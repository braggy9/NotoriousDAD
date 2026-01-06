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

            MixGeneratorView()
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
    @State private var advancedNotes = "" // Free-text for advanced NLP options

    // UI State
    @State private var isGenerating = false
    @State private var generationError: String?
    @State private var generatedPlaylistURL: String?
    @State private var showingSuccess = false
    @FocusState private var focusedField: Field?

    enum Field: Hashable {
        case include, reference, bpmMin, bpmMax, notes
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

                    // MARK: - Advanced Notes Section
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader(icon: "text.bubble", title: "Notes (Optional)")

                        TextField("e.g. 90s house, deep cuts, exclude Drake", text: $advancedNotes, axis: .vertical)
                            .textFieldStyle(RoundedTextFieldStyle())
                            .lineLimit(2...4)
                            .focused($focusedField, equals: .notes)

                        Text("Add extra instructions: era, exclude artists, deep cuts vs hits")
                            .font(.caption2)
                            .foregroundColor(.secondary)
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
        advancedNotes = ""
    }

    private func callGeneratePlaylistAPI(prompt: String) async throws -> String {
        // Use cloud server with HTTPS
        guard let url = URL(string: "https://mixmaster.mixtape.run/api/generate-playlist") else {
            throw GenerationError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120 // Allow longer for AI processing

        // Include refresh token for server-side auth (bypasses cookie-based auth)
        let body: [String: Any] = [
            "prompt": prompt,
            "refresh_token": "AQB1rhlNzigZavJoEM52V7ANmglze5E8i6KffPV7UcE05TAfNReaIkcu3frWseCSsiKMBIhOXMn9YINoG1ao_syFAelvnQQPKHsXvxJk12lrmfW7yqoBNUWJhsLE_sxprBo"
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

// MARK: - Server Discovery Manager

class ServerDiscovery: ObservableObject {
    @Published var isConnected = false
    @Published var isSearching = false
    @Published var serverAddress: String = ""
    @Published var connectionError: String?

    // Cloud server first, then local network fallbacks
    private let commonAddresses = [
        "mixmaster.mixtape.run", // Cloud server with HTTPS (primary)
        "192.168.86.20",   // Your current local network
        "192.168.1.1",
        "192.168.0.1",
        "10.0.0.1",
        "172.16.0.1",
    ]

    init() {
        // Load saved address
        if let saved = UserDefaults.standard.string(forKey: "mixServerAddress"), !saved.isEmpty {
            serverAddress = saved
        }
    }

    func saveAddress(_ address: String) {
        serverAddress = address
        UserDefaults.standard.set(address, forKey: "mixServerAddress")
    }

    @MainActor
    func autoDiscover() async {
        isSearching = true
        connectionError = nil

        // First try saved address
        if !serverAddress.isEmpty {
            if await testConnection(serverAddress) {
                isConnected = true
                isSearching = false
                return
            }
        }

        // Try to discover by scanning common addresses
        for baseAddress in commonAddresses {
            // Try the base
            if await testConnection(baseAddress) {
                saveAddress(baseAddress)
                isConnected = true
                isSearching = false
                return
            }

            // Try common host IPs on this subnet (x.x.x.2-50)
            let subnet = baseAddress.components(separatedBy: ".").dropLast().joined(separator: ".")
            for lastOctet in [2, 10, 20, 50, 100, 150, 200] {
                let ip = "\(subnet).\(lastOctet)"
                if await testConnection(ip) {
                    saveAddress(ip)
                    isConnected = true
                    isSearching = false
                    return
                }
            }
        }

        isSearching = false
        connectionError = "Server not found. Tap to configure manually."
    }

    func testConnection(_ address: String) async -> Bool {
        // Use HTTPS for cloud domain, HTTP with port 3000 for local IPs
        let urlString: String
        if address == "mixmaster.mixtape.run" {
            urlString = "https://\(address)/api/discover"
        } else {
            urlString = "http://\(address):3000/api/discover"
        }
        guard let url = URL(string: urlString) else { return false }

        var request = URLRequest(url: url)
        request.timeoutInterval = 2 // Fast timeout for discovery

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else { return false }

            // Verify it's our server
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

// MARK: - Mix Generator View

struct MixGeneratorView: View {
    @EnvironmentObject var libraryManager: LibraryManager
    @EnvironmentObject var notificationManager: NotificationManager
    @StateObject private var serverDiscovery = ServerDiscovery()

    // Form Fields
    @State private var mixPrompt = ""
    @State private var selectedDuration: MixDurationPreset = .short
    @State private var selectedStyle: MixStylePreset?

    // UI State
    @State private var isGenerating = false
    @State private var generationProgress = ""
    @State private var generationError: String?
    @State private var generatedMix: GeneratedMixResult?
    @State private var showingSettings = false
    @FocusState private var isPromptFocused: Bool

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Server Status with Auto-Discovery
                    ServerStatusCardAuto(
                        discovery: serverDiscovery,
                        showingSettings: $showingSettings
                    )

                    // MARK: - Prompt Input
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader(icon: "text.bubble", title: "Describe Your Mix")

                        TextField("e.g., upbeat house mix for a beach party", text: $mixPrompt, axis: .vertical)
                            .textFieldStyle(RoundedTextFieldStyle())
                            .lineLimit(2...4)
                            .focused($isPromptFocused)

                        Text("Include mood, artists, BPM range, or occasion")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal)

                    // MARK: - Style Presets
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader(icon: "square.grid.2x2", title: "Quick Presets")

                        LazyVGrid(columns: [
                            GridItem(.flexible()),
                            GridItem(.flexible()),
                            GridItem(.flexible())
                        ], spacing: 10) {
                            ForEach(MixStylePreset.allCases, id: \.self) { style in
                                MixStyleChip(style: style, isSelected: selectedStyle == style) {
                                    selectedStyle = selectedStyle == style ? nil : style
                                    if selectedStyle != nil {
                                        mixPrompt = style.prompt
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal)

                    // MARK: - Duration Selection
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeader(icon: "clock", title: "Mix Length")

                        HStack(spacing: 10) {
                            ForEach(MixDurationPreset.allCases, id: \.self) { duration in
                                MixDurationChip(duration: duration, isSelected: selectedDuration == duration) {
                                    selectedDuration = duration
                                }
                            }
                        }
                    }
                    .padding(.horizontal)

                    // MARK: - Generate Button
                    Button(action: generateMix) {
                        HStack(spacing: 12) {
                            if isGenerating {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            } else {
                                Image(systemName: "waveform.path.ecg")
                                    .font(.title3)
                            }
                            Text(isGenerating ? "Generating..." : "Generate Audio Mix")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(mixPrompt.isEmpty ? Color.gray : Color.purple)
                        .foregroundColor(.white)
                        .cornerRadius(14)
                    }
                    .disabled(mixPrompt.isEmpty || isGenerating)
                    .padding(.horizontal)

                    // Progress Message
                    if isGenerating && !generationProgress.isEmpty {
                        HStack {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle())
                            Text(generationProgress)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .padding(.horizontal)
                    }

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

                    // Generated Mix Result
                    if let mix = generatedMix {
                        MixResultCard(mix: mix, serverAddress: serverDiscovery.serverAddress)
                    }

                    // MARK: - Info Card
                    VStack(alignment: .leading, spacing: 8) {
                        Label("How it works", systemImage: "info.circle.fill")
                            .font(.subheadline.bold())
                            .foregroundColor(.blue)

                        VStack(alignment: .leading, spacing: 4) {
                            Text("1. AI selects tracks from your library")
                            Text("2. Analyzes beat & key for transitions")
                            Text("3. Creates seamless crossfades")
                            Text("4. Exports a ready-to-play audio file")
                        }
                        .font(.caption)
                        .foregroundColor(.secondary)
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(12)
                    .padding(.horizontal)
                    .padding(.bottom, 20)
                }
                .padding(.top)
            }
            .navigationTitle("Audio Mix")
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { isPromptFocused = false }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gear")
                    }
                }
            }
            .sheet(isPresented: $showingSettings) {
                MixServerSettingsAuto(discovery: serverDiscovery)
            }
        }
    }

    // MARK: - Actions

    private func generateMix() {
        isGenerating = true
        generationError = nil
        generationProgress = "Selecting tracks..."
        isPromptFocused = false

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

    private func callGenerateMixAPI(prompt: String, trackCount: Int) async throws -> GeneratedMixResult {
        // Use HTTPS for cloud domain, HTTP with port 3000 for local
        let baseUrl: String
        if serverDiscovery.serverAddress == "mixmaster.mixtape.run" {
            baseUrl = "https://\(serverDiscovery.serverAddress)"
        } else {
            baseUrl = "http://\(serverDiscovery.serverAddress):3000"
        }

        // Step 1: Start the job
        guard let startUrl = URL(string: "\(baseUrl)/api/generate-mix") else {
            throw MixError.invalidURL
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
                throw MixError.apiError(errorMessage)
            }
            throw MixError.apiError("Failed to start mix generation")
        }

        guard let startJson = try? JSONSerialization.jsonObject(with: startData) as? [String: Any],
              let jobId = startJson["jobId"] as? String else {
            throw MixError.invalidResponse
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
                    throw MixError.invalidResponse
                }

                let mixName = result["mixName"] as? String ?? "Mix"
                let mixUrl = result["mixUrl"] as? String ?? ""
                let tracklist = result["tracklist"] as? [[String: Any]] ?? []
                let duration = result["duration"] as? Double ?? 0

                return GeneratedMixResult(
                    filename: mixName,
                    downloadUrl: mixUrl,
                    duration: formatDuration(duration),
                    trackCount: tracklist.count,
                    tracks: tracklist.compactMap { track in
                        MixTrackItem(
                            title: track["title"] as? String ?? "",
                            artist: track["artist"] as? String ?? "",
                            bpm: track["bpm"] as? Double ?? 0,
                            key: track["key"] as? String ?? ""
                        )
                    }
                )
            } else if status == "failed" {
                let errorMessage = statusJson["error"] as? String ?? "Mix generation failed"
                throw MixError.apiError(errorMessage)
            }
            // Continue polling for pending/processing status
        }

        throw MixError.apiError("Mix generation timed out")
    }

    private func formatDuration(_ seconds: Double) -> String {
        let minutes = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", minutes, secs)
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
        case .dinner: return "Chill deep house and nu-disco for a dinner party"
        case .lateNight: return "Dark melodic techno for late night, 122-130 BPM"
        case .focus: return "Ambient electronica for deep focus, 80-110 BPM"
        case .roadTrip: return "Feel-good indie dance and electropop for a road trip"
        }
    }
}

enum MixDurationPreset: String, CaseIterable {
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

enum MixError: LocalizedError {
    case invalidURL
    case invalidResponse
    case apiError(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Can't connect to server"
        case .invalidResponse: return "Invalid response"
        case .apiError(let message): return message
        }
    }
}

// MARK: - Mix UI Components

struct ServerStatusCard: View {
    let serverAddress: String
    @Binding var showingSettings: Bool

    var body: some View {
        HStack {
            Image(systemName: "server.rack")
                .foregroundColor(.purple)
            Text("Server: \(serverAddress)")
                .font(.caption)
            Spacer()
            Button {
                showingSettings = true
            } label: {
                Text("Change")
                    .font(.caption)
                    .foregroundColor(.purple)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
        .padding(.horizontal)
    }
}

// MARK: - Server Status Card with Auto-Discovery

struct ServerStatusCardAuto: View {
    @ObservedObject var discovery: ServerDiscovery
    @Binding var showingSettings: Bool

    var body: some View {
        HStack {
            // Status Icon
            if discovery.isSearching {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle())
                    .scaleEffect(0.8)
            } else if discovery.isConnected {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.green)
            } else {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.orange)
            }

            // Status Text
            VStack(alignment: .leading, spacing: 2) {
                if discovery.isSearching {
                    Text("Searching for server...")
                        .font(.caption)
                        .foregroundColor(.secondary)
                } else if discovery.isConnected {
                    Text("Connected")
                        .font(.caption.bold())
                        .foregroundColor(.green)
                    Text(discovery.serverAddress)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                } else if let error = discovery.connectionError {
                    Text("Not Connected")
                        .font(.caption.bold())
                        .foregroundColor(.orange)
                    Text(error)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                } else {
                    Text("Tap to connect")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            // Action Buttons
            if !discovery.isSearching {
                if !discovery.isConnected {
                    Button {
                        Task {
                            await discovery.autoDiscover()
                        }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.caption)
                            .foregroundColor(.purple)
                    }
                    .padding(.trailing, 8)
                }

                Button {
                    showingSettings = true
                } label: {
                    Image(systemName: "gear")
                        .font(.caption)
                        .foregroundColor(.purple)
                }
            }
        }
        .padding()
        .background(discovery.isConnected ? Color.green.opacity(0.1) : Color(.systemGray6))
        .cornerRadius(12)
        .padding(.horizontal)
        .onAppear {
            // Auto-discover on first appearance
            if !discovery.isConnected && !discovery.isSearching {
                Task {
                    await discovery.autoDiscover()
                }
            }
        }
    }
}

struct MixStyleChip: View {
    let style: MixStylePreset
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: style.icon)
                    .font(.title3)
                Text(style.rawValue)
                    .font(.caption2)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(isSelected ? style.color.opacity(0.2) : Color(.systemGray6))
            .foregroundColor(isSelected ? style.color : .primary)
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isSelected ? style.color : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct MixDurationChip: View {
    let duration: MixDurationPreset
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: "clock")
                    .font(.caption)
                Text(duration.rawValue)
                    .font(.caption)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(isSelected ? Color.purple.opacity(0.2) : Color(.systemGray6))
            .foregroundColor(isSelected ? .purple : .primary)
            .cornerRadius(16)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(isSelected ? Color.purple : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct MixResultCard: View {
    let mix: GeneratedMixResult
    let serverAddress: String

    @StateObject private var player = AudioPlayerManager()
    @State private var showShareSheet = false
    @State private var shareFileURL: URL?

    var body: some View {
        VStack(spacing: 16) {
            // Success Header
            HStack {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title)
                    .foregroundColor(.green)
                VStack(alignment: .leading) {
                    Text("Mix Generated!")
                        .font(.headline)
                    Text("\(mix.trackCount) tracks • \(mix.duration)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
            }

            Divider()

            // Audio Player Controls
            VStack(spacing: 12) {
                // Waveform icon + filename
                HStack {
                    Image(systemName: "waveform")
                        .foregroundColor(.purple)
                    Text(mix.filename)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .lineLimit(1)
                    Spacer()
                }

                // Playback progress bar
                if player.duration > 0 {
                    VStack(spacing: 4) {
                        GeometryReader { geometry in
                            ZStack(alignment: .leading) {
                                // Background track
                                Rectangle()
                                    .fill(Color(.systemGray5))
                                    .frame(height: 4)

                                // Progress
                                Rectangle()
                                    .fill(Color.purple)
                                    .frame(width: geometry.size.width * CGFloat(player.currentTime / player.duration), height: 4)
                            }
                            .cornerRadius(2)
                            .gesture(
                                DragGesture(minimumDistance: 0)
                                    .onChanged { value in
                                        let position = min(max(0, value.location.x / geometry.size.width), 1)
                                        player.seek(to: position)
                                    }
                            )
                        }
                        .frame(height: 4)

                        // Time labels
                        HStack {
                            Text(formatTime(player.currentTime))
                                .font(.caption2)
                                .foregroundColor(.secondary)
                            Spacer()
                            Text(formatTime(player.duration))
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                // Play/Pause button
                HStack(spacing: 16) {
                    Button {
                        if player.isPlaying || player.duration > 0 {
                            player.togglePlayPause()
                        } else {
                            startStreaming()
                        }
                    } label: {
                        HStack {
                            Image(systemName: player.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                                .font(.title2)
                            Text(player.isPlaying ? "Pause" : (player.duration > 0 ? "Play" : "Stream Mix"))
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.purple)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .disabled(player.isLoading)

                    // Save to Music button
                    Button {
                        saveToMusic()
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: "square.and.arrow.down")
                                .font(.title3)
                            Text("Save")
                                .font(.caption2)
                        }
                        .frame(width: 70)
                        .padding(.vertical, 8)
                        .background(Color.green)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                }

                // Loading/download indicator
                if player.isLoading {
                    HStack {
                        ProgressView()
                            .scaleEffect(0.8)
                        Text("Loading...")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                if player.downloadProgress > 0 && player.downloadProgress < 1 {
                    HStack {
                        ProgressView(value: player.downloadProgress)
                        Text("\(Int(player.downloadProgress * 100))%")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }

                if let error = player.error {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                }
            }
            .padding()
            .background(Color(.systemGray6).opacity(0.5))
            .cornerRadius(10)

            Divider()

            // Track List (first 5)
            ForEach(Array(mix.tracks.prefix(5).enumerated()), id: \.offset) { index, track in
                HStack {
                    Text("\(index + 1)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .frame(width: 20)
                    VStack(alignment: .leading) {
                        Text(track.title)
                            .font(.caption)
                            .lineLimit(1)
                        Text(track.artist)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                    Spacer()
                    Text(track.key)
                        .font(.caption2)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(Color.purple.opacity(0.2))
                        .cornerRadius(4)
                }
            }

            if mix.tracks.count > 5 {
                Text("+ \(mix.tracks.count - 5) more tracks")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
        .padding(.horizontal)
        .sheet(isPresented: $showShareSheet) {
            if let url = shareFileURL {
                ShareSheet(items: [url])
            }
        }
    }

    // MARK: - Helper Methods

    private func getMixURL() -> URL? {
        let urlString: String
        if serverAddress == "mixmaster.mixtape.run" {
            urlString = "https://\(serverAddress)\(mix.downloadUrl)"
        } else {
            urlString = "http://\(serverAddress):3000\(mix.downloadUrl)"
        }
        return URL(string: urlString)
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
                    shareFileURL = fileURL
                    showShareSheet = true
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

// MARK: - Share Sheet (UIActivityViewController wrapper)

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
        return controller
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

struct MixServerSettings: View {
    @Environment(\.dismiss) var dismiss
    @Binding var serverAddress: String
    @State private var tempAddress: String = ""

    var body: some View {
        NavigationView {
            Form {
                Section {
                    TextField("Server IP Address", text: $tempAddress)
                        .keyboardType(.decimalPad)
                } header: {
                    Text("Server Address")
                } footer: {
                    Text("Enter your Mac's local IP address (e.g., 192.168.1.100). The dev server must be running on your Mac.")
                }

                Section {
                    Text("1. Run 'npm run dev' on your Mac")
                    Text("2. Find your Mac's IP in System Settings > Network")
                    Text("3. Make sure both devices are on the same WiFi")
                }
                header: {
                    Text("Setup Instructions")
                }
            }
            .navigationTitle("Server Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        serverAddress = tempAddress
                        dismiss()
                    }
                }
            }
            .onAppear {
                tempAddress = serverAddress
            }
        }
    }
}

// MARK: - Server Settings with Auto-Discovery

struct MixServerSettingsAuto: View {
    @Environment(\.dismiss) var dismiss
    @ObservedObject var discovery: ServerDiscovery
    @State private var tempAddress: String = ""
    @State private var isTestingConnection = false
    @State private var testResult: String?

    var body: some View {
        NavigationView {
            Form {
                // Current Status
                Section {
                    HStack {
                        if discovery.isConnected {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("Connected to \(discovery.serverAddress)")
                        } else {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.red)
                            Text("Not Connected")
                        }
                    }
                } header: {
                    Text("Connection Status")
                }

                // Manual Address Entry
                Section {
                    TextField("Server IP Address", text: $tempAddress)
                        .keyboardType(.decimalPad)
                        .autocapitalization(.none)

                    Button {
                        testConnection()
                    } label: {
                        HStack {
                            if isTestingConnection {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle())
                                Text("Testing...")
                            } else {
                                Image(systemName: "wifi")
                                Text("Test Connection")
                            }
                        }
                    }
                    .disabled(tempAddress.isEmpty || isTestingConnection)

                    if let result = testResult {
                        Text(result)
                            .font(.caption)
                            .foregroundColor(result.contains("Success") ? .green : .red)
                    }
                } header: {
                    Text("Manual Configuration")
                } footer: {
                    Text("Enter your Mac's IP address (e.g., 192.168.86.20)")
                }

                // Auto-Discovery
                Section {
                    Button {
                        Task {
                            await discovery.autoDiscover()
                        }
                    } label: {
                        HStack {
                            if discovery.isSearching {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle())
                                Text("Searching...")
                            } else {
                                Image(systemName: "magnifyingglass.circle")
                                Text("Auto-Discover Server")
                            }
                        }
                    }
                    .disabled(discovery.isSearching)
                } header: {
                    Text("Automatic Discovery")
                } footer: {
                    Text("Scans your local network for the NotoriousDAD server")
                }

                // Setup Instructions
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Run 'npm run dev' on your Mac", systemImage: "1.circle.fill")
                        Label("Both devices on same WiFi", systemImage: "2.circle.fill")
                        Label("Check Mac IP in System Settings → Network", systemImage: "3.circle.fill")
                    }
                    .font(.caption)
                } header: {
                    Text("Setup Instructions")
                }
            }
            .navigationTitle("Server Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .onAppear {
                tempAddress = discovery.serverAddress
            }
        }
    }

    private func testConnection() {
        isTestingConnection = true
        testResult = nil

        Task {
            let success = await discovery.testConnection(tempAddress)
            await MainActor.run {
                isTestingConnection = false
                if success {
                    testResult = "Success! Server found."
                    discovery.saveAddress(tempAddress)
                    discovery.isConnected = true
                } else {
                    testResult = "Failed. Check address and server."
                }
            }
        }
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
                        Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "Unknown")
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
