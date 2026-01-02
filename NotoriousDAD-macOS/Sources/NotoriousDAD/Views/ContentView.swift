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

    @State private var prompt = ""
    @State private var isGenerating = false
    @State private var generatedPlaylist: DADPlaylist?

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Generate Playlist")
                    .font(.largeTitle.bold())
                Spacer()
                Button {
                    showingNewPlaylist = true
                } label: {
                    Label("New", systemImage: "plus")
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()

            Divider()

            // Prompt input
            VStack(alignment: .leading, spacing: 12) {
                Text("Describe your mix:")
                    .font(.headline)

                TextEditor(text: $prompt)
                    .font(.body)
                    .frame(height: 100)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                    )

                Text("Example: Include: Fred again, Disclosure. 30 tracks. Energy: build")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                HStack {
                    Spacer()
                    Button {
                        Task { await generatePlaylist() }
                    } label: {
                        if isGenerating {
                            ProgressView()
                                .controlSize(.small)
                            Text("Generating...")
                        } else {
                            Label("Generate Mix", systemImage: "wand.and.stars")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(prompt.isEmpty || isGenerating || !spotifyManager.isAuthenticated)
                }
            }
            .padding()

            Divider()

            // Generated playlist preview
            if let playlist = generatedPlaylist {
                PlaylistPreview(playlist: playlist)
            } else {
                ContentUnavailableView(
                    "No Playlist Yet",
                    systemImage: "waveform",
                    description: Text("Enter a prompt above to generate your first mix")
                )
            }
        }
    }

    private func generatePlaylist() async {
        isGenerating = true
        defer { isGenerating = false }

        // Parse constraints (simplified - would use NLP in production)
        let constraints = PlaylistConstraints(
            includeArtists: parseIncludeArtists(from: prompt),
            trackCount: parseTrackCount(from: prompt) ?? 30,
            rawPrompt: prompt
        )

        // Generate using core library
        let playlist = await NotoriousDADKit.generatePlaylist(
            from: libraryManager.tracks,
            constraints: constraints,
            name: "DAD: New Mix"
        )

        await MainActor.run {
            generatedPlaylist = playlist
        }
    }

    private func parseIncludeArtists(from prompt: String) -> [String] {
        // Simple parsing - look for "Include:" pattern
        guard let range = prompt.range(of: "Include:", options: .caseInsensitive) else {
            return []
        }
        let afterInclude = prompt[range.upperBound...]
        let endIndex = afterInclude.firstIndex(of: ".") ?? afterInclude.endIndex
        let artistsString = afterInclude[..<endIndex]
        return artistsString.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
    }

    private func parseTrackCount(from prompt: String) -> Int? {
        let pattern = #"(\d+)\s*tracks?"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
              let match = regex.firstMatch(in: prompt, range: NSRange(prompt.startIndex..., in: prompt)),
              let range = Range(match.range(at: 1), in: prompt) else {
            return nil
        }
        return Int(prompt[range])
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
