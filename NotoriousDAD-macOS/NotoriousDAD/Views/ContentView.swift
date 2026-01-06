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
        case mix = "Audio Mix"
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
            case .mix:
                MixGeneratorView()
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
        case .mix: return "waveform.path.ecg"
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
        case .short: return 8
        case .medium: return 15
        case .long: return 30
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
