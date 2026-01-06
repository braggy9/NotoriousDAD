import SwiftUI
import NotoriousDADKit
import SpotifyWebAPI

@main
struct NotoriousDADApp: App {
    @StateObject private var spotifyManager = SpotifyManager()
    @StateObject private var libraryManager = LibraryManager()
    @StateObject private var notificationManager = NotificationManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(spotifyManager)
                .environmentObject(libraryManager)
                .environmentObject(notificationManager)
                .frame(minWidth: 1000, idealWidth: 1200, minHeight: 700, idealHeight: 800)
                .onOpenURL { url in
                    // Handle Spotify OAuth callback
                    if url.scheme == "notoriousdad" {
                        spotifyManager.handleCallback(url: url)
                    }
                }
                .task {
                    // Request notification permissions on macOS
                    await notificationManager.requestAuthorization()
                }
        }
        .defaultSize(width: 1200, height: 800)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Playlist...") {
                    NotificationCenter.default.post(name: .newPlaylist, object: nil)
                }
                .keyboardShortcut("n", modifiers: .command)
            }
            CommandGroup(after: .importExport) {
                Button("Import MIK CSV...") {
                    NotificationCenter.default.post(name: .importMIK, object: nil)
                }
                .keyboardShortcut("i", modifiers: [.command, .shift])
            }
        }

        #if os(macOS)
        Settings {
            SettingsView()
                .environmentObject(spotifyManager)
        }
        #endif
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let newPlaylist = Notification.Name("newPlaylist")
    static let importMIK = Notification.Name("importMIK")
}
