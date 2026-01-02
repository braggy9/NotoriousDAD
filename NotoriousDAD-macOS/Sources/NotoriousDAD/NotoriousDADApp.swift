import SwiftUI
import NotoriousDADKit
import SpotifyWebAPI

@main
struct NotoriousDADApp: App {
    @StateObject private var spotifyManager = SpotifyManager()
    @StateObject private var libraryManager = LibraryManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(spotifyManager)
                .environmentObject(libraryManager)
                .frame(minWidth: 900, minHeight: 600)
        }
        .windowStyle(.hiddenTitleBar)
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
