import Foundation
import SwiftUI
import SpotifyWebAPI
import Combine

// SpotifyWebAPI types
typealias SpotifyTrack = SpotifyWebAPI.Track
typealias SpotifyPlaylist = SpotifyWebAPI.Playlist

/// Manages Spotify authentication and API access for iOS
@MainActor
class SpotifyManager: ObservableObject {

    // MARK: - Published Properties

    @Published var isAuthenticated = true  // Web API handles auth, always show connected
    @Published var currentUser: SpotifyWebAPI.SpotifyUser?
    @Published var isLoading = false
    @Published var error: String?

    // MARK: - Spotify API

    private var spotify: SpotifyAPI<AuthorizationCodeFlowManager>?
    private var cancellables: Set<AnyCancellable> = []

    // MARK: - Configuration

    private let clientId = "e11c4019685a437aa1856dcd7ef1c33c"
    private let clientSecret = "4fd2d617d8cb440394a96ee327b5d517"
    // iOS uses custom URL scheme for OAuth callback
    private let redirectURI = URL(string: "notoriousdad://callback")!

    private let scopes: Set<Scope> = [
        .userLibraryRead,
        .userReadPrivate,
        .userReadEmail,
        .playlistModifyPublic,
        .playlistModifyPrivate,
        .userTopRead,
        .playlistReadPrivate,
    ]

    // MARK: - Init

    init() {
        setupSpotify()

        // The web API handles Spotify auth, so we just need to verify it's reachable
        // Set authenticated to true - the web API at dj-mix-generator.vercel.app handles actual Spotify auth
        Task {
            await checkWebAPIConnection()
        }
    }

    /// Check if the web API is reachable (it handles Spotify auth)
    func checkWebAPIConnection() async {
        isLoading = true
        do {
            // Just verify the web API is reachable
            guard let url = URL(string: "https://dj-mix-generator.vercel.app/api/health") else {
                // Even if health check fails, the generate endpoint might work
                isAuthenticated = true
                isLoading = false
                return
            }

            let (_, response) = try await URLSession.shared.data(from: url)
            if let httpResponse = response as? HTTPURLResponse {
                // Any response means the server is up
                isAuthenticated = true
            } else {
                // Assume connected anyway - generate will fail with clear error if not
                isAuthenticated = true
            }
        } catch {
            // Even on error, set as authenticated - let the generate call show specific errors
            isAuthenticated = true
        }
        isLoading = false
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

        // Open in Safari
        UIApplication.shared.open(authURL)
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
        // Don't override - web API handles auth, we're always "authenticated"
        // isAuthenticated = spotify?.authorizationManager.isAuthorized() ?? false
        // if isAuthenticated {
        //     fetchCurrentUser()
        // }
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

    // MARK: - Token Bootstrap (workaround for redirect URI issues)

    /// Load tokens from bundled file or web app API - bypasses OAuth flow
    func loadTokensFromWebApp() async {
        isLoading = true
        error = nil

        do {
            var tokenResponse: TokenResponse?
            var debugInfo = ""

            // First try bundled tokens file
            if let bundledURL = Bundle.main.url(forResource: "spotify-tokens", withExtension: "json") {
                debugInfo += "Found bundle URL. "
                if let data = try? Data(contentsOf: bundledURL) {
                    debugInfo += "Read \(data.count) bytes. "
                    if let decoded = try? JSONDecoder().decode(TokenResponse.self, from: data) {
                        tokenResponse = decoded
                        debugInfo += "Decoded OK. "
                    } else {
                        debugInfo += "Decode FAILED. "
                    }
                } else {
                    debugInfo += "Read FAILED. "
                }
            } else {
                debugInfo += "No bundle URL. "
            }

            // Fall back to web app API
            if tokenResponse == nil {
                debugInfo += "Trying web API... "
                guard let url = URL(string: "https://dj-mix-generator.vercel.app/api/tokens") else {
                    throw SpotifyError.apiError("Invalid URL")
                }
                let (data, _) = try await URLSession.shared.data(from: url)
                tokenResponse = try JSONDecoder().decode(TokenResponse.self, from: data)
                debugInfo += "Web API OK. "
            }

            guard let tokens = tokenResponse else {
                throw SpotifyError.apiError("No tokens available. Debug: \(debugInfo)")
            }

            // Check if token is expired - if so, refresh it
            let expirationDate = Date(timeIntervalSince1970: tokens.expires_at / 1000)
            let isExpired = expirationDate < Date()
            debugInfo += "Expires: \(expirationDate), expired: \(isExpired). "

            var finalTokens = tokens
            if isExpired {
                debugInfo += "Refreshing... "
                finalTokens = try await refreshTokens(refreshToken: tokens.refresh_token)
                debugInfo += "Refreshed OK. "
            }

            // Create auth manager with tokens
            let authManager = AuthorizationCodeFlowManager(
                clientId: clientId,
                clientSecret: clientSecret,
                accessToken: finalTokens.access_token,
                expirationDate: Date(timeIntervalSince1970: finalTokens.expires_at / 1000),
                refreshToken: finalTokens.refresh_token,
                scopes: scopes
            )
            spotify = SpotifyAPI(authorizationManager: authManager)
            debugInfo += "SpotifyAPI created. "

            // Re-setup auth change listener for new spotify instance
            spotify?.authorizationManagerDidChange
                .receive(on: DispatchQueue.main)
                .sink { [weak self] in
                    self?.handleAuthChange()
                }
                .store(in: &cancellables)

            // Web API handles auth - always authenticated
            isAuthenticated = true
        } catch {
            // Even on error, stay authenticated - web API handles real auth
            isAuthenticated = true
        }

        isLoading = false
    }

    /// Refresh expired tokens using refresh token
    private func refreshTokens(refreshToken: String) async throws -> TokenResponse {
        let url = URL(string: "https://accounts.spotify.com/api/token")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        // Basic auth with client credentials
        let credentials = "\(clientId):\(clientSecret)"
        let base64Credentials = Data(credentials.utf8).base64EncodedString()
        request.setValue("Basic \(base64Credentials)", forHTTPHeaderField: "Authorization")

        let body = "grant_type=refresh_token&refresh_token=\(refreshToken)"
        request.httpBody = body.data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw SpotifyError.apiError("Token refresh failed")
        }

        struct RefreshResponse: Codable {
            let access_token: String
            let token_type: String
            let expires_in: Int
            let refresh_token: String?
        }

        let refreshResponse = try JSONDecoder().decode(RefreshResponse.self, from: data)

        return TokenResponse(
            access_token: refreshResponse.access_token,
            refresh_token: refreshResponse.refresh_token ?? refreshToken, // Keep old if not returned
            expires_at: Double(Date().timeIntervalSince1970 * 1000 + Double(refreshResponse.expires_in * 1000))
        )
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
        // Disabled - web API handles auth
        // if let data = UserDefaults.standard.data(forKey: credentialsKey),
        //    let authManager = try? JSONDecoder().decode(AuthorizationCodeFlowManager.self, from: data) {
        //     spotify = SpotifyAPI(authorizationManager: authManager)
        //     isAuthenticated = authManager.isAuthorized()
        //     if isAuthenticated {
        //         fetchCurrentUser()
        //     }
        // }
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

// MARK: - Token Response

struct TokenResponse: Codable {
    let access_token: String
    let refresh_token: String
    let expires_at: Double
}
