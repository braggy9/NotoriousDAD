import SwiftUI
import NotoriousDADKit

@main
struct NotoriousDADApp: App {
    @StateObject private var spotifyManager = SpotifyManager()
    @StateObject private var libraryManager = LibraryManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(spotifyManager)
                .environmentObject(libraryManager)
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
                }
        }
    }
}
