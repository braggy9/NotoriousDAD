import SwiftUI
import UIKit
import NotoriousDADKit

// MARK: - Redesigned Mix Generator View
// Audio mix generation with clean dark theme

struct MixGeneratorViewRedesign: View {
    @EnvironmentObject var libraryManager: LibraryManager
    @EnvironmentObject var notificationManager: NotificationManager
    @StateObject private var serverDiscovery = ServerDiscovery()

    // Form state
    @State private var mixPrompt = ""
    @State private var selectedStyle: MixStyle?
    @State private var selectedDuration: MixDuration = .medium
    @State private var playlistURL = "" // Optional Spotify playlist for track selection

    // UI state
    @State private var isGenerating = false
    @State private var progress = ""
    @State private var progressPercentage: Double = 0.0
    @State private var error: String?
    @State private var result: MixResult?
    @State private var showSettings = false

    @FocusState private var isPromptFocused: Bool

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: AppTheme.Spacing.lg) {

                    // Header with server status
                    headerSection

                    // Style presets
                    styleSection

                    // Custom prompt
                    promptSection

                    // Optional: Spotify playlist input
                    playlistSection

                    // Duration picker
                    durationSection

                    // Generate button
                    generateButton

                    // Progress/Error
                    statusSection

                    // Result card
                    if let mix = result {
                        MixResultCardRedesign(mix: mix, serverAddress: serverDiscovery.serverAddress)
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
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gear")
                            .foregroundColor(AppTheme.Colors.gold)
                    }
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { isPromptFocused = false }
                        .foregroundColor(AppTheme.Colors.gold)
                }
            }
            .sheet(isPresented: $showSettings) {
                ServerSettingsSheet(discovery: serverDiscovery)
            }
            .onAppear {
                if !serverDiscovery.isConnected && !serverDiscovery.isSearching {
                    Task { await serverDiscovery.autoDiscover() }
                }
            }
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: AppTheme.Spacing.sm) {
            HStack {
                VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                    Text("Audio Mix")
                        .font(AppTheme.Typography.largeTitle)
                        .foregroundColor(AppTheme.Colors.textPrimary)

                    Text("Generate seamless DJ mixes from your library")
                        .font(AppTheme.Typography.subheadline)
                        .foregroundColor(AppTheme.Colors.textSecondary)
                }
                Spacer()
            }

            // Server status
            ServerStatusPill(discovery: serverDiscovery)
        }
    }

    // MARK: - Style Section

    private var styleSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Label("Quick Presets", systemImage: "sparkles")
                .font(AppTheme.Typography.headline)
                .foregroundColor(AppTheme.Colors.textPrimary)

            LazyVGrid(columns: [
                GridItem(.flexible(), spacing: AppTheme.Spacing.sm),
                GridItem(.flexible(), spacing: AppTheme.Spacing.sm),
                GridItem(.flexible(), spacing: AppTheme.Spacing.sm)
            ], spacing: AppTheme.Spacing.sm) {
                ForEach(MixStyle.allCases, id: \.self) { style in
                    StyleCard(
                        style: style,
                        isSelected: selectedStyle == style,
                        action: {
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
                    )
                }
            }
        }
    }

    // MARK: - Prompt Section

    private var promptSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Label("Describe Your Mix", systemImage: "text.bubble")
                .font(AppTheme.Typography.headline)
                .foregroundColor(AppTheme.Colors.textPrimary)

            ThemedTextField(
                placeholder: "e.g., upbeat house for a beach party, 120-128 BPM",
                text: $mixPrompt,
                axis: .vertical
            )
            .focused($isPromptFocused)
            .lineLimit(2...4)

            Text("Include mood, genres, BPM range, or occasion")
                .font(AppTheme.Typography.caption2)
                .foregroundColor(AppTheme.Colors.textTertiary)
        }
        .cardStyle()
    }

    // MARK: - Playlist Section

    @ViewBuilder
    private var playlistSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
            Label("From Spotify Playlist (Optional)", systemImage: "music.note.list")
                .font(AppTheme.Typography.headline)
                .foregroundColor(AppTheme.Colors.textPrimary)

            ThemedTextField(
                placeholder: "Paste Spotify playlist URL...",
                text: $playlistURL
            )
            .focused($isPromptFocused)
            .autocapitalization(.none)

            Text("Generate mix from tracks in this playlist")
                .font(AppTheme.Typography.caption2)
                .foregroundColor(AppTheme.Colors.textTertiary)
        }
        .cardStyle()
    }

    // MARK: - Duration Section

    private var durationSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Label("Mix Length", systemImage: "clock")
                .font(AppTheme.Typography.headline)
                .foregroundColor(AppTheme.Colors.textPrimary)

            HStack(spacing: AppTheme.Spacing.sm) {
                ForEach(MixDuration.allCases, id: \.self) { duration in
                    DurationButton(
                        duration: duration,
                        isSelected: selectedDuration == duration,
                        action: {
                            withAnimation(AppTheme.Animation.quick) {
                                selectedDuration = duration
                            }
                        }
                    )
                }
            }
        }
        .cardStyle()
    }

    // MARK: - Generate Button

    private var generateButton: some View {
        Button(action: generateMix) {
            HStack(spacing: AppTheme.Spacing.sm) {
                if isGenerating {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.background))
                        .scaleEffect(0.9)
                } else {
                    Image(systemName: "waveform.path.ecg")
                        .font(.system(size: 18, weight: .semibold))
                }

                Text(isGenerating ? "Generating..." : "Generate Audio Mix")
            }
        }
        .buttonStyle(PrimaryButtonStyle(isDisabled: !canGenerate || isGenerating))
        .disabled(!canGenerate || isGenerating)
    }

    // MARK: - Status Section

    @ViewBuilder
    private var statusSection: some View {
        if isGenerating && !progress.isEmpty {
            VStack(spacing: AppTheme.Spacing.xs) {
                // Progress bar
                VStack(spacing: 4) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(AppTheme.Colors.surfaceHighlight)
                                .frame(height: 6)

                            Capsule()
                                .fill(AppTheme.Colors.gold)
                                .frame(width: geo.size.width * progressPercentage, height: 6)
                        }
                    }
                    .frame(height: 6)

                    HStack {
                        Text(progress)
                            .font(AppTheme.Typography.footnote)
                            .foregroundColor(AppTheme.Colors.textSecondary)
                        Spacer()
                        Text("\(Int(progressPercentage * 100))%")
                            .font(AppTheme.Typography.footnote)
                            .foregroundColor(AppTheme.Colors.gold)
                            .fontWeight(.semibold)
                    }
                }
            }
            .cardStyle()
        }

        if let errorMsg = error {
            HStack(spacing: AppTheme.Spacing.sm) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(AppTheme.Colors.error)
                Text(errorMsg)
                    .font(AppTheme.Typography.footnote)
                    .foregroundColor(AppTheme.Colors.error)
                Spacer()
                Button {
                    withAnimation { error = nil }
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
    }

    // MARK: - Computed

    private var canGenerate: Bool {
        !mixPrompt.isEmpty && serverDiscovery.isConnected
    }

    // MARK: - Actions

    private func generateMix() {
        isGenerating = true
        error = nil
        progress = "Starting..."
        progressPercentage = 0.0
        isPromptFocused = false

        Task {
            // Request background execution time so mix generation continues when app is backgrounded
            var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid
            backgroundTaskID = await UIApplication.shared.beginBackgroundTask(withName: "MixGeneration") {
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
                    notificationManager.notifyMixComplete(
                        mixName: mixResult.filename,
                        trackCount: mixResult.trackCount
                    )
                }
            } catch {
                // Log full error details for debugging
                print("❌ Mix Generation Error:")
                print("  Type: \(type(of: error))")
                print("  Description: \(error)")
                print("  Localized: \(error.localizedDescription)")
                if let mixError = error as? MixError {
                    print("  MixError Details: \(mixError)")
                }

                await MainActor.run {
                    isGenerating = false
                    // Show full error details to user
                    let errorMsg = "Error: \(error.localizedDescription)"
                    self.error = errorMsg
                    progress = ""
                    notificationManager.notifyMixFailed(error: error.localizedDescription)
                }
            }
        }
    }

    private func callMixAPI() async throws -> MixResult {
        let baseUrl: String
        if serverDiscovery.serverAddress == "mixmaster.mixtape.run" {
            baseUrl = "https://\(serverDiscovery.serverAddress)"
        } else {
            baseUrl = "http://\(serverDiscovery.serverAddress):3000"
        }

        print("🎵 Starting mix generation...")
        print("  Server: \(baseUrl)")
        print("  Prompt: \(mixPrompt)")
        print("  Track Count: \(selectedDuration.trackCount)")
        if !playlistURL.isEmpty {
            print("  Playlist URL: \(playlistURL)")
        }

        guard let startUrl = URL(string: "\(baseUrl)/api/generate-mix") else {
            print("❌ Invalid URL: \(baseUrl)/api/generate-mix")
            throw MixError.invalidURL
        }

        // Create URLSession with extended timeout for initial request
        // Server may be slow to respond if FFmpeg is already running
        let initialConfig = URLSessionConfiguration.default
        initialConfig.timeoutIntervalForRequest = 300 // 5 minutes for initial response
        initialConfig.timeoutIntervalForResource = 1200 // 20 minutes total
        let initialSession = URLSession(configuration: initialConfig)

        var request = URLRequest(url: startUrl)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [
            "prompt": mixPrompt,
            "trackCount": selectedDuration.trackCount
        ]
        // Include playlist URL and refresh_token if provided
        if !playlistURL.isEmpty {
            body["playlistURL"] = playlistURL

            // Load Spotify refresh token for playlist authentication
            if let refreshToken = loadSpotifyRefreshToken() {
                body["refresh_token"] = refreshToken
                print("  🔑 Including refresh_token for Spotify playlist access")
            } else {
                print("  ⚠️ No refresh_token found - playlist may fail to load")
            }
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        print("📤 Sending POST request to /api/generate-mix...")
        let (startData, startResponse) = try await initialSession.data(for: request)
        print("📥 Received response from /api/generate-mix")

        guard let httpResponse = startResponse as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            if let errorJson = try? JSONSerialization.jsonObject(with: startData) as? [String: Any],
               let errorMessage = errorJson["error"] as? String {
                throw MixError.apiError(errorMessage)
            }
            throw MixError.apiError("Failed to start")
        }

        guard let startJson = try? JSONSerialization.jsonObject(with: startData) as? [String: Any],
              let jobId = startJson["jobId"] as? String else {
            print("❌ Failed to parse jobId from response")
            if let responseStr = String(data: startData, encoding: .utf8) {
                print("  Response: \(responseStr)")
            }
            throw MixError.invalidResponse
        }

        print("✅ Got jobId: \(jobId)")
        print("🔄 Starting status polling...")

        // Poll for status (faster polling, longer timeout for new duration fix)
        await MainActor.run { progress = "Selecting tracks..." }

        let statusUrl = URL(string: "\(baseUrl)/api/mix-status/\(jobId)")!
        var pollCount = 0
        let maxPolls = 400 // 400 polls × 3 sec = 20 minutes max (handles 2-hour mixes)

        // Create URLSession with very long timeout for status polling
        // Server can be slow to respond (30+ sec) while FFmpeg is running
        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = 300 // 5 minutes per status check
        sessionConfig.timeoutIntervalForResource = 1200 // 20 minutes total
        let statusSession = URLSession(configuration: sessionConfig)

        while pollCount < maxPolls {
            try await Task.sleep(nanoseconds: 10_000_000_000) // Poll every 10 seconds (server is slow during FFmpeg)
            pollCount += 1

            let (statusData, _) = try await statusSession.data(from: statusUrl)

            guard let statusJson = try? JSONSerialization.jsonObject(with: statusData) as? [String: Any],
                  let status = statusJson["status"] as? String else {
                print("⚠️ Poll \(pollCount): Failed to parse status JSON")
                continue
            }

            print("📊 Poll \(pollCount): Status = \(status)")

            // Update progress message and percentage
            if let msg = statusJson["progressMessage"] as? String {
                await MainActor.run { progress = msg }
            }
            if let prog = statusJson["progress"] as? Int {
                await MainActor.run { progressPercentage = Double(prog) / 100.0 }
            }

            if status == "complete" {
                print("✅ Mix generation complete!")
                guard let resultData = statusJson["result"] as? [String: Any] else {
                    print("❌ Failed to parse result data")
                    throw MixError.invalidResponse
                }

                let tracklist = resultData["tracklist"] as? [[String: Any]] ?? []
                print("  Tracks: \(tracklist.count)")
                print("  Mix URL: \(resultData["mixUrl"] as? String ?? "unknown")")

                return MixResult(
                    filename: resultData["mixName"] as? String ?? "Mix",
                    downloadUrl: resultData["mixUrl"] as? String ?? "",
                    duration: formatDuration(resultData["duration"] as? Double ?? 0),
                    trackCount: tracklist.count,
                    tracks: tracklist.compactMap { track in
                        MixTrack(
                            title: track["title"] as? String ?? "",
                            artist: track["artist"] as? String ?? "",
                            bpm: track["bpm"] as? Double ?? 0,
                            key: track["key"] as? String ?? ""
                        )
                    }
                )
            } else if status == "failed" {
                let errorMsg = statusJson["error"] as? String ?? "Unknown error"
                print("❌ Mix generation failed: \(errorMsg)")
                throw MixError.apiError(errorMsg)
            }
        }

        print("⏱️ Timeout after \(maxPolls) polls (20 minutes)")
        throw MixError.apiError("Timeout - mix took too long to generate")
    }

    private func formatDuration(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    /// Load Spotify refresh token from bundled spotify-tokens.json
    private func loadSpotifyRefreshToken() -> String? {
        guard let url = Bundle.main.url(forResource: "spotify-tokens", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let refreshToken = json["refresh_token"] as? String else {
            print("❌ Failed to load Spotify refresh token from spotify-tokens.json")
            return nil
        }
        return refreshToken
    }
}

// MARK: - Supporting Types

struct MixResult {
    let filename: String
    let downloadUrl: String
    let duration: String
    let trackCount: Int
    let tracks: [MixTrack]
}

struct MixTrack {
    let title: String
    let artist: String
    let bpm: Double
    let key: String
}

enum MixStyle: String, CaseIterable {
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
        case .beach: return "Upbeat house and disco for a summer beach party, 118-126 BPM"
        case .workout: return "High energy workout mix with driving beats, 128-140 BPM"
        case .dinner: return "Chill deep house and nu-disco for a dinner party"
        case .lateNight: return "Dark melodic techno for late night, 122-130 BPM"
        case .focus: return "Ambient electronica for deep focus, 80-110 BPM"
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
        // ~3.5 min per track with crossfade overlap
        case .short: return 12   // ~30-35 min
        case .medium: return 20  // ~55-65 min
        case .long: return 40    // ~2 hours
        }
    }
}

// MARK: - Components

struct StyleCard: View {
    let style: MixStyle
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
            .background(
                RoundedRectangle(cornerRadius: AppTheme.Radius.md)
                    .fill(isSelected ? style.color.opacity(0.15) : AppTheme.Colors.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.Radius.md)
                    .stroke(isSelected ? style.color : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct DurationButton: View {
    let duration: MixDuration
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(duration.rawValue)
                .font(AppTheme.Typography.callout)
                .foregroundColor(isSelected ? AppTheme.Colors.background : AppTheme.Colors.textSecondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, AppTheme.Spacing.sm)
                .background(
                    RoundedRectangle(cornerRadius: AppTheme.Radius.md)
                        .fill(isSelected ? AppTheme.Colors.gold : AppTheme.Colors.surfaceHighlight)
                )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct ServerStatusPill: View {
    @ObservedObject var discovery: ServerDiscovery

    var body: some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            if discovery.isSearching {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.gold))
                    .scaleEffect(0.6)
                Text("Connecting...")
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(AppTheme.Colors.textSecondary)
            } else if discovery.isConnected {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 10))
                    .foregroundColor(AppTheme.Colors.success)
                Text("Server Connected")
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(AppTheme.Colors.success)
            } else {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 10))
                    .foregroundColor(AppTheme.Colors.warning)
                Text("Not Connected")
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(AppTheme.Colors.warning)
            }
        }
        .padding(.horizontal, AppTheme.Spacing.sm)
        .padding(.vertical, AppTheme.Spacing.xxs)
        .background(
            Capsule()
                .fill(discovery.isConnected ? AppTheme.Colors.success.opacity(0.15) : AppTheme.Colors.warning.opacity(0.15))
        )
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct MixResultCardRedesign: View {
    let mix: MixResult
    let serverAddress: String

    @StateObject private var player = AudioPlayerManager()
    @State private var showShare = false
    @State private var shareURL: URL?
    @State private var showFullTracklist = false

    var body: some View {
        VStack(spacing: AppTheme.Spacing.md) {
            // Header
            HStack {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 28))
                    .foregroundColor(AppTheme.Colors.success)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Mix Ready!")
                        .font(AppTheme.Typography.headline)
                        .foregroundColor(AppTheme.Colors.textPrimary)
                    Text("\(mix.trackCount) tracks • \(mix.duration)")
                        .font(AppTheme.Typography.caption)
                        .foregroundColor(AppTheme.Colors.textSecondary)
                }
                Spacer()
            }

            Divider().background(AppTheme.Colors.surfaceHighlight)

            // Player
            VStack(spacing: AppTheme.Spacing.sm) {
                HStack {
                    Image(systemName: "waveform")
                        .foregroundColor(AppTheme.Colors.gold)
                    Text(mix.filename)
                        .font(AppTheme.Typography.callout)
                        .foregroundColor(AppTheme.Colors.textPrimary)
                        .lineLimit(1)
                    Spacer()
                }

                // Progress bar
                if player.duration > 0 {
                    VStack(spacing: 4) {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule()
                                    .fill(AppTheme.Colors.surfaceHighlight)
                                    .frame(height: 4)

                                Capsule()
                                    .fill(AppTheme.Colors.gold)
                                    .frame(width: geo.size.width * CGFloat(player.currentTime / player.duration), height: 4)
                            }
                            .gesture(
                                DragGesture(minimumDistance: 0)
                                    .onChanged { value in
                                        let pos = min(max(0, value.location.x / geo.size.width), 1)
                                        player.seek(to: pos)
                                    }
                            )
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

                // Play/Save buttons
                HStack(spacing: AppTheme.Spacing.sm) {
                    Button {
                        if player.isPlaying || player.duration > 0 {
                            player.togglePlayPause()
                        } else {
                            streamMix()
                        }
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

                    Button {
                        saveMix()
                    } label: {
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
                    HStack {
                        ProgressView().scaleEffect(0.7)
                        Text("Loading...")
                            .font(AppTheme.Typography.caption)
                            .foregroundColor(AppTheme.Colors.textSecondary)
                    }
                }

                if let error = player.error, !error.isEmpty {
                    HStack {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(AppTheme.Colors.error)
                        Text(error)
                            .font(AppTheme.Typography.caption)
                            .foregroundColor(AppTheme.Colors.error)
                            .lineLimit(3)
                    }
                    .padding(AppTheme.Spacing.xs)
                    .background(AppTheme.Colors.error.opacity(0.15))
                    .cornerRadius(AppTheme.Radius.sm)
                }
            }
            .padding(AppTheme.Spacing.sm)
            .background(AppTheme.Colors.surfaceHighlight.opacity(0.5))
            .cornerRadius(AppTheme.Radius.md)

            // Track list preview
            VStack(spacing: AppTheme.Spacing.xs) {
                ForEach(Array(mix.tracks.prefix(3).enumerated()), id: \.offset) { idx, track in
                    HStack {
                        Text("\(idx + 1)")
                            .font(AppTheme.Typography.caption)
                            .foregroundColor(AppTheme.Colors.textTertiary)
                            .frame(width: 16)

                        VStack(alignment: .leading, spacing: 1) {
                            Text(track.title)
                                .font(AppTheme.Typography.footnote)
                                .foregroundColor(AppTheme.Colors.textPrimary)
                                .lineLimit(1)
                            Text(track.artist)
                                .font(AppTheme.Typography.caption2)
                                .foregroundColor(AppTheme.Colors.textSecondary)
                                .lineLimit(1)
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
                    Button {
                        showFullTracklist = true
                    } label: {
                        HStack(spacing: AppTheme.Spacing.xxs) {
                            Text("+ \(mix.tracks.count - 3) more tracks")
                                .font(AppTheme.Typography.caption)
                                .foregroundColor(AppTheme.Colors.gold)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(AppTheme.Colors.gold)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
        }
        .cardStyle(elevated: true)
        .sheet(isPresented: $showShare) {
            if let url = shareURL {
                ShareSheet(items: [url])
            }
        }
        .sheet(isPresented: $showFullTracklist) {
            FullTracklistSheet(mix: mix)
        }
    }

    private func getMixURL() -> URL? {
        let urlString: String
        if serverAddress == "mixmaster.mixtape.run" {
            urlString = "https://\(serverAddress)\(mix.downloadUrl)"
        } else {
            urlString = "http://\(serverAddress):3000\(mix.downloadUrl)"
        }
        print("🔗 MixResultCard: Constructed URL: \(urlString)")
        return URL(string: urlString)
    }

    private func streamMix() {
        guard let url = getMixURL() else {
            print("❌ MixResultCard: Failed to construct URL for streaming")
            return
        }
        print("▶️ MixResultCard: Starting stream from: \(url.absoluteString)")
        player.streamAudio(from: url)
    }

    private func saveMix() {
        print("🚀 MixResultCard: saveMix() called - button tap registered!")
        print("📋 MixResultCard: mix.downloadUrl = \(mix.downloadUrl)")
        print("🌐 MixResultCard: serverAddress = \(serverAddress)")

        guard let url = getMixURL() else {
            print("❌ MixResultCard: Failed to construct URL for download")
            player.error = "Invalid download URL"
            return
        }
        print("💾 MixResultCard: Starting download from: \(url.absoluteString)")
        player.downloadAudio(from: url) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let fileURL):
                    print("✅ MixResultCard: Download succeeded, showing share sheet for: \(fileURL.path)")
                    shareURL = fileURL
                    showShare = true
                case .failure(let error):
                    print("❌ MixResultCard: Download failed: \(error.localizedDescription)")
                    player.error = error.localizedDescription
                }
            }
        }
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        return String(format: "%d:%02d", m, s)
    }
}

struct ServerSettingsSheet: View {
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
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(AppTheme.Colors.success)
                            Text(discovery.serverAddress)
                        } else {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(AppTheme.Colors.error)
                            Text("Not Connected")
                        }
                    }
                } header: {
                    Text("Status")
                }

                Section {
                    TextField("Server Address", text: $tempAddress)
                        .autocapitalization(.none)

                    Button {
                        testConnection()
                    } label: {
                        HStack {
                            if testing {
                                ProgressView().scaleEffect(0.8)
                                Text("Testing...")
                            } else {
                                Image(systemName: "wifi")
                                Text("Test Connection")
                            }
                        }
                    }
                    .disabled(tempAddress.isEmpty || testing)

                    if let result = testResult {
                        Text(result)
                            .font(.caption)
                            .foregroundColor(result.contains("Success") ? .green : .red)
                    }
                } header: {
                    Text("Manual Configuration")
                }

                Section {
                    Button {
                        Task { await discovery.autoDiscover() }
                    } label: {
                        HStack {
                            if discovery.isSearching {
                                ProgressView().scaleEffect(0.8)
                                Text("Searching...")
                            } else {
                                Image(systemName: "magnifyingglass")
                                Text("Auto-Discover")
                            }
                        }
                    }
                    .disabled(discovery.isSearching)
                } header: {
                    Text("Automatic")
                }
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

    private func testConnection() {
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
    }
}

// MARK: - Full Tracklist Sheet

struct FullTracklistSheet: View {
    @Environment(\.dismiss) var dismiss
    let mix: MixResult

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: AppTheme.Spacing.sm) {
                    ForEach(Array(mix.tracks.enumerated()), id: \.offset) { idx, track in
                        HStack(alignment: .top, spacing: AppTheme.Spacing.sm) {
                            // Track number
                            Text("\(idx + 1)")
                                .font(AppTheme.Typography.callout)
                                .foregroundColor(AppTheme.Colors.textTertiary)
                                .fontWeight(.semibold)
                                .frame(width: 24, alignment: .trailing)

                            // Track info
                            VStack(alignment: .leading, spacing: 2) {
                                Text(track.title)
                                    .font(AppTheme.Typography.body)
                                    .foregroundColor(AppTheme.Colors.textPrimary)
                                    .lineLimit(2)
                                Text(track.artist)
                                    .font(AppTheme.Typography.footnote)
                                    .foregroundColor(AppTheme.Colors.textSecondary)
                                    .lineLimit(1)
                            }

                            Spacer()

                            // BPM and Key
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("\(Int(track.bpm)) BPM")
                                    .font(AppTheme.Typography.caption2)
                                    .foregroundColor(AppTheme.Colors.textTertiary)
                                Text(track.key)
                                    .font(AppTheme.Typography.caption2)
                                    .foregroundColor(AppTheme.Colors.gold)
                                    .fontWeight(.semibold)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(AppTheme.Colors.gold.opacity(0.15))
                                    .cornerRadius(4)
                            }
                        }
                        .padding(AppTheme.Spacing.sm)
                        .background(AppTheme.Colors.surface)
                        .cornerRadius(AppTheme.Radius.md)
                    }
                }
                .padding(AppTheme.Spacing.md)
            }
            .screenBackground()
            .navigationTitle("Tracklist")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(AppTheme.Colors.gold)
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    MixGeneratorViewRedesign()
        .environmentObject(LibraryManager())
        .environmentObject(NotificationManager())
}
