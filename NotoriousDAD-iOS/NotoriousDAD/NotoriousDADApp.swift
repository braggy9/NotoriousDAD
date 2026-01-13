import SwiftUI
import NotoriousDADKit
import BackgroundTasks

@main
struct NotoriousDADApp: App {
    @StateObject private var spotifyManager = SpotifyManager()
    @StateObject private var libraryManager = LibraryManager()
    @StateObject private var notificationManager = NotificationManager.shared
    @Environment(\.scenePhase) private var scenePhase

    // Background task identifier - must match Info.plist BGTaskSchedulerPermittedIdentifiers
    static let backgroundRefreshTaskId = "com.notoriousdad.app.refresh"

    init() {
        // Register background task handler
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.backgroundRefreshTaskId,
            using: nil
        ) { task in
            Self.handleBackgroundRefresh(task: task as! BGAppRefreshTask)
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(spotifyManager)
                .environmentObject(libraryManager)
                .environmentObject(notificationManager)
                .onOpenURL { url in
                    // Handle URL scheme callbacks
                    guard let scheme = url.scheme else { return }

                    switch scheme {
                    case "notoriousdad":
                        // Handle Spotify OAuth callback
                        spotifyManager.handleCallback(url: url)
                    case "notoriousdad-spotify":
                        // Handle Spotify App Remote callback (SDK)
                        // Currently using deep link approach which doesn't need callback handling
                        print("🎵 Spotify callback received: \(url)")
                    default:
                        break
                    }
                }
                .task {
                    // Load tokens when app starts
                    if !spotifyManager.isAuthenticated {
                        await spotifyManager.loadTokensFromWebApp()
                    }

                    // Request notification permissions
                    await notificationManager.requestAuthorization()
                }
                .onChange(of: scenePhase) { _, newPhase in
                    switch newPhase {
                    case .background:
                        scheduleBackgroundRefresh()
                    case .active:
                        // Refresh if cache is stale when becoming active
                        Task {
                            if let ageHours = CacheManager.shared.cacheAgeHours(), ageHours > 24 {
                                await libraryManager.refreshFromBundle()
                            }
                        }
                    default:
                        break
                    }
                }
        }
    }

    // MARK: - Background Refresh

    private func scheduleBackgroundRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: Self.backgroundRefreshTaskId)
        // Schedule for at least 1 hour from now
        request.earliestBeginDate = Date(timeIntervalSinceNow: 3600)

        do {
            try BGTaskScheduler.shared.submit(request)
            print("📅 Scheduled background refresh for ~1 hour from now")
        } catch {
            print("⚠️ Could not schedule background refresh: \(error.localizedDescription)")
        }
    }

    private static func handleBackgroundRefresh(task: BGAppRefreshTask) {
        print("🔄 Background refresh task starting...")

        // Create a task to refresh the library
        let refreshTask = Task {
            let manager = LibraryManager()
            await manager.refreshFromBundle()
            return true
        }

        // Set up expiration handler
        task.expirationHandler = {
            refreshTask.cancel()
            print("⏰ Background refresh task expired")
        }

        // Complete when done
        Task {
            let success = await refreshTask.value
            task.setTaskCompleted(success: success)
            print("✅ Background refresh task completed")

            // Schedule next refresh
            let request = BGAppRefreshTaskRequest(identifier: backgroundRefreshTaskId)
            request.earliestBeginDate = Date(timeIntervalSinceNow: 3600 * 6) // 6 hours
            try? BGTaskScheduler.shared.submit(request)
        }
    }
}
