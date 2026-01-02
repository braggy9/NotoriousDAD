import Foundation
import SwiftUI
import SpotifyWebAPI
import Combine

// SpotifyWebAPI types are at module level, not nested in SpotifyAPI<T>
typealias SpotifyTrack = SpotifyWebAPI.Track
typealias SpotifyPlaylist = SpotifyWebAPI.Playlist

/// Manages Spotify authentication and API access
@MainActor
class SpotifyManager: ObservableObject {

    // MARK: - Published Properties

    @Published var isAuthenticated = false
    @Published var currentUser: SpotifyWebAPI.SpotifyUser?
    @Published var isLoading = false
    @Published var error: String?

    // MARK: - Spotify API

    private var spotify: SpotifyAPI<AuthorizationCodeFlowManager>?
    private var cancellables: Set<AnyCancellable> = []

    // MARK: - Configuration

    private let clientId = "YOUR_CLIENT_ID"  // TODO: Load from config
    private let clientSecret = "YOUR_CLIENT_SECRET"  // TODO: Load from config
    private let redirectURI = URL(string: "notoriousdad://callback")!

    private let scopes: Set<Scope> = [
        .userLibraryRead,
        .userReadPrivate,
        .userReadEmail,
        .playlistModifyPublic,
        .playlistModifyPrivate,
        .userTopRead,
        .userReadRecentlyPlayed,
    ]

    // MARK: - Init

    init() {
        setupSpotify()
        loadSavedCredentials()
    }

    private func setupSpotify() {
        let authManager = AuthorizationCodeFlowManager(
            clientId: clientId,
            clientSecret: clientSecret
        )

        spotify = SpotifyAPI(authorizationManager: authManager)

        // Listen for auth changes
        spotify?.authorizationManagerDidChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                self?.handleAuthChange()
            }
            .store(in: &cancellables)
    }

    // MARK: - Authentication

    /// Start OAuth authorization flow
    func authorize() {
        guard let spotify = spotify else { return }

        let authURL = spotify.authorizationManager.makeAuthorizationURL(
            redirectURI: redirectURI,
            showDialog: false,
            scopes: scopes
        )!

        // Open in browser
        #if os(macOS)
        NSWorkspace.shared.open(authURL)
        #endif
    }

    /// Handle callback URL from OAuth
    func handleCallback(url: URL) {
        guard let spotify = spotify else { return }

        isLoading = true
        error = nil

        spotify.authorizationManager.requestAccessAndRefreshTokens(
            redirectURIWithQuery: url
        )
        .receive(on: DispatchQueue.main)
        .sink(
            receiveCompletion: { [weak self] completion in
                self?.isLoading = false
                if case .failure(let error) = completion {
                    self?.error = error.localizedDescription
                }
            },
            receiveValue: { [weak self] in
                self?.saveCredentials()
                self?.fetchCurrentUser()
            }
        )
        .store(in: &cancellables)
    }

    /// Log out and clear credentials
    func logout() {
        spotify?.authorizationManager.deauthorize()
        isAuthenticated = false
        currentUser = nil
        clearSavedCredentials()
    }

    private func handleAuthChange() {
        isAuthenticated = spotify?.authorizationManager.isAuthorized() ?? false
        if isAuthenticated {
            fetchCurrentUser()
        }
    }

    // MARK: - User Data

    private func fetchCurrentUser() {
        guard let spotify = spotify else { return }

        spotify.currentUserProfile()
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] user in
                    self?.currentUser = user
                }
            )
            .store(in: &cancellables)
    }

    // MARK: - API Methods

    /// Search for tracks by artist
    func searchTracks(artist: String, limit: Int = 30) async throws -> [SpotifyTrack] {
        guard let spotify = spotify else {
            throw SpotifyError.notAuthenticated
        }

        return try await withCheckedThrowingContinuation { continuation in
            spotify.search(
                query: "artist:\(artist)",
                categories: [.track],
                limit: limit
            )
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        continuation.resume(throwing: error)
                    }
                },
                receiveValue: { results in
                    let tracks = results.tracks?.items ?? []
                    continuation.resume(returning: tracks)
                }
            )
            .store(in: &self.cancellables)
        }
    }

    /// Create a playlist
    func createPlaylist(name: String, tracks: [String]) async throws -> String {
        guard let spotify = spotify,
              let userId = currentUser?.id else {
            throw SpotifyError.notAuthenticated
        }

        // Create playlist
        let playlist = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Playlist<PlaylistItems>, Error>) in
            spotify.createPlaylist(
                for: userId,
                PlaylistDetails(name: name, isPublic: false)
            )
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        continuation.resume(throwing: error)
                    }
                },
                receiveValue: { playlist in
                    continuation.resume(returning: playlist)
                }
            )
            .store(in: &self.cancellables)
        }

        // Add tracks
        let uris = tracks.map { "spotify:track:\($0)" }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            spotify.addToPlaylist(playlist.uri, uris: uris)
                .sink(
                    receiveCompletion: { completion in
                        switch completion {
                        case .finished:
                            continuation.resume()
                        case .failure(let error):
                            continuation.resume(throwing: error)
                        }
                    },
                    receiveValue: { _ in }
                )
                .store(in: &self.cancellables)
        }

        return playlist.id
    }

    // MARK: - Credential Storage

    private let credentialsKey = "spotify_credentials"

    private func saveCredentials() {
        guard let spotify = spotify,
              let data = try? JSONEncoder().encode(spotify.authorizationManager) else {
            return
        }
        UserDefaults.standard.set(data, forKey: credentialsKey)
    }

    private func loadSavedCredentials() {
        guard let data = UserDefaults.standard.data(forKey: credentialsKey),
              let authManager = try? JSONDecoder().decode(AuthorizationCodeFlowManager.self, from: data) else {
            return
        }

        spotify = SpotifyAPI(authorizationManager: authManager)
        isAuthenticated = authManager.isAuthorized()

        if isAuthenticated {
            fetchCurrentUser()
        }
    }

    private func clearSavedCredentials() {
        UserDefaults.standard.removeObject(forKey: credentialsKey)
    }
}

// MARK: - Errors

enum SpotifyError: LocalizedError {
    case notAuthenticated
    case apiError(String)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Not authenticated with Spotify"
        case .apiError(let message):
            return message
        }
    }
}
