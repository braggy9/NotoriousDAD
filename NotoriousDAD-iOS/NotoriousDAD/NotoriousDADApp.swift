import SwiftUI
import NotoriousDADKit

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
                .onOpenURL { url in
                    // Handle Spotify OAuth callback
                    if url.scheme == "notoriousdad" {
                        spotifyManager.handleCallback(url: url)
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
        }
    }
}
