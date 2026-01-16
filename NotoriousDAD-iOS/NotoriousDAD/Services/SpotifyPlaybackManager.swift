import Foundation
import SwiftUI
import UIKit

/// Manages Spotify playback control via the Spotify iOS SDK (SPTAppRemote)
/// This provides "remote control" of the Spotify app - play, pause, skip, etc.
@MainActor
class SpotifyPlaybackManager: ObservableObject {
    static let shared = SpotifyPlaybackManager()

    // MARK: - Published Properties

    @Published var isConnected = false
    @Published var isSpotifyInstalled = false
    @Published var currentTrack: PlaybackTrack?
    @Published var isPaused = true
    @Published var connectionError: String?

    // MARK: - Configuration

    // Same client ID as SpotifyManager
    private let clientId = "e11c4019685a437aa1856dcd7ef1c33c"
    // Custom URL scheme registered in Info.plist
    private let redirectURL = URL(string: "notoriousdad-spotify://callback")!

    // MARK: - State

    private var pendingPlaybackURI: String?

    // MARK: - Init

    private init() {
        checkSpotifyInstalled()
    }

    // MARK: - Spotify App Detection

    /// Check if Spotify app is installed
    func checkSpotifyInstalled() {
        // LSApplicationQueriesSchemes in Info.plist allows querying spotify://
        if let spotifyURL = URL(string: "spotify://") {
            isSpotifyInstalled = UIApplication.shared.canOpenURL(spotifyURL)
        } else {
            isSpotifyInstalled = false
        }
        print("🎵 Spotify app installed: \(isSpotifyInstalled)")
    }

    // MARK: - Playback Control

    /// Open a playlist in the Spotify app
    /// - Parameter playlistId: Spotify playlist ID (e.g., "37i9dQZF1DXcBWIGoYBM5M")
    func openPlaylist(_ playlistId: String) {
        let uri = "spotify:playlist:\(playlistId)"
        openSpotifyURI(uri)
    }

    /// Open a track in the Spotify app
    /// - Parameter trackId: Spotify track ID
    func openTrack(_ trackId: String) {
        let uri = "spotify:track:\(trackId)"
        openSpotifyURI(uri)
    }

    /// Open any Spotify URI in the Spotify app
    /// - Parameter uri: Full Spotify URI (e.g., "spotify:playlist:xxxxx")
    func openSpotifyURI(_ uri: String) {
        // First check if Spotify is installed
        checkSpotifyInstalled()

        if isSpotifyInstalled {
            // Open directly in Spotify app
            if let url = URL(string: uri) {
                print("🎵 Opening in Spotify: \(uri)")
                UIApplication.shared.open(url) { success in
                    if success {
                        print("✅ Opened Spotify successfully")
                        // HapticManager.shared.success()
                    } else {
                        print("❌ Failed to open Spotify")
                        // Fall back to web URL
                        self.openSpotifyWeb(uri: uri)
                    }
                }
            }
        } else {
            // Open in browser/App Store
            openSpotifyWeb(uri: uri)
        }
    }

    /// Open Spotify content in web browser (fallback when app not installed)
    private func openSpotifyWeb(uri: String) {
        // Convert URI to web URL
        // spotify:playlist:xxxxx -> https://open.spotify.com/playlist/xxxxx
        let components = uri.split(separator: ":")
        guard components.count >= 3 else {
            print("⚠️ Invalid Spotify URI: \(uri)")
            return
        }

        let type = String(components[1])  // playlist, track, album, artist
        let id = String(components[2])
        let webURL = URL(string: "https://open.spotify.com/\(type)/\(id)")!

        print("🌐 Opening Spotify web: \(webURL)")
        UIApplication.shared.open(webURL)
    }

    /// Open the Spotify app (main screen)
    func openSpotifyApp() {
        if let url = URL(string: "spotify://") {
            UIApplication.shared.open(url)
        }
    }

    // MARK: - Deep Link Helpers

    /// Extract playlist ID from various Spotify URL formats
    /// Supports:
    /// - spotify:playlist:xxxxx
    /// - https://open.spotify.com/playlist/xxxxx
    /// - https://open.spotify.com/playlist/xxxxx?si=xxxxx
    static func extractPlaylistId(from urlString: String) -> String? {
        // Check if it's a URI format
        if urlString.hasPrefix("spotify:playlist:") {
            return String(urlString.dropFirst("spotify:playlist:".count))
        }

        // Check if it's a web URL
        guard let url = URL(string: urlString),
              let host = url.host,
              host.contains("spotify.com"),
              url.pathComponents.count >= 3,
              url.pathComponents[1] == "playlist" else {
            return nil
        }

        return url.pathComponents[2]
    }

    /// Create a Spotify playlist URI from a playlist ID
    static func playlistURI(from playlistId: String) -> String {
        return "spotify:playlist:\(playlistId)"
    }
}

// MARK: - Playback Track Model

struct PlaybackTrack: Identifiable, Equatable {
    let id: String
    let name: String
    let artist: String
    let albumArtURL: URL?
    let duration: TimeInterval
}

// MARK: - Play Button View

/// A button that opens content in Spotify
struct SpotifyPlayButton: View {
    let title: String
    let playlistId: String?
    let playlistURL: String?

    @StateObject private var playbackManager = SpotifyPlaybackManager.shared

    init(title: String = "Play in Spotify", playlistId: String? = nil, playlistURL: String? = nil) {
        self.title = title
        self.playlistId = playlistId
        self.playlistURL = playlistURL
    }

    var body: some View {
        Button(action: openInSpotify) {
            HStack(spacing: 12) {
                Image(systemName: playbackManager.isSpotifyInstalled ? "play.fill" : "arrow.up.right")
                    .font(.system(size: 18, weight: .semibold))
                Text(playbackManager.isSpotifyInstalled ? title : "Open in Spotify")
                    .font(.system(size: 17, weight: .semibold, design: .rounded))
            }
            .foregroundColor(.black)
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(
                LinearGradient(
                    colors: [Color.spotifyGreen, Color.spotifyGreenLight],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .cornerRadius(16)
        }
        .onAppear {
            playbackManager.checkSpotifyInstalled()
        }
    }

    private func openInSpotify() {
        // HapticManager.shared.buttonPress()

        // Try to extract playlist ID from URL if not provided directly
        var resolvedPlaylistId = playlistId

        if resolvedPlaylistId == nil, let url = playlistURL {
            resolvedPlaylistId = SpotifyPlaybackManager.extractPlaylistId(from: url)
        }

        if let id = resolvedPlaylistId {
            playbackManager.openPlaylist(id)
        } else if let url = playlistURL, let webURL = URL(string: url) {
            // Fallback: open the raw URL
            UIApplication.shared.open(webURL)
        }
    }
}

// MARK: - Color Extension for Spotify Green

extension Color {
    // Spotify brand green: #1DB954
    static let spotifyGreen = Color(red: 0.114, green: 0.725, blue: 0.329)
    // Lighter spotify green: #1ED760
    static let spotifyGreenLight = Color(red: 0.118, green: 0.843, blue: 0.376)
}
