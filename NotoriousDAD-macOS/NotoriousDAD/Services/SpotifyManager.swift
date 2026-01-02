import Foundation
import SwiftUI
import SpotifyWebAPI
import Combine
import Network

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

    private let clientId = "e11c4019685a437aa1856dcd7ef1c33c"
    private let clientSecret = "4fd2d617d8cb440394a96ee327b5d517"
    private let redirectURI = URL(string: "http://127.0.0.1:8888/callback")!

    // Local server for OAuth callback
    private var callbackServer: CallbackServer?

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

        // Start local server to receive callback
        callbackServer = CallbackServer(port: 8888) { [weak self] url in
            self?.handleCallback(url: url)
            self?.callbackServer?.stop()
            self?.callbackServer = nil
        }
        callbackServer?.start()

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
        // First try UserDefaults
        if let data = UserDefaults.standard.data(forKey: credentialsKey),
           let authManager = try? JSONDecoder().decode(AuthorizationCodeFlowManager.self, from: data) {
            spotify = SpotifyAPI(authorizationManager: authManager)
            isAuthenticated = authManager.isAuthorized()
            if isAuthenticated {
                fetchCurrentUser()
                return
            }
        }

        // Fallback: try loading from web app's token file
        loadFromWebAppToken()
    }

    /// Load tokens from the web app's .spotify-token.json file
    private func loadFromWebAppToken() {
        let logPath = "/tmp/notoriousdad-auth.log"
        func log(_ message: String) {
            let entry = "[\(Date())] \(message)\n"
            if let data = entry.data(using: .utf8) {
                if FileManager.default.fileExists(atPath: logPath) {
                    if let handle = FileHandle(forWritingAtPath: logPath) {
                        handle.seekToEndOfFile()
                        handle.write(data)
                        handle.closeFile()
                    }
                } else {
                    try? data.write(to: URL(fileURLWithPath: logPath))
                }
            }
            print(message)
        }

        log("🔍 Attempting to load tokens from web app...")

        let tokenPath = "/Users/tombragg/dj-mix-generator/.spotify-token.json"
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: tokenPath)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let accessToken = json["access_token"] as? String,
              let refreshToken = json["refresh_token"] as? String else {
            log("⚠️ Could not load tokens from web app - file not found or invalid")
            return
        }

        log("✅ Found tokens in web app file (token length: \(accessToken.count))")

        // Use Codable structs to match the exact format the library expects
        // expiration_date needs to be ISO 8601 string
        let formatter = ISO8601DateFormatter()
        let expirationDateString = formatter.string(from: Date().addingTimeInterval(3600))

        let authInfo = WebAppAuthInfo(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expirationDate: expirationDateString,
            scope: scopes.map { $0.rawValue }.joined(separator: " "),
            backend: WebAppBackend(clientId: clientId, clientSecret: clientSecret)
        )

        do {
            let authJson = try JSONEncoder().encode(authInfo)
            log("📄 Encoded JSON: \(String(data: authJson, encoding: .utf8) ?? "nil")")

            let authManager = try JSONDecoder().decode(AuthorizationCodeFlowManager.self, from: authJson)
            log("✅ Decoded auth manager successfully")

            spotify = SpotifyAPI(authorizationManager: authManager)

            // Re-subscribe to auth changes
            spotify?.authorizationManagerDidChange
                .receive(on: DispatchQueue.main)
                .sink { [weak self] in
                    self?.handleAuthChange()
                }
                .store(in: &cancellables)

            log("✅ Successfully loaded Spotify auth from web app")
            isAuthenticated = true
            fetchCurrentUser()
        } catch {
            log("⚠️ Could not decode auth manager: \(error)")
        }
    }

    private func clearSavedCredentials() {
        UserDefaults.standard.removeObject(forKey: credentialsKey)
    }
}

// MARK: - Web App Token Helpers

/// Helper struct to encode auth info in the format SpotifyWebAPI expects
private struct WebAppAuthInfo: Codable {
    let accessToken: String
    let refreshToken: String
    let expirationDate: String  // ISO 8601 date string
    let scope: String
    let backend: WebAppBackend

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expirationDate = "expiration_date"
        case scope
        case backend
    }
}

private struct WebAppBackend: Codable {
    let clientId: String
    let clientSecret: String

    enum CodingKeys: String, CodingKey {
        case clientId = "client_id"
        case clientSecret = "client_secret"
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

// MARK: - Local Callback Server

/// Simple HTTP server to handle OAuth callbacks
class CallbackServer {
    private let port: UInt16
    private let callback: (URL) -> Void
    private var serverSocket: FileHandle?
    private var listeningSocket: Int32 = -1
    private var isRunning = false

    init(port: UInt16, callback: @escaping (URL) -> Void) {
        self.port = port
        self.callback = callback
    }

    func start() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.runServer()
        }
    }

    func stop() {
        isRunning = false
        if listeningSocket >= 0 {
            close(listeningSocket)
            listeningSocket = -1
        }
    }

    private func runServer() {
        listeningSocket = socket(AF_INET, SOCK_STREAM, 0)
        guard listeningSocket >= 0 else {
            print("❌ Failed to create socket")
            return
        }

        var reuse: Int32 = 1
        setsockopt(listeningSocket, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = port.bigEndian
        addr.sin_addr.s_addr = INADDR_ANY

        let bindResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPtr in
                bind(listeningSocket, sockaddrPtr, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }

        guard bindResult == 0 else {
            print("❌ Failed to bind to port \(port)")
            close(listeningSocket)
            return
        }

        guard listen(listeningSocket, 1) == 0 else {
            print("❌ Failed to listen")
            close(listeningSocket)
            return
        }

        print("✅ OAuth callback server listening on port \(port)")
        isRunning = true

        while isRunning {
            var clientAddr = sockaddr_in()
            var clientAddrLen = socklen_t(MemoryLayout<sockaddr_in>.size)

            let clientSocket = withUnsafeMutablePointer(to: &clientAddr) { ptr in
                ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPtr in
                    accept(listeningSocket, sockaddrPtr, &clientAddrLen)
                }
            }

            guard clientSocket >= 0 else { continue }

            // Read request
            var buffer = [UInt8](repeating: 0, count: 4096)
            let bytesRead = read(clientSocket, &buffer, buffer.count)

            if bytesRead > 0 {
                let request = String(bytes: buffer[0..<bytesRead], encoding: .utf8) ?? ""

                // Parse the GET request for callback URL
                if let urlPath = request.components(separatedBy: " ").dropFirst().first,
                   urlPath.contains("callback") {
                    let fullURL = "http://localhost:\(port)\(urlPath)"

                    // Send success response
                    let html = """
                    HTTP/1.1 200 OK\r
                    Content-Type: text/html\r
                    Connection: close\r
                    \r
                    <!DOCTYPE html>
                    <html>
                    <head><title>Success</title></head>
                    <body style="font-family: -apple-system; text-align: center; padding: 50px;">
                    <h1>✅ Authentication Successful!</h1>
                    <p>You can close this window and return to Notorious DAD.</p>
                    <script>setTimeout(() => window.close(), 2000);</script>
                    </body>
                    </html>
                    """
                    _ = html.withCString { write(clientSocket, $0, strlen($0)) }
                    close(clientSocket)

                    // Trigger callback on main thread
                    if let url = URL(string: fullURL) {
                        DispatchQueue.main.async { [weak self] in
                            self?.callback(url)
                        }
                    }
                    break
                }
            }
            close(clientSocket)
        }

        close(listeningSocket)
        listeningSocket = -1
        print("✅ OAuth callback server stopped")
    }
}
