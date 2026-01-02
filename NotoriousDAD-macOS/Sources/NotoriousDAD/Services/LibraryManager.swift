import Foundation
import SwiftUI
import NotoriousDADKit
import MusicKit

// Use type alias to disambiguate from MusicKit.Track
typealias DADTrack = NotoriousDADKit.Track

/// Manages the local music library from various sources
@MainActor
class LibraryManager: ObservableObject {

    // MARK: - Published Properties

    @Published var tracks: [DADTrack] = []
    @Published var isLoading = false
    @Published var error: String?
    @Published var loadingProgress: Double = 0

    // Sources
    @Published var mikTrackCount = 0
    @Published var appleMusicTrackCount = 0

    var trackCount: Int { tracks.count }

    // MARK: - File Paths

    private var mikDataURL: URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent("mik-tracks.json")
    }

    // MARK: - Init

    init() {
        Task {
            await loadAllSources()
        }
    }

    // MARK: - Load All Sources

    func loadAllSources() async {
        isLoading = true
        loadingProgress = 0
        error = nil

        var allTracks: [DADTrack] = []

        // 1. Load MIK data
        if let mikTracks = await loadMIKData() {
            allTracks.append(contentsOf: mikTracks)
            mikTrackCount = mikTracks.count
        }
        loadingProgress = 0.5

        // 2. Load Apple Music library
        if let appleTracks = await loadAppleMusicLibrary() {
            // Merge, avoiding duplicates
            let existingIds = Set(allTracks.map { $0.id })
            let newTracks = appleTracks.filter { !existingIds.contains($0.id) }
            allTracks.append(contentsOf: newTracks)
            appleMusicTrackCount = appleTracks.count
        }
        loadingProgress = 1.0

        tracks = allTracks
        isLoading = false
    }

    // MARK: - MIK Data

    /// Load MIK-analyzed tracks from JSON file
    private func loadMIKData() async -> [DADTrack]? {
        guard let url = mikDataURL,
              FileManager.default.fileExists(atPath: url.path) else {
            return nil
        }

        do {
            let data = try Data(contentsOf: url)
            let mikTracks = try JSONDecoder().decode([DADTrack].self, from: data)
            return mikTracks
        } catch {
            self.error = "Failed to load MIK data: \(error.localizedDescription)"
            return nil
        }
    }

    /// Import MIK CSV file
    func importMIKCSV(from url: URL) async throws {
        isLoading = true
        defer { isLoading = false }

        let csvContent = try String(contentsOf: url, encoding: .utf8)
        let tracks = parseMIKCSV(csvContent)

        // Save to local storage
        if let saveURL = mikDataURL {
            let data = try JSONEncoder().encode(tracks)
            try data.write(to: saveURL)
        }

        // Reload
        await loadAllSources()
    }

    private func parseMIKCSV(_ content: String) -> [DADTrack] {
        var tracks: [DADTrack] = []
        let lines = content.components(separatedBy: .newlines)

        // Skip header
        for line in lines.dropFirst() {
            let columns = parseCSVLine(line)
            guard columns.count >= 6 else { continue }

            // CSV format: Name, Artist, Album, BPM, Key, Energy, ...
            let name = columns[0]
            let artist = columns[1]
            let album = columns[2]
            let bpm = Double(columns[3]) ?? 0
            let key = columns[4]
            let energy = Int(columns[5]) ?? 5

            // Generate a temporary ID (would match to Spotify in production)
            let id = "\(artist)-\(name)".lowercased().replacingOccurrences(of: " ", with: "-")

            let track = DADTrack(
                id: id,
                uri: "mik:\(id)",
                name: name,
                artists: [artist],
                album: album,
                durationMs: 0,
                source: .mikLibrary,
                mikData: MIKData(
                    key: key,
                    bpm: bpm,
                    energy: energy
                ),
                camelotKey: key  // MIK already provides Camelot keys
            )

            tracks.append(track)
        }

        return tracks
    }

    private func parseCSVLine(_ line: String) -> [String] {
        var result: [String] = []
        var current = ""
        var inQuotes = false

        for char in line {
            if char == "\"" {
                inQuotes.toggle()
            } else if char == "," && !inQuotes {
                result.append(current.trimmingCharacters(in: .whitespaces))
                current = ""
            } else {
                current.append(char)
            }
        }
        result.append(current.trimmingCharacters(in: .whitespaces))

        return result
    }

    // MARK: - Apple Music (MusicKit)

    /// Load tracks from Apple Music library with play counts
    private func loadAppleMusicLibrary() async -> [DADTrack]? {
        // Request authorization
        let status = await MusicAuthorization.request()
        guard status == .authorized else {
            return nil
        }

        do {
            var request = MusicLibraryRequest<Song>()
            request.limit = 10000  // Adjust as needed

            let response = try await request.response()
            let tracks = response.items.map { song -> DADTrack in
                // Convert MusicKit Song to our Track model
                DADTrack(
                    id: song.id.rawValue,
                    uri: "apple:\(song.id.rawValue)",
                    name: song.title,
                    artists: [song.artistName],
                    album: song.albumTitle ?? "",
                    durationMs: Int((song.duration ?? 0) * 1000),
                    source: .appleMusic,
                    appleMusicPlayCount: song.playCount ?? 0
                )
            }

            return tracks
        } catch {
            self.error = "Failed to load Apple Music: \(error.localizedDescription)"
            return nil
        }
    }

    // MARK: - Sync with Spotify

    /// Match Apple Music tracks to Spotify IDs
    func syncWithSpotify(using spotifyManager: SpotifyManager) async {
        // This would use Spotify search to find matching tracks
        // and update the track IDs for playlist creation
        // Implementation similar to the web app's matcher
    }
}
