import Foundation
import SwiftUI
import NotoriousDADKit

// Use type alias to disambiguate
typealias DADTrack = NotoriousDADKit.Track

// MARK: - Cache Manager

/// Manages offline caching of library data
class CacheManager {
    static let shared = CacheManager()

    private let fileManager = FileManager.default
    private let cacheDirectory: URL
    private let tracksFileName = "cached-tracks.json"
    private let metadataFileName = "cache-metadata.json"

    struct CacheMetadata: Codable {
        var lastUpdated: Date
        var trackCount: Int
        var mikTrackCount: Int
        var appleMusicTrackCount: Int
        var version: Int = 1
    }

    private init() {
        // Use app's caches directory for offline storage
        let paths = fileManager.urls(for: .cachesDirectory, in: .userDomainMask)
        cacheDirectory = paths[0].appendingPathComponent("LibraryCache", isDirectory: true)

        // Create cache directory if it doesn't exist
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    private var tracksURL: URL {
        cacheDirectory.appendingPathComponent(tracksFileName)
    }

    private var metadataURL: URL {
        cacheDirectory.appendingPathComponent(metadataFileName)
    }

    /// Save tracks to cache
    func saveTracks(_ tracks: [DADTrack], mikCount: Int, appleCount: Int) {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601

            // Save tracks
            let tracksData = try encoder.encode(tracks)
            try tracksData.write(to: tracksURL, options: .atomic)

            // Save metadata
            let metadata = CacheMetadata(
                lastUpdated: Date(),
                trackCount: tracks.count,
                mikTrackCount: mikCount,
                appleMusicTrackCount: appleCount
            )
            let metadataData = try encoder.encode(metadata)
            try metadataData.write(to: metadataURL, options: .atomic)

            print("💾 Cached \(tracks.count) tracks to disk")
        } catch {
            print("⚠️ Failed to cache tracks: \(error.localizedDescription)")
        }
    }

    /// Load tracks from cache
    func loadCachedTracks() -> (tracks: [DADTrack], metadata: CacheMetadata)? {
        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601

            // Load metadata first to check validity
            let metadataData = try Data(contentsOf: metadataURL)
            let metadata = try decoder.decode(CacheMetadata.self, from: metadataData)

            // Load tracks
            let tracksData = try Data(contentsOf: tracksURL)
            let tracks = try decoder.decode([DADTrack].self, from: tracksData)

            print("📦 Loaded \(tracks.count) tracks from cache (updated: \(metadata.lastUpdated))")
            return (tracks, metadata)
        } catch {
            print("📭 No cache available or cache corrupted: \(error.localizedDescription)")
            return nil
        }
    }

    /// Check if cache exists and is valid
    func hasValidCache() -> Bool {
        fileManager.fileExists(atPath: tracksURL.path) &&
        fileManager.fileExists(atPath: metadataURL.path)
    }

    /// Get cache age in hours
    func cacheAgeHours() -> Double? {
        guard let cached = loadCachedTracks() else { return nil }
        return Date().timeIntervalSince(cached.metadata.lastUpdated) / 3600
    }

    /// Clear cache
    func clearCache() {
        try? fileManager.removeItem(at: tracksURL)
        try? fileManager.removeItem(at: metadataURL)
        print("🗑️ Cache cleared")
    }

    /// Get cache size in bytes
    func cacheSizeBytes() -> Int64 {
        var size: Int64 = 0
        if let attrs = try? fileManager.attributesOfItem(atPath: tracksURL.path),
           let fileSize = attrs[.size] as? Int64 {
            size += fileSize
        }
        if let attrs = try? fileManager.attributesOfItem(atPath: metadataURL.path),
           let fileSize = attrs[.size] as? Int64 {
            size += fileSize
        }
        return size
    }
}

/// Manages the local music library from web app's pre-matched data
/// Includes offline caching for instant startup
@MainActor
class LibraryManager: ObservableObject {

    // MARK: - Published Properties

    @Published var tracks: [DADTrack] = []
    @Published var isLoading = false
    @Published var error: String?
    @Published var loadingProgress: Double = 0
    @Published var isUsingCache = false
    @Published var lastCacheUpdate: Date?

    // Sources
    @Published var mikTrackCount = 0
    @Published var appleMusicTrackCount = 0

    var trackCount: Int { tracks.count }

    // MARK: - Cache

    private let cache = CacheManager.shared

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
            await loadWithCacheFirst()
        }
    }

    // MARK: - Load with Cache Priority

    /// Load from cache first for instant startup, then refresh from files in background
    func loadWithCacheFirst() async {
        isLoading = true
        loadingProgress = 0
        error = nil

        // Try to load from cache first for instant startup
        if let cached = cache.loadCachedTracks() {
            tracks = cached.tracks
            mikTrackCount = cached.metadata.mikTrackCount
            appleMusicTrackCount = cached.metadata.appleMusicTrackCount
            isUsingCache = true
            lastCacheUpdate = cached.metadata.lastUpdated
            isLoading = false
            loadingProgress = 1.0

            print("⚡️ Using cached library (\(tracks.count) tracks)")

            // If cache is older than 24 hours, refresh in background
            if let ageHours = cache.cacheAgeHours(), ageHours > 24 {
                print("🔄 Cache is \(Int(ageHours)) hours old, refreshing in background...")
                await loadAllSources()
            }
        } else {
            // No cache available, load from files
            print("📂 No cache found, loading from files...")
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

        // Save to cache for next launch
        cache.saveTracks(tracks, mikCount: mikTrackCount, appleCount: appleMusicTrackCount)
        isUsingCache = false
        lastCacheUpdate = Date()

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
