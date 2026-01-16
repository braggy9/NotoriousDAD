import SwiftUI
import UIKit
import NotoriousDADKit

// MARK: - All-in-One View File
// This file combines all redesign views to avoid Xcode project complexity

// MARK: - App Theme (Electric Gold Design System)

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
        static let accentGreen = Color(red: 0.4, green: 0.9, blue: 0.5)
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
    
    struct Shadow {
        static let subtle = SwiftUI.Color.black.opacity(0.15)
        static let medium = SwiftUI.Color.black.opacity(0.25)
        static let strong = SwiftUI.Color.black.opacity(0.4)
    }
    
    struct Animation {
        static let quick = SwiftUI.Animation.easeOut(duration: 0.15)
        static let standard = SwiftUI.Animation.easeInOut(duration: 0.25)
        static let smooth = SwiftUI.Animation.easeInOut(duration: 0.35)
        static let spring = SwiftUI.Animation.spring(response: 0.35, dampingFraction: 0.7)
    }
}

// MARK: - View Modifiers

struct GoldGradient: ViewModifier {
    func body(content: Content) -> some View {
        content.foregroundStyle(
            LinearGradient(colors: [AppTheme.Colors.gold, AppTheme.Colors.goldDeep], startPoint: .topLeading, endPoint: .bottomTrailing)
        )
    }
}

struct CardStyle: ViewModifier {
    var isElevated: Bool = false
    func body(content: Content) -> some View {
        content
            .padding(AppTheme.Spacing.md)
            .background(isElevated ? AppTheme.Colors.surfaceElevated : AppTheme.Colors.surface)
            .cornerRadius(AppTheme.Radius.lg)
    }
}

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
                        LinearGradient(colors: [AppTheme.Colors.gold, AppTheme.Colors.goldDeep], startPoint: .topLeading, endPoint: .bottomTrailing)
                    }
                }
            )
            .cornerRadius(AppTheme.Radius.md)
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(AppTheme.Animation.quick, value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppTheme.Typography.callout)
            .foregroundColor(AppTheme.Colors.gold)
            .padding(.horizontal, AppTheme.Spacing.md)
            .padding(.vertical, AppTheme.Spacing.sm)
            .background(AppTheme.Colors.gold.opacity(0.15))
            .cornerRadius(AppTheme.Radius.md)
            .overlay(RoundedRectangle(cornerRadius: AppTheme.Radius.md).stroke(AppTheme.Colors.gold.opacity(0.3), lineWidth: 1))
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(AppTheme.Animation.quick, value: configuration.isPressed)
    }
}

extension View {
    func goldGradient() -> some View {
        modifier(GoldGradient())
    }
    func cardStyle(elevated: Bool = false) -> some View {
        modifier(CardStyle(isElevated: elevated))
    }
    func screenBackground() -> some View {
        self.background(AppTheme.Colors.background.ignoresSafeArea())
    }
}


// MARK: - Mix Generator View Redesign

// MARK: - Redesigned Mix Generator View
// Audio mix generation with clean dark theme


// MARK: - Generate View Redesign

// MARK: - Redesigned Generate View
// Clean, stepped flow with large touch targets and dark theme

struct GenerateViewRedesign: View {
    @EnvironmentObject var spotifyManager: SpotifyManager
    @EnvironmentObject var libraryManager: LibraryManager

    // Form state
    @State private var includeArtists = ""
    @State private var referenceArtists = ""
    @State private var selectedVibe: VibeOption?
    @State private var selectedEnergy: EnergyOption = .build
    @State private var trackCount: Double = 30
    @State private var notes = ""

    // UI state
    @State private var isGenerating = false
    @State private var generationError: String?
    @State private var showSuccess = false
    @State private var generatedPlaylistURL: String?

    @FocusState private var focusedField: FormField?

    enum FormField {
        case include, reference, notes
    }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: AppTheme.Spacing.lg) {

                    // MARK: - Header
                    headerSection

                    // MARK: - Vibe Selection (Large Cards)
                    vibeSection

                    // MARK: - Artists Input
                    artistsSection

                    // MARK: - Energy & Duration
                    settingsSection

                    // MARK: - Notes (Collapsed by default)
                    notesSection

                    // MARK: - Generate Button
                    generateButton

                    // Error display
                    if let error = generationError {
                        errorBanner(error)
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
                    Button("Open in Spotify") {
                        openSpotify(url: url)
                    }
                }
                Button("Done", role: .cancel) {}
            } message: {
                Text("Your playlist has been added to Spotify.")
            }
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(spacing: AppTheme.Spacing.xs) {
            Text("Generate Playlist")
                .font(AppTheme.Typography.largeTitle)
                .foregroundColor(AppTheme.Colors.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: AppTheme.Spacing.sm) {
                statusPill(
                    icon: "checkmark.circle.fill",
                    text: "Connected",
                    color: AppTheme.Colors.success
                )

                statusPill(
                    icon: "music.note",
                    text: "\(libraryManager.trackCount.formatted()) tracks",
                    color: AppTheme.Colors.gold
                )
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func statusPill(icon: String, text: String, color: Color) -> some View {
        HStack(spacing: AppTheme.Spacing.xxs) {
            Image(systemName: icon)
                .font(.system(size: 10))
            Text(text)
                .font(AppTheme.Typography.caption)
        }
        .foregroundColor(color)
        .padding(.horizontal, AppTheme.Spacing.xs)
        .padding(.vertical, AppTheme.Spacing.xxs)
        .background(color.opacity(0.15))
        .cornerRadius(AppTheme.Radius.full)
    }

    // MARK: - Vibe Section

    private var vibeSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            sectionHeader(icon: "sparkles", title: "Pick a Vibe")

            LazyVGrid(columns: [
                GridItem(.flexible(), spacing: AppTheme.Spacing.sm),
                GridItem(.flexible(), spacing: AppTheme.Spacing.sm)
            ], spacing: AppTheme.Spacing.sm) {
                ForEach(VibeOption.allCases, id: \.self) { vibe in
                    VibeCard(
                        vibe: vibe,
                        isSelected: selectedVibe == vibe,
                        action: {
                            withAnimation(AppTheme.Animation.spring) {
                                selectedVibe = selectedVibe == vibe ? nil : vibe
                            }
                        }
                    )
                }
            }
        }
    }

    // MARK: - Artists Section

    private var artistsSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            sectionHeader(icon: "music.mic", title: "Artists")

            // Include artists
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                Label("Must Include", systemImage: "checkmark.circle.fill")
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(AppTheme.Colors.success)

                ThemedTextField(
                    placeholder: "Fred again, Disclosure...",
                    text: $includeArtists
                )
                .focused($focusedField, equals: .include)
            }

            // Reference artists
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                Label("Style Reference", systemImage: "waveform")
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(AppTheme.Colors.textSecondary)

                ThemedTextField(
                    placeholder: "Chemical Brothers, Fatboy Slim...",
                    text: $referenceArtists
                )
                .focused($focusedField, equals: .reference)

                Text("Influences the vibe but won't necessarily appear")
                    .font(AppTheme.Typography.caption2)
                    .foregroundColor(AppTheme.Colors.textTertiary)
            }
        }
        .cardStyle()
    }

    // MARK: - Settings Section

    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            // Energy curve
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                sectionHeader(icon: "chart.line.uptrend.xyaxis", title: "Energy Flow")

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: AppTheme.Spacing.xs) {
                        ForEach(EnergyOption.allCases, id: \.self) { energy in
                            EnergyPill(
                                energy: energy,
                                isSelected: selectedEnergy == energy,
                                action: {
                                    withAnimation(AppTheme.Animation.quick) {
                                        selectedEnergy = energy
                                    }
                                }
                            )
                        }
                    }
                }
            }

            Divider()
                .background(AppTheme.Colors.surfaceHighlight)

            // Track count slider
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                HStack {
                    Text("Tracks")
                        .font(AppTheme.Typography.callout)
                        .foregroundColor(AppTheme.Colors.textPrimary)
                    Spacer()
                    Text("\(Int(trackCount))")
                        .font(AppTheme.Typography.headline)
                        .foregroundColor(AppTheme.Colors.gold)
                }

                Slider(value: $trackCount, in: 10...60, step: 5)
                    .tint(AppTheme.Colors.gold)

                HStack {
                    Text("~\(Int(trackCount) * 3) min")
                        .font(AppTheme.Typography.caption)
                        .foregroundColor(AppTheme.Colors.textTertiary)
                    Spacer()
                }
            }
        }
        .cardStyle()
    }

    // MARK: - Notes Section

    private var notesSection: some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                ThemedTextField(
                    placeholder: "e.g., 90s house, deep cuts only, exclude Drake...",
                    text: $notes,
                    axis: .vertical
                )
                .focused($focusedField, equals: .notes)
                .lineLimit(2...4)

                Text("Add any extra preferences or exclusions")
                    .font(AppTheme.Typography.caption2)
                    .foregroundColor(AppTheme.Colors.textTertiary)
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

    // MARK: - Generate Button

    private var generateButton: some View {
        Button(action: generate) {
            HStack(spacing: AppTheme.Spacing.sm) {
                if isGenerating {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: AppTheme.Colors.background))
                        .scaleEffect(0.9)
                } else {
                    Image(systemName: "wand.and.stars")
                        .font(.system(size: 18, weight: .semibold))
                }

                Text(isGenerating ? "Creating Mix..." : "Generate Mix")
            }
        }
        .buttonStyle(PrimaryButtonStyle(isDisabled: !canGenerate || isGenerating))
        .disabled(!canGenerate || isGenerating)
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(AppTheme.Colors.error)
            Text(message)
                .font(AppTheme.Typography.footnote)
                .foregroundColor(AppTheme.Colors.error)
            Spacer()
            Button {
                withAnimation { generationError = nil }
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

    // MARK: - Helpers

    private func sectionHeader(icon: String, title: String) -> some View {
        Label(title, systemImage: icon)
            .font(AppTheme.Typography.headline)
            .foregroundColor(AppTheme.Colors.textPrimary)
    }

    private var canGenerate: Bool {
        !includeArtists.isEmpty || !referenceArtists.isEmpty || selectedVibe != nil
    }

    private var generatedPrompt: String {
        var parts: [String] = []

        if !includeArtists.isEmpty {
            parts.append("Include: \(includeArtists)")
        }
        if !referenceArtists.isEmpty {
            parts.append("Reference: \(referenceArtists)")
        }
        if let vibe = selectedVibe {
            parts.append("Mood: \(vibe.rawValue)")
        }

        parts.append("\(Int(trackCount)) tracks")
        parts.append("Energy: \(selectedEnergy.rawValue)")

        if !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append(notes.trimmingCharacters(in: .whitespacesAndNewlines))
        }

        return parts.joined(separator: ". ")
    }

    // MARK: - Actions

    private func generate() {
        isGenerating = true
        generationError = nil
        focusedField = nil

        Task {
            do {
                let url = try await callGenerateAPI(prompt: generatedPrompt)
                await MainActor.run {
                    isGenerating = false
                    generatedPlaylistURL = url
                    showSuccess = true
                    resetForm()
                }
            } catch {
                await MainActor.run {
                    isGenerating = false
                    generationError = error.localizedDescription
                }
            }
        }
    }

    private func resetForm() {
        includeArtists = ""
        referenceArtists = ""
        selectedVibe = nil
        notes = ""
    }

    private func openSpotify(url: String) {
        if let spotifyURL = URL(string: url.replacingOccurrences(of: "https://open.spotify.com/", with: "spotify://")) {
            UIApplication.shared.open(spotifyURL)
        }
    }

    private func callGenerateAPI(prompt: String) async throws -> String {
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

        return playlistURL
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
    case peak = "Peak Energy"
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

// MARK: - Custom Components

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

struct EnergyPill: View {
    let energy: EnergyOption
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: AppTheme.Spacing.xxs) {
                Image(systemName: energy.icon)
                    .font(.system(size: 12, weight: .medium))
                Text(energy.rawValue)
                    .font(AppTheme.Typography.caption)
            }
            .foregroundColor(isSelected ? AppTheme.Colors.background : AppTheme.Colors.textSecondary)
            .padding(.horizontal, AppTheme.Spacing.sm)
            .padding(.vertical, AppTheme.Spacing.xs)
            .background(
                Capsule()
                    .fill(isSelected ? AppTheme.Colors.gold : AppTheme.Colors.surfaceHighlight)
            )
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

// MARK: - Preview

#Preview {
    GenerateViewRedesign()
        .environmentObject(SpotifyManager())
        .environmentObject(LibraryManager())
}

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
                    Text("Mix")
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

                Text(isGenerating ? "Generating..." : "Generate Mix")
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
                await MainActor.run {
                    isGenerating = false
                    self.error = error.localizedDescription
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

        guard let startUrl = URL(string: "\(baseUrl)/api/generate-mix") else {
            throw MixError.invalidURL
        }

        var request = URLRequest(url: startUrl)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 300 // 5 minutes for mix generation

        var body: [String: Any] = [
            "prompt": mixPrompt,
            "trackCount": selectedDuration.trackCount
        ]
        // Include playlist URL if provided
        if !playlistURL.isEmpty {
            body["playlistURL"] = playlistURL
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (startData, startResponse) = try await URLSession.shared.data(for: request)

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
            throw MixError.invalidResponse
        }

        // Poll for status (faster polling, longer timeout for new duration fix)
        await MainActor.run { progress = "Selecting tracks..." }

        let statusUrl = URL(string: "\(baseUrl)/api/mix-status/\(jobId)")!
        var pollCount = 0
        let maxPolls = 400 // 400 polls × 3 sec = 20 minutes max (handles 2-hour mixes)

        while pollCount < maxPolls {
            try await Task.sleep(nanoseconds: 3_000_000_000) // Poll every 3 seconds (was 5)
            pollCount += 1

            let (statusData, _) = try await URLSession.shared.data(from: statusUrl)

            guard let statusJson = try? JSONSerialization.jsonObject(with: statusData) as? [String: Any],
                  let status = statusJson["status"] as? String else {
                continue
            }

            // Update progress message and percentage
            if let msg = statusJson["progressMessage"] as? String {
                await MainActor.run { progress = msg }
            }
            if let prog = statusJson["progress"] as? Int {
                await MainActor.run { progressPercentage = Double(prog) / 100.0 }
            }

            if status == "complete" {
                guard let resultData = statusJson["result"] as? [String: Any] else {
                    throw MixError.invalidResponse
                }

                let tracklist = resultData["tracklist"] as? [[String: Any]] ?? []

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
                throw MixError.apiError(statusJson["error"] as? String ?? "Failed")
            }
        }

        throw MixError.apiError("Timeout")
    }

    private func formatDuration(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
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
                case .success(let fileURL):
                    shareURL = fileURL
                    showShare = true
                case .failure(let error):
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
        .environmentObject(NotificationManager.shared)
}

// MARK: - Generation Errors

enum GenerationError: LocalizedError {
    case invalidURL
    case invalidResponse
    case apiError(String)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid API endpoint"
        case .invalidResponse: return "Invalid server response"
        case .apiError(let msg): return msg
        }
    }
}

enum MixError: LocalizedError {
    case invalidURL
    case invalidResponse
    case apiError(String)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid server URL"
        case .invalidResponse: return "Invalid server response"
        case .apiError(let msg): return msg
        }
    }
}

// MARK: - ShareSheet

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Server Discovery

// MARK: - Mashup Finder View

struct MashupFinderViewRedesign: View {
    @StateObject private var mashupManager = MashupManager.shared
    @EnvironmentObject var libraryManager: LibraryManager
    @State private var selectedMode: MashupMode = .browse
    @State private var searchQuery = ""
    @State private var minCompatibility = 75
    @State private var searchedTrackId: String?

    enum MashupMode {
        case browse  // Browse top mashup pairs
        case search  // Search for partner for specific track
    }

    var body: some View {
        NavigationView {
            ZStack {
                AppTheme.Colors.background.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: AppTheme.Spacing.lg) {
                        // Header
                        VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                            Text("Mashup Finder")
                                .font(AppTheme.Typography.largeTitle)
                                .foregroundColor(AppTheme.Colors.textPrimary)
                                .modifier(GoldGradient())

                            Text("Find compatible track pairs for simultaneous playback")
                                .font(AppTheme.Typography.subheadline)
                                .foregroundColor(AppTheme.Colors.textSecondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, AppTheme.Spacing.md)
                        .padding(.top, AppTheme.Spacing.md)

                        // Mode Selector
                        Picker("Mode", selection: $selectedMode) {
                            Text("Browse Top Pairs").tag(MashupMode.browse)
                            Text("Find Partner").tag(MashupMode.search)
                        }
                        .pickerStyle(SegmentedPickerStyle())
                        .padding(.horizontal, AppTheme.Spacing.md)

                        if selectedMode == .browse {
                            browseModeView
                        } else {
                            searchModeView
                        }
                    }
                    .padding(.bottom, AppTheme.Spacing.xl)
                }
            }
            .navigationBarHidden(true)
        }
    }

    // MARK: - Browse Mode (Top Mashup Pairs)

    private var browseModeView: some View {
        VStack(spacing: AppTheme.Spacing.md) {
            // Compatibility Filter
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                HStack {
                    Text("Min Compatibility")
                        .font(AppTheme.Typography.callout)
                        .foregroundColor(AppTheme.Colors.textSecondary)
                    Spacer()
                    Text("\(minCompatibility)%")
                        .font(AppTheme.Typography.headline)
                        .foregroundColor(AppTheme.Colors.gold)
                }

                Slider(value: Binding(
                    get: { Double(minCompatibility) },
                    set: { minCompatibility = Int($0) }
                ), in: 70...95, step: 5)
                    .tint(AppTheme.Colors.gold)
            }
            .modifier(CardStyle())
            .padding(.horizontal, AppTheme.Spacing.md)

            // Load Button
            Button(action: {
                Task {
                    await mashupManager.findMashupPairs(minScore: minCompatibility)
                }
            }) {
                HStack {
                    if mashupManager.isLoading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    } else {
                        Image(systemName: "waveform.path.ecg")
                    }
                    Text(mashupManager.isLoading ? "Analyzing..." : "Find Mashups")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle(isDisabled: mashupManager.isLoading))
            .disabled(mashupManager.isLoading)
            .padding(.horizontal, AppTheme.Spacing.md)

            // Summary Stats
            if let summary = mashupManager.summary {
                summaryStatsView(summary: summary)
            }

            // Results
            if !mashupManager.mashupPairs.isEmpty {
                mashupPairsListView
            }

            // Error Message
            if let error = mashupManager.errorMessage {
                Text(error)
                    .font(AppTheme.Typography.callout)
                    .foregroundColor(AppTheme.Colors.error)
                    .modifier(CardStyle())
                    .padding(.horizontal, AppTheme.Spacing.md)
            }
        }
    }

    // MARK: - Search Mode (Find Partner)

    private var searchModeView: some View {
        VStack(spacing: AppTheme.Spacing.md) {
            // Track Search
            VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
                Text("Search for a track")
                    .font(AppTheme.Typography.callout)
                    .foregroundColor(AppTheme.Colors.textSecondary)

                TextField("Track name or artist", text: $searchQuery)
                    .padding()
                    .background(AppTheme.Colors.surfaceElevated)
                    .cornerRadius(AppTheme.Radius.md)
                    .foregroundColor(AppTheme.Colors.textPrimary)
            }
            .modifier(CardStyle())
            .padding(.horizontal, AppTheme.Spacing.md)

            // Filtered Track Results
            if !searchQuery.isEmpty {
                filteredTracksView
            }

            // Best Partner Result
            if let partner = mashupManager.bestPartner {
                bestPartnerView(partner: partner)
            }

            // Error Message
            if let error = mashupManager.errorMessage {
                Text(error)
                    .font(AppTheme.Typography.callout)
                    .foregroundColor(AppTheme.Colors.error)
                    .modifier(CardStyle())
                    .padding(.horizontal, AppTheme.Spacing.md)
            }
        }
    }

    // MARK: - Summary Stats

    private func summaryStatsView(summary: MashupSummary) -> some View {
        HStack(spacing: AppTheme.Spacing.sm) {
            if let easy = summary.easyPairs {
                statPill(label: "Easy", value: "\(easy)", color: AppTheme.Colors.success)
            }
            if let medium = summary.mediumPairs {
                statPill(label: "Medium", value: "\(medium)", color: AppTheme.Colors.warning)
            }
            if let hard = summary.hardPairs {
                statPill(label: "Hard", value: "\(hard)", color: AppTheme.Colors.error)
            }
        }
        .padding(.horizontal, AppTheme.Spacing.md)
    }

    private func statPill(label: String, value: String, color: Color) -> some View {
        VStack(spacing: AppTheme.Spacing.xxs) {
            Text(value)
                .font(AppTheme.Typography.title2)
                .fontWeight(.bold)
                .foregroundColor(color)
            Text(label)
                .font(AppTheme.Typography.caption)
                .foregroundColor(AppTheme.Colors.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, AppTheme.Spacing.sm)
        .background(AppTheme.Colors.surface)
        .cornerRadius(AppTheme.Radius.md)
    }

    // MARK: - Mashup Pairs List

    private var mashupPairsListView: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Text("Top Mashup Opportunities")
                .font(AppTheme.Typography.headline)
                .foregroundColor(AppTheme.Colors.textPrimary)
                .padding(.horizontal, AppTheme.Spacing.md)

            ForEach(mashupManager.mashupPairs.prefix(20)) { pair in
                mashupPairCard(pair: pair)
            }
        }
    }

    private func mashupPairCard(pair: MashupPair) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            // Compatibility Score
            HStack {
                Text("\(Int(pair.compatibility.overallScore))%")
                    .font(AppTheme.Typography.title2)
                    .fontWeight(.bold)
                    .foregroundColor(difficultyColor(pair.compatibility.difficulty))

                Text(pair.compatibility.difficulty.uppercased())
                    .font(AppTheme.Typography.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(difficultyColor(pair.compatibility.difficulty))
                    .padding(.horizontal, AppTheme.Spacing.xs)
                    .padding(.vertical, AppTheme.Spacing.xxs)
                    .background(difficultyColor(pair.compatibility.difficulty).opacity(0.2))
                    .cornerRadius(AppTheme.Radius.sm)

                Spacer()

                // Key Badge
                Text(pair.track1.camelotKey)
                    .font(AppTheme.Typography.caption)
                    .fontWeight(.bold)
                    .foregroundColor(AppTheme.Colors.accentCyan)
                    .padding(.horizontal, AppTheme.Spacing.xs)
                    .padding(.vertical, AppTheme.Spacing.xxs)
                    .background(AppTheme.Colors.accentCyan.opacity(0.2))
                    .cornerRadius(AppTheme.Radius.sm)
            }

            // Track 1
            trackRow(track: pair.track1, icon: "1.circle.fill")

            // Mix Icon
            HStack {
                Spacer()
                Image(systemName: "waveform.path.badge.plus")
                    .foregroundColor(AppTheme.Colors.gold)
                    .font(.system(size: 14))
                Spacer()
            }

            // Track 2
            trackRow(track: pair.track2, icon: "2.circle.fill")

            // Mixing Notes (Collapsed by default, expand on tap)
            if !pair.mixingNotes.isEmpty {
                DisclosureGroup("Mixing Notes") {
                    VStack(alignment: .leading, spacing: AppTheme.Spacing.xxs) {
                        ForEach(pair.mixingNotes, id: \.self) { note in
                            HStack(alignment: .top, spacing: AppTheme.Spacing.xs) {
                                Text("•")
                                    .foregroundColor(AppTheme.Colors.gold)
                                Text(note)
                                    .font(AppTheme.Typography.caption)
                                    .foregroundColor(AppTheme.Colors.textSecondary)
                            }
                        }
                    }
                    .padding(.top, AppTheme.Spacing.xs)
                }
                .font(AppTheme.Typography.callout)
                .foregroundColor(AppTheme.Colors.textSecondary)
                .tint(AppTheme.Colors.gold)
            }
        }
        .modifier(CardStyle())
        .padding(.horizontal, AppTheme.Spacing.md)
    }

    private func trackRow(track: MashupTrack, icon: String) -> some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            Image(systemName: icon)
                .foregroundColor(AppTheme.Colors.gold)
                .font(.system(size: 16))

            VStack(alignment: .leading, spacing: 2) {
                Text(track.name)
                    .font(AppTheme.Typography.callout)
                    .fontWeight(.medium)
                    .foregroundColor(AppTheme.Colors.textPrimary)
                    .lineLimit(1)

                Text(track.artist)
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(AppTheme.Colors.textSecondary)
                    .lineLimit(1)
            }

            Spacer()

            Text("\(Int(track.bpm)) BPM")
                .font(AppTheme.Typography.caption)
                .foregroundColor(AppTheme.Colors.textTertiary)
        }
    }

    // MARK: - Filtered Tracks (Search Mode)

    private var filteredTracksView: some View {
        let filtered = libraryManager.tracks.filter { track in
            let query = searchQuery.lowercased()
            return track.name.lowercased().contains(query) ||
                   track.artists.joined(separator: " ").lowercased().contains(query)
        }

        return VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Text("Tap a track to find its mashup partner")
                .font(AppTheme.Typography.caption)
                .foregroundColor(AppTheme.Colors.textSecondary)
                .padding(.horizontal, AppTheme.Spacing.md)

            ForEach(filtered.prefix(10)) { track in
                Button(action: {
                    searchedTrackId = track.id
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
                                .lineLimit(1)

                            Text(track.artists.joined(separator: ", "))
                                .font(AppTheme.Typography.caption)
                                .foregroundColor(AppTheme.Colors.textSecondary)
                                .lineLimit(1)
                        }

                        Spacer()

                        if let mikData = track.mikData {
                            Text(mikData.key ?? "")
                                .font(AppTheme.Typography.caption)
                                .foregroundColor(AppTheme.Colors.accentCyan)
                        }
                    }
                    .padding()
                    .background(AppTheme.Colors.surface)
                    .cornerRadius(AppTheme.Radius.md)
                }
                .padding(.horizontal, AppTheme.Spacing.md)
            }
        }
    }

    // MARK: - Best Partner View

    private func bestPartnerView(partner: MashupPair) -> some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.md) {
            Text("Best Mashup Partner")
                .font(AppTheme.Typography.headline)
                .foregroundColor(AppTheme.Colors.textPrimary)

            mashupPairCard(pair: partner)
        }
        .padding(.top, AppTheme.Spacing.md)
    }

    // MARK: - Helpers

    private func difficultyColor(_ difficulty: String) -> Color {
        switch difficulty.lowercased() {
        case "easy": return AppTheme.Colors.success
        case "medium": return AppTheme.Colors.warning
        case "hard": return AppTheme.Colors.error
        default: return AppTheme.Colors.textSecondary
        }
    }
}


// MARK: - Main ContentView (Entry Point)

struct ContentView: View {
    @EnvironmentObject var spotifyManager: SpotifyManager
    @EnvironmentObject var libraryManager: LibraryManager
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            GenerateViewRedesign()
                .tabItem {
                    Label("Playlist", systemImage: "music.note.list")
                }
                .tag(0)

            MixGeneratorViewRedesign()
                .tabItem {
                    Label("Mix", systemImage: "waveform.path.ecg")
                }
                .tag(1)

            MashupFinderViewRedesign()
                .tabItem {
                    Label("Mashups", systemImage: "waveform.path.badge.plus")
                }
                .tag(2)

            LibraryViewRedesign()
                .tabItem {
                    Label("Tracks", systemImage: "music.note")
                }
                .tag(3)

            SettingsViewRedesign()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
                .tag(4)
        }
        .tint(AppTheme.Colors.gold)
        .preferredColorScheme(.dark)
        .onAppear {
            configureTabBarAppearance()
        }
    }

    private func configureTabBarAppearance() {
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(AppTheme.Colors.surface)
        appearance.stackedLayoutAppearance.normal.iconColor = UIColor(AppTheme.Colors.textTertiary)
        appearance.stackedLayoutAppearance.normal.titleTextAttributes = [.foregroundColor: UIColor(AppTheme.Colors.textTertiary)]
        appearance.stackedLayoutAppearance.selected.iconColor = UIColor(AppTheme.Colors.gold)
        appearance.stackedLayoutAppearance.selected.titleTextAttributes = [.foregroundColor: UIColor(AppTheme.Colors.gold)]
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }
}

class ServerDiscovery: ObservableObject {
    @Published var serverAddress = "mixmaster.mixtape.run"
    @Published var isConnected = false
    @Published var isSearching = false
    
    func autoDiscover() async {
        await MainActor.run { isSearching = true }
        
        let candidates = [
            "mixmaster.mixtape.run",
            "192.168.1.1",
            "192.168.0.1",
            "localhost"
        ]
        
        for address in candidates {
            if await testConnection(address) {
                await MainActor.run {
                    serverAddress = address
                    isConnected = true
                    isSearching = false
                    saveAddress(address)
                }
                return
            }
        }
        
        await MainActor.run { isSearching = false }
    }
    
    func testConnection(_ address: String) async -> Bool {
        let urlString: String
        if address == "mixmaster.mixtape.run" {
            urlString = "https://\(address)/api/health"
        } else {
            urlString = "http://\(address):3000/api/health"
        }
        
        guard let url = URL(string: urlString) else { return false }
        
        do {
            let (_, response) = try await URLSession.shared.data(from: url)
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                return true
            }
        } catch {}
        
        return false
    }
    
    func saveAddress(_ address: String) {
        UserDefaults.standard.set(address, forKey: "serverAddress")
    }
    
    init() {
        if let saved = UserDefaults.standard.string(forKey: "serverAddress") {
            serverAddress = saved
        }
    }
}

// MARK: - Library View Redesign

struct LibraryViewRedesign: View {
    @EnvironmentObject var libraryManager: LibraryManager
    @State private var searchText = ""
    @State private var selectedFilter: LibraryFilter = .all

    enum LibraryFilter: String, CaseIterable {
        case all = "All"
        case mik = "MIK"
        case appleMusic = "Apple Music"
    }

    var filteredTracks: [NotoriousDADKit.Track] {
        var tracks = libraryManager.tracks
        switch selectedFilter {
        case .mik: tracks = tracks.filter { $0.mikData != nil }
        case .appleMusic: tracks = tracks.filter { $0.appleMusicPlayCount > 0 }
        case .all: break
        }
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
                statsHeader.padding(.horizontal, AppTheme.Spacing.md).padding(.vertical, AppTheme.Spacing.sm)
                filterPills.padding(.horizontal, AppTheme.Spacing.md).padding(.bottom, AppTheme.Spacing.sm)
                ScrollView {
                    LazyVStack(spacing: AppTheme.Spacing.xs) {
                        ForEach(filteredTracks, id: \.id) { track in
                            TrackRowRedesign(track: track)
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
        }
    }

    private var statsHeader: some View {
        HStack(spacing: AppTheme.Spacing.md) {
            StatCard(icon: "waveform", value: "\(libraryManager.mikTrackCount.formatted())", label: "MIK Analyzed", color: AppTheme.Colors.accentCyan)
            StatCard(icon: "music.note", value: "\(libraryManager.appleMusicTrackCount.formatted())", label: "Apple Music", color: AppTheme.Colors.accentPink)
        }
    }

    private var filterPills: some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            ForEach(LibraryFilter.allCases, id: \.self) { filter in
                Button {
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
        }
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

struct TrackRowRedesign: View {
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
                    Text("\(track.appleMusicPlayCount)").font(AppTheme.Typography.caption2).foregroundColor(AppTheme.Colors.accentPink)
                        .padding(.horizontal, 6).padding(.vertical, 2).background(AppTheme.Colors.accentPink.opacity(0.15)).cornerRadius(4)
                }
                if track.mikData != nil {
                    Image(systemName: "waveform").font(.system(size: 10)).foregroundColor(AppTheme.Colors.accentCyan)
                        .padding(4).background(AppTheme.Colors.accentCyan.opacity(0.15)).cornerRadius(4)
                }
            }
        }
        .padding(.vertical, AppTheme.Spacing.xs).padding(.horizontal, AppTheme.Spacing.sm)
        .background(AppTheme.Colors.surface).cornerRadius(AppTheme.Radius.sm)
    }
}

// MARK: - Settings View Redesign

struct SettingsViewRedesign: View {
    @EnvironmentObject var spotifyManager: SpotifyManager

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: AppTheme.Spacing.lg) {
                    spotifySection
                    aboutSection
                    creditsSection
                }
                .padding(.horizontal, AppTheme.Spacing.md)
                .padding(.top, AppTheme.Spacing.sm)
            }
            .screenBackground()
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.large)
        }
    }

    private var spotifySection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Label("Spotify", systemImage: "music.note.tv").font(AppTheme.Typography.headline).foregroundColor(AppTheme.Colors.textPrimary)
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
                    .font(AppTheme.Typography.callout).foregroundColor(AppTheme.Colors.gold)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .cardStyle()
        }
    }

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Label("About", systemImage: "info.circle").font(AppTheme.Typography.headline).foregroundColor(AppTheme.Colors.textPrimary)
            VStack(spacing: AppTheme.Spacing.xs) {
                infoRow(label: "Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                infoRow(label: "Build", value: Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—")
            }
            .cardStyle()
        }
    }

    private var creditsSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Label("Credits", systemImage: "heart.fill").font(AppTheme.Typography.headline).foregroundColor(AppTheme.Colors.textPrimary)
            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                Text("Notorious DAD").font(AppTheme.Typography.callout).foregroundColor(AppTheme.Colors.textPrimary)
                Text("Built for DJs. Uses Spotify API, Mixed In Key data, and your personal music library.").font(AppTheme.Typography.caption).foregroundColor(AppTheme.Colors.textSecondary)
            }
            .cardStyle()
        }
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack {
            Text(label).font(AppTheme.Typography.callout).foregroundColor(AppTheme.Colors.textSecondary)
            Spacer()
            Text(value).font(AppTheme.Typography.callout).foregroundColor(AppTheme.Colors.textPrimary)
        }
    }
}
