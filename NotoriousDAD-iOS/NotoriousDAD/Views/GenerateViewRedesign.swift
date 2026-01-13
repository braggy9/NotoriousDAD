import SwiftUI
import NotoriousDADKit

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
            Text("Create Mix")
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
