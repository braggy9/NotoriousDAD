import SwiftUI
import NotoriousDADKit
import AVFoundation
import Combine

// Use the same type alias as LibraryManager for consistency
typealias DADPlaylist = NotoriousDADKit.Playlist

// MARK: - Network Manager with Retry Logic

class NetworkManager {
    static let shared = NetworkManager()

    private init() {}

    /// Perform a network request with automatic retry and exponential backoff
    func performRequest<T>(
        maxRetries: Int = 3,
        initialDelay: TimeInterval = 1.0,
        operation: @escaping () async throws -> T
    ) async throws -> T {
        var lastError: Error?
        var delay = initialDelay

        for attempt in 1...maxRetries {
            do {
                return try await operation()
            } catch {
                lastError = error

                // Don't retry on certain errors
                if isNonRetryableError(error) {
                    throw error
                }

                // Last attempt - throw the error
                if attempt == maxRetries {
                    throw NetworkError.maxRetriesExceeded(underlying: error, attempts: maxRetries)
                }

                // Wait before retrying with exponential backoff
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                delay *= 2 // Exponential backoff
            }
        }

        throw lastError ?? NetworkError.unknown
    }

    private func isNonRetryableError(_ error: Error) -> Bool {
        // Don't retry on authentication or client errors
        if let networkError = error as? NetworkError {
            switch networkError {
            case .authenticationRequired, .invalidRequest:
                return true
            default:
                return false
            }
        }

        // Check for HTTP status codes that shouldn't be retried
        if let urlError = error as? URLError {
            switch urlError.code {
            case .cancelled, .userAuthenticationRequired:
                return true
            default:
                return false
            }
        }

        return false
    }

    /// Check if device has network connectivity
    func isConnected() -> Bool {
        // Simple check - try to create a socket connection
        // For production, use NWPathMonitor
        return true // Simplified for now
    }
}

enum NetworkError: LocalizedError {
    case noConnection
    case timeout
    case serverError(statusCode: Int)
    case authenticationRequired
    case invalidRequest
    case maxRetriesExceeded(underlying: Error, attempts: Int)
    case unknown

    var errorDescription: String? {
        switch self {
        case .noConnection:
            return "No internet connection. Please check your network and try again."
        case .timeout:
            return "Request timed out. The server may be busy - please try again."
        case .serverError(let code):
            return "Server error (\(code)). Please try again later."
        case .authenticationRequired:
            return "Authentication required. Please reconnect to Spotify."
        case .invalidRequest:
            return "Invalid request. Please check your input and try again."
        case .maxRetriesExceeded(_, let attempts):
            return "Failed after \(attempts) attempts. Please check your connection and try again."
        case .unknown:
            return "An unexpected error occurred. Please try again."
        }
    }

    var isRetryable: Bool {
        switch self {
        case .noConnection, .timeout, .serverError, .maxRetriesExceeded, .unknown:
            return true
        case .authenticationRequired, .invalidRequest:
            return false
        }
    }
}

// MARK: - Audio Player Manager (macOS)

class AudioPlayerManager: ObservableObject {
    @Published var isPlaying = false
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var downloadProgress: Double = 0
    @Published var isLoading = false
    @Published var error: String?

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var cancellables = Set<AnyCancellable>()

    func streamAudio(from url: URL) {
        cleanup()
        isLoading = true
        error = nil

        let playerItem = AVPlayerItem(url: url)
        player = AVPlayer(playerItem: playerItem)

        let interval = CMTime(seconds: 0.5, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            self?.currentTime = time.seconds
            if let duration = self?.player?.currentItem?.duration.seconds,
               !duration.isNaN && !duration.isInfinite {
                self?.duration = duration
            }
        }

        player?.currentItem?.publisher(for: \.status)
            .sink { [weak self] status in
                switch status {
                case .readyToPlay:
                    self?.isLoading = false
                case .failed:
                    self?.error = "Failed to load audio"
                    self?.isLoading = false
                default:
                    break
                }
            }
            .store(in: &cancellables)

        player?.play()
        isPlaying = true
    }

    func togglePlayPause() {
        guard let player = player else { return }
        if isPlaying { player.pause() } else { player.play() }
        isPlaying.toggle()
    }

    func seek(to position: Double) {
        guard let duration = player?.currentItem?.duration.seconds,
              !duration.isNaN && !duration.isInfinite else { return }
        let targetTime = CMTime(seconds: duration * position, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        player?.seek(to: targetTime)
    }

    func stop() {
        player?.pause()
        player?.seek(to: .zero)
        isPlaying = false
        currentTime = 0
    }

    func downloadAudio(from url: URL, completion: @escaping (Result<URL, Error>) -> Void) {
        // If already downloaded, return cached file
        if let cachedURL = downloadedFileURL, FileManager.default.fileExists(atPath: cachedURL.path) {
            completion(.success(cachedURL))
            return
        }

        downloadProgress = 0

        let task = URLSession.shared.downloadTask(with: url) { [weak self] tempURL, response, error in
            if let error = error {
                DispatchQueue.main.async {
                    self?.error = error.localizedDescription
                    self?.downloadProgress = 0
                }
                completion(.failure(error))
                return
            }

            guard let tempURL = tempURL else {
                completion(.failure(NSError(domain: "AudioPlayer", code: -1, userInfo: [NSLocalizedDescriptionKey: "No file downloaded"])))
                return
            }

            let tempDir = FileManager.default.temporaryDirectory
            let fileName = url.lastPathComponent.isEmpty ? "mix.mp3" : url.lastPathComponent
            let destinationURL = tempDir.appendingPathComponent(fileName)

            do {
                if FileManager.default.fileExists(atPath: destinationURL.path) {
                    try FileManager.default.removeItem(at: destinationURL)
                }
                try FileManager.default.moveItem(at: tempURL, to: destinationURL)
                DispatchQueue.main.async {
                    self?.downloadedFileURL = destinationURL
                    self?.downloadProgress = 1.0
                }
                completion(.success(destinationURL))
            } catch {
                completion(.failure(error))
            }
        }
        task.resume()
    }

    func getDownloadedFileURL() -> URL? {
        return downloadedFileURL
    }

    private var downloadedFileURL: URL?

    private func cleanup() {
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
            timeObserver = nil
        }
        player?.pause()
        player = nil
    }
}

// MARK: - App Theme System (Electric Gold)

struct AppTheme {
    struct Colors {
        static let gold = Color(red: 1.0, green: 0.84, blue: 0.0)
        static let goldDeep = Color(red: 0.85, green: 0.65, blue: 0.13)
        static let goldDark = Color(red: 0.55, green: 0.41, blue: 0.08)

        static let background = Color(red: 0.06, green: 0.06, blue: 0.08)
        static let surface = Color(red: 0.10, green: 0.10, blue: 0.12)
        static let surfaceElevated = Color(red: 0.14, green: 0.14, blue: 0.16)
        static let surfaceHighlight = Color(red: 0.18, green: 0.18, blue: 0.20)

        static let textPrimary = Color.white
        static let textSecondary = Color(white: 0.65)
        static let textTertiary = Color(white: 0.45)

        static let success = Color(red: 0.3, green: 0.85, blue: 0.4)
        static let error = Color(red: 1.0, green: 0.35, blue: 0.35)
        static let warning = Color(red: 1.0, green: 0.7, blue: 0.2)

        static let accentCyan = Color(red: 0.2, green: 0.8, blue: 0.9)
        static let accentPink = Color(red: 1.0, green: 0.4, blue: 0.6)
    }

    struct Typography {
        static let largeTitle = Font.system(size: 28, weight: .bold, design: .rounded)
        static let title = Font.system(size: 22, weight: .bold, design: .rounded)
        static let title2 = Font.system(size: 18, weight: .semibold, design: .rounded)
        static let headline = Font.system(size: 14, weight: .semibold, design: .rounded)
        static let body = Font.system(size: 13, weight: .regular, design: .default)
        static let callout = Font.system(size: 12, weight: .medium, design: .default)
        static let caption = Font.system(size: 11, weight: .medium, design: .default)
    }

    struct Spacing {
        static let xxs: CGFloat = 4
        static let xs: CGFloat = 8
        static let sm: CGFloat = 12
        static let md: CGFloat = 16
        static let lg: CGFloat = 24
        static let xl: CGFloat = 32
    }

    struct Radius {
        static let sm: CGFloat = 6
        static let md: CGFloat = 10
        static let lg: CGFloat = 14
    }
}

// MARK: - Prompt Template System

struct PromptTemplate: Identifiable, Codable, Equatable {
    let id: UUID
    var name: String
    var includeArtists: String
    var referenceArtists: String
    var vibe: String?
    var energy: String
    var notes: String
    var createdAt: Date

    init(id: UUID = UUID(), name: String, includeArtists: String = "", referenceArtists: String = "", vibe: String? = nil, createdAt: Date = Date(), energy: String = "Build", notes: String = "") {
        self.id = id
        self.name = name
        self.includeArtists = includeArtists
        self.referenceArtists = referenceArtists
        self.vibe = vibe
        self.createdAt = createdAt
        self.energy = energy
        self.notes = notes
    }
}

class TemplateManager: ObservableObject {
    @Published var templates: [PromptTemplate] = []
    private let userDefaults = UserDefaults.standard
    private let templatesKey = "savedTemplates"

    // Default templates
    static let defaultTemplates: [PromptTemplate] = [
        PromptTemplate(
            name: "🏃‍♂️ Workout",
            includeArtists: "Fred again",
            referenceArtists: "Chemical Brothers, Fatboy Slim",
            vibe: "energetic",
            energy: "Build",
            notes: "High energy mix for workouts"
        ),
        PromptTemplate(
            name: "🍽️ Dinner Party",
            includeArtists: "Disclosure",
            referenceArtists: "Tame Impala",
            vibe: "chill",
            energy: "Sustain",
            notes: "Sophisticated vibes for dinner"
        ),
        PromptTemplate(
            name: "🎉 House Party",
            includeArtists: "Fred again, Disclosure",
            referenceArtists: "Fatboy Slim, Chemical Brothers",
            vibe: "party",
            energy: "Build",
            notes: "Peak time party energy"
        ),
        PromptTemplate(
            name: "🌅 Sunset Session",
            includeArtists: "Rufus du Sol",
            referenceArtists: "Tame Impala",
            vibe: "dreamy",
            energy: "Sustain",
            notes: "Melodic sunset vibes"
        )
    ]

    init() {
        loadTemplates()
    }

    private func loadTemplates() {
        if let data = userDefaults.data(forKey: templatesKey),
           let decoded = try? JSONDecoder().decode([PromptTemplate].self, from: data) {
            templates = decoded
        } else {
            templates = TemplateManager.defaultTemplates
            saveTemplates()
        }
    }

    private func saveTemplates() {
        if let encoded = try? JSONEncoder().encode(templates) {
            userDefaults.set(encoded, forKey: templatesKey)
        }
    }

    func saveTemplate(_ template: PromptTemplate) {
        if let index = templates.firstIndex(where: { $0.id == template.id }) {
            templates[index] = template
        } else {
            templates.append(template)
        }
        saveTemplates()

        // Sync to server
        Task {
            await syncToServer(template)
        }
    }

    func deleteTemplate(_ template: PromptTemplate) {
        templates.removeAll { $0.id == template.id }
        saveTemplates()

        // Sync deletion to server
        Task {
            await deleteFromServer(template)
        }
    }

    // Server sync methods
    func syncFromServer() async {
        guard let url = URL(string: "https://mixmaster.mixtape.run/api/user/templates") else { return }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)

            struct ServerResponse: Codable {
                struct ServerTemplate: Codable {
                    let id: String
                    let name: String
                    let includeArtists: String?
                    let referenceArtists: String?
                    let vibe: String?
                    let energy: String?
                    let notes: String?
                    let createdAt: String
                }
                let templates: [ServerTemplate]
            }

            let decoded = try JSONDecoder().decode(ServerResponse.self, from: data)

            // Convert server templates to local format
            let serverTemplates: [PromptTemplate] = decoded.templates.compactMap { st in
                guard let uuid = UUID(uuidString: st.id) else { return nil }
                let dateFormatter = ISO8601DateFormatter()
                let createdDate = dateFormatter.date(from: st.createdAt) ?? Date()

                return PromptTemplate(
                    id: uuid,
                    name: st.name,
                    includeArtists: st.includeArtists ?? "",
                    referenceArtists: st.referenceArtists ?? "",
                    vibe: st.vibe,
                    createdAt: createdDate,
                    energy: st.energy ?? "Build",
                    notes: st.notes ?? ""
                )
            }

            // Merge with local templates
            await MainActor.run {
                // Keep default templates
                let defaults = templates.filter { t in
                    TemplateManager.defaultTemplates.contains { $0.name == t.name }
                }

                // Merge with server templates
                var merged = defaults
                for serverTemplate in serverTemplates {
                    if !merged.contains(where: { $0.id == serverTemplate.id }) {
                        merged.append(serverTemplate)
                    }
                }

                templates = merged
                saveTemplates()
            }
        } catch {
            print("Failed to sync templates from server: \(error)")
        }
    }

    private func syncToServer(_ template: PromptTemplate) async {
        guard let url = URL(string: "https://mixmaster.mixtape.run/api/user/templates") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let dateFormatter = ISO8601DateFormatter()
        let templateData: [String: Any] = [
            "id": template.id.uuidString,
            "name": template.name,
            "includeArtists": template.includeArtists,
            "referenceArtists": template.referenceArtists,
            "vibe": template.vibe ?? "",
            "energy": template.energy,
            "notes": template.notes,
            "createdAt": dateFormatter.string(from: template.createdAt)
        ]

        request.httpBody = try? JSONSerialization.data(withJSONObject: templateData)

        do {
            _ = try await URLSession.shared.data(for: request)
        } catch {
            print("Failed to sync template to server: \(error)")
        }
    }

    private func deleteFromServer(_ template: PromptTemplate) async {
        guard let url = URL(string: "https://mixmaster.mixtape.run/api/user/templates/\(template.id.uuidString)") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"

        do {
            _ = try await URLSession.shared.data(for: request)
        } catch {
            print("Failed to delete template from server: \(error)")
        }
    }
}

// MARK: - Generation History System

struct HistoryTrackItem: Codable, Equatable {
    let name: String
    let artist: String
    let bpm: Double?
    let key: String?
}

struct GenerationHistoryItem: Identifiable, Codable, Equatable {
    let id: UUID
    let prompt: String
    let playlistName: String
    let playlistId: String?
    let audioMixUrl: String?
    let trackCount: Int
    let createdAt: Date
    let tracks: [HistoryTrackItem]

    var typeDescription: String {
        if audioMixUrl != nil {
            return "Audio Mix"
        } else if playlistId != nil {
            return "Spotify Playlist"
        } else {
            return "Unknown"
        }
    }

    init(id: UUID = UUID(), prompt: String, playlistName: String, playlistId: String? = nil, audioMixUrl: String? = nil, trackCount: Int, createdAt: Date = Date(), tracks: [HistoryTrackItem] = []) {
        self.id = id
        self.prompt = prompt
        self.playlistName = playlistName
        self.playlistId = playlistId
        self.audioMixUrl = audioMixUrl
        self.trackCount = trackCount
        self.createdAt = createdAt
        self.tracks = tracks
    }
}

class HistoryManager: ObservableObject {
    @Published var history: [GenerationHistoryItem] = []
    private let userDefaults = UserDefaults.standard
    private let historyKey = "generationHistory"
    private let maxHistoryItems = 50

    init() {
        loadHistory()
    }

    private func loadHistory() {
        if let data = userDefaults.data(forKey: historyKey),
           let decoded = try? JSONDecoder().decode([GenerationHistoryItem].self, from: data) {
            history = Array(decoded.prefix(maxHistoryItems))
        }
    }

    private func saveHistory() {
        let trimmed = Array(history.prefix(maxHistoryItems))
        if let encoded = try? JSONEncoder().encode(trimmed) {
            userDefaults.set(encoded, forKey: historyKey)
        }
    }

    func addItem(_ item: GenerationHistoryItem) {
        history.insert(item, at: 0)
        if history.count > maxHistoryItems {
            history = Array(history.prefix(maxHistoryItems))
        }
        saveHistory()

        // Sync to server
        Task {
            await syncToServer(item)
        }
    }

    func clearHistory() {
        history.removeAll()
        saveHistory()
    }

    // Server sync methods
    func syncFromServer() async {
        guard let url = URL(string: "https://mixmaster.mixtape.run/api/user/history") else { return }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)

            struct ServerResponse: Codable {
                struct ServerHistoryItem: Codable {
                    struct ServerTrack: Codable {
                        let name: String
                        let artist: String
                        let bpm: Double?
                        let key: String?
                    }

                    let id: String
                    let prompt: String
                    let playlistName: String
                    let playlistId: String?
                    let audioMixUrl: String?
                    let trackCount: Int
                    let createdAt: String
                    let tracks: [ServerTrack]?
                }
                let history: [ServerHistoryItem]
            }

            let decoded = try JSONDecoder().decode(ServerResponse.self, from: data)

            // Convert server history to local format
            let serverHistory: [GenerationHistoryItem] = decoded.history.compactMap { sh in
                guard let uuid = UUID(uuidString: sh.id) else { return nil }
                let dateFormatter = ISO8601DateFormatter()
                let createdDate = dateFormatter.date(from: sh.createdAt) ?? Date()

                let tracks = sh.tracks?.map { t in
                    HistoryTrackItem(name: t.name, artist: t.artist, bpm: t.bpm, key: t.key)
                } ?? []

                return GenerationHistoryItem(
                    id: uuid,
                    prompt: sh.prompt,
                    playlistName: sh.playlistName,
                    playlistId: sh.playlistId,
                    audioMixUrl: sh.audioMixUrl,
                    trackCount: sh.trackCount,
                    createdAt: createdDate,
                    tracks: tracks
                )
            }

            // Merge with local history (server is source of truth)
            await MainActor.run {
                var merged = serverHistory

                // Add any local items not on server
                for localItem in history {
                    if !merged.contains(where: { $0.id == localItem.id }) {
                        merged.append(localItem)
                    }
                }

                // Sort by date and trim
                history = Array(merged.sorted { $0.createdAt > $1.createdAt }.prefix(maxHistoryItems))
                saveHistory()
            }
        } catch {
            print("Failed to sync history from server: \(error)")
        }
    }

    private func syncToServer(_ item: GenerationHistoryItem) async {
        guard let url = URL(string: "https://mixmaster.mixtape.run/api/user/history") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let dateFormatter = ISO8601DateFormatter()

        var itemData: [String: Any] = [
            "id": item.id.uuidString,
            "prompt": item.prompt,
            "playlistName": item.playlistName,
            "trackCount": item.trackCount,
            "createdAt": dateFormatter.string(from: item.createdAt),
            "tracks": item.tracks.map { track -> [String: Any] in
                var trackData: [String: Any] = [
                    "name": track.name,
                    "artist": track.artist
                ]
                if let bpm = track.bpm {
                    trackData["bpm"] = bpm
                }
                if let key = track.key {
                    trackData["key"] = key
                }
                return trackData
            }
        ]

        if let playlistId = item.playlistId {
            itemData["playlistId"] = playlistId
        }
        if let audioMixUrl = item.audioMixUrl {
            itemData["audioMixUrl"] = audioMixUrl
        }

        request.httpBody = try? JSONSerialization.data(withJSONObject: itemData)

        do {
            _ = try await URLSession.shared.data(for: request)
        } catch {
            print("Failed to sync history to server: \(error)")
        }
    }
}

// MARK: - Mashup Finder View

struct MashupFinderView: View {
    @StateObject private var mashupManager = MashupManager.shared
    @EnvironmentObject var libraryManager: LibraryManager
    @State private var selectedMode: MashupMode = .browse
    @State private var searchQuery = ""
    @State private var minCompatibility = 75

    enum MashupMode {
        case browse
        case search
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                VStack(alignment: .leading, spacing: 8) {
                    Text("Mashup Finder")
                        .font(AppTheme.Typography.largeTitle)
                        .foregroundStyle(
                            LinearGradient(colors: [AppTheme.Colors.gold, AppTheme.Colors.goldDeep], startPoint: .topLeading, endPoint: .bottomTrailing)
                        )

                    Text("Find compatible track pairs for simultaneous playback")
                        .font(AppTheme.Typography.callout)
                        .foregroundColor(AppTheme.Colors.textSecondary)
                }
                .padding(.horizontal)

                // Mode Selector
                Picker("Mode", selection: $selectedMode) {
                    Text("Browse Top Pairs").tag(MashupMode.browse)
                    Text("Find Partner").tag(MashupMode.search)
                }
                .pickerStyle(SegmentedPickerStyle())
                .padding(.horizontal)

                if selectedMode == .browse {
                    browseModeView
                } else {
                    searchModeView
                }
            }
            .padding(.vertical)
        }
        .background(AppTheme.Colors.background)
    }

    private var browseModeView: some View {
        VStack(spacing: 16) {
            // Controls
            HStack {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Min Compatibility: \(minCompatibility)%")
                        .font(AppTheme.Typography.callout)
                        .foregroundColor(AppTheme.Colors.textSecondary)

                    Slider(value: Binding(
                        get: { Double(minCompatibility) },
                        set: { minCompatibility = Int($0) }
                    ), in: 70...95, step: 5)
                        .tint(AppTheme.Colors.gold)
                }

                Button(action: {
                    Task {
                        await mashupManager.findMashupPairs(minScore: minCompatibility)
                    }
                }) {
                    HStack {
                        if mashupManager.isLoading {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Image(systemName: "waveform.path.ecg")
                        }
                        Text(mashupManager.isLoading ? "Analyzing..." : "Find Mashups")
                    }
                    .frame(width: 160)
                }
                .buttonStyle(.borderedProminent)
                .tint(AppTheme.Colors.gold)
                .disabled(mashupManager.isLoading)
            }
            .padding()
            .background(AppTheme.Colors.surface)
            .cornerRadius(12)
            .padding(.horizontal)

            // Summary
            if let summary = mashupManager.summary {
                HStack(spacing: 16) {
                    if let easy = summary.easyPairs {
                        statBox(label: "Easy", value: "\(easy)", color: AppTheme.Colors.success)
                    }
                    if let medium = summary.mediumPairs {
                        statBox(label: "Medium", value: "\(medium)", color: AppTheme.Colors.warning)
                    }
                    if let hard = summary.hardPairs {
                        statBox(label: "Hard", value: "\(hard)", color: AppTheme.Colors.error)
                    }
                }
                .padding(.horizontal)
            }

            // Results
            if !mashupManager.mashupPairs.isEmpty {
                ForEach(mashupManager.mashupPairs.prefix(20)) { pair in
                    mashupPairCard(pair: pair)
                }
            }

            // Error
            if let error = mashupManager.errorMessage {
                Text(error)
                    .foregroundColor(AppTheme.Colors.error)
                    .padding()
                    .background(AppTheme.Colors.surface)
                    .cornerRadius(12)
                    .padding(.horizontal)
            }
        }
    }

    private var searchModeView: some View {
        VStack(spacing: 16) {
            // Search field
            TextField("Search for a track...", text: $searchQuery)
                .textFieldStyle(.roundedBorder)
                .padding(.horizontal)

            // Results
            if !searchQuery.isEmpty {
                let filtered = libraryManager.tracks.filter { track in
                    let query = searchQuery.lowercased()
                    return track.name.lowercased().contains(query) ||
                           track.artists.joined(separator: " ").lowercased().contains(query)
                }

                ForEach(filtered.prefix(10)) { track in
                    Button(action: {
                        Task {
                            await mashupManager.findBestPartner(for: track.id)
                        }
                    }) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(track.name)
                                    .font(AppTheme.Typography.callout)
                                    .fontWeight(.medium)
                                    .foregroundColor(AppTheme.Colors.textPrimary)

                                Text(track.artists.joined(separator: ", "))
                                    .font(AppTheme.Typography.caption)
                                    .foregroundColor(AppTheme.Colors.textSecondary)
                            }
                            Spacer()
                            if let mikData = track.mikData, let key = mikData.key {
                                Text(key)
                                    .font(AppTheme.Typography.caption)
                                    .foregroundColor(AppTheme.Colors.accentCyan)
                            }
                        }
                        .padding()
                        .background(AppTheme.Colors.surface)
                        .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)
                }
            }

            // Best partner result
            if let partner = mashupManager.bestPartner {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Best Mashup Partner")
                        .font(AppTheme.Typography.headline)
                        .foregroundColor(AppTheme.Colors.textPrimary)
                        .padding(.horizontal)

                    mashupPairCard(pair: partner)
                }
            }
        }
    }

    private func statBox(label: String, value: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(AppTheme.Typography.title2)
                .fontWeight(.bold)
                .foregroundColor(color)
            Text(label)
                .font(AppTheme.Typography.caption)
                .foregroundColor(AppTheme.Colors.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(AppTheme.Colors.surface)
        .cornerRadius(12)
    }

    private func mashupPairCard(pair: MashupPair) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Text("\(Int(pair.compatibility.overallScore))%")
                    .font(AppTheme.Typography.title2)
                    .fontWeight(.bold)
                    .foregroundColor(difficultyColor(pair.compatibility.difficulty))

                Text(pair.compatibility.difficulty.uppercased())
                    .font(AppTheme.Typography.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(difficultyColor(pair.compatibility.difficulty))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(difficultyColor(pair.compatibility.difficulty).opacity(0.2))
                    .cornerRadius(6)

                Spacer()

                Text(pair.track1.camelotKey)
                    .font(AppTheme.Typography.caption)
                    .fontWeight(.bold)
                    .foregroundColor(AppTheme.Colors.accentCyan)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(AppTheme.Colors.accentCyan.opacity(0.2))
                    .cornerRadius(6)
            }

            // Tracks
            trackRow(track: pair.track1, icon: "1.circle.fill")

            HStack {
                Spacer()
                Image(systemName: "waveform.path.badge.plus")
                    .foregroundColor(AppTheme.Colors.gold)
                Spacer()
            }

            trackRow(track: pair.track2, icon: "2.circle.fill")

            // Mixing notes
            if !pair.mixingNotes.isEmpty {
                DisclosureGroup("Mixing Notes") {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(pair.mixingNotes, id: \.self) { note in
                            HStack(alignment: .top, spacing: 8) {
                                Text("•")
                                    .foregroundColor(AppTheme.Colors.gold)
                                Text(note)
                                    .font(AppTheme.Typography.caption)
                                    .foregroundColor(AppTheme.Colors.textSecondary)
                            }
                        }
                    }
                    .padding(.top, 8)
                }
                .font(AppTheme.Typography.callout)
                .foregroundColor(AppTheme.Colors.textSecondary)
                .tint(AppTheme.Colors.gold)
            }
        }
        .padding()
        .background(AppTheme.Colors.surface)
        .cornerRadius(12)
        .padding(.horizontal)
    }

    private func trackRow(track: MashupTrack, icon: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundColor(AppTheme.Colors.gold)

            VStack(alignment: .leading, spacing: 2) {
                Text(track.name)
                    .font(AppTheme.Typography.callout)
                    .fontWeight(.medium)
                    .foregroundColor(AppTheme.Colors.textPrimary)

                Text(track.artist)
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(AppTheme.Colors.textSecondary)
            }

            Spacer()

            Text("\(Int(track.bpm)) BPM")
                .font(AppTheme.Typography.caption)
                .foregroundColor(AppTheme.Colors.textTertiary)
        }
    }

    private func difficultyColor(_ difficulty: String) -> Color {
        switch difficulty.lowercased() {
        case "easy": return AppTheme.Colors.success
        case "medium": return AppTheme.Colors.warning
        case "hard": return AppTheme.Colors.error
        default: return AppTheme.Colors.textSecondary
        }
    }
}

struct ContentView: View {
    @EnvironmentObject var spotifyManager: SpotifyManager
    @EnvironmentObject var libraryManager: LibraryManager
    @State private var selectedTab: Tab = .generate
    @State private var showingNewPlaylist = false

    enum Tab: String, CaseIterable {
        case generate = "Generate"
        case mix = "Audio Mix"
        case mashups = "Mashups"
        case library = "Library"
        case playlists = "Playlists"
    }

    var body: some View {
        NavigationSplitView {
            // Sidebar
            VStack(alignment: .leading, spacing: 0) {
                // Logo/Title
                HStack {
                    Image(systemName: "waveform.circle.fill")
                        .font(.largeTitle)
                        .foregroundStyle(
                            LinearGradient(
                                colors: [AppTheme.Colors.gold, AppTheme.Colors.goldDeep],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    Text("Notorious DAD")
                        .font(AppTheme.Typography.headline)
                        .foregroundColor(AppTheme.Colors.textPrimary)
                }
                .padding()

                Divider()

                // Navigation
                List(Tab.allCases, id: \.self, selection: $selectedTab) { tab in
                    Label(tab.rawValue, systemImage: iconForTab(tab))
                        .tag(tab)
                }
                .listStyle(.sidebar)

                Divider()

                // Status
                VStack(alignment: .leading, spacing: 8) {
                    if spotifyManager.isAuthenticated {
                        Label("Spotify Connected", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(AppTheme.Colors.success)
                    } else {
                        Button("Connect Spotify") {
                            spotifyManager.authorize()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.Colors.gold)
                    }

                    Text("\(libraryManager.trackCount) tracks loaded")
                        .font(AppTheme.Typography.caption)
                        .foregroundStyle(AppTheme.Colors.textSecondary)
                }
                .padding()
            }
            .frame(minWidth: 200)
        } detail: {
            // Main content
            switch selectedTab {
            case .generate:
                GenerateView(showingNewPlaylist: $showingNewPlaylist)
            case .mix:
                MixGeneratorView()
            case .mashups:
                MashupFinderView()
            case .library:
                LibraryView()
            case .playlists:
                PlaylistsView()
            }
        }
        .sheet(isPresented: $showingNewPlaylist) {
            NewPlaylistSheet()
        }
        .onReceive(NotificationCenter.default.publisher(for: .newPlaylist)) { _ in
            showingNewPlaylist = true
        }
        .tint(AppTheme.Colors.gold)
        .preferredColorScheme(.dark)
    }

    private func iconForTab(_ tab: Tab) -> String {
        switch tab {
        case .generate: return "wand.and.stars"
        case .mix: return "waveform.path.ecg"
        case .mashups: return "waveform.path.badge.plus"
        case .library: return "music.note.list"
        case .playlists: return "list.bullet.rectangle"
        }
    }
}

// MARK: - Generate View

struct GenerateView: View {
    @EnvironmentObject var spotifyManager: SpotifyManager
    @EnvironmentObject var libraryManager: LibraryManager
    @Binding var showingNewPlaylist: Bool

    // Form Fields
    @State private var includeArtists = ""
    @State private var referenceArtists = ""
    @State private var selectedMood: MacMoodPreset?
    @State private var trackCount = 30
    @State private var bpmMin = ""
    @State private var bpmMax = ""
    @State private var selectedEnergy: MacEnergyPreset = .build
    @State private var advancedNotes = "" // Free-text for advanced NLP options

    // UI State
    @State private var isGenerating = false
    @State private var generationError: String?
    @State private var generatedPlaylistURL: String?
    @State private var showingSuccess = false

    var body: some View {
        HStack(spacing: 0) {
            // Left Panel - Form
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Header
                    HStack {
                        VStack(alignment: .leading) {
                            Text("Generate Mix")
                                .font(.largeTitle.bold())
                            Text("Create DJ-ready playlists with harmonic mixing")
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .padding(.bottom, 8)

                    // MARK: - Artists Section
                    GroupBox {
                        VStack(alignment: .leading, spacing: 16) {
                            // Include Artists
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.green)
                                    Text("Include Artists")
                                        .font(.headline)
                                    Text("(must appear)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                TextField("Fred again, Disclosure, Rufus Du Sol", text: $includeArtists)
                                    .textFieldStyle(.roundedBorder)
                            }

                            // Reference Artists
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Image(systemName: "arrow.triangle.branch")
                                        .foregroundStyle(.blue)
                                    Text("Reference Artists")
                                        .font(.headline)
                                    Text("(style guide)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                TextField("Chemical Brothers, Fatboy Slim", text: $referenceArtists)
                                    .textFieldStyle(.roundedBorder)
                            }
                        }
                        .padding(.vertical, 8)
                    } label: {
                        Label("Artists", systemImage: "music.mic")
                    }

                    // MARK: - Mood Section
                    GroupBox {
                        LazyVGrid(columns: [
                            GridItem(.flexible()),
                            GridItem(.flexible()),
                            GridItem(.flexible())
                        ], spacing: 12) {
                            ForEach(MacMoodPreset.allCases, id: \.self) { mood in
                                MacMoodButton(mood: mood, isSelected: selectedMood == mood) {
                                    selectedMood = selectedMood == mood ? nil : mood
                                }
                            }
                        }
                        .padding(.vertical, 8)
                    } label: {
                        Label("Vibe & Mood", systemImage: "face.smiling")
                    }

                    // MARK: - Energy Section
                    GroupBox {
                        HStack(spacing: 12) {
                            ForEach(MacEnergyPreset.allCases, id: \.self) { energy in
                                MacEnergyButton(energy: energy, isSelected: selectedEnergy == energy) {
                                    selectedEnergy = energy
                                }
                            }
                        }
                        .padding(.vertical, 8)
                    } label: {
                        Label("Energy Curve", systemImage: "chart.line.uptrend.xyaxis")
                    }

                    // MARK: - Settings Section
                    GroupBox {
                        VStack(spacing: 16) {
                            // Track Count
                            HStack {
                                Text("Number of Tracks")
                                Spacer()
                                Stepper(value: $trackCount, in: 10...100, step: 5) {
                                    Text("\(trackCount)")
                                        .font(.headline.monospacedDigit())
                                        .frame(width: 40)
                                }
                            }

                            Divider()

                            // BPM Range
                            HStack {
                                Text("BPM Range")
                                Spacer()
                                HStack(spacing: 8) {
                                    TextField("Min", text: $bpmMin)
                                        .textFieldStyle(.roundedBorder)
                                        .frame(width: 60)
                                    Text("–")
                                    TextField("Max", text: $bpmMax)
                                        .textFieldStyle(.roundedBorder)
                                        .frame(width: 60)
                                }
                            }
                        }
                        .padding(.vertical, 8)
                    } label: {
                        Label("Settings", systemImage: "slider.horizontal.3")
                    }

                    // MARK: - Notes Section (Optional)
                    GroupBox {
                        VStack(alignment: .leading, spacing: 8) {
                            TextField("e.g. 90s house, deep cuts, exclude Drake", text: $advancedNotes, axis: .vertical)
                                .textFieldStyle(.roundedBorder)
                                .lineLimit(2...4)
                            Text("Add extra instructions: era, exclude artists, deep cuts vs hits")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 8)
                    } label: {
                        Label("Notes (Optional)", systemImage: "text.bubble")
                    }

                    // MARK: - Generate Button
                    Button(action: generatePlaylist) {
                        HStack(spacing: 12) {
                            if isGenerating {
                                ProgressView()
                                    .controlSize(.small)
                            } else {
                                Image(systemName: "wand.and.stars")
                            }
                            Text(isGenerating ? "Generating Mix..." : "Generate Mix")
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(!canGenerate || isGenerating)

                    // Error Message
                    if let error = generationError {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                            Text(error)
                                .foregroundStyle(.red)
                        }
                        .font(.callout)
                    }

                    // Tip
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "lightbulb.fill")
                            .foregroundStyle(.yellow)
                        Text("**Tip:** Use \"Include\" for artists that must appear in your playlist. Use \"Reference\" for artists whose style should influence the selection.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .background(.quaternary.opacity(0.5))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(24)
            }
            .frame(maxWidth: .infinity)

            Divider()

            // Right Panel - Preview
            VStack(spacing: 0) {
                // Preview Header
                HStack {
                    Text("Preview")
                        .font(.title2.bold())
                    Spacer()
                    if generatedPlaylistURL != nil {
                        Button {
                            if let url = generatedPlaylistURL,
                               let spotifyURL = URL(string: url) {
                                NSWorkspace.shared.open(spotifyURL)
                            }
                        } label: {
                            Label("Open in Spotify", systemImage: "arrow.up.forward.app")
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                .padding()

                Divider()

                if generatedPlaylistURL != nil {
                    VStack(spacing: 16) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 60))
                            .foregroundStyle(.green)
                        Text("Playlist Created!")
                            .font(.title2.bold())
                        Text("Your mix has been added to Spotify")
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ContentUnavailableView(
                        "No Playlist Yet",
                        systemImage: "waveform",
                        description: Text("Fill in the form and click Generate to create your mix")
                    )
                }
            }
            .frame(width: 350)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .alert("Playlist Created!", isPresented: $showingSuccess) {
            if let url = generatedPlaylistURL {
                Button("Open in Spotify") {
                    if let spotifyURL = URL(string: url) {
                        NSWorkspace.shared.open(spotifyURL)
                    }
                }
            }
            Button("OK", role: .cancel) { }
        } message: {
            Text("Your mix has been created and added to your Spotify library.")
        }
    }

    // MARK: - Computed Properties

    private var canGenerate: Bool {
        spotifyManager.isAuthenticated && (!includeArtists.isEmpty || !referenceArtists.isEmpty || selectedMood != nil)
    }

    private var generatedPrompt: String {
        var parts: [String] = []

        if !includeArtists.isEmpty {
            parts.append("Include: \(includeArtists)")
        }
        if !referenceArtists.isEmpty {
            parts.append("Reference: \(referenceArtists)")
        }
        if let mood = selectedMood {
            parts.append("Mood: \(mood.rawValue)")
        }
        parts.append("\(trackCount) tracks")
        parts.append("Energy: \(selectedEnergy.rawValue)")

        if let min = Int(bpmMin), let max = Int(bpmMax), min > 0, max > 0 {
            parts.append("BPM: \(min)-\(max)")
        }

        // Add free-text notes at the end (parsed by NLP)
        if !advancedNotes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append(advancedNotes.trimmingCharacters(in: .whitespacesAndNewlines))
        }

        return parts.joined(separator: ". ")
    }

    // MARK: - Actions

    private func generatePlaylist() {
        isGenerating = true
        generationError = nil

        Task {
            do {
                let playlistURL = try await callGeneratePlaylistAPI(prompt: generatedPrompt)
                await MainActor.run {
                    isGenerating = false
                    generatedPlaylistURL = playlistURL
                    showingSuccess = true
                    clearForm()
                }
            } catch {
                await MainActor.run {
                    isGenerating = false
                    generationError = error.localizedDescription
                }
            }
        }
    }

    private func clearForm() {
        includeArtists = ""
        referenceArtists = ""
        selectedMood = nil
        bpmMin = ""
        bpmMax = ""
        advancedNotes = ""
    }

    private func callGeneratePlaylistAPI(prompt: String) async throws -> String {
        // Use cloud server with HTTPS
        guard let url = URL(string: "https://mixmaster.mixtape.run/api/generate-playlist") else {
            throw MacGenerationError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120

        // Include refresh token for server-side auth (bypasses cookie-based auth)
        let body: [String: Any] = [
            "prompt": prompt,
            "refresh_token": "AQB1rhlNzigZavJoEM52V7ANmglze5E8i6KffPV7UcE05TAfNReaIkcu3frWseCSsiKMBIhOXMn9YINoG1ao_syFAelvnQQPKHsXvxJk12lrmfW7yqoBNUWJhsLE_sxprBo"
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw MacGenerationError.invalidResponse
        }

        if httpResponse.statusCode != 200 {
            if let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let errorMessage = errorJson["error"] as? String {
                throw MacGenerationError.apiError(errorMessage)
            }
            throw MacGenerationError.apiError("Status \(httpResponse.statusCode)")
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let playlistUrl = json["playlistUrl"] as? String else {
            throw MacGenerationError.invalidResponse
        }

        return playlistUrl
    }
}

// MARK: - macOS Supporting Types

enum MacMoodPreset: String, CaseIterable {
    case chilled = "Chilled"
    case energetic = "Energetic"
    case focused = "Focused"
    case social = "Social"
    case moody = "Moody"
    case workout = "Workout"

    var icon: String {
        switch self {
        case .chilled: return "leaf.fill"
        case .energetic: return "flame.fill"
        case .focused: return "brain.head.profile"
        case .social: return "person.2.fill"
        case .moody: return "moon.stars.fill"
        case .workout: return "figure.run"
        }
    }

    var color: Color {
        switch self {
        case .chilled: return .mint
        case .energetic: return .orange
        case .focused: return .indigo
        case .social: return .pink
        case .moody: return .purple
        case .workout: return .red
        }
    }
}

enum MacEnergyPreset: String, CaseIterable {
    case build = "Build"
    case peak = "Peak"
    case wave = "Wave"
    case descend = "Descend"
    case steady = "Steady"

    var icon: String {
        switch self {
        case .build: return "chart.line.uptrend.xyaxis"
        case .peak: return "arrow.up.to.line"
        case .wave: return "waveform.path"
        case .descend: return "chart.line.downtrend.xyaxis"
        case .steady: return "minus"
        }
    }
}

enum MacGenerationError: LocalizedError {
    case invalidURL
    case invalidResponse
    case apiError(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid API URL"
        case .invalidResponse: return "Invalid response from server"
        case .apiError(let message): return message
        }
    }
}

// MARK: - macOS UI Components

struct MacMoodButton: View {
    let mood: MacMoodPreset
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: mood.icon)
                    .font(.title2)
                Text(mood.rawValue)
                    .font(.caption)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(isSelected ? mood.color.opacity(0.2) : Color.clear)
            .foregroundStyle(isSelected ? mood.color : .primary)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? mood.color : Color.secondary.opacity(0.3), lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
    }
}

struct MacEnergyButton: View {
    let energy: MacEnergyPreset
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: energy.icon)
                    .font(.caption)
                Text(energy.rawValue)
                    .font(.caption)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(isSelected ? Color.purple.opacity(0.2) : Color.clear)
            .foregroundStyle(isSelected ? .purple : .primary)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(isSelected ? Color.purple : Color.secondary.opacity(0.3), lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Playlist Preview

struct PlaylistPreview: View {
    let playlist: DADPlaylist

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Stats header
            HStack {
                VStack(alignment: .leading) {
                    Text(playlist.name)
                        .font(.title2.bold())
                    Text("\(playlist.tracks.count) tracks • \(playlist.formattedDuration)")
                        .foregroundStyle(.secondary)
                }

                Spacer()

                VStack(alignment: .trailing) {
                    HStack {
                        Image(systemName: "music.quarternote.3")
                        Text("\(playlist.artistCount) artists")
                    }
                    HStack {
                        Image(systemName: "key")
                        Text(String(format: "%.0f%% harmonic", playlist.harmonicScore))
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            .padding()

            Divider()

            // Track list
            List(Array(playlist.tracks.enumerated()), id: \.element.id) { index, track in
                HStack {
                    Text("\(index + 1)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .frame(width: 30)

                    VStack(alignment: .leading) {
                        Text(track.name)
                            .lineLimit(1)
                        Text(track.artistName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    if let key = track.camelotKey {
                        Text(key)
                            .font(.caption.monospaced())
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.purple.opacity(0.2))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }

                    if let bpm = track.bpm {
                        Text("\(Int(bpm))")
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}

// MARK: - Mix Generator View

struct MixGeneratorView: View {
    @EnvironmentObject var libraryManager: LibraryManager
    @EnvironmentObject var notificationManager: NotificationManager

    // Form Fields
    @State private var mixPrompt = ""
    @State private var selectedDuration: MixDuration = .short
    @State private var selectedStyle: MixStyle?

    // UI State
    @State private var isGenerating = false
    @State private var generationProgress = ""
    @State private var generationError: String?
    @State private var generatedMix: GeneratedMix?
    @State private var previousMixes: [PreviousMix] = []

    var body: some View {
        HSplitView {
            // Left Panel - Form
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Header
                    HStack {
                        VStack(alignment: .leading) {
                            Text("Audio Mix Generator")
                                .font(.largeTitle.bold())
                            Text("Create beatmatched, harmonically-mixed audio files")
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .padding(.bottom, 8)

                    // MARK: - Prompt Input
                    GroupBox {
                        VStack(alignment: .leading, spacing: 12) {
                            TextField("Describe your mix: e.g., 'upbeat house mix for a beach party'", text: $mixPrompt, axis: .vertical)
                                .textFieldStyle(.roundedBorder)
                                .lineLimit(2...4)

                            Text("Tip: Include mood, artists, BPM range, or occasion")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 8)
                    } label: {
                        Label("Mix Description", systemImage: "text.bubble")
                    }

                    // MARK: - Style Presets
                    GroupBox {
                        LazyVGrid(columns: [
                            GridItem(.flexible()),
                            GridItem(.flexible()),
                            GridItem(.flexible())
                        ], spacing: 12) {
                            ForEach(MixStyle.allCases, id: \.self) { style in
                                MixStyleButton(style: style, isSelected: selectedStyle == style) {
                                    selectedStyle = selectedStyle == style ? nil : style
                                    if selectedStyle != nil {
                                        mixPrompt = style.prompt
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 8)
                    } label: {
                        Label("Quick Presets", systemImage: "square.grid.2x2")
                    }

                    // MARK: - Duration Selection
                    GroupBox {
                        HStack(spacing: 12) {
                            ForEach(MixDuration.allCases, id: \.self) { duration in
                                MixDurationButton(duration: duration, isSelected: selectedDuration == duration) {
                                    selectedDuration = duration
                                }
                            }
                        }
                        .padding(.vertical, 8)
                    } label: {
                        Label("Mix Length", systemImage: "clock")
                    }

                    // MARK: - Generate Button
                    Button(action: generateMix) {
                        HStack(spacing: 12) {
                            if isGenerating {
                                ProgressView()
                                    .controlSize(.small)
                            } else {
                                Image(systemName: "waveform.path.ecg")
                            }
                            Text(isGenerating ? "Generating Mix..." : "Generate Audio Mix")
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.purple)
                    .controlSize(.large)
                    .disabled(mixPrompt.isEmpty || isGenerating)

                    // Progress Message
                    if isGenerating && !generationProgress.isEmpty {
                        HStack {
                            ProgressView()
                                .controlSize(.small)
                            Text(generationProgress)
                                .foregroundStyle(.secondary)
                        }
                        .font(.callout)
                    }

                    // Error Message
                    if let error = generationError {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                            Text(error)
                                .foregroundStyle(.red)
                        }
                        .font(.callout)
                    }

                    // MARK: - Info Box
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "info.circle.fill")
                            .foregroundStyle(.blue)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("**How it works:**")
                            Text("1. AI selects tracks from your library")
                            Text("2. Analyzes beat & key for optimal transitions")
                            Text("3. Creates seamless crossfades with FFmpeg")
                            Text("4. Exports a ready-to-play audio file")
                        }
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    }
                    .padding()
                    .background(.quaternary.opacity(0.5))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .padding(24)
            }
            .frame(minWidth: 400, maxWidth: .infinity)

            // Right Panel - Result / Previous Mixes
            VStack(spacing: 0) {
                // Header
                HStack {
                    Text(generatedMix != nil ? "Your Mix" : "Previous Mixes")
                        .font(.title2.bold())
                    Spacer()
                    if generatedMix != nil {
                        Button {
                            generatedMix = nil
                        } label: {
                            Label("Show All", systemImage: "list.bullet")
                        }
                    }
                }
                .padding()

                Divider()

                if let mix = generatedMix {
                    // Show generated mix result
                    MixResultView(mix: mix)
                } else if previousMixes.isEmpty {
                    ContentUnavailableView(
                        "No Mixes Yet",
                        systemImage: "waveform",
                        description: Text("Generate your first audio mix to get started")
                    )
                } else {
                    // Show previous mixes list
                    List(previousMixes, id: \.filename) { mix in
                        PreviousMixRow(mix: mix) {
                            downloadMix(filename: mix.filename)
                        }
                    }
                }
            }
            .frame(minWidth: 300, maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            loadPreviousMixes()
        }
    }

    // MARK: - Actions

    private func generateMix() {
        isGenerating = true
        generationError = nil
        generationProgress = "Selecting tracks from library..."

        Task {
            do {
                let result = try await callGenerateMixAPI(
                    prompt: mixPrompt,
                    trackCount: selectedDuration.trackCount
                )
                await MainActor.run {
                    isGenerating = false
                    generatedMix = result
                    generationProgress = ""
                    loadPreviousMixes() // Refresh list

                    // Send notification on success
                    notificationManager.notifyMixComplete(
                        mixName: result.filename,
                        trackCount: result.trackCount
                    )
                }
            } catch {
                await MainActor.run {
                    isGenerating = false
                    generationError = error.localizedDescription
                    generationProgress = ""

                    // Send notification on failure
                    notificationManager.notifyMixFailed(error: error.localizedDescription)
                }
            }
        }
    }

    private func loadPreviousMixes() {
        Task {
            do {
                let mixes = try await fetchPreviousMixes()
                await MainActor.run {
                    previousMixes = mixes
                }
            } catch {
                print("Failed to load previous mixes: \(error)")
            }
        }
    }

    private func downloadMix(filename: String) {
        // Use cloud server with HTTPS
        guard let url = URL(string: "https://mixmaster.mixtape.run/api/download-mix?file=\(filename.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? filename)") else { return }
        NSWorkspace.shared.open(url)
    }

    // MARK: - API Calls

    private func callGenerateMixAPI(prompt: String, trackCount: Int) async throws -> GeneratedMix {
        let baseUrl = "https://mixmaster.mixtape.run"

        // Step 1: Start the job
        guard let startUrl = URL(string: "\(baseUrl)/api/generate-mix") else {
            throw MixGenerationError.invalidURL
        }

        var startRequest = URLRequest(url: startUrl)
        startRequest.httpMethod = "POST"
        startRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        startRequest.timeoutInterval = 30

        let body: [String: Any] = [
            "prompt": prompt,
            "trackCount": trackCount
        ]
        startRequest.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (startData, startResponse) = try await URLSession.shared.data(for: startRequest)

        guard let httpResponse = startResponse as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            if let errorJson = try? JSONSerialization.jsonObject(with: startData) as? [String: Any],
               let errorMessage = errorJson["error"] as? String {
                throw MixGenerationError.apiError(errorMessage)
            }
            throw MixGenerationError.apiError("Failed to start mix generation")
        }

        guard let startJson = try? JSONSerialization.jsonObject(with: startData) as? [String: Any],
              let jobId = startJson["jobId"] as? String else {
            throw MixGenerationError.invalidResponse
        }

        // Step 2: Poll for status
        await MainActor.run {
            generationProgress = "Starting mix generation..."
        }

        let statusUrl = URL(string: "\(baseUrl)/api/mix-status/\(jobId)")!
        var pollCount = 0
        let maxPolls = 180 // 15 minutes at 5 second intervals

        while pollCount < maxPolls {
            try await Task.sleep(nanoseconds: 5_000_000_000) // 5 seconds
            pollCount += 1

            let (statusData, _) = try await URLSession.shared.data(from: statusUrl)

            guard let statusJson = try? JSONSerialization.jsonObject(with: statusData) as? [String: Any],
                  let status = statusJson["status"] as? String else {
                continue
            }

            // Update progress message
            if let progressMessage = statusJson["progressMessage"] as? String {
                await MainActor.run {
                    generationProgress = progressMessage
                }
            }

            if status == "complete" {
                // Parse the result
                guard let result = statusJson["result"] as? [String: Any] else {
                    throw MixGenerationError.invalidResponse
                }

                let mixName = result["mixName"] as? String ?? "Mix"
                let mixUrl = result["mixUrl"] as? String ?? ""
                let tracklist = result["tracklist"] as? [[String: Any]] ?? []
                let duration = result["duration"] as? Double ?? 0

                return GeneratedMix(
                    filename: mixName,
                    downloadUrl: mixUrl,
                    duration: formatDuration(duration),
                    trackCount: tracklist.count,
                    tracks: tracklist.compactMap { track in
                        MixTrackInfo(
                            title: track["title"] as? String ?? "",
                            artist: track["artist"] as? String ?? "",
                            bpm: track["bpm"] as? Double ?? 0,
                            key: track["key"] as? String ?? ""
                        )
                    }
                )
            } else if status == "failed" {
                let errorMessage = statusJson["error"] as? String ?? "Mix generation failed"
                throw MixGenerationError.apiError(errorMessage)
            }
            // Continue polling for pending/processing status
        }

        throw MixGenerationError.apiError("Mix generation timed out")
    }

    private func formatDuration(_ seconds: Double) -> String {
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", minutes, secs)
    }

    private func fetchPreviousMixes() async throws -> [PreviousMix] {
        // Use cloud server with HTTPS
        guard let url = URL(string: "https://mixmaster.mixtape.run/api/list-mixes") else {
            throw MixGenerationError.invalidURL
        }

        let (data, _) = try await URLSession.shared.data(from: url)

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let mixes = json["mixes"] as? [[String: Any]] else {
            return []
        }

        return mixes.compactMap { mix in
            PreviousMix(
                filename: mix["filename"] as? String ?? "",
                name: mix["name"] as? String ?? "",
                duration: mix["durationFormatted"] as? String ?? "",
                size: mix["sizeFormatted"] as? String ?? "",
                createdAt: mix["createdAt"] as? String ?? ""
            )
        }
    }
}

// MARK: - Mix Generator Supporting Types

struct GeneratedMix {
    let filename: String
    let downloadUrl: String
    let duration: String
    let trackCount: Int
    let tracks: [MixTrackInfo]
}

struct MixTrackInfo {
    let title: String
    let artist: String
    let bpm: Double
    let key: String
}

struct PreviousMix {
    let filename: String
    let name: String
    let duration: String
    let size: String
    let createdAt: String
}

enum MixStyle: String, CaseIterable {
    case beach = "Beach Party"
    case workout = "Workout"
    case dinner = "Dinner Party"
    case lateNight = "Late Night"
    case focus = "Focus/Work"
    case roadTrip = "Road Trip"

    var icon: String {
        switch self {
        case .beach: return "sun.max.fill"
        case .workout: return "figure.run"
        case .dinner: return "fork.knife"
        case .lateNight: return "moon.stars.fill"
        case .focus: return "brain.head.profile"
        case .roadTrip: return "car.fill"
        }
    }

    var color: Color {
        switch self {
        case .beach: return .orange
        case .workout: return .red
        case .dinner: return .brown
        case .lateNight: return .purple
        case .focus: return .blue
        case .roadTrip: return .green
        }
    }

    var prompt: String {
        switch self {
        case .beach: return "Upbeat house and disco for a summer beach party, 118-126 BPM"
        case .workout: return "High energy workout mix with driving beats, 128-140 BPM"
        case .dinner: return "Chill deep house and nu-disco for a sophisticated dinner party"
        case .lateNight: return "Dark, melodic techno for late night vibes, 122-130 BPM"
        case .focus: return "Ambient electronica and downtempo for deep focus, 80-110 BPM"
        case .roadTrip: return "Feel-good indie dance and electropop for a road trip"
        }
    }
}

enum MixDuration: String, CaseIterable {
    case short = "30 min"
    case medium = "1 hour"
    case long = "2 hours"

    var trackCount: Int {
        switch self {
        // Match iOS presets (assuming ~3.5 min per track with crossfade)
        case .short: return 12   // ~30-35 min
        case .medium: return 20  // ~55-65 min
        case .long: return 40    // ~2 hours
        }
    }
}

enum MixGenerationError: LocalizedError {
    case invalidURL
    case invalidResponse
    case apiError(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid API URL"
        case .invalidResponse: return "Invalid response from server"
        case .apiError(let message): return message
        }
    }
}

// MARK: - Mix UI Components

struct MixStyleButton: View {
    let style: MixStyle
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: style.icon)
                    .font(.title2)
                Text(style.rawValue)
                    .font(.caption)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(isSelected ? style.color.opacity(0.2) : Color.clear)
            .foregroundStyle(isSelected ? style.color : .primary)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? style.color : Color.secondary.opacity(0.3), lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
    }
}

struct MixDurationButton: View {
    let duration: MixDuration
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: "clock")
                    .font(.caption)
                Text(duration.rawValue)
                    .font(.callout)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(isSelected ? Color.purple.opacity(0.2) : Color.clear)
            .foregroundStyle(isSelected ? .purple : .primary)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(isSelected ? Color.purple : Color.secondary.opacity(0.3), lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
    }
}

struct MixResultView: View {
    let mix: GeneratedMix

    @StateObject private var player = AudioPlayerManager()
    @State private var showShareSheet = false

    var body: some View {
        VStack(spacing: 0) {
            // Success Header
            VStack(spacing: 16) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 50))
                    .foregroundStyle(.green)
                Text("Mix Generated!")
                    .font(.title2.bold())
                Text("\(mix.trackCount) tracks • \(mix.duration)")
                    .foregroundStyle(.secondary)

                // Audio Player Controls
                VStack(spacing: 12) {
                    // Waveform + filename
                    HStack {
                        Image(systemName: "waveform")
                            .foregroundStyle(.purple)
                        Text(mix.filename)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .lineLimit(1)
                    }

                    // Playback progress bar
                    if player.duration > 0 {
                        VStack(spacing: 4) {
                            GeometryReader { geometry in
                                ZStack(alignment: .leading) {
                                    // Background track
                                    Rectangle()
                                        .fill(Color.secondary.opacity(0.3))
                                        .frame(height: 6)

                                    // Progress
                                    Rectangle()
                                        .fill(Color.purple)
                                        .frame(width: geometry.size.width * CGFloat(player.currentTime / player.duration), height: 6)
                                }
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                                .onTapGesture { location in
                                    let position = min(max(0, location.x / geometry.size.width), 1)
                                    player.seek(to: position)
                                }
                            }
                            .frame(height: 6)

                            // Time labels
                            HStack {
                                Text(formatTime(player.currentTime))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Spacer()
                                Text(formatTime(player.duration))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    // Control buttons
                    HStack(spacing: 12) {
                        // Play/Pause button
                        Button {
                            if player.isPlaying || player.duration > 0 {
                                player.togglePlayPause()
                            } else {
                                startStreaming()
                            }
                        } label: {
                            HStack {
                                Image(systemName: player.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                                    .font(.title3)
                                Text(player.isPlaying ? "Pause" : (player.duration > 0 ? "Play" : "Stream Mix"))
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.purple)
                        .disabled(player.isLoading)

                        // Save to Music button
                        Button {
                            saveToMusic()
                        } label: {
                            Label("Save to Music", systemImage: "square.and.arrow.down")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                    }

                    // Loading/download indicator
                    if player.isLoading {
                        ProgressView()
                            .scaleEffect(0.7)
                            .padding(.vertical, 4)
                    }

                    if player.downloadProgress > 0 && player.downloadProgress < 1 {
                        HStack {
                            ProgressView(value: player.downloadProgress)
                            Text("\(Int(player.downloadProgress * 100))%")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if let error = player.error {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                .padding()
                .background(Color.secondary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .padding(.horizontal)
            }
            .padding(.vertical, 24)

            Divider()

            // Track List
            List(Array(mix.tracks.enumerated()), id: \.offset) { index, track in
                HStack {
                    Text("\(index + 1)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .frame(width: 24)

                    VStack(alignment: .leading) {
                        Text(track.title)
                            .lineLimit(1)
                        Text(track.artist)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Text(track.key)
                        .font(.caption.monospaced())
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.purple.opacity(0.2))
                        .clipShape(RoundedRectangle(cornerRadius: 4))

                    Text("\(Int(track.bpm))")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .frame(width: 32)
                }
            }
        }
    }

    // MARK: - Helper Methods

    private func getMixURL() -> URL? {
        return URL(string: "https://mixmaster.mixtape.run\(mix.downloadUrl)")
    }

    private func startStreaming() {
        guard let url = getMixURL() else { return }
        player.streamAudio(from: url)
    }

    private func saveToMusic() {
        guard let url = getMixURL() else { return }

        // Download the file first (if not already cached)
        player.downloadAudio(from: url) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let fileURL):
                    // Show macOS share sheet (NSSharingServicePicker)
                    let picker = NSSharingServicePicker(items: [fileURL])
                    if let window = NSApplication.shared.keyWindow,
                       let contentView = window.contentView {
                        picker.show(relativeTo: .zero, of: contentView, preferredEdge: .minY)
                    }
                case .failure(let error):
                    player.error = "Download failed: \(error.localizedDescription)"
                }
            }
        }
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

struct PreviousMixRow: View {
    let mix: PreviousMix
    let onDownload: () -> Void

    var body: some View {
        HStack {
            Image(systemName: "waveform")
                .foregroundStyle(.purple)
                .frame(width: 32)

            VStack(alignment: .leading) {
                Text(mix.name)
                    .lineLimit(1)
                HStack {
                    Text(mix.duration)
                    Text("•")
                    Text(mix.size)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            Spacer()

            Button(action: onDownload) {
                Image(systemName: "arrow.down.circle")
            }
            .buttonStyle(.borderless)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Placeholder Views

struct LibraryView: View {
    @EnvironmentObject var libraryManager: LibraryManager
    @State private var searchText = ""
    @State private var selectedFilter: LibraryFilter = .all
    @State private var showFilters = false

    // DJ Filters
    @State private var selectedKey: String?
    @State private var bpmMin: Double = 80
    @State private var bpmMax: Double = 180
    @State private var bpmFilterActive = false

    enum LibraryFilter: String, CaseIterable {
        case all = "All"
        case mik = "MIK"
        case appleMusic = "Apple Music"
    }

    // Available Camelot keys for filtering
    static let camelotKeys = [
        "1A", "2A", "3A", "4A", "5A", "6A", "7A", "8A", "9A", "10A", "11A", "12A",
        "1B", "2B", "3B", "4B", "5B", "6B", "7B", "8B", "9B", "10B", "11B", "12B"
    ]

    var activeFilterCount: Int {
        var count = 0
        if selectedKey != nil { count += 1 }
        if bpmFilterActive { count += 1 }
        return count
    }

    var filteredTracks: [NotoriousDADKit.Track] {
        var tracks = libraryManager.tracks

        // Source filter
        switch selectedFilter {
        case .mik: tracks = tracks.filter { $0.mikData != nil }
        case .appleMusic: tracks = tracks.filter { $0.appleMusicPlayCount > 0 }
        case .all: break
        }

        // Key filter
        if let key = selectedKey {
            tracks = tracks.filter { $0.camelotKey == key || $0.mikData?.key == key }
        }

        // BPM filter
        if bpmFilterActive {
            tracks = tracks.filter { track in
                guard let bpm = track.bpm else { return false }
                return bpm >= bpmMin && bpm <= bpmMax
            }
        }

        // Search filter
        if !searchText.isEmpty {
            tracks = tracks.filter {
                $0.name.localizedCaseInsensitiveContains(searchText) ||
                $0.artists.joined(separator: ", ").localizedCaseInsensitiveContains(searchText)
            }
        }

        return Array(tracks.prefix(100))
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header with stats
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Library")
                        .font(.largeTitle.bold())
                    Text("\(libraryManager.trackCount.formatted()) total tracks")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                // Stats
                HStack(spacing: 12) {
                    StatBadge(icon: "waveform", value: libraryManager.mikTrackCount, label: "MIK", color: .cyan)
                    StatBadge(icon: "music.note", value: libraryManager.appleMusicTrackCount, label: "Apple Music", color: .pink)
                }
            }
            .padding()

            Divider()

            // Toolbar: Search + Filters
            HStack(spacing: 12) {
                // Search
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Search tracks or artists...", text: $searchText)
                        .textFieldStyle(.plain)
                }
                .padding(8)
                .background(Color(nsColor: .controlBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .frame(maxWidth: 300)

                // Source filters
                Picker("Filter", selection: $selectedFilter) {
                    ForEach(LibraryFilter.allCases, id: \.self) { filter in
                        Text(filter.rawValue).tag(filter)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 280)

                Spacer()

                // DJ Filters button
                Button {
                    showFilters.toggle()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "slider.horizontal.3")
                        Text("DJ Filters")
                        if activeFilterCount > 0 {
                            Text("\(activeFilterCount)")
                                .font(.caption)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(AppTheme.Colors.gold)
                                .foregroundColor(.black)
                                .clipShape(Capsule())
                        }
                    }
                }
                .buttonStyle(.bordered)
            }
            .padding()

            // Active filter pills
            if activeFilterCount > 0 {
                HStack(spacing: 8) {
                    Text("Active filters:")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if let key = selectedKey {
                        FilterPill(text: "Key: \(key)") {
                            selectedKey = nil
                        }
                    }
                    if bpmFilterActive {
                        FilterPill(text: "BPM: \(Int(bpmMin))-\(Int(bpmMax))") {
                            bpmFilterActive = false
                        }
                    }

                    Spacer()

                    Button("Clear All") {
                        selectedKey = nil
                        bpmFilterActive = false
                    }
                    .font(.caption)
                    .foregroundColor(AppTheme.Colors.gold)
                }
                .padding(.horizontal)
                .padding(.bottom, 8)
            }

            Divider()

            // Track list
            if libraryManager.isLoading {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Loading library...")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if filteredTracks.isEmpty {
                ContentUnavailableView(
                    "No tracks found",
                    systemImage: "music.note.slash",
                    description: Text(searchText.isEmpty ? "Try adjusting your filters" : "No matches for \"\(searchText)\"")
                )
            } else {
                ScrollView {
                    LazyVStack(spacing: 1) {
                        ForEach(filteredTracks) { track in
                            TrackRowMac(track: track)
                        }
                    }
                }
            }
        }
        .sheet(isPresented: $showFilters) {
            DJFiltersSheetMac(
                selectedKey: $selectedKey,
                bpmMin: $bpmMin,
                bpmMax: $bpmMax,
                bpmFilterActive: $bpmFilterActive
            )
        }
    }
}

// MARK: - Helper Views

struct StatBadge: View {
    let icon: String
    let value: Int
    let label: String
    let color: Color

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 0) {
                Text("\(value.formatted())")
                    .font(.caption.bold())
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

struct FilterPill: View {
    let text: String
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Text(text)
                .font(.caption)
            Button {
                onRemove()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.caption)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(AppTheme.Colors.gold.opacity(0.2))
        .clipShape(Capsule())
    }
}

struct TrackRowMac: View {
    let track: NotoriousDADKit.Track

    var body: some View {
        HStack(spacing: 12) {
            // Track info
            VStack(alignment: .leading, spacing: 2) {
                Text(track.name)
                    .font(.body)
                    .lineLimit(1)
                Text(track.artists.joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            // MIK data
            if let mik = track.mikData {
                HStack(spacing: 8) {
                    if let key = mik.key, !key.isEmpty {
                        Text(key)
                            .font(.caption.bold())
                            .foregroundColor(.cyan)
                            .frame(minWidth: 28)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.cyan.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                    if let bpm = mik.bpm, bpm > 0 {
                        Text("\(Int(bpm))")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                            .frame(minWidth: 32)
                    }
                }
            }

            // Apple Music playcount
            if track.appleMusicPlayCount > 0 {
                HStack(spacing: 4) {
                    Image(systemName: "play.circle.fill")
                        .foregroundStyle(.pink)
                        .font(.caption)
                    Text("\(track.appleMusicPlayCount)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(width: 60)
            }

            // Duration
            Text(formatDuration(track.durationMs))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.tertiary)
                .frame(width: 40)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.3))
        .contentShape(Rectangle())
        .onHover { hovering in
            if hovering {
                NSCursor.pointingHand.push()
            } else {
                NSCursor.pop()
            }
        }
    }

    private func formatDuration(_ ms: Int) -> String {
        let seconds = ms / 1000
        let minutes = seconds / 60
        let remainingSeconds = seconds % 60
        return String(format: "%d:%02d", minutes, remainingSeconds)
    }
}

// MARK: - DJ Filters Sheet (macOS)

struct DJFiltersSheetMac: View {
    @Binding var selectedKey: String?
    @Binding var bpmMin: Double
    @Binding var bpmMax: Double
    @Binding var bpmFilterActive: Bool
    @Environment(\.dismiss) var dismiss

    var body: some View {
        VStack(spacing: 20) {
            // Header
            HStack {
                Text("DJ Filters")
                    .font(.title2.bold())
                Spacer()
                Button("Done") {
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Key Filter
                    GroupBox {
                        VStack(alignment: .leading, spacing: 16) {
                            HStack {
                                Label("Musical Key", systemImage: "music.quarternote.3")
                                    .font(.headline)
                                Spacer()
                                if selectedKey != nil {
                                    Button("Clear") {
                                        selectedKey = nil
                                    }
                                    .foregroundColor(AppTheme.Colors.gold)
                                }
                            }

                            // Minor keys (A row)
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Minor Keys")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 12), spacing: 8) {
                                    ForEach(1...12, id: \.self) { num in
                                        let key = "\(num)A"
                                        KeyButtonMac(key: key, isSelected: selectedKey == key) {
                                            selectedKey = selectedKey == key ? nil : key
                                        }
                                    }
                                }
                            }

                            // Major keys (B row)
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Major Keys")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 12), spacing: 8) {
                                    ForEach(1...12, id: \.self) { num in
                                        let key = "\(num)B"
                                        KeyButtonMac(key: key, isSelected: selectedKey == key) {
                                            selectedKey = selectedKey == key ? nil : key
                                        }
                                    }
                                }
                            }
                        }
                        .padding(12)
                    }

                    // BPM Filter
                    GroupBox {
                        VStack(alignment: .leading, spacing: 16) {
                            HStack {
                                Label("BPM Range", systemImage: "metronome")
                                    .font(.headline)
                                Spacer()
                                Toggle("", isOn: $bpmFilterActive)
                                    .labelsHidden()
                            }

                            if bpmFilterActive {
                                VStack(spacing: 16) {
                                    // Range display
                                    HStack {
                                        Text("\(Int(bpmMin))")
                                            .font(.title3.bold())
                                            .foregroundColor(AppTheme.Colors.gold)
                                            .frame(width: 50)
                                        Spacer()
                                        Text("to")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        Spacer()
                                        Text("\(Int(bpmMax))")
                                            .font(.title3.bold())
                                            .foregroundColor(AppTheme.Colors.gold)
                                            .frame(width: 50)
                                    }

                                    // Min slider
                                    HStack {
                                        Text("Min")
                                            .font(.caption)
                                            .frame(width: 35, alignment: .leading)
                                        Slider(value: $bpmMin, in: 60...180, step: 5) { editing in
                                            if bpmMin > bpmMax - 5 {
                                                bpmMin = bpmMax - 5
                                            }
                                        }
                                    }

                                    // Max slider
                                    HStack {
                                        Text("Max")
                                            .font(.caption)
                                            .frame(width: 35, alignment: .leading)
                                        Slider(value: $bpmMax, in: 60...200, step: 5) { editing in
                                            if bpmMax < bpmMin + 5 {
                                                bpmMax = bpmMin + 5
                                            }
                                        }
                                    }

                                    // Presets
                                    HStack(spacing: 12) {
                                        Text("Presets:")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)

                                        BPMPresetButtonMac(label: "House", range: 120...130) {
                                            bpmMin = 120
                                            bpmMax = 130
                                        }
                                        BPMPresetButtonMac(label: "Techno", range: 130...140) {
                                            bpmMin = 130
                                            bpmMax = 140
                                        }
                                        BPMPresetButtonMac(label: "D&B", range: 160...180) {
                                            bpmMin = 160
                                            bpmMax = 180
                                        }
                                    }
                                }
                            }
                        }
                        .padding(12)
                    }
                }
            }
        }
        .padding()
        .frame(width: 600, height: 500)
    }
}

struct KeyButtonMac: View {
    let key: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(key)
                .font(.caption)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
                .background(isSelected ? AppTheme.Colors.gold : Color(nsColor: .controlBackgroundColor))
                .foregroundColor(isSelected ? .black : .primary)
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
    }
}

struct BPMPresetButtonMac: View {
    let label: String
    let range: ClosedRange<Int>
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(label)
                    .font(.caption.bold())
                Text("\(range.lowerBound)-\(range.upperBound)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
        .buttonStyle(.bordered)
    }
}

struct PlaylistsView: View {
    var body: some View {
        ContentUnavailableView(
            "Your Playlists",
            systemImage: "list.bullet.rectangle",
            description: Text("Generated playlists will appear here")
        )
    }
}

struct NewPlaylistSheet: View {
    @Environment(\.dismiss) var dismiss

    var body: some View {
        VStack(spacing: 20) {
            Text("New Playlist")
                .font(.title.bold())

            Text("Quick playlist creation wizard coming soon...")
                .foregroundStyle(.secondary)

            Button("Close") {
                dismiss()
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(40)
        .frame(width: 400, height: 300)
    }
}

struct SettingsView: View {
    @EnvironmentObject var spotifyManager: SpotifyManager

    var body: some View {
        Form {
            Section("Spotify") {
                if spotifyManager.isAuthenticated {
                    Label("Connected", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Button("Disconnect") {
                        spotifyManager.logout()
                    }
                } else {
                    Button("Connect to Spotify") {
                        spotifyManager.authorize()
                    }
                }
            }

            Section("Library") {
                Text("MIK CSV import settings")
                Text("Apple Music sync settings")
            }

            Section("About") {
                HStack {
                    Text("Version")
                    Spacer()
                    Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "Unknown")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .frame(width: 400, height: 350)
    }
}

#Preview {
    ContentView()
        .environmentObject(SpotifyManager())
        .environmentObject(LibraryManager())
}
