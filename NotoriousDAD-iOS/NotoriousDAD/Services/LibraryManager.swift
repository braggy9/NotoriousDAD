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

/// Manages the local music library for iOS
/// Loads data from bundled JSON files or fetches from API
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

    // MARK: - API Configuration

    // For production, load from your web app API
    private let apiBaseURL = "https://dj-mix-generator.vercel.app/api"

    // MARK: - Init

    init() {
        Task {
            await loadWithCacheFirst()
        }
    }

    // MARK: - Load with Cache Priority

    /// Load from cache first for instant startup, then refresh from bundle in background
    func loadWithCacheFirst() async {
        isLoading = true
        loadingProgress = 0

        // Try cache first for instant startup
        if let cached = cache.loadCachedTracks() {
            tracks = cached.tracks
            mikTrackCount = cached.metadata.mikTrackCount
            appleMusicTrackCount = cached.metadata.appleMusicTrackCount
            lastCacheUpdate = cached.metadata.lastUpdated
            isUsingCache = true
            loadingProgress = 1.0
            isLoading = false

            print("⚡ Quick load from cache: \(tracks.count) tracks")

            // Refresh from bundle in background if cache is old (> 24 hours)
            if let ageHours = cache.cacheAgeHours(), ageHours > 24 {
                print("🔄 Cache is \(Int(ageHours))h old, refreshing in background...")
                Task.detached { [weak self] in
                    await self?.refreshFromBundle()
                }
            }
            return
        }

        // No cache - load from bundle
        await loadAllSources()
    }

    // MARK: - Load All Sources

    func loadAllSources() async {
        isLoading = true
        loadingProgress = 0
        error = nil
        isUsingCache = false

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
        loadingProgress = 0.9

        tracks = Array(trackById.values).sorted { $0.appleMusicPlayCount > $1.appleMusicPlayCount }

        // Save to cache for next launch
        if !tracks.isEmpty {
            cache.saveTracks(tracks, mikCount: mikTrackCount, appleCount: appleMusicTrackCount)
            lastCacheUpdate = Date()
        }

        loadingProgress = 1.0
        isLoading = false
        print("📊 Total unique tracks: \(tracks.count)")
    }

    // MARK: - Background Refresh

    /// Refresh library from bundle data in background
    @MainActor
    func refreshFromBundle() async {
        print("🔄 Background refresh starting...")

        var trackById: [String: DADTrack] = [:]
        var newMikCount = 0
        var newAppleCount = 0

        if let mikTracks = loadBundledMIKData() {
            for track in mikTracks {
                trackById[track.id] = track
            }
            newMikCount = mikTracks.count
        }

        if let appleTracks = loadBundledAppleMusicData() {
            for track in appleTracks {
                if var existing = trackById[track.id] {
                    existing.appleMusicPlayCount = track.appleMusicPlayCount
                    trackById[track.id] = existing
                } else {
                    trackById[track.id] = track
                }
            }
            newAppleCount = appleTracks.count
        }

        let newTracks = Array(trackById.values).sorted { $0.appleMusicPlayCount > $1.appleMusicPlayCount }

        // Only update if we got data
        if !newTracks.isEmpty {
            tracks = newTracks
            mikTrackCount = newMikCount
            appleMusicTrackCount = newAppleCount
            isUsingCache = false
            cache.saveTracks(newTracks, mikCount: newMikCount, appleCount: newAppleCount)
            lastCacheUpdate = Date()
            print("✅ Background refresh complete: \(newTracks.count) tracks")
        }
    }

    /// Force refresh from bundle (user-initiated)
    func forceRefresh() async {
        isLoading = true
        loadingProgress = 0
        await loadAllSources()
    }

    /// Clear cache and reload
    func clearCacheAndReload() async {
        cache.clearCache()
        await loadAllSources()
    }

    /// Get cache info for display
    var cacheInfo: String {
        let sizeBytes = cache.cacheSizeBytes()
        let sizeMB = Double(sizeBytes) / 1_000_000
        if let date = lastCacheUpdate {
            let formatter = RelativeDateTimeFormatter()
            formatter.unitsStyle = .abbreviated
            let ago = formatter.localizedString(for: date, relativeTo: Date())
            return String(format: "%.1f MB • Updated %@", sizeMB, ago)
        }
        return String(format: "%.1f MB", sizeMB)
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
