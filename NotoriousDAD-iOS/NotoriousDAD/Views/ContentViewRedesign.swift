import SwiftUI
import NotoriousDADKit

// MARK: - Redesigned Content View
// Main app container with dark theme and gold accents

struct ContentViewRedesign: View {
    @EnvironmentObject var spotifyManager: SpotifyManager
    @EnvironmentObject var libraryManager: LibraryManager
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            GenerateViewRedesign()
                .tabItem {
                    Label("Create", systemImage: "wand.and.stars")
                }
                .tag(0)

            MixGeneratorViewRedesign()
                .tabItem {
                    Label("Audio Mix", systemImage: "waveform.path.ecg")
                }
                .tag(1)

            LibraryViewRedesign()
                .tabItem {
                    Label("Library", systemImage: "music.note.list")
                }
                .tag(2)

            SettingsViewRedesign()
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
    }

    private func configureTabBarAppearance() {
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(AppTheme.Colors.surface)

        // Normal state
        appearance.stackedLayoutAppearance.normal.iconColor = UIColor(AppTheme.Colors.textTertiary)
        appearance.stackedLayoutAppearance.normal.titleTextAttributes = [
            .foregroundColor: UIColor(AppTheme.Colors.textTertiary)
        ]

        // Selected state
        appearance.stackedLayoutAppearance.selected.iconColor = UIColor(AppTheme.Colors.gold)
        appearance.stackedLayoutAppearance.selected.titleTextAttributes = [
            .foregroundColor: UIColor(AppTheme.Colors.gold)
        ]

        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
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

        // Apply filter
        switch selectedFilter {
        case .mik:
            tracks = tracks.filter { $0.mikData != nil }
        case .appleMusic:
            tracks = tracks.filter { $0.appleMusicPlayCount > 0 }
        case .all:
            break
        }

        // Apply search
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
                // Stats header
                statsHeader
                    .padding(.horizontal, AppTheme.Spacing.md)
                    .padding(.vertical, AppTheme.Spacing.sm)

                // Filter pills
                filterPills
                    .padding(.horizontal, AppTheme.Spacing.md)
                    .padding(.bottom, AppTheme.Spacing.sm)

                // Track list
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
            StatCard(
                icon: "waveform",
                value: "\(libraryManager.mikTrackCount.formatted())",
                label: "MIK Analyzed",
                color: AppTheme.Colors.accentCyan
            )

            StatCard(
                icon: "music.note",
                value: "\(libraryManager.appleMusicTrackCount.formatted())",
                label: "Apple Music",
                color: AppTheme.Colors.accentPink
            )
        }
    }

    private var filterPills: some View {
        HStack(spacing: AppTheme.Spacing.xs) {
            ForEach(LibraryFilter.allCases, id: \.self) { filter in
                Button {
                    withAnimation(AppTheme.Animation.quick) {
                        selectedFilter = filter
                    }
                } label: {
                    Text(filter.rawValue)
                        .font(AppTheme.Typography.caption)
                        .foregroundColor(selectedFilter == filter ? AppTheme.Colors.background : AppTheme.Colors.textSecondary)
                        .padding(.horizontal, AppTheme.Spacing.sm)
                        .padding(.vertical, AppTheme.Spacing.xxs)
                        .background(
                            Capsule()
                                .fill(selectedFilter == filter ? AppTheme.Colors.gold : AppTheme.Colors.surfaceHighlight)
                        )
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
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundColor(color)
                Text(value)
                    .font(AppTheme.Typography.title3)
                    .foregroundColor(AppTheme.Colors.textPrimary)
            }
            Text(label)
                .font(AppTheme.Typography.caption2)
                .foregroundColor(AppTheme.Colors.textSecondary)
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
            // Track info
            VStack(alignment: .leading, spacing: 2) {
                Text(track.name)
                    .font(AppTheme.Typography.callout)
                    .foregroundColor(AppTheme.Colors.textPrimary)
                    .lineLimit(1)

                Text(track.artists.joined(separator: ", "))
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(AppTheme.Colors.textSecondary)
                    .lineLimit(1)
            }

            Spacer()

            // Badges
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

// MARK: - Settings View Redesign

struct SettingsViewRedesign: View {
    @EnvironmentObject var spotifyManager: SpotifyManager

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: AppTheme.Spacing.lg) {
                    // Spotify connection
                    spotifySection

                    // About
                    aboutSection

                    // Credits
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
            Label("Spotify", systemImage: "music.note.tv")
                .font(AppTheme.Typography.headline)
                .foregroundColor(AppTheme.Colors.textPrimary)

            VStack(spacing: AppTheme.Spacing.sm) {
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(AppTheme.Colors.success)
                    Text("Connected")
                        .font(AppTheme.Typography.callout)
                        .foregroundColor(AppTheme.Colors.textPrimary)
                    Spacer()
                    if let user = spotifyManager.currentUser {
                        Text(user.displayName ?? "User")
                            .font(AppTheme.Typography.caption)
                            .foregroundColor(AppTheme.Colors.textSecondary)
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
    }

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Label("About", systemImage: "info.circle")
                .font(AppTheme.Typography.headline)
                .foregroundColor(AppTheme.Colors.textPrimary)

            VStack(spacing: AppTheme.Spacing.xs) {
                infoRow(label: "Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                infoRow(label: "Build", value: buildDate)
            }
            .cardStyle()
        }
    }

    private var creditsSection: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            Label("Credits", systemImage: "heart.fill")
                .font(AppTheme.Typography.headline)
                .foregroundColor(AppTheme.Colors.textPrimary)

            VStack(alignment: .leading, spacing: AppTheme.Spacing.xs) {
                Text("Notorious DAD")
                    .font(AppTheme.Typography.callout)
                    .foregroundColor(AppTheme.Colors.textPrimary)

                Text("Built with love for DJs everywhere. Uses Spotify API, Mixed In Key data, and your personal music library.")
                    .font(AppTheme.Typography.caption)
                    .foregroundColor(AppTheme.Colors.textSecondary)
            }
            .cardStyle()
        }
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(AppTheme.Typography.callout)
                .foregroundColor(AppTheme.Colors.textSecondary)
            Spacer()
            Text(value)
                .font(AppTheme.Typography.callout)
                .foregroundColor(AppTheme.Colors.textPrimary)
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

// MARK: - Preview

#Preview {
    ContentViewRedesign()
        .environmentObject(SpotifyManager())
        .environmentObject(LibraryManager())
        .environmentObject(NotificationManager())
}
