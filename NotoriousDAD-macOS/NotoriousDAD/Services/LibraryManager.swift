import Foundation
import SwiftUI
import NotoriousDADKit

// Use type alias to disambiguate
typealias DADTrack = NotoriousDADKit.Track

/// Manages the local music library from web app's pre-matched data
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

    // MARK: - Web App Data Paths

    private let webAppDataPath = "/Users/tombragg/dj-mix-generator/data"

    private var mikDataURL: URL {
        URL(fileURLWithPath: "\(webAppDataPath)/matched-tracks.json")
    }

    private var appleMusicCheckpointURL: URL {
        URL(fileURLWithPath: "\(webAppDataPath)/apple-music-checkpoint.json")
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

        var trackById: [String: DADTrack] = [:]

        // 1. Load MIK data (4,080 tracks with professional key/BPM analysis)
        if let mikTracks = await loadMIKData() {
            for track in mikTracks {
                trackById[track.id] = track
            }
            mikTrackCount = mikTracks.count
            print("✅ Loaded \(mikTracks.count) MIK tracks")
        }
        loadingProgress = 0.3

        // 2. Load Apple Music checkpoint (39,850 matched tracks)
        if let appleTracks = await loadAppleMusicCheckpoint() {
            for track in appleTracks {
                // Merge: if track exists from MIK, keep MIK data but add playcount
                if var existing = trackById[track.id] {
                    existing.appleMusicPlayCount = track.appleMusicPlayCount
                    trackById[track.id] = existing
                } else {
                    trackById[track.id] = track
                }
            }
            appleMusicTrackCount = appleTracks.count
            print("✅ Loaded \(appleTracks.count) Apple Music matched tracks")
        }
        loadingProgress = 1.0

        tracks = Array(trackById.values).sorted { $0.appleMusicPlayCount > $1.appleMusicPlayCount }
        isLoading = false
        print("📊 Total unique tracks: \(tracks.count)")
    }

    // MARK: - MIK Data

    /// Load MIK-analyzed tracks from web app's matched-tracks.json
    private func loadMIKData() async -> [DADTrack]? {
        guard FileManager.default.fileExists(atPath: mikDataURL.path) else {
            print("⚠️ MIK data file not found at \(mikDataURL.path)")
            return nil
        }

        do {
            let data = try Data(contentsOf: mikDataURL)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard let tracksArray = json?["tracks"] as? [[String: Any]] else {
                return nil
            }

            var tracks: [DADTrack] = []
            for item in tracksArray {
                guard let spotifyTrack = item["spotifyTrack"] as? [String: Any],
                      let mikTrack = item["mikTrack"] as? [String: Any],
                      let id = spotifyTrack["id"] as? String,
                      let name = spotifyTrack["name"] as? String else {
                    continue
                }

                // Extract artist
                let artists = (spotifyTrack["artists"] as? [[String: Any]])?.compactMap { $0["name"] as? String } ?? []

                // Extract album
                let albumInfo = spotifyTrack["album"] as? [String: Any]
                let album = albumInfo?["name"] as? String ?? ""

                // Extract duration
                let durationMs = spotifyTrack["duration_ms"] as? Int ?? 0

                // Extract MIK data
                let bpm = (mikTrack["bpm"] as? Double) ?? Double(mikTrack["bpm"] as? String ?? "0") ?? 0
                let key = mikTrack["key"] as? String ?? ""
                let energy = (mikTrack["energy"] as? Int) ?? Int(mikTrack["energy"] as? String ?? "5") ?? 5

                let track = DADTrack(
                    id: id,
                    uri: "spotify:track:\(id)",
                    name: name,
                    artists: artists,
                    album: album,
                    durationMs: durationMs,
                    source: .mikLibrary,
                    mikData: MIKData(key: key, bpm: bpm, energy: energy),
                    camelotKey: key
                )
                tracks.append(track)
            }

            return tracks
        } catch {
            self.error = "Failed to load MIK data: \(error.localizedDescription)"
            print("❌ MIK load error: \(error)")
            return nil
        }
    }

    // MARK: - Apple Music Checkpoint

    /// Load Apple Music matched tracks from web app's checkpoint
    private func loadAppleMusicCheckpoint() async -> [DADTrack]? {
        guard FileManager.default.fileExists(atPath: appleMusicCheckpointURL.path) else {
            print("⚠️ Apple Music checkpoint not found at \(appleMusicCheckpointURL.path)")
            return nil
        }

        do {
            let data = try Data(contentsOf: appleMusicCheckpointURL)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard let matches = json?["matches"] as? [[String: Any]] else {
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

                // Extract artist
                let artists = (spotifyTrack["artists"] as? [[String: Any]])?.compactMap { $0["name"] as? String } ?? []

                // Extract album
                let albumInfo = spotifyTrack["album"] as? [String: Any]
                let album = albumInfo?["name"] as? String ?? ""

                // Extract duration
                let durationMs = spotifyTrack["duration_ms"] as? Int ?? 0

                // Extract playcount from Apple Music data
                let playCountStr = appleMusicTrack["playCount"] as? String ?? "0"
                let playCount = Int(playCountStr) ?? 0

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
        } catch {
            self.error = "Failed to load Apple Music checkpoint: \(error.localizedDescription)"
            print("❌ Apple Music checkpoint load error: \(error)")
            return nil
        }
    }
}
