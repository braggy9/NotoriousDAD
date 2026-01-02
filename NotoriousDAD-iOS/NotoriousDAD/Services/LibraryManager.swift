import Foundation
import SwiftUI
import NotoriousDADKit

// Use type alias to disambiguate
typealias DADTrack = NotoriousDADKit.Track

/// Manages the local music library for iOS
/// Loads data from bundled JSON files or fetches from API
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

    // MARK: - API Configuration

    // For production, load from your web app API
    private let apiBaseURL = "https://dj-mix-generator.vercel.app/api"

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

        var trackById: [String: DADTrack] = [:]

        // Try loading from bundled files first (for offline use)
        if let mikTracks = loadBundledMIKData() {
            for track in mikTracks {
                trackById[track.id] = track
            }
            mikTrackCount = mikTracks.count
            print("✅ Loaded \(mikTracks.count) MIK tracks from bundle")
        }
        loadingProgress = 0.3

        if let appleTracks = loadBundledAppleMusicData() {
            for track in appleTracks {
                if var existing = trackById[track.id] {
                    existing.appleMusicPlayCount = track.appleMusicPlayCount
                    trackById[track.id] = existing
                } else {
                    trackById[track.id] = track
                }
            }
            appleMusicTrackCount = appleTracks.count
            print("✅ Loaded \(appleTracks.count) Apple Music tracks from bundle")
        }
        loadingProgress = 0.6

        // If no bundled data, try fetching from API
        if trackById.isEmpty {
            print("📡 No bundled data, fetching from API...")
            if let apiTracks = await fetchTracksFromAPI() {
                for track in apiTracks {
                    trackById[track.id] = track
                }
                appleMusicTrackCount = apiTracks.count
            }
        }
        loadingProgress = 1.0

        tracks = Array(trackById.values).sorted { $0.appleMusicPlayCount > $1.appleMusicPlayCount }
        isLoading = false
        print("📊 Total unique tracks: \(tracks.count)")
    }

    // MARK: - Bundled Data Loading

    /// Load MIK data from app bundle
    private func loadBundledMIKData() -> [DADTrack]? {
        guard let url = Bundle.main.url(forResource: "matched-tracks", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let tracksArray = json["tracks"] as? [[String: Any]] else {
            return nil
        }

        return parseSpotifyTracks(tracksArray, source: .mikLibrary)
    }

    /// Load Apple Music data from app bundle
    private func loadBundledAppleMusicData() -> [DADTrack]? {
        guard let url = Bundle.main.url(forResource: "apple-music-checkpoint", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let matches = json["matches"] as? [[String: Any]] else {
            return nil
        }

        var tracks: [DADTrack] = []
        for match in matches {
            guard let spotifyTrack = match["spotifyTrack"] as? [String: Any],
                  let appleMusicTrack = match["appleMusicTrack"] as? [String: Any],
                  let id = spotifyTrack["id"] as? String,
                  let name = spotifyTrack["name"] as? String else {
                continue
            }

            let artists = (spotifyTrack["artists"] as? [[String: Any]])?.compactMap { $0["name"] as? String } ?? []
            let albumInfo = spotifyTrack["album"] as? [String: Any]
            let album = albumInfo?["name"] as? String ?? ""
            let durationMs = spotifyTrack["duration_ms"] as? Int ?? 0

            let playCountStr = appleMusicTrack["playCount"] as? String ?? "0"
            var playCount = Int(playCountStr) ?? 0
            // Filter out invalid play counts (sample rates like 44100/48000 got mixed in)
            if playCount > 10000 {
                playCount = 0
            }

            let track = DADTrack(
                id: id,
                uri: "spotify:track:\(id)",
                name: name,
                artists: artists,
                album: album,
                durationMs: durationMs,
                source: .appleMusic,
                appleMusicPlayCount: playCount
            )
            tracks.append(track)
        }

        return tracks
    }

    // MARK: - API Loading

    /// Fetch tracks from web app API
    private func fetchTracksFromAPI() async -> [DADTrack]? {
        // This would fetch from your Vercel API
        // For now, return nil - implement when API endpoint is ready
        return nil
    }

    // MARK: - Helpers

    private func parseSpotifyTracks(_ items: [[String: Any]], source: TrackSource) -> [DADTrack] {
        var tracks: [DADTrack] = []

        for item in items {
            guard let spotifyTrack = item["spotifyTrack"] as? [String: Any],
                  let id = spotifyTrack["id"] as? String,
                  let name = spotifyTrack["name"] as? String else {
                continue
            }

            let artists = (spotifyTrack["artists"] as? [[String: Any]])?.compactMap { $0["name"] as? String } ?? []
            let albumInfo = spotifyTrack["album"] as? [String: Any]
            let album = albumInfo?["name"] as? String ?? ""
            let durationMs = spotifyTrack["duration_ms"] as? Int ?? 0

            var mikData: MIKData? = nil
            if let mikTrack = item["mikTrack"] as? [String: Any] {
                let bpm = (mikTrack["bpm"] as? Double) ?? Double(mikTrack["bpm"] as? String ?? "0") ?? 0
                let key = mikTrack["key"] as? String ?? ""
                let energy = (mikTrack["energy"] as? Int) ?? Int(mikTrack["energy"] as? String ?? "5") ?? 5
                mikData = MIKData(key: key, bpm: bpm, energy: energy)
            }

            let track = DADTrack(
                id: id,
                uri: "spotify:track:\(id)",
                name: name,
                artists: artists,
                album: album,
                durationMs: durationMs,
                source: source,
                mikData: mikData,
                camelotKey: mikData?.key
            )
            tracks.append(track)
        }

        return tracks
    }
}
