import SwiftUI
import NotoriousDADKit

struct ContentView: View {
    @EnvironmentObject var spotifyManager: SpotifyManager
    @EnvironmentObject var libraryManager: LibraryManager
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            GenerateView()
                .tabItem {
                    Label("Generate", systemImage: "wand.and.stars")
                }
                .tag(0)

            LibraryView()
                .tabItem {
                    Label("Library", systemImage: "music.note.list")
                }
                .tag(1)

            PlaylistsView()
                .tabItem {
                    Label("Playlists", systemImage: "list.bullet.rectangle")
                }
                .tag(2)

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
                .tag(3)
        }
        .accentColor(.purple)
    }
}

// MARK: - Generate View

struct GenerateView: View {
    @EnvironmentObject var spotifyManager: SpotifyManager
    @EnvironmentObject var libraryManager: LibraryManager

    // Form Fields
    @State private var includeArtists = ""
    @State private var referenceArtists = ""
    @State private var selectedMood: MoodPreset?
    @State private var trackCount = 30
    @State private var bpmMin = ""
    @State private var bpmMax = ""
    @State private var selectedEnergy: EnergyPreset = .build

    // UI State
    @State private var isGenerating = false
    @State private var generationError: String?
    @State private var generatedPlaylistURL: String?
    @State private var showingSuccess = false
    @FocusState private var focusedField: Field?

    enum Field: Hashable {
        case include, reference, bpmMin, bpmMax
    }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Status Card
                    StatusCard(
                        isSpotifyConnected: spotifyManager.isAuthenticated,
                        trackCount: libraryManager.trackCount
                    )

                    // MARK: - Artists Section
                    VStack(alignment: .leading, spacing: 16) {
                        SectionHeader(icon: "music.mic", title: "Artists")

                        // Include Artists
                        VStack(alignment: .leading, spacing: 6) {
                            Label("Include", systemImage: "checkmark.circle.fill")
                                .font(.subheadline.weight(.medium))
                                .foregroundColor(.green)
                            TextField("Fred again, Disclosure, Rufus Du Sol", text: $includeArtists)
                                .textFieldStyle(RoundedTextFieldStyle())
                                .focused($focusedField, equals: .include)
                            Text("Must appear in playlist")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }

                        // Reference Artists
                        VStack(alignment: .leading, spacing: 6) {
                            Label("Reference", systemImage: "arrow.triangle.branch")
                                .font(.subheadline.weight(.medium))
                                .foregroundColor(.blue)
                            TextField("Chemical Brothers, Fatboy Slim", text: $referenceArtists)
                                .textFieldStyle(RoundedTextFieldStyle())
                                .focused($focusedField, equals: .reference)
                            Text("Style guide (not required to appear)")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.horizontal)

                    // MARK: - Mood Section
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader(icon: "face.smiling", title: "Vibe & Mood")

                        LazyVGrid(columns: [
                            GridItem(.flexible()),
                            GridItem(.flexible()),
                            GridItem(.flexible())
                        ], spacing: 10) {
                            ForEach(MoodPreset.allCases, id: \.self) { mood in
                                MoodChip(mood: mood, isSelected: selectedMood == mood) {
                                    selectedMood = selectedMood == mood ? nil : mood
                                }
                            }
                        }
                    }
                    .padding(.horizontal)

                    // MARK: - Energy Curve Section
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader(icon: "chart.line.uptrend.xyaxis", title: "Energy Curve")

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(EnergyPreset.allCases, id: \.self) { energy in
                                    EnergyChip(energy: energy, isSelected: selectedEnergy == energy) {
                                        selectedEnergy = energy
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal)

                    // MARK: - Settings Section
                    VStack(alignment: .leading, spacing: 16) {
                        SectionHeader(icon: "slider.horizontal.3", title: "Settings")

                        // Track Count
                        HStack {
                            Text("Tracks")
                                .font(.subheadline)
                            Spacer()
                            Stepper("\(trackCount)", value: $trackCount, in: 10...100, step: 5)
                                .labelsHidden()
                            Text("\(trackCount)")
                                .font(.headline)
                                .frame(width: 40)
                        }

                        // BPM Range
                        HStack(spacing: 12) {
                            Text("BPM")
                                .font(.subheadline)
                            Spacer()
                            TextField("Min", text: $bpmMin)
                                .keyboardType(.numberPad)
                                .frame(width: 60)
                                .textFieldStyle(RoundedTextFieldStyle())
                                .focused($focusedField, equals: .bpmMin)
                            Text("-")
                            TextField("Max", text: $bpmMax)
                                .keyboardType(.numberPad)
                                .frame(width: 60)
                                .textFieldStyle(RoundedTextFieldStyle())
                                .focused($focusedField, equals: .bpmMax)
                        }
                    }
                    .padding(.horizontal)

                    // MARK: - Generate Button
                    Button(action: generatePlaylist) {
                        HStack(spacing: 12) {
                            if isGenerating {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            } else {
                                Image(systemName: "wand.and.stars")
                                    .font(.title3)
                            }
                            Text(isGenerating ? "Generating Mix..." : "Generate Mix")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(canGenerate ? Color.purple : Color.gray)
                        .foregroundColor(.white)
                        .cornerRadius(14)
                    }
                    .disabled(!canGenerate || isGenerating)
                    .padding(.horizontal)

                    // Error Message
                    if let error = generationError {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.red)
                            Text(error)
                                .font(.caption)
                                .foregroundColor(.red)
                        }
                        .padding(.horizontal)
                    }

                    // Tip
                    HStack {
                        Image(systemName: "lightbulb.fill")
                            .foregroundColor(.yellow)
                        Text("Tip: Use Include for must-have artists, Reference for style inspiration")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 20)
                }
                .padding(.top)
            }
            .navigationTitle("Notorious DAD")
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                }
            }
            .alert("Playlist Created!", isPresented: $showingSuccess) {
                if let url = generatedPlaylistURL {
                    Button("Open in Spotify") {
                        if let spotifyURL = URL(string: url.replacingOccurrences(of: "https://open.spotify.com/", with: "spotify://")) {
                            UIApplication.shared.open(spotifyURL)
                        }
                    }
                }
                Button("OK", role: .cancel) { }
            } message: {
                Text("Your mix has been created and added to your Spotify library.")
            }
        }
    }

    // MARK: - Computed Properties

    private var canGenerate: Bool {
        // Web API handles auth - just check if user entered something
        !includeArtists.isEmpty || !referenceArtists.isEmpty || selectedMood != nil
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
        focusedField = nil

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
            throw GenerationError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120 // Allow longer for AI processing

        let body: [String: Any] = ["prompt": prompt]
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
              let playlistURL = json["playlistURL"] as? String else {
            throw GenerationError.invalidResponse
        }

        return playlistURL
    }
}

// MARK: - Supporting Types

enum MoodPreset: String, CaseIterable {
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

enum EnergyPreset: String, CaseIterable {
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

// MARK: - UI Components

struct SectionHeader: View {
    let icon: String
    let title: String

    var body: some View {
        Label(title, systemImage: icon)
            .font(.headline)
            .foregroundColor(.primary)
    }
}

struct RoundedTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(12)
            .background(Color(.systemGray6))
            .cornerRadius(10)
    }
}

struct MoodChip: View {
    let mood: MoodPreset
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: mood.icon)
                    .font(.title3)
                Text(mood.rawValue)
                    .font(.caption)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(isSelected ? mood.color.opacity(0.2) : Color(.systemGray6))
            .foregroundColor(isSelected ? mood.color : .primary)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? mood.color : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct EnergyChip: View {
    let energy: EnergyPreset
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
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(isSelected ? Color.purple.opacity(0.2) : Color(.systemGray6))
            .foregroundColor(isSelected ? .purple : .primary)
            .cornerRadius(20)
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(isSelected ? Color.purple : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Generation Errors

enum GenerationError: LocalizedError {
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

// MARK: - Status Card

struct StatusCard: View {
    let isSpotifyConnected: Bool
    let trackCount: Int

    var body: some View {
        HStack(spacing: 16) {
            // Spotify Status - Always show connected (web API handles auth)
            HStack {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.green)
                Text("Spotify")
                    .font(.caption)
            }

            Divider()
                .frame(height: 20)

            // Track Count
            HStack {
                Image(systemName: "music.note")
                    .foregroundColor(.purple)
                Text("\(trackCount.formatted()) tracks")
                    .font(.caption)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
        .padding(.horizontal)
    }
}

// MARK: - Library View

struct LibraryView: View {
    @EnvironmentObject var libraryManager: LibraryManager
    @State private var searchText = ""

    var filteredTracks: [NotoriousDADKit.Track] {
        if searchText.isEmpty {
            return Array(libraryManager.tracks.prefix(100))
        }
        return libraryManager.tracks.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) ||
            $0.artists.joined(separator: ", ").localizedCaseInsensitiveContains(searchText)
        }.prefix(100).map { $0 }
    }

    var body: some View {
        NavigationView {
            List {
                Section {
                    HStack {
                        Label("\(libraryManager.mikTrackCount)", systemImage: "waveform")
                        Spacer()
                        Text("MIK Analyzed")
                            .foregroundColor(.secondary)
                    }
                    HStack {
                        Label("\(libraryManager.appleMusicTrackCount)", systemImage: "music.note")
                        Spacer()
                        Text("Apple Music")
                            .foregroundColor(.secondary)
                    }
                } header: {
                    Text("Sources")
                }

                Section {
                    ForEach(filteredTracks, id: \.id) { track in
                        TrackRow(track: track)
                    }
                } header: {
                    Text("Top Tracks")
                }
            }
            .searchable(text: $searchText, prompt: "Search tracks...")
            .navigationTitle("Library")
        }
    }
}

struct TrackRow: View {
    let track: NotoriousDADKit.Track

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(track.name)
                .font(.body)
                .lineLimit(1)

            HStack {
                Text(track.artists.joined(separator: ", "))
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)

                Spacer()

                if track.appleMusicPlayCount > 0 {
                    Text("\(track.appleMusicPlayCount) plays")
                        .font(.caption2)
                        .foregroundColor(.purple)
                }

                if track.mikData != nil {
                    Image(systemName: "waveform")
                        .font(.caption2)
                        .foregroundColor(.blue)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Playlists View

struct PlaylistsView: View {
    var body: some View {
        NavigationView {
            VStack {
                Image(systemName: "list.bullet.rectangle")
                    .font(.system(size: 60))
                    .foregroundColor(.gray)
                Text("No Playlists Yet")
                    .font(.title2)
                    .foregroundColor(.secondary)
                Text("Generate your first mix!")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .navigationTitle("Playlists")
        }
    }
}

// MARK: - Settings View

struct SettingsView: View {
    @EnvironmentObject var spotifyManager: SpotifyManager

    // Build timestamp - updates each compile
    private var buildDateString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        // __DATE__ and __TIME__ aren't available in Swift, so use bundle info
        if let executableURL = Bundle.main.executableURL,
           let attributes = try? FileManager.default.attributesOfItem(atPath: executableURL.path),
           let modDate = attributes[.modificationDate] as? Date {
            return formatter.string(from: modDate)
        }
        return "Unknown"
    }

    var body: some View {
        NavigationView {
            List {
                Section("Spotify") {
                    if spotifyManager.isAuthenticated {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("Connected")
                            Spacer()
                            if let user = spotifyManager.currentUser {
                                Text(user.displayName ?? "User")
                                    .foregroundColor(.secondary)
                            }
                        }

                        Button("Disconnect") {
                            spotifyManager.logout()
                        }
                        .foregroundColor(.red)
                    } else {
                        // Primary: Sync from web app (workaround for OAuth issues)
                        Button(action: {
                            Task {
                                await spotifyManager.loadTokensFromWebApp()
                            }
                        }) {
                            HStack {
                                if spotifyManager.isLoading {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle())
                                } else {
                                    Image(systemName: "arrow.triangle.2.circlepath")
                                }
                                Text("Sync from Web App")
                            }
                        }
                        .disabled(spotifyManager.isLoading)

                        // Fallback: Direct OAuth (may not work due to redirect issues)
                        Button(action: { spotifyManager.authorize() }) {
                            HStack {
                                Image(systemName: "link")
                                Text("Connect Directly")
                            }
                        }
                        .foregroundColor(.secondary)

                        if let error = spotifyManager.error {
                            Text(error)
                                .font(.caption)
                                .foregroundColor(.red)
                        }
                    }
                }

                Section("About") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0.0")
                            .foregroundColor(.secondary)
                    }
                    HStack {
                        Text("Build")
                        Spacer()
                        Text(buildDateString)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(SpotifyManager())
        .environmentObject(LibraryManager())
}
