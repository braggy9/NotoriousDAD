import SwiftUI
import NotoriousDADKit
import UIKit

// MARK: - Haptic Feedback Manager

class HapticManager {
    static let shared = HapticManager()

    private let impactLight = UIImpactFeedbackGenerator(style: .light)
    private let impactMedium = UIImpactFeedbackGenerator(style: .medium)
    private let impactHeavy = UIImpactFeedbackGenerator(style: .heavy)
    private let selectionGenerator = UISelectionFeedbackGenerator()
    private let notification = UINotificationFeedbackGenerator()

    private init() {
        // Pre-warm generators for responsiveness
        impactLight.prepare()
        impactMedium.prepare()
        selectionGenerator.prepare()
    }

    /// Light tap - for selections, toggles
    func tap() {
        impactLight.impactOccurred()
    }

    /// Medium tap - for button presses
    func buttonPress() {
        impactMedium.impactOccurred()
    }

    /// Heavy tap - for significant actions
    func impact() {
        impactHeavy.impactOccurred()
    }

    /// Selection changed - for pickers, sliders
    func selection() {
        selectionGenerator.selectionChanged()
    }

    /// Success - for completed actions
    func success() {
        notification.notificationOccurred(.success)
    }

    /// Warning - for alerts
    func warning() {
        notification.notificationOccurred(.warning)
    }

    /// Error - for failures
    func error() {
        notification.notificationOccurred(.error)
    }
}

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

// MARK: - Prompt Templates

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
    static let shared = TemplateManager()

    @Published var templates: [PromptTemplate] = []
    @Published var isSyncing = false
    @Published var lastSyncError: String?

    private let storageKey = "savedPromptTemplates"
    private let baseURL = "https://mixmaster.mixtape.run"
    private let refreshToken = "AQAVPKU8sif9kQl9turbdayZlNzSJ8KYBj7QRqEYN9iSuwW1OqYUcQWP0NpSZt5gbE-09xokwfi9pDpfYauUfZsMfqdoINR5ftl2O8ecGkoXeZgEBNu3KKIoP8tc-7CPkf0"

    private init() {
        loadLocalTemplates()
        // Sync with server in background
        Task { await syncFromServer() }
    }

    func saveTemplate(_ template: PromptTemplate) {
        if let index = templates.firstIndex(where: { $0.id == template.id }) {
            templates[index] = template
        } else {
            templates.insert(template, at: 0)
        }
        persistLocally()
        // Sync to server in background
        Task { await syncToServer(template) }
    }

    func deleteTemplate(_ template: PromptTemplate) {
        templates.removeAll { $0.id == template.id }
        persistLocally()
        // Delete from server in background
        Task { await deleteFromServer(template) }
    }

    /// Force sync with server
    func refresh() async {
        await syncFromServer()
    }

    // MARK: - Local Storage

    private func loadLocalTemplates() {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode([PromptTemplate].self, from: data) else {
            // Add default templates on first launch
            templates = defaultTemplates
            persistLocally()
            return
        }
        templates = decoded
    }

    private func persistLocally() {
        if let encoded = try? JSONEncoder().encode(templates) {
            UserDefaults.standard.set(encoded, forKey: storageKey)
        }
    }

    // MARK: - Server Sync

    private func syncFromServer() async {
        await MainActor.run { isSyncing = true }
        defer { Task { @MainActor in isSyncing = false } }

        do {
            guard let url = URL(string: "\(baseURL)/api/user/templates") else { return }

            // For GET requests, we need to pass token in body via POST workaround
            // or accept query params. For now, server uses fallback token.
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                print("📋 Templates: Server sync failed with status \((response as? HTTPURLResponse)?.statusCode ?? 0)")
                return
            }

            struct TemplatesResponse: Codable {
                let templates: [ServerTemplate]
            }

            struct ServerTemplate: Codable {
                let id: String
                let name: String
                let includeArtists: String?
                let referenceArtists: String?
                let vibe: String?
                let energy: String?
                let notes: String?
                let isDefault: Bool?
                let createdAt: String
            }

            let decoded = try JSONDecoder().decode(TemplatesResponse.self, from: data)

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

            // Merge: server templates take precedence, but keep local-only ones
            await MainActor.run {
                if !serverTemplates.isEmpty {
                    templates = serverTemplates
                    persistLocally()
                    lastSyncError = nil
                    print("📋 Templates: Synced \(serverTemplates.count) templates from server")
                }
            }
        } catch {
            await MainActor.run { lastSyncError = error.localizedDescription }
            print("📋 Templates: Sync error - \(error)")
        }
    }

    private func syncToServer(_ template: PromptTemplate) async {
        do {
            guard let url = URL(string: "\(baseURL)/api/user/templates") else { return }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            let dateFormatter = ISO8601DateFormatter()

            let body: [String: Any] = [
                "template": [
                    "id": template.id.uuidString,
                    "name": template.name,
                    "includeArtists": template.includeArtists,
                    "referenceArtists": template.referenceArtists,
                    "vibe": template.vibe ?? "",
                    "energy": template.energy,
                    "notes": template.notes,
                    "isDefault": false,
                    "createdAt": dateFormatter.string(from: template.createdAt)
                ],
                "refresh_token": refreshToken
            ]

            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (_, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                print("📋 Templates: Saved \"\(template.name)\" to server")
            }
        } catch {
            print("📋 Templates: Failed to save to server - \(error)")
        }
    }

    private func deleteFromServer(_ template: PromptTemplate) async {
        do {
            guard let url = URL(string: "\(baseURL)/api/user/templates") else { return }
            var request = URLRequest(url: url)
            request.httpMethod = "DELETE"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            let body: [String: Any] = [
                "templateId": template.id.uuidString,
                "refresh_token": refreshToken
            ]

            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (_, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                print("📋 Templates: Deleted \"\(template.name)\" from server")
            }
        } catch {
            print("📋 Templates: Failed to delete from server - \(error)")
        }
    }

    private var defaultTemplates: [PromptTemplate] {
        [
            PromptTemplate(name: "🏋️ Workout", includeArtists: "", referenceArtists: "", vibe: "Energetic", energy: "Build", notes: "High energy tracks for training"),
            PromptTemplate(name: "🍽️ Dinner Party", includeArtists: "", referenceArtists: "", vibe: "Chill", energy: "Steady", notes: "Relaxed background vibes"),
            PromptTemplate(name: "🎉 House Party", includeArtists: "", referenceArtists: "", vibe: "Party", energy: "Build", notes: "Peak time dance floor energy"),
            PromptTemplate(name: "🌅 Sunset Session", includeArtists: "", referenceArtists: "", vibe: "Melodic", energy: "Wave", notes: "Golden hour chill-out vibes")
        ]
    }
}

// MARK: - Generation History Manager

struct HistoryTrackItem: Codable, Identifiable {
    var id: String { "\(artist)-\(title)" }
    let title: String
    let artist: String
    let bpm: Double?
    let key: String?
}

struct GenerationHistoryItem: Identifiable, Codable {
    let id: UUID
    let prompt: String
    let playlistName: String?
    let playlistURL: String?
    let trackCount: Int
    let generationType: GenerationType
    let tracks: [HistoryTrackItem]?  // Track listing for mixes
    let duration: String?            // Duration for mixes
    let createdAt: Date

    enum GenerationType: String, Codable {
        case spotify = "spotify"
        case audioMix = "mix"
    }

    init(id: UUID = UUID(), prompt: String, playlistName: String?, playlistURL: String?, trackCount: Int, generationType: GenerationType, tracks: [HistoryTrackItem]? = nil, duration: String? = nil, createdAt: Date = Date()) {
        self.id = id
        self.prompt = prompt
        self.playlistName = playlistName
        self.playlistURL = playlistURL
        self.trackCount = trackCount
        self.generationType = generationType
        self.tracks = tracks
        self.duration = duration
        self.createdAt = createdAt
    }
}

class HistoryManager: ObservableObject {
    static let shared = HistoryManager()

    @Published var history: [GenerationHistoryItem] = []
    @Published var isSyncing = false

    private let storageKey = "generationHistory"
    private let baseURL = "https://mixmaster.mixtape.run"
    private let refreshToken = "AQAVPKU8sif9kQl9turbdayZlNzSJ8KYBj7QRqEYN9iSuwW1OqYUcQWP0NpSZt5gbE-09xokwfi9pDpfYauUfZsMfqdoINR5ftl2O8ecGkoXeZgEBNu3KKIoP8tc-7CPkf0"
    private let maxLocalItems = 50

    private init() {
        loadLocalHistory()
        Task { await syncFromServer() }
    }

    func addItem(_ item: GenerationHistoryItem) {
        history.insert(item, at: 0)
        // Keep only recent items locally
        if history.count > maxLocalItems {
            history = Array(history.prefix(maxLocalItems))
        }
        persistLocally()
        // Sync to server
        Task { await syncToServer(item) }
    }

    func refresh() async {
        await syncFromServer()
    }

    // MARK: - Local Storage

    private func loadLocalHistory() {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode([GenerationHistoryItem].self, from: data) else {
            return
        }
        history = decoded
    }

    private func persistLocally() {
        if let encoded = try? JSONEncoder().encode(history) {
            UserDefaults.standard.set(encoded, forKey: storageKey)
        }
    }

    // MARK: - Server Sync

    private func syncFromServer() async {
        await MainActor.run { isSyncing = true }
        defer { Task { @MainActor in isSyncing = false } }

        do {
            guard let url = URL(string: "\(baseURL)/api/user/history?limit=50") else { return }
            var request = URLRequest(url: url)
            request.httpMethod = "GET"

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                print("📜 History: Server sync failed")
                return
            }

            struct HistoryResponse: Codable {
                let history: [ServerHistoryItem]
            }

            struct ServerTrackItem: Codable {
                let title: String
                let artist: String
                let bpm: Double?
                let key: String?
            }

            struct ServerHistoryItem: Codable {
                let id: String
                let prompt: String
                let playlistName: String?
                let playlistURL: String?
                let trackCount: Int
                let generationType: String
                let tracks: [ServerTrackItem]?
                let duration: String?
                let createdAt: String
            }

            let decoded = try JSONDecoder().decode(HistoryResponse.self, from: data)

            let serverHistory: [GenerationHistoryItem] = decoded.history.compactMap { sh in
                guard let uuid = UUID(uuidString: sh.id) else { return nil }
                let dateFormatter = ISO8601DateFormatter()
                let createdDate = dateFormatter.date(from: sh.createdAt) ?? Date()
                let type: GenerationHistoryItem.GenerationType = sh.generationType == "spotify" ? .spotify : .audioMix

                // Convert server tracks to local format
                let tracks: [HistoryTrackItem]? = sh.tracks?.map { st in
                    HistoryTrackItem(title: st.title, artist: st.artist, bpm: st.bpm, key: st.key)
                }

                return GenerationHistoryItem(
                    id: uuid,
                    prompt: sh.prompt,
                    playlistName: sh.playlistName,
                    playlistURL: sh.playlistURL,
                    trackCount: sh.trackCount,
                    generationType: type,
                    tracks: tracks,
                    duration: sh.duration,
                    createdAt: createdDate
                )
            }

            await MainActor.run {
                if !serverHistory.isEmpty {
                    history = serverHistory
                    persistLocally()
                    print("📜 History: Synced \(serverHistory.count) items from server")
                }
            }
        } catch {
            print("📜 History: Sync error - \(error)")
        }
    }

    private func syncToServer(_ item: GenerationHistoryItem) async {
        do {
            guard let url = URL(string: "\(baseURL)/api/user/history") else { return }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            let dateFormatter = ISO8601DateFormatter()

            var itemDict: [String: Any] = [
                "id": item.id.uuidString,
                "prompt": item.prompt,
                "playlistName": item.playlistName ?? "",
                "playlistURL": item.playlistURL ?? "",
                "trackCount": item.trackCount,
                "generationType": item.generationType.rawValue,
                "createdAt": dateFormatter.string(from: item.createdAt)
            ]

            // Add tracks if available (for mixes)
            if let tracks = item.tracks {
                itemDict["tracks"] = tracks.map { track in
                    [
                        "title": track.title,
                        "artist": track.artist,
                        "bpm": track.bpm ?? 0,
                        "key": track.key ?? ""
                    ] as [String: Any]
                }
            }

            // Add duration if available (for mixes)
            if let duration = item.duration {
                itemDict["duration"] = duration
            }

            let body: [String: Any] = [
                "item": itemDict,
                "refresh_token": refreshToken
            ]

            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (_, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                print("📜 History: Saved \(item.generationType.rawValue) generation to server")
            }
        } catch {
            print("📜 History: Failed to save to server - \(error)")
        }
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
        static let largeTitle = Font.system(size: 34, weight: .bold, design: .rounded)
        static let title = Font.system(size: 28, weight: .bold, design: .rounded)
        static let title2 = Font.system(size: 22, weight: .semibold, design: .rounded)
        static let title3 = Font.system(size: 20, weight: .semibold, design: .rounded)
        static let headline = Font.system(size: 17, weight: .semibold, design: .rounded)
        static let body = Font.system(size: 17, weight: .regular, design: .default)
        static let callout = Font.system(size: 16, weight: .medium, design: .default)
        static let subheadline = Font.system(size: 15, weight: .regular, design: .default)
        static let footnote = Font.system(size: 13, weight: .regular, design: .default)
        static let caption = Font.system(size: 12, weight: .medium, design: .default)
        static let caption2 = Font.system(size: 11, weight: .regular, design: .default)
    }

    struct Spacing {
        static let xxs: CGFloat = 4
        static let xs: CGFloat = 8
        static let sm: CGFloat = 12
        static let md: CGFloat = 16
        static let lg: CGFloat = 24
        static let xl: CGFloat = 32
        static let xxl: CGFloat = 48
    }

    struct Radius {
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 20
        static let full: CGFloat = 9999
    }

    struct Animation {
        static let quick = SwiftUI.Animation.easeOut(duration: 0.15)
        static let standard = SwiftUI.Animation.easeInOut(duration: 0.25)
        static let spring = SwiftUI.Animation.spring(response: 0.35, dampingFraction: 0.7)
    }
}

// MARK: - View Extensions

extension View {
    func cardStyle(elevated: Bool = false) -> some View {
        self
            .padding(AppTheme.Spacing.md)
            .background(elevated ? AppTheme.Colors.surfaceElevated : AppTheme.Colors.surface)
            .cornerRadius(AppTheme.Radius.lg)
    }

    func screenBackground() -> some View {
        self.background(AppTheme.Colors.background.ignoresSafeArea())
    }
}

// MARK: - Button Styles

struct PrimaryButtonStyle: ButtonStyle {
    var isDisabled: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppTheme.Typography.headline)
            .foregroundColor(isDisabled ? AppTheme.Colors.textTertiary : AppTheme.Colors.background)
            .frame(maxWidth: .infinity)
            .padding(.vertical, AppTheme.Spacing.md)
            .background(
                Group {
                    if isDisabled {
                        AppTheme.Colors.surfaceHighlight
                    } else {
                        LinearGradient(
                            colors: [AppTheme.Colors.gold, AppTheme.Colors.goldDeep],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    }
                }
            )
            .cornerRadius(AppTheme.Radius.md)
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(AppTheme.Animation.quick, value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, isPressed in
                if isPressed && !isDisabled {
                    HapticManager.shared.buttonPress()
                }
            }
    }
}

// MARK: - Main Content View

struct ContentView: View {
    @EnvironmentObject var spotifyManager: SpotifyManager
    @EnvironmentObject var libraryManager: LibraryManager
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            GenerateView()
                .tabItem {
                    Label("Create", systemImage: "wand.and.stars")
                }
                .tag(0)

            MixGeneratorViewRedesign()
                .tabItem {
                    Label("Audio Mix", systemImage: "waveform.path.ecg")
                }
                .tag(1)

            LibraryView()
                .tabItem {
                    Label("Library", systemImage: "music.note.list")
                }
                .tag(2)

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
                .tag(3)
        }
        .tint(AppTheme.Colors.gold)
        .preferredColorScheme(.dark)
        .onAppear {
            configureTabBarAppearance()
        }
        .onChange(of: selectedTab) { _, _ in
            HapticManager.shared.selection()
        }
    }

    private func configureTabBarAppearance() {
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(AppTheme.Colors.surface)

        appearance.stackedLayoutAppearance.normal.iconColor = UIColor(AppTheme.Colors.textTertiary)
        appearance.stackedLayoutAppearance.normal.titleTextAttributes = [
            .foregroundColor: UIColor(AppTheme.Colors.textTertiary)
        ]
        appearance.stackedLayoutAppearance.selected.iconColor = UIColor(AppTheme.Colors.gold)
        appearance.stackedLayoutAppearance.selected.titleTextAttributes = [
            .foregroundColor: UIColor(AppTheme.Colors.gold)
        ]

        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }
}

// MARK: - Generate View

struct GenerateView: View {
    @EnvironmentObject var spotifyManager: SpotifyManager
    @EnvironmentObject var libraryManager: LibraryManager
    @StateObject private var templateManager = TemplateManager.shared

    @State private var includeArtists = ""
    @State private var referenceArtists = ""
    @State private var selectedVibe: VibeOption?
    @State private var selectedEnergy: EnergyOption = .build
    @State private var trackCount: Double = 30
    @State private var notes = ""

    @State private var isGenerating = false
    @State private var generationError: String?
    @State private var isErrorRetryable = false
    @State private var showSuccess = false
    @State private var generatedPlaylistURL: String?

    @State private var showSaveTemplate = false
    @State private var newTemplateName = ""

    @FocusState private var focusedField: FormField?

    enum FormField { case include, reference, notes }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: AppTheme.Spacing.lg) {
                    headerSection
                    templatesSection
                    vibeSection
                    artistsSection
                    settingsSection
                    notesSection
                    generateButton

                    if let error = generationError {
                        errorBanner(error, isRetryable: isErrorRetryable) {
                            generate()
                        }
                    }

                    Spacer(minLength: AppTheme.Spacing.xxl)
                }
                .padding(.horizontal, AppTheme.Spacing.md)
                .padding(.top, AppTheme.Spacing.sm)
            }
            .screenBackground()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                        .foregroundColor(AppTheme.Colors.gold)
                }
            }
            .alert("Mix Created!", isPresented: $showSuccess) {
                if let url = generatedPlaylistURL {
                    Button("Open in Spotify") { openSpotify(url: url) }
                }
                Button("Done", role: .cancel) {}
            } message: {
                Text("Your playlist has been added to Spotify.")
            }
            .alert("Save Template", isPresented: $showSaveTemplate) {
                TextField("Template name", text: $newTemplateName)
                Button("Save") {
                    if !newTemplateName.isEmpty {
                        saveCurrentAsTemplate(name: newTemplateName)
                        newTemplateName = ""
                    }
                }
                Button("Cancel", role: .cancel) {
                    newTemplateName = ""
                }
            } message: {
                Text("Save your current settings as a quick-start template.")
            }
        }
    }

    private var headerSection: some View {
        VStack(spacing: AppTheme.Spacing.xs) {
            Text("Create Mix")
                .font(AppTheme.Typography.largeTitle)
                .foregroundColor(AppTheme.Colors.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: AppTheme.Spacing.sm) {
                statusPill(icon: "checkmark.circle.fill", text: "Connected", color: AppTheme.Colors.success)
                statusPill(icon: "music.note", text: "\(libraryManager.trackCount.formatted()) tracks", color: AppTheme.Colors.gold)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func statusPill(icon: String, text: String, color: Color) -> some View {
        HStack(spacing: AppTheme.Spacing.xxs) {
            Image(systemName: icon).font(.system(size: 10))
            Text(text).font(AppTheme.Typography.caption)
        }
        .foregroundColor(color)
        .padding(.horizontal, AppTheme.Spacing.xs)
        .padding(.vertical, AppTheme.Spacing.xxs)
        .background(color.opacity(0.15))
        .cornerRadius(AppTheme.Radius.full)
    }

    private var templatesSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            HStack {
                Label("Quick Start", systemImage: "bookmark.fill")
                    .font(AppTheme.Typography.headline)
                    .foregroundColor(AppTheme.Colors.textPrimary)

                Spacer()

                Button {
                    HapticManager.shared.tap()
                    showSaveTemplate = true
                } label: {
                    Label("Save", systemImage: "plus.circle")
                        .font(AppTheme.Typography.caption)
                        .foregroundColor(AppTheme.Colors.gold)
                }
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: AppTheme.Spacing.sm) {
                    ForEach(templateManager.templates) { template in
                        TemplateChip(template: template) {
                            applyTemplate(template)
                        } onDelete: {
                            templateManager.deleteTemplate(template)
                        }
                    }
                }
            }
        }
    }

    private func applyTemplate(_ template: PromptTemplate) {
        HapticManager.shared.tap()
        withAnimation(AppTheme.Animation.spring) {
            includeArtists = template.includeArtists
            referenceArtists = template.referenceArtists
            if let vibeName = template.vibe {
                selectedVibe = VibeOption.allCases.first { $0.rawValue == vibeName }
            } else {
                selectedVibe = nil
            }
            selectedEnergy = EnergyOption.allCases.first { $0.rawValue == template.energy } ?? .build
            notes = template.notes
        }
    }

    private func saveCurrentAsTemplate(name: String) {
        let template = PromptTemplate(
            name: name,
            includeArtists: includeArtists,
            referenceArtists: referenceArtists,
            vibe: selectedVibe?.rawValue,
            energy: selectedEnergy.rawValue,
            notes: notes
        )
        templateManager.saveTemplate(template)
        HapticManager.shared.success()
    }

    private var vibeSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Label("Pick a Vibe", systemImage: "sparkles")
                .font(AppTheme.Typography.headline)
                .foregroundColor(AppTheme.Colors.textPrimary)

            LazyVGrid(columns: [
                GridItem(.flexible(), spacing: AppTheme.Spacing.sm),
                GridItem(.flexible(), spacing: AppTheme.Spacing.sm)
            ], spacing: AppTheme.Spacing.sm) {
                ForEach(VibeOption.allCases, id: \.self) { vibe in
                    VibeCard(vibe: vibe, isSelected: selectedVibe == vibe) {
                        HapticManager.shared.tap()
                        withAnimation(AppTheme.Animation.spring) {
                            selectedVibe = selectedVibe == vibe ? nil : vibe
                        }
                    }
                }
            }
        }
    }

    private var artistsSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            Label("Artists", systemImage: "music.mic")
                .font(AppTheme.Typography.headline)
                .foregroundColor(AppTheme.Colors.textPrimary)

            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                Label("Must Include", systemImage: "checkmark.circle.fill")
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(AppTheme.Colors.success)

                ThemedTextField(placeholder: "Fred again, Disclosure...", text: $includeArtists)
                    .focused($focusedField, equals: .include)
            }

            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                Label("Style Reference", systemImage: "waveform")
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(AppTheme.Colors.textSecondary)

                ThemedTextField(placeholder: "Chemical Brothers, Fatboy Slim...", text: $referenceArtists)
                    .focused($focusedField, equals: .reference)

                Text("Influences vibe but won't necessarily appear")
                    .font(AppTheme.Typography.caption2)
                    .foregroundColor(AppTheme.Colors.textTertiary)
            }
        }
        .cardStyle()
    }

    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                Label("Energy Flow", systemImage: "chart.line.uptrend.xyaxis")
                    .font(AppTheme.Typography.headline)
                    .foregroundColor(AppTheme.Colors.textPrimary)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: AppTheme.Spacing.xs) {
                        ForEach(EnergyOption.allCases, id: \.self) { energy in
                            EnergyPill(energy: energy, isSelected: selectedEnergy == energy) {
                                HapticManager.shared.selection()
                                withAnimation(AppTheme.Animation.quick) {
                                    selectedEnergy = energy
                                }
                            }
                        }
                    }
                }
            }

            Divider().background(AppTheme.Colors.surfaceHighlight)

            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                HStack {
                    Text("Tracks").font(AppTheme.Typography.callout).foregroundColor(AppTheme.Colors.textPrimary)
                    Spacer()
                    Text("\(Int(trackCount))").font(AppTheme.Typography.headline).foregroundColor(AppTheme.Colors.gold)
                }

                Slider(value: $trackCount, in: 10...60, step: 5).tint(AppTheme.Colors.gold)

                Text("~\(Int(trackCount) * 3) min")
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(AppTheme.Colors.textTertiary)
            }
        }
        .cardStyle()
    }

    private var notesSection: some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                ThemedTextField(placeholder: "e.g., 90s house, deep cuts only...", text: $notes, axis: .vertical)
                    .focused($focusedField, equals: .notes)
                    .lineLimit(2...4)
            }
            .padding(.top, AppTheme.Spacing.sm)
        } label: {
            Label("Additional Notes", systemImage: "text.bubble")
                .font(AppTheme.Typography.callout)
                .foregroundColor(AppTheme.Colors.textSecondary)
        }
        .tint(AppTheme.Colors.gold)
        .cardStyle()
    }

    private var generateButton: some View {
        Button(action: generate) {
            HStack(spacing: AppTheme.Spacing.sm) {
                if isGenerating {
                    ProgressView().progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.background)).scaleEffect(0.9)
                } else {
                    Image(systemName: "wand.and.stars").font(.system(size: 18, weight: .semibold))
                }
                Text(isGenerating ? "Creating Mix..." : "Generate Mix")
            }
        }
        .buttonStyle(PrimaryButtonStyle(isDisabled: !canGenerate || isGenerating))
        .disabled(!canGenerate || isGenerating)
    }

    private func errorBanner(_ message: String, isRetryable: Bool = false, onRetry: (() -> Void)? = nil) -> some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(AppTheme.Colors.error)

            Text(message)
                .font(AppTheme.Typography.footnote)
                .foregroundColor(AppTheme.Colors.error)
                .lineLimit(2)

            Spacer()

            if isRetryable, let retry = onRetry {
                Button {
                    HapticManager.shared.tap()
                    withAnimation {
                        generationError = nil
                        isErrorRetryable = false
                    }
                    retry()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 11, weight: .semibold))
                        Text("Retry")
                            .font(AppTheme.Typography.caption)
                    }
                    .foregroundColor(AppTheme.Colors.gold)
                    .padding(.horizontal, AppTheme.Spacing.sm)
                    .padding(.vertical, AppTheme.Spacing.xs)
                    .background(AppTheme.Colors.gold.opacity(0.15))
                    .cornerRadius(AppTheme.Radius.sm)
                }
            }

            Button {
                withAnimation {
                    generationError = nil
                    isErrorRetryable = false
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(AppTheme.Colors.textTertiary)
            }
        }
        .padding(AppTheme.Spacing.sm)
        .background(AppTheme.Colors.error.opacity(0.15))
        .cornerRadius(AppTheme.Radius.sm)
    }

    private var canGenerate: Bool {
        !includeArtists.isEmpty || !referenceArtists.isEmpty || selectedVibe != nil
    }

    private var generatedPrompt: String {
        var parts: [String] = []
        if !includeArtists.isEmpty { parts.append("Include: \(includeArtists)") }
        if !referenceArtists.isEmpty { parts.append("Reference: \(referenceArtists)") }
        if let vibe = selectedVibe { parts.append("Mood: \(vibe.rawValue)") }
        parts.append("\(Int(trackCount)) tracks")
        parts.append("Energy: \(selectedEnergy.rawValue)")
        if !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append(notes.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return parts.joined(separator: ". ")
    }

    private func generate() {
        isGenerating = true
        generationError = nil
        isErrorRetryable = false
        focusedField = nil

        Task {
            do {
                // Use NetworkManager for automatic retry with exponential backoff
                let result = try await NetworkManager.shared.performRequest(maxRetries: 3) {
                    try await self.callGenerateAPI(prompt: self.generatedPrompt)
                }
                await MainActor.run {
                    isGenerating = false
                    generatedPlaylistURL = result.playlistURL
                    showSuccess = true
                    HapticManager.shared.success()

                    // Track history
                    let historyItem = GenerationHistoryItem(
                        prompt: generatedPrompt,
                        playlistName: result.playlistName,
                        playlistURL: result.playlistURL,
                        trackCount: result.trackCount,
                        generationType: .spotify
                    )
                    HistoryManager.shared.addItem(historyItem)

                    includeArtists = ""
                    referenceArtists = ""
                    selectedVibe = nil
                    notes = ""
                }
            } catch {
                await MainActor.run {
                    isGenerating = false

                    // Determine if error is retryable for the UI
                    if let genError = error as? GenerationError {
                        generationError = genError.localizedDescription
                        isErrorRetryable = genError.isRetryable
                    } else if let networkError = error as? NetworkError {
                        generationError = networkError.localizedDescription
                        isErrorRetryable = networkError.isRetryable
                    } else {
                        generationError = error.localizedDescription
                        isErrorRetryable = true // Default to retryable for unknown errors
                    }

                    HapticManager.shared.error()
                }
            }
        }
    }

    private func openSpotify(url: String) {
        // Use SpotifyPlaybackManager for better handling (app detection, fallbacks)
        if let playlistId = SpotifyPlaybackManager.extractPlaylistId(from: url) {
            SpotifyPlaybackManager.shared.openPlaylist(playlistId)
        } else if let spotifyURL = URL(string: url.replacingOccurrences(of: "https://open.spotify.com/", with: "spotify://")) {
            // Fallback to direct URL opening
            UIApplication.shared.open(spotifyURL)
        }
    }

    /// Result from successful playlist generation
    struct GenerationResult {
        let playlistURL: String
        let playlistName: String?
        let trackCount: Int
    }

    private func callGenerateAPI(prompt: String) async throws -> GenerationResult {
        guard let url = URL(string: "https://mixmaster.mixtape.run/api/generate-playlist") else {
            throw GenerationError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120

        let body: [String: Any] = [
            "prompt": prompt,
            "refresh_token": "AQAVPKU8sif9kQl9turbdayZlNzSJ8KYBj7QRqEYN9iSuwW1OqYUcQWP0NpSZt5gbE-09xokwfi9pDpfYauUfZsMfqdoINR5ftl2O8ecGkoXeZgEBNu3KKIoP8tc-7CPkf0"
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw GenerationError.invalidResponse
        }

        if httpResponse.statusCode != 200 {
            if let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let errorMessage = errorJson["error"] as? String {
                throw GenerationError.apiError(errorMessage)
            }
            throw GenerationError.apiError("Status \(httpResponse.statusCode)")
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let playlistURL = json["playlistUrl"] as? String else {
            throw GenerationError.invalidResponse
        }

        // Extract additional data for history
        let playlistName = json["playlistName"] as? String
        let trackCount = json["trackCount"] as? Int ?? 30

        return GenerationResult(
            playlistURL: playlistURL,
            playlistName: playlistName,
            trackCount: trackCount
        )
    }
}

// MARK: - Supporting Types

enum VibeOption: String, CaseIterable {
    case chill = "Chill"
    case energetic = "Energetic"
    case focus = "Focus"
    case party = "Party"
    case moody = "Moody"
    case workout = "Workout"

    var icon: String {
        switch self {
        case .chill: return "leaf.fill"
        case .energetic: return "flame.fill"
        case .focus: return "brain.head.profile"
        case .party: return "party.popper.fill"
        case .moody: return "moon.stars.fill"
        case .workout: return "figure.run"
        }
    }

    var color: Color {
        switch self {
        case .chill: return Color(red: 0.4, green: 0.8, blue: 0.7)
        case .energetic: return Color(red: 1.0, green: 0.5, blue: 0.2)
        case .focus: return Color(red: 0.4, green: 0.5, blue: 0.9)
        case .party: return Color(red: 1.0, green: 0.4, blue: 0.6)
        case .moody: return Color(red: 0.6, green: 0.4, blue: 0.8)
        case .workout: return Color(red: 1.0, green: 0.3, blue: 0.3)
        }
    }
}

enum EnergyOption: String, CaseIterable {
    case build = "Build Up"
    case peak = "Peak"
    case wave = "Waves"
    case descend = "Wind Down"
    case steady = "Steady"

    var icon: String {
        switch self {
        case .build: return "arrow.up.right"
        case .peak: return "arrow.up.to.line"
        case .wave: return "waveform.path"
        case .descend: return "arrow.down.right"
        case .steady: return "equal"
        }
    }
}

enum GenerationError: LocalizedError {
    case invalidURL
    case invalidResponse
    case apiError(String)
    case networkError(NetworkError)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid API URL"
        case .invalidResponse: return "Invalid response"
        case .apiError(let msg): return msg
        case .networkError(let error): return error.localizedDescription
        }
    }

    var isRetryable: Bool {
        switch self {
        case .invalidURL:
            return false
        case .invalidResponse, .apiError:
            return true
        case .networkError(let error):
            return error.isRetryable
        }
    }
}

// MARK: - UI Components

struct VibeCard: View {
    let vibe: VibeOption
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: AppTheme.Spacing.sm) {
                Image(systemName: vibe.icon)
                    .font(.system(size: 28, weight: .medium))
                    .foregroundColor(isSelected ? vibe.color : AppTheme.Colors.textSecondary)
                Text(vibe.rawValue)
                    .font(AppTheme.Typography.callout)
                    .foregroundColor(isSelected ? AppTheme.Colors.textPrimary : AppTheme.Colors.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 100)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.Radius.lg)
                    .fill(isSelected ? vibe.color.opacity(0.15) : AppTheme.Colors.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.Radius.lg)
                    .stroke(isSelected ? vibe.color : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct TemplateChip: View {
    let template: PromptTemplate
    let onTap: () -> Void
    let onDelete: () -> Void

    @State private var showDeleteConfirm = false

    var body: some View {
        Button(action: onTap) {
            Text(template.name)
                .font(AppTheme.Typography.callout)
                .foregroundColor(AppTheme.Colors.textPrimary)
                .padding(.horizontal, AppTheme.Spacing.md)
                .padding(.vertical, AppTheme.Spacing.sm)
                .background(AppTheme.Colors.surface)
                .cornerRadius(AppTheme.Radius.lg)
                .overlay(
                    RoundedRectangle(cornerRadius: AppTheme.Radius.lg)
                        .stroke(AppTheme.Colors.surfaceHighlight, lineWidth: 1)
                )
        }
        .buttonStyle(PlainButtonStyle())
        .contextMenu {
            Button(role: .destructive) {
                HapticManager.shared.warning()
                onDelete()
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }
}

struct EnergyPill: View {
    let energy: EnergyOption
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: AppTheme.Spacing.xxs) {
                Image(systemName: energy.icon).font(.system(size: 12, weight: .medium))
                Text(energy.rawValue).font(AppTheme.Typography.caption)
            }
            .foregroundColor(isSelected ? AppTheme.Colors.background : AppTheme.Colors.textSecondary)
            .padding(.horizontal, AppTheme.Spacing.sm)
            .padding(.vertical, AppTheme.Spacing.xs)
            .background(Capsule().fill(isSelected ? AppTheme.Colors.gold : AppTheme.Colors.surfaceHighlight))
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct ThemedTextField: View {
    let placeholder: String
    @Binding var text: String
    var axis: Axis = .horizontal

    var body: some View {
        TextField(placeholder, text: $text, axis: axis)
            .font(AppTheme.Typography.body)
            .foregroundColor(AppTheme.Colors.textPrimary)
            .padding(AppTheme.Spacing.sm)
            .background(AppTheme.Colors.surfaceHighlight)
            .cornerRadius(AppTheme.Radius.sm)
            .tint(AppTheme.Colors.gold)
    }
}

// MARK: - Mix Generator View

struct MixGeneratorView: View {
    @EnvironmentObject var libraryManager: LibraryManager
    @EnvironmentObject var notificationManager: NotificationManager
    @StateObject private var serverDiscovery = ServerDiscovery()

    @State private var mixPrompt = ""
    @State private var selectedStyle: MixStylePreset?
    @State private var selectedDuration: MixDurationPreset = .medium
    @State private var customTrackCount: Double = 20
    @State private var useCustomDuration = false
    @State private var isGenerating = false
    @State private var progress = ""
    @State private var error: String?
    @State private var isErrorRetryable = false
    @State private var result: GeneratedMixResult?
    @State private var showSettings = false
    @FocusState private var isPromptFocused: Bool

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: AppTheme.Spacing.lg) {
                    // Header
                    VStack(spacing: AppTheme.Spacing.sm) {
                        HStack {
                            VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                                Text("Audio Mix")
                                    .font(AppTheme.Typography.largeTitle)
                                    .foregroundColor(AppTheme.Colors.textPrimary)
                                Text("Generate seamless DJ mixes")
                                    .font(AppTheme.Typography.subheadline)
                                    .foregroundColor(AppTheme.Colors.textSecondary)
                            }
                            Spacer()
                        }

                        // Server status
                        HStack(spacing: AppTheme.Spacing.xs) {
                            if serverDiscovery.isSearching {
                                ProgressView().scaleEffect(0.6)
                                Text("Connecting...").font(AppTheme.Typography.caption).foregroundColor(AppTheme.Colors.textSecondary)
                            } else if serverDiscovery.isConnected {
                                Image(systemName: "checkmark.circle.fill").font(.system(size: 10)).foregroundColor(AppTheme.Colors.success)
                                Text("Server Connected").font(AppTheme.Typography.caption).foregroundColor(AppTheme.Colors.success)
                            } else {
                                Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 10)).foregroundColor(AppTheme.Colors.warning)
                                Text("Not Connected").font(AppTheme.Typography.caption).foregroundColor(AppTheme.Colors.warning)
                            }
                        }
                        .padding(.horizontal, AppTheme.Spacing.sm)
                        .padding(.vertical, AppTheme.Spacing.xxs)
                        .background(Capsule().fill(serverDiscovery.isConnected ? AppTheme.Colors.success.opacity(0.15) : AppTheme.Colors.warning.opacity(0.15)))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    // Style presets
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        Label("Quick Presets", systemImage: "sparkles")
                            .font(AppTheme.Typography.headline)
                            .foregroundColor(AppTheme.Colors.textPrimary)

                        LazyVGrid(columns: [
                            GridItem(.flexible(), spacing: AppTheme.Spacing.sm),
                            GridItem(.flexible(), spacing: AppTheme.Spacing.sm),
                            GridItem(.flexible(), spacing: AppTheme.Spacing.sm)
                        ], spacing: AppTheme.Spacing.sm) {
                            ForEach(MixStylePreset.allCases, id: \.self) { style in
                                MixStyleChip(style: style, isSelected: selectedStyle == style) {
                                    HapticManager.shared.tap()
                                    withAnimation(AppTheme.Animation.spring) {
                                        if selectedStyle == style {
                                            selectedStyle = nil
                                            mixPrompt = ""
                                        } else {
                                            selectedStyle = style
                                            mixPrompt = style.prompt
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Prompt
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                        Label("Describe Your Mix", systemImage: "text.bubble")
                            .font(AppTheme.Typography.headline)
                            .foregroundColor(AppTheme.Colors.textPrimary)

                        ThemedTextField(placeholder: "e.g., upbeat house for beach party, 120-128 BPM", text: $mixPrompt, axis: .vertical)
                            .focused($isPromptFocused)
                            .lineLimit(2...4)
                    }
                    .cardStyle()

                    // Duration
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        HStack {
                            Label("Mix Length", systemImage: "clock")
                                .font(AppTheme.Typography.headline)
                                .foregroundColor(AppTheme.Colors.textPrimary)
                            Spacer()
                            Text(estimatedDurationText)
                                .font(AppTheme.Typography.headline)
                                .foregroundColor(AppTheme.Colors.gold)
                        }

                        // Quick presets
                        HStack(spacing: AppTheme.Spacing.sm) {
                            ForEach(MixDurationPreset.allCases, id: \.self) { duration in
                                Button {
                                    HapticManager.shared.selection()
                                    withAnimation(AppTheme.Animation.quick) {
                                        selectedDuration = duration
                                        customTrackCount = Double(duration.trackCount)
                                        useCustomDuration = false
                                    }
                                } label: {
                                    Text(duration.rawValue)
                                        .font(AppTheme.Typography.callout)
                                        .foregroundColor(isPresetSelected(duration) ? AppTheme.Colors.background : AppTheme.Colors.textSecondary)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, AppTheme.Spacing.sm)
                                        .background(RoundedRectangle(cornerRadius: AppTheme.Radius.md).fill(isPresetSelected(duration) ? AppTheme.Colors.gold : AppTheme.Colors.surfaceHighlight))
                                }
                                .buttonStyle(PlainButtonStyle())
                            }
                        }

                        Divider().background(AppTheme.Colors.surfaceHighlight)

                        // Custom slider
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                            HStack {
                                Text("Custom")
                                    .font(AppTheme.Typography.callout)
                                    .foregroundColor(AppTheme.Colors.textSecondary)
                                Spacer()
                                Text("\(Int(customTrackCount)) tracks")
                                    .font(AppTheme.Typography.callout)
                                    .foregroundColor(useCustomDuration ? AppTheme.Colors.gold : AppTheme.Colors.textTertiary)
                            }

                            Slider(value: $customTrackCount, in: 8...60, step: 2) { editing in
                                if editing {
                                    HapticManager.shared.selection()
                                    useCustomDuration = true
                                }
                            }
                            .tint(AppTheme.Colors.gold)
                            .onChange(of: customTrackCount) { _, _ in
                                if useCustomDuration {
                                    HapticManager.shared.selection()
                                }
                            }
                        }
                    }
                    .cardStyle()

                    // Generate button
                    Button(action: generateMix) {
                        HStack(spacing: AppTheme.Spacing.sm) {
                            if isGenerating {
                                ProgressView().progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.background)).scaleEffect(0.9)
                            } else {
                                Image(systemName: "waveform.path.ecg").font(.system(size: 18, weight: .semibold))
                            }
                            Text(isGenerating ? "Generating..." : "Generate Audio Mix")
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle(isDisabled: mixPrompt.isEmpty || isGenerating || !serverDiscovery.isConnected))
                    .disabled(mixPrompt.isEmpty || isGenerating || !serverDiscovery.isConnected)

                    // Progress/Error
                    if isGenerating && !progress.isEmpty {
                        HStack(spacing: AppTheme.Spacing.sm) {
                            ProgressView().scaleEffect(0.8)
                            Text(progress).font(AppTheme.Typography.footnote).foregroundColor(AppTheme.Colors.textSecondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .cardStyle()
                    }

                    if let errorMsg = error {
                        HStack(spacing: AppTheme.Spacing.sm) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(AppTheme.Colors.error)
                            Text(errorMsg)
                                .font(AppTheme.Typography.footnote)
                                .foregroundColor(AppTheme.Colors.error)
                                .lineLimit(2)
                            Spacer()

                            if isErrorRetryable {
                                Button {
                                    HapticManager.shared.tap()
                                    withAnimation {
                                        error = nil
                                        isErrorRetryable = false
                                    }
                                    generateMix()
                                } label: {
                                    HStack(spacing: 4) {
                                        Image(systemName: "arrow.clockwise")
                                            .font(.system(size: 11, weight: .semibold))
                                        Text("Retry")
                                            .font(AppTheme.Typography.caption)
                                    }
                                    .foregroundColor(AppTheme.Colors.gold)
                                    .padding(.horizontal, AppTheme.Spacing.sm)
                                    .padding(.vertical, AppTheme.Spacing.xs)
                                    .background(AppTheme.Colors.gold.opacity(0.15))
                                    .cornerRadius(AppTheme.Radius.sm)
                                }
                            }

                            Button {
                                withAnimation {
                                    error = nil
                                    isErrorRetryable = false
                                }
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(AppTheme.Colors.textTertiary)
                            }
                        }
                        .padding(AppTheme.Spacing.sm)
                        .background(AppTheme.Colors.error.opacity(0.15))
                        .cornerRadius(AppTheme.Radius.sm)
                    }

                    // Result card
                    if let mix = result {
                        MixResultCard(mix: mix, serverAddress: serverDiscovery.serverAddress)
                    }

                    Spacer(minLength: AppTheme.Spacing.xxl)
                }
                .padding(.horizontal, AppTheme.Spacing.md)
                .padding(.top, AppTheme.Spacing.sm)
            }
            .screenBackground()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { showSettings = true } label: {
                        Image(systemName: "gear").foregroundColor(AppTheme.Colors.gold)
                    }
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { isPromptFocused = false }.foregroundColor(AppTheme.Colors.gold)
                }
            }
            .sheet(isPresented: $showSettings) {
                MixServerSettingsAuto(discovery: serverDiscovery)
            }
            .onAppear {
                if !serverDiscovery.isConnected && !serverDiscovery.isSearching {
                    Task { await serverDiscovery.autoDiscover() }
                }
            }
        }
    }

    // MARK: - Duration Helpers

    /// The effective track count to use for mix generation
    private var effectiveTrackCount: Int {
        if useCustomDuration {
            return Int(customTrackCount)
        } else {
            return selectedDuration.trackCount
        }
    }

    /// Check if a preset is currently selected (not using custom)
    private func isPresetSelected(_ preset: MixDurationPreset) -> Bool {
        !useCustomDuration && selectedDuration == preset
    }

    /// Human-readable duration text based on current selection
    private var estimatedDurationText: String {
        let tracks = effectiveTrackCount
        let minutes = tracks * 3  // ~3 min per track with crossfade
        if minutes >= 60 {
            let hours = minutes / 60
            let mins = minutes % 60
            if mins == 0 {
                return "\(hours)h"
            } else {
                return "\(hours)h \(mins)m"
            }
        } else {
            return "~\(minutes) min"
        }
    }

    // MARK: - API Calls

    private func generateMix() {
        isGenerating = true
        error = nil
        isErrorRetryable = false
        progress = "Starting..."
        isPromptFocused = false

        Task {
            // Request background execution time so mix generation continues when app is backgrounded
            var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid
            backgroundTaskID = UIApplication.shared.beginBackgroundTask(withName: "MixGeneration") {
                // Cleanup if we run out of time
                if backgroundTaskID != .invalid {
                    UIApplication.shared.endBackgroundTask(backgroundTaskID)
                    backgroundTaskID = .invalid
                }
            }

            defer {
                // End background task when done
                if backgroundTaskID != .invalid {
                    UIApplication.shared.endBackgroundTask(backgroundTaskID)
                }
            }

            do {
                let mixResult = try await callMixAPI()
                await MainActor.run {
                    isGenerating = false
                    result = mixResult
                    progress = ""
                    HapticManager.shared.success()
                    notificationManager.notifyMixComplete(mixName: mixResult.filename, trackCount: mixResult.trackCount)

                    // Track history with full tracklist
                    let historyTracks = mixResult.tracks.map { track in
                        HistoryTrackItem(title: track.title, artist: track.artist, bpm: track.bpm, key: track.key)
                    }
                    let historyItem = GenerationHistoryItem(
                        prompt: mixPrompt,
                        playlistName: mixResult.filename,
                        playlistURL: mixResult.downloadUrl,
                        trackCount: mixResult.trackCount,
                        generationType: .audioMix,
                        tracks: historyTracks,
                        duration: mixResult.duration
                    )
                    HistoryManager.shared.addItem(historyItem)
                }
            } catch {
                await MainActor.run {
                    isGenerating = false
                    self.error = error.localizedDescription
                    progress = ""

                    // Most mix API errors are retryable (network, timeout, server errors)
                    if let mixError = error as? MixError {
                        isErrorRetryable = mixError.isRetryable
                    } else {
                        isErrorRetryable = true // Default to retryable for unknown errors
                    }

                    HapticManager.shared.error()
                    notificationManager.notifyMixFailed(error: error.localizedDescription)
                }
            }
        }
    }

    private func callMixAPI() async throws -> GeneratedMixResult {
        // Always use cloud server with HTTPS
        let baseUrl = "https://mixmaster.mixtape.run"

        guard let startUrl = URL(string: "\(baseUrl)/api/generate-mix") else { throw MixError.invalidURL }

        // Configure URLSession with longer timeouts for mobile networks
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 300
        config.waitsForConnectivity = true
        let session = URLSession(configuration: config)

        var request = URLRequest(url: startUrl)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120

        let body: [String: Any] = ["prompt": mixPrompt, "trackCount": effectiveTrackCount]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (startData, startResponse) = try await session.data(for: request)

        guard let httpResponse = startResponse as? HTTPURLResponse else {
            throw MixError.apiError("No response from server")
        }

        if httpResponse.statusCode != 200 {
            if let errorJson = try? JSONSerialization.jsonObject(with: startData) as? [String: Any],
               let errorMessage = errorJson["error"] as? String {
                throw MixError.apiError(errorMessage)
            }
            throw MixError.apiError("Server error: \(httpResponse.statusCode)")
        }

        guard let startJson = try? JSONSerialization.jsonObject(with: startData) as? [String: Any],
              let jobId = startJson["jobId"] as? String else {
            throw MixError.invalidResponse
        }

        await MainActor.run { progress = "Selecting tracks..." }

        guard let statusUrl = URL(string: "\(baseUrl)/api/mix-status/\(jobId)") else {
            throw MixError.invalidURL
        }

        var pollCount = 0
        let maxPolls = 180 // 15 minutes at 5 second intervals

        while pollCount < maxPolls {
            try await Task.sleep(nanoseconds: 5_000_000_000)
            pollCount += 1

            var statusRequest = URLRequest(url: statusUrl)
            statusRequest.timeoutInterval = 30

            let (statusData, _) = try await session.data(for: statusRequest)

            guard let statusJson = try? JSONSerialization.jsonObject(with: statusData) as? [String: Any],
                  let status = statusJson["status"] as? String else { continue }

            if let msg = statusJson["progressMessage"] as? String {
                await MainActor.run { progress = msg }
            }

            if status == "complete" {
                guard let resultData = statusJson["result"] as? [String: Any] else { throw MixError.invalidResponse }
                let tracklist = resultData["tracklist"] as? [[String: Any]] ?? []

                return GeneratedMixResult(
                    filename: resultData["mixName"] as? String ?? "Mix",
                    downloadUrl: resultData["mixUrl"] as? String ?? "",
                    duration: formatDuration(resultData["duration"] as? Double ?? 0),
                    trackCount: tracklist.count,
                    tracks: tracklist.compactMap {
                        MixTrackItem(
                            title: $0["title"] as? String ?? "",
                            artist: $0["artist"] as? String ?? "",
                            bpm: $0["bpm"] as? Double ?? 0,
                            key: $0["key"] as? String ?? ""
                        )
                    }
                )
            } else if status == "failed" {
                throw MixError.apiError(statusJson["error"] as? String ?? "Failed")
            }
        }
        throw MixError.apiError("Generation timed out after 15 minutes")
    }

    private func formatDuration(_ seconds: Double) -> String {
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        return String(format: "%d:%02d", m, s)
    }
}

// MARK: - Mix Generator Types

struct GeneratedMixResult {
    let filename: String
    let downloadUrl: String
    let duration: String
    let trackCount: Int
    let tracks: [MixTrackItem]
}

struct MixTrackItem {
    let title: String
    let artist: String
    let bpm: Double
    let key: String
}

enum MixStylePreset: String, CaseIterable {
    case beach = "Beach"
    case workout = "Workout"
    case dinner = "Dinner"
    case lateNight = "Late Night"
    case focus = "Focus"
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
        case .beach: return Color(red: 1.0, green: 0.6, blue: 0.2)
        case .workout: return Color(red: 1.0, green: 0.3, blue: 0.3)
        case .dinner: return Color(red: 0.7, green: 0.5, blue: 0.3)
        case .lateNight: return Color(red: 0.6, green: 0.4, blue: 0.8)
        case .focus: return Color(red: 0.3, green: 0.6, blue: 0.9)
        case .roadTrip: return Color(red: 0.3, green: 0.8, blue: 0.5)
        }
    }

    var prompt: String {
        switch self {
        case .beach: return "Upbeat house and disco for summer beach party, 118-126 BPM"
        case .workout: return "High energy workout mix with driving beats, 128-140 BPM"
        case .dinner: return "Chill deep house and nu-disco for dinner party"
        case .lateNight: return "Dark melodic techno for late night, 122-130 BPM"
        case .focus: return "Ambient electronica for deep focus, 80-110 BPM"
        case .roadTrip: return "Feel-good indie dance and electropop for road trip"
        }
    }
}

enum MixDurationPreset: String, CaseIterable {
    case short = "30 min"
    case medium = "1 hour"
    case long = "2 hours"

    var trackCount: Int {
        switch self {
        // Assuming ~3.5 min per track with crossfade overlap
        case .short: return 12   // ~30-35 min
        case .medium: return 20  // ~55-65 min
        case .long: return 40    // ~2 hours
        }
    }
}

enum MixError: LocalizedError {
    case invalidURL
    case invalidResponse
    case apiError(String)
    case timeout
    case serverError(statusCode: Int)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Can't connect to server"
        case .invalidResponse: return "Invalid response from server"
        case .apiError(let msg): return msg
        case .timeout: return "Request timed out. Please try again."
        case .serverError(let code): return "Server error (\(code)). Please try again later."
        }
    }

    var isRetryable: Bool {
        switch self {
        case .invalidURL:
            return false // Configuration error, won't fix on retry
        case .invalidResponse, .apiError, .timeout, .serverError:
            return true // These could succeed on retry
        }
    }
}

struct MixStyleChip: View {
    let style: MixStylePreset
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: AppTheme.Spacing.xxs) {
                Image(systemName: style.icon)
                    .font(.system(size: 22, weight: .medium))
                    .foregroundColor(isSelected ? style.color : AppTheme.Colors.textSecondary)
                Text(style.rawValue)
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(isSelected ? AppTheme.Colors.textPrimary : AppTheme.Colors.textSecondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 70)
            .background(RoundedRectangle(cornerRadius: AppTheme.Radius.md).fill(isSelected ? style.color.opacity(0.15) : AppTheme.Colors.surface))
            .overlay(RoundedRectangle(cornerRadius: AppTheme.Radius.md).stroke(isSelected ? style.color : Color.clear, lineWidth: 2))
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Server Discovery

class ServerDiscovery: ObservableObject {
    @Published var isConnected = false
    @Published var isSearching = false
    @Published var serverAddress: String = ""
    @Published var connectionError: String?

    // Cloud server is the primary - always try it first
    private let cloudServer = "mixmaster.mixtape.run"
    private let localAddresses = [
        "192.168.86.20",
        "192.168.1.1",
        "192.168.0.1"
    ]

    init() {
        // Always default to cloud server for reliability
        serverAddress = cloudServer
        // But check if user manually set a different one
        if let saved = UserDefaults.standard.string(forKey: "mixServerAddress"),
           !saved.isEmpty && saved != cloudServer {
            serverAddress = saved
        }
    }

    func saveAddress(_ address: String) {
        serverAddress = address
        UserDefaults.standard.set(address, forKey: "mixServerAddress")
    }

    func clearSavedAddress() {
        UserDefaults.standard.removeObject(forKey: "mixServerAddress")
        serverAddress = cloudServer
    }

    @MainActor
    func autoDiscover() async {
        isSearching = true
        connectionError = nil

        // ALWAYS try cloud server first - it's the most reliable
        if await testConnection(cloudServer) {
            saveAddress(cloudServer)
            isConnected = true
            isSearching = false
            return
        }

        // Only try local addresses if cloud fails (for local development)
        for address in localAddresses {
            if await testConnection(address) {
                saveAddress(address)
                isConnected = true
                isSearching = false
                return
            }
        }

        // Clear any stale saved address since nothing worked
        clearSavedAddress()
        isSearching = false
        connectionError = "Server not found. Check your connection."
    }

    func testConnection(_ address: String) async -> Bool {
        let urlString = address == cloudServer
            ? "https://\(address)/api/discover"
            : "http://\(address):3000/api/discover"
        guard let url = URL(string: urlString) else { return false }

        var request = URLRequest(url: url)
        request.timeoutInterval = 10 // Increased for mobile networks

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else { return false }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let service = json["service"] as? String,
               service.contains("NotoriousDAD") {
                return true
            }
            return false
        } catch {
            return false
        }
    }

    @MainActor
    func retryConnection() async {
        isConnected = false
        connectionError = nil
        await autoDiscover()
    }
}

struct MixServerSettingsAuto: View {
    @Environment(\.dismiss) var dismiss
    @ObservedObject var discovery: ServerDiscovery
    @State private var tempAddress = ""
    @State private var testing = false
    @State private var testResult: String?

    var body: some View {
        NavigationView {
            List {
                Section {
                    HStack {
                        if discovery.isConnected {
                            Image(systemName: "checkmark.circle.fill").foregroundColor(AppTheme.Colors.success)
                            Text(discovery.serverAddress)
                        } else {
                            Image(systemName: "xmark.circle.fill").foregroundColor(AppTheme.Colors.error)
                            Text("Not Connected")
                        }
                    }
                } header: { Text("Status") }

                Section {
                    TextField("Server Address", text: $tempAddress).autocapitalization(.none)
                    Button {
                        testing = true
                        testResult = nil
                        Task {
                            let success = await discovery.testConnection(tempAddress)
                            await MainActor.run {
                                testing = false
                                if success {
                                    testResult = "Success!"
                                    discovery.saveAddress(tempAddress)
                                    discovery.isConnected = true
                                } else {
                                    testResult = "Failed"
                                }
                            }
                        }
                    } label: {
                        HStack {
                            if testing { ProgressView().scaleEffect(0.8); Text("Testing...") }
                            else { Image(systemName: "wifi"); Text("Test Connection") }
                        }
                    }
                    .disabled(tempAddress.isEmpty || testing)

                    if let result = testResult {
                        Text(result).font(.caption).foregroundColor(result.contains("Success") ? .green : .red)
                    }
                } header: { Text("Manual") }

                Section {
                    Button {
                        Task { await discovery.autoDiscover() }
                    } label: {
                        HStack {
                            if discovery.isSearching { ProgressView().scaleEffect(0.8); Text("Searching...") }
                            else { Image(systemName: "magnifyingglass"); Text("Auto-Discover") }
                        }
                    }
                    .disabled(discovery.isSearching)
                } header: { Text("Automatic") }
            }
            .navigationTitle("Server Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .onAppear { tempAddress = discovery.serverAddress }
        }
        .preferredColorScheme(.dark)
    }
}

struct MixResultCard: View {
    let mix: GeneratedMixResult
    let serverAddress: String

    @StateObject private var player = AudioPlayerManager()
    @State private var showShare = false
    @State private var shareURL: URL?

    var body: some View {
        VStack(spacing: AppTheme.Spacing.md) {
            HStack {
                Image(systemName: "checkmark.circle.fill").font(.system(size: 28)).foregroundColor(AppTheme.Colors.success)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Mix Ready!").font(AppTheme.Typography.headline).foregroundColor(AppTheme.Colors.textPrimary)
                    Text("\(mix.trackCount) tracks • \(mix.duration)").font(AppTheme.Typography.caption).foregroundColor(AppTheme.Colors.textSecondary)
                }
                Spacer()
            }

            Divider().background(AppTheme.Colors.surfaceHighlight)

            VStack(spacing: AppTheme.Spacing.sm) {
                HStack {
                    Image(systemName: "waveform").foregroundColor(AppTheme.Colors.gold)
                    Text(mix.filename).font(AppTheme.Typography.callout).foregroundColor(AppTheme.Colors.textPrimary).lineLimit(1)
                    Spacer()
                }

                if player.duration > 0 {
                    VStack(spacing: 4) {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(AppTheme.Colors.surfaceHighlight).frame(height: 4)
                                Capsule().fill(AppTheme.Colors.gold).frame(width: geo.size.width * CGFloat(player.currentTime / player.duration), height: 4)
                            }
                            .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                                let pos = min(max(0, value.location.x / geo.size.width), 1)
                                player.seek(to: pos)
                            })
                        }
                        .frame(height: 4)

                        HStack {
                            Text(formatTime(player.currentTime))
                            Spacer()
                            Text(formatTime(player.duration))
                        }
                        .font(AppTheme.Typography.caption2)
                        .foregroundColor(AppTheme.Colors.textTertiary)
                    }
                }

                HStack(spacing: AppTheme.Spacing.sm) {
                    Button {
                        if player.isPlaying || player.duration > 0 { player.togglePlayPause() }
                        else { streamMix() }
                    } label: {
                        HStack {
                            Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            Text(player.isPlaying ? "Pause" : "Play")
                        }
                        .font(AppTheme.Typography.callout)
                        .foregroundColor(AppTheme.Colors.background)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, AppTheme.Spacing.sm)
                        .background(AppTheme.Colors.gold)
                        .cornerRadius(AppTheme.Radius.md)
                    }
                    .disabled(player.isLoading)

                    Button { saveMix() } label: {
                        Image(systemName: "square.and.arrow.down")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(AppTheme.Colors.gold)
                            .frame(width: 50)
                            .padding(.vertical, AppTheme.Spacing.sm)
                            .background(AppTheme.Colors.gold.opacity(0.15))
                            .cornerRadius(AppTheme.Radius.md)
                    }
                }

                if player.isLoading {
                    HStack { ProgressView().scaleEffect(0.7); Text("Loading...").font(AppTheme.Typography.caption).foregroundColor(AppTheme.Colors.textSecondary) }
                }
            }
            .padding(AppTheme.Spacing.sm)
            .background(AppTheme.Colors.surfaceHighlight.opacity(0.5))
            .cornerRadius(AppTheme.Radius.md)

            VStack(spacing: AppTheme.Spacing.xs) {
                ForEach(Array(mix.tracks.prefix(3).enumerated()), id: \.offset) { idx, track in
                    HStack {
                        Text("\(idx + 1)").font(AppTheme.Typography.caption).foregroundColor(AppTheme.Colors.textTertiary).frame(width: 16)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(track.title).font(AppTheme.Typography.footnote).foregroundColor(AppTheme.Colors.textPrimary).lineLimit(1)
                            Text(track.artist).font(AppTheme.Typography.caption2).foregroundColor(AppTheme.Colors.textSecondary).lineLimit(1)
                        }
                        Spacer()
                        Text(track.key)
                            .font(AppTheme.Typography.caption2)
                            .foregroundColor(AppTheme.Colors.gold)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(AppTheme.Colors.gold.opacity(0.15))
                            .cornerRadius(4)
                    }
                }

                if mix.tracks.count > 3 {
                    Text("+ \(mix.tracks.count - 3) more")
                        .font(AppTheme.Typography.caption)
                        .foregroundColor(AppTheme.Colors.textTertiary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .cardStyle(elevated: true)
        .sheet(isPresented: $showShare) {
            if let url = shareURL { ShareSheet(items: [url]) }
        }
    }

    private func getMixURL() -> URL? {
        let urlString = serverAddress == "mixmaster.mixtape.run"
            ? "https://\(serverAddress)\(mix.downloadUrl)"
            : "http://\(serverAddress):3000\(mix.downloadUrl)"
        return URL(string: urlString)
    }

    private func streamMix() {
        guard let url = getMixURL() else { return }
        player.streamAudio(from: url)
    }

    private func saveMix() {
        guard let url = getMixURL() else { return }
        player.downloadAudio(from: url) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let fileURL): shareURL = fileURL; showShare = true
                case .failure(let error): player.error = error.localizedDescription
                }
            }
        }
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        String(format: "%d:%02d", Int(seconds) / 60, Int(seconds) % 60)
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Library View

struct LibraryView: View {
    @EnvironmentObject var libraryManager: LibraryManager
    @State private var searchText = ""
    @State private var selectedFilter: LibraryFilter = .all
    @State private var showFilters = false

    // Key/BPM Filters
    @State private var selectedKey: String?
    @State private var bpmMin: Double = 80
    @State private var bpmMax: Double = 180
    @State private var bpmFilterActive = false

    enum LibraryFilter: String, CaseIterable { case all = "All", mik = "MIK", appleMusic = "Apple Music" }

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
        NavigationView {
            VStack(spacing: 0) {
                // Stats
                HStack(spacing: AppTheme.Spacing.md) {
                    StatCard(icon: "waveform", value: "\(libraryManager.mikTrackCount.formatted())", label: "MIK Analyzed", color: AppTheme.Colors.accentCyan)
                    StatCard(icon: "music.note", value: "\(libraryManager.appleMusicTrackCount.formatted())", label: "Apple Music", color: AppTheme.Colors.accentPink)
                }
                .padding(.horizontal, AppTheme.Spacing.md)
                .padding(.vertical, AppTheme.Spacing.sm)

                // Source filter tabs + DJ filter button
                HStack(spacing: AppTheme.Spacing.xs) {
                    ForEach(LibraryFilter.allCases, id: \.self) { filter in
                        Button {
                            HapticManager.shared.selection()
                            withAnimation(AppTheme.Animation.quick) { selectedFilter = filter }
                        } label: {
                            Text(filter.rawValue)
                                .font(AppTheme.Typography.caption)
                                .foregroundColor(selectedFilter == filter ? AppTheme.Colors.background : AppTheme.Colors.textSecondary)
                                .padding(.horizontal, AppTheme.Spacing.sm)
                                .padding(.vertical, AppTheme.Spacing.xxs)
                                .background(Capsule().fill(selectedFilter == filter ? AppTheme.Colors.gold : AppTheme.Colors.surfaceHighlight))
                        }
                        .buttonStyle(PlainButtonStyle())
                    }
                    Spacer()

                    // DJ Filters button
                    Button {
                        HapticManager.shared.tap()
                        showFilters.toggle()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "slider.horizontal.3")
                                .font(.system(size: 12, weight: .semibold))
                            if activeFilterCount > 0 {
                                Text("\(activeFilterCount)")
                                    .font(AppTheme.Typography.caption2)
                            }
                        }
                        .foregroundColor(activeFilterCount > 0 ? AppTheme.Colors.background : AppTheme.Colors.gold)
                        .padding(.horizontal, AppTheme.Spacing.sm)
                        .padding(.vertical, AppTheme.Spacing.xxs)
                        .background(Capsule().fill(activeFilterCount > 0 ? AppTheme.Colors.gold : AppTheme.Colors.gold.opacity(0.15)))
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                .padding(.horizontal, AppTheme.Spacing.md)
                .padding(.bottom, AppTheme.Spacing.sm)

                // Active filter pills
                if activeFilterCount > 0 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: AppTheme.Spacing.xs) {
                            if let key = selectedKey {
                                FilterPill(label: "Key: \(key)", color: AppTheme.Colors.accentCyan) {
                                    withAnimation { selectedKey = nil }
                                }
                            }
                            if bpmFilterActive {
                                FilterPill(label: "BPM: \(Int(bpmMin))-\(Int(bpmMax))", color: AppTheme.Colors.gold) {
                                    withAnimation { bpmFilterActive = false }
                                }
                            }
                        }
                        .padding(.horizontal, AppTheme.Spacing.md)
                    }
                    .padding(.bottom, AppTheme.Spacing.sm)
                }

                // Results count
                Text("\(filteredTracks.count) tracks")
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(AppTheme.Colors.textTertiary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, AppTheme.Spacing.md)
                    .padding(.bottom, AppTheme.Spacing.xs)

                ScrollView {
                    LazyVStack(spacing: AppTheme.Spacing.xs) {
                        ForEach(filteredTracks, id: \.id) { track in
                            TrackRow(track: track)
                        }
                    }
                    .padding(.horizontal, AppTheme.Spacing.md)
                    .padding(.bottom, AppTheme.Spacing.xxl)
                }
            }
            .screenBackground()
            .navigationTitle("Library")
            .navigationBarTitleDisplayMode(.large)
            .searchable(text: $searchText, prompt: "Search tracks...")
            .tint(AppTheme.Colors.gold)
            .sheet(isPresented: $showFilters) {
                DJFiltersSheet(
                    selectedKey: $selectedKey,
                    bpmMin: $bpmMin,
                    bpmMax: $bpmMax,
                    bpmFilterActive: $bpmFilterActive
                )
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
            }
        }
    }
}

// MARK: - Filter Pill

struct FilterPill: View {
    let label: String
    let color: Color
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Text(label)
                .font(AppTheme.Typography.caption)
                .foregroundColor(color)
            Button {
                HapticManager.shared.tap()
                onRemove()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundColor(color.opacity(0.7))
            }
        }
        .padding(.horizontal, AppTheme.Spacing.sm)
        .padding(.vertical, AppTheme.Spacing.xxs)
        .background(color.opacity(0.15))
        .cornerRadius(AppTheme.Radius.lg)
    }
}

// MARK: - DJ Filters Sheet

struct DJFiltersSheet: View {
    @Binding var selectedKey: String?
    @Binding var bpmMin: Double
    @Binding var bpmMax: Double
    @Binding var bpmFilterActive: Bool
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.lg) {
                    // Key Filter
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        HStack {
                            Label("Musical Key", systemImage: "music.quarternote.3")
                                .font(AppTheme.Typography.headline)
                                .foregroundColor(AppTheme.Colors.textPrimary)
                            Spacer()
                            if selectedKey != nil {
                                Button("Clear") {
                                    HapticManager.shared.tap()
                                    selectedKey = nil
                                }
                                .font(AppTheme.Typography.caption)
                                .foregroundColor(AppTheme.Colors.gold)
                            }
                        }

                        // Minor keys (A row)
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                            Text("Minor Keys")
                                .font(AppTheme.Typography.caption)
                                .foregroundColor(AppTheme.Colors.textSecondary)
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 6), spacing: 6) {
                                ForEach(1...12, id: \.self) { num in
                                    let key = "\(num)A"
                                    KeyButton(key: key, isSelected: selectedKey == key) {
                                        HapticManager.shared.selection()
                                        selectedKey = selectedKey == key ? nil : key
                                    }
                                }
                            }
                        }

                        // Major keys (B row)
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                            Text("Major Keys")
                                .font(AppTheme.Typography.caption)
                                .foregroundColor(AppTheme.Colors.textSecondary)
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 6), spacing: 6) {
                                ForEach(1...12, id: \.self) { num in
                                    let key = "\(num)B"
                                    KeyButton(key: key, isSelected: selectedKey == key) {
                                        HapticManager.shared.selection()
                                        selectedKey = selectedKey == key ? nil : key
                                    }
                                }
                            }
                        }
                    }
                    .cardStyle()

                    // BPM Filter
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        HStack {
                            Label("BPM Range", systemImage: "metronome")
                                .font(AppTheme.Typography.headline)
                                .foregroundColor(AppTheme.Colors.textPrimary)
                            Spacer()
                            Toggle("", isOn: $bpmFilterActive)
                                .tint(AppTheme.Colors.gold)
                                .labelsHidden()
                        }

                        if bpmFilterActive {
                            VStack(spacing: AppTheme.Spacing.sm) {
                                HStack {
                                    Text("\(Int(bpmMin))")
                                        .font(AppTheme.Typography.headline)
                                        .foregroundColor(AppTheme.Colors.gold)
                                        .frame(width: 40)
                                    Spacer()
                                    Text("to")
                                        .font(AppTheme.Typography.caption)
                                        .foregroundColor(AppTheme.Colors.textSecondary)
                                    Spacer()
                                    Text("\(Int(bpmMax))")
                                        .font(AppTheme.Typography.headline)
                                        .foregroundColor(AppTheme.Colors.gold)
                                        .frame(width: 40)
                                }

                                // Min BPM slider
                                HStack {
                                    Text("Min")
                                        .font(AppTheme.Typography.caption)
                                        .foregroundColor(AppTheme.Colors.textSecondary)
                                        .frame(width: 30)
                                    Slider(value: $bpmMin, in: 60...180, step: 5) { editing in
                                        if editing { HapticManager.shared.selection() }
                                        // Ensure min doesn't exceed max
                                        if bpmMin > bpmMax - 5 {
                                            bpmMin = bpmMax - 5
                                        }
                                    }
                                    .tint(AppTheme.Colors.gold)
                                }

                                // Max BPM slider
                                HStack {
                                    Text("Max")
                                        .font(AppTheme.Typography.caption)
                                        .foregroundColor(AppTheme.Colors.textSecondary)
                                        .frame(width: 30)
                                    Slider(value: $bpmMax, in: 60...200, step: 5) { editing in
                                        if editing { HapticManager.shared.selection() }
                                        // Ensure max doesn't go below min
                                        if bpmMax < bpmMin + 5 {
                                            bpmMax = bpmMin + 5
                                        }
                                    }
                                    .tint(AppTheme.Colors.gold)
                                }

                                // Quick BPM presets
                                HStack(spacing: AppTheme.Spacing.sm) {
                                    BPMPresetButton(label: "House", range: 120...130) {
                                        bpmMin = 120
                                        bpmMax = 130
                                    }
                                    BPMPresetButton(label: "Techno", range: 130...140) {
                                        bpmMin = 130
                                        bpmMax = 140
                                    }
                                    BPMPresetButton(label: "D&B", range: 160...180) {
                                        bpmMin = 160
                                        bpmMax = 180
                                    }
                                }
                            }
                            .padding(.top, AppTheme.Spacing.xs)
                        }
                    }
                    .cardStyle()

                    Spacer()
                }
                .padding(AppTheme.Spacing.md)
            }
            .screenBackground()
            .navigationTitle("DJ Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        HapticManager.shared.tap()
                        dismiss()
                    }
                    .foregroundColor(AppTheme.Colors.gold)
                }
            }
        }
    }
}

struct KeyButton: View {
    let key: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(key)
                .font(AppTheme.Typography.caption)
                .foregroundColor(isSelected ? AppTheme.Colors.background : AppTheme.Colors.textSecondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppTheme.Spacing.sm)
                .background(RoundedRectangle(cornerRadius: AppTheme.Radius.sm)
                    .fill(isSelected ? AppTheme.Colors.accentCyan : AppTheme.Colors.surfaceHighlight))
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct BPMPresetButton: View {
    let label: String
    let range: ClosedRange<Double>
    let action: () -> Void

    var body: some View {
        Button {
            HapticManager.shared.tap()
            action()
        } label: {
            VStack(spacing: 2) {
                Text(label)
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(AppTheme.Colors.textPrimary)
                Text("\(Int(range.lowerBound))-\(Int(range.upperBound))")
                    .font(AppTheme.Typography.caption2)
                    .foregroundColor(AppTheme.Colors.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, AppTheme.Spacing.sm)
            .background(AppTheme.Colors.surfaceHighlight)
            .cornerRadius(AppTheme.Radius.sm)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct StatCard: View {
    let icon: String
    let value: String
    let label: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
            HStack {
                Image(systemName: icon).font(.system(size: 14)).foregroundColor(color)
                Text(value).font(AppTheme.Typography.title3).foregroundColor(AppTheme.Colors.textPrimary)
            }
            Text(label).font(AppTheme.Typography.caption2).foregroundColor(AppTheme.Colors.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(AppTheme.Spacing.sm)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.Radius.md)
    }
}

struct TrackRow: View {
    let track: NotoriousDADKit.Track

    var body: some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text(track.name).font(AppTheme.Typography.callout).foregroundColor(AppTheme.Colors.textPrimary).lineLimit(1)
                Text(track.artists.joined(separator: ", ")).font(AppTheme.Typography.caption).foregroundColor(AppTheme.Colors.textSecondary).lineLimit(1)
            }
            Spacer()
            HStack(spacing: AppTheme.Spacing.xxs) {
                if track.appleMusicPlayCount > 0 {
                    Text("\(track.appleMusicPlayCount)")
                        .font(AppTheme.Typography.caption2)
                        .foregroundColor(AppTheme.Colors.accentPink)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(AppTheme.Colors.accentPink.opacity(0.15))
                        .cornerRadius(4)
                }
                if track.mikData != nil {
                    Image(systemName: "waveform")
                        .font(.system(size: 10))
                        .foregroundColor(AppTheme.Colors.accentCyan)
                        .padding(4)
                        .background(AppTheme.Colors.accentCyan.opacity(0.15))
                        .cornerRadius(4)
                }
            }
        }
        .padding(.vertical, AppTheme.Spacing.xs)
        .padding(.horizontal, AppTheme.Spacing.sm)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.Radius.sm)
    }
}

// MARK: - Settings View

struct SettingsView: View {
    @EnvironmentObject var spotifyManager: SpotifyManager

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: AppTheme.Spacing.lg) {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        Label("Spotify", systemImage: "music.note.tv")
                            .font(AppTheme.Typography.headline)
                            .foregroundColor(AppTheme.Colors.textPrimary)

                        VStack(spacing: AppTheme.Spacing.sm) {
                            HStack {
                                Image(systemName: "checkmark.circle.fill").foregroundColor(AppTheme.Colors.success)
                                Text("Connected").font(AppTheme.Typography.callout).foregroundColor(AppTheme.Colors.textPrimary)
                                Spacer()
                                if let user = spotifyManager.currentUser {
                                    Text(user.displayName ?? "User").font(AppTheme.Typography.caption).foregroundColor(AppTheme.Colors.textSecondary)
                                }
                            }

                            Button {
                                Task { await spotifyManager.loadTokensFromWebApp() }
                            } label: {
                                HStack {
                                    Image(systemName: "arrow.triangle.2.circlepath")
                                    Text("Refresh Connection")
                                }
                                .font(AppTheme.Typography.callout)
                                .foregroundColor(AppTheme.Colors.gold)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .cardStyle()
                    }

                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        Label("About", systemImage: "info.circle")
                            .font(AppTheme.Typography.headline)
                            .foregroundColor(AppTheme.Colors.textPrimary)

                        VStack(spacing: AppTheme.Spacing.xs) {
                            HStack {
                                Text("Version").font(AppTheme.Typography.callout).foregroundColor(AppTheme.Colors.textSecondary)
                                Spacer()
                                Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—").font(AppTheme.Typography.callout).foregroundColor(AppTheme.Colors.textPrimary)
                            }
                            HStack {
                                Text("Build").font(AppTheme.Typography.callout).foregroundColor(AppTheme.Colors.textSecondary)
                                Spacer()
                                Text(buildDate).font(AppTheme.Typography.callout).foregroundColor(AppTheme.Colors.textPrimary)
                            }
                        }
                        .cardStyle()
                    }

                    VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                        Label("Credits", systemImage: "heart.fill")
                            .font(AppTheme.Typography.headline)
                            .foregroundColor(AppTheme.Colors.textPrimary)

                        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                            Text("Notorious DAD").font(AppTheme.Typography.callout).foregroundColor(AppTheme.Colors.textPrimary)
                            Text("Built with love for DJs everywhere.")
                                .font(AppTheme.Typography.caption)
                                .foregroundColor(AppTheme.Colors.textSecondary)
                        }
                        .cardStyle()
                    }
                }
                .padding(.horizontal, AppTheme.Spacing.md)
                .padding(.top, AppTheme.Spacing.sm)
            }
            .screenBackground()
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.large)
        }
    }

    private var buildDate: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        if let executableURL = Bundle.main.executableURL,
           let attributes = try? FileManager.default.attributesOfItem(atPath: executableURL.path),
           let modDate = attributes[.modificationDate] as? Date {
            return formatter.string(from: modDate)
        }
        return "—"
    }
}

#Preview {
    ContentView()
        .environmentObject(SpotifyManager())
        .environmentObject(LibraryManager())
        .environmentObject(NotificationManager.shared)
}
