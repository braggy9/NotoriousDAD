import SwiftUI
import NotoriousDADKit

// Use the same type alias as LibraryManager for consistency
typealias DADPlaylist = NotoriousDADKit.Playlist

struct ContentView: View {
    @EnvironmentObject var spotifyManager: SpotifyManager
    @EnvironmentObject var libraryManager: LibraryManager
    @State private var selectedTab: Tab = .generate
    @State private var showingNewPlaylist = false

    enum Tab: String, CaseIterable {
        case generate = "Generate"
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
                        .foregroundStyle(.purple)
                    Text("Notorious DAD")
                        .font(.headline)
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
                            .foregroundStyle(.green)
                    } else {
                        Button("Connect Spotify") {
                            spotifyManager.authorize()
                        }
                        .buttonStyle(.borderedProminent)
                    }

                    Text("\(libraryManager.trackCount) tracks loaded")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding()
            }
            .frame(minWidth: 200)
        } detail: {
            // Main content
            switch selectedTab {
            case .generate:
                GenerateView(showingNewPlaylist: $showingNewPlaylist)
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
    }

    private func iconForTab(_ tab: Tab) -> String {
        switch tab {
        case .generate: return "wand.and.stars"
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

    // UI State
    @State private var isGenerating = false
    @State private var generationError: String?
    @State private var generatedPlaylistURL: String?
    @State private var showingSuccess = false

    var body: some View {
        HSplitView {
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
                .padding(24)
            }
            .frame(minWidth: 400, idealWidth: 500)

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
            .frame(minWidth: 300)
        }
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
    }

    private func callGeneratePlaylistAPI(prompt: String) async throws -> String {
        guard let url = URL(string: "https://dj-mix-generator.vercel.app/api/generate-playlist") else {
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

// MARK: - Placeholder Views

struct LibraryView: View {
    @EnvironmentObject var libraryManager: LibraryManager

    var body: some View {
        VStack {
            Text("Library")
                .font(.largeTitle.bold())
            Text("\(libraryManager.trackCount) tracks")
                .foregroundStyle(.secondary)

            // Would show track list, import options, etc.
            ContentUnavailableView(
                "Library View",
                systemImage: "music.note.list",
                description: Text("Track browsing and MIK import coming soon")
            )
        }
        .padding()
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
        }
        .padding()
        .frame(width: 400, height: 300)
    }
}

#Preview {
    ContentView()
        .environmentObject(SpotifyManager())
        .environmentObject(LibraryManager())
}
