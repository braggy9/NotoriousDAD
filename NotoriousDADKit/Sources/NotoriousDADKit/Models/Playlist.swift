import Foundation

/// A generated DJ playlist with harmonic ordering
public struct Playlist: Identifiable, Codable, Sendable {
    public let id: UUID
    public var name: String
    public var description: String?
    public var tracks: [Track]
    public var constraints: PlaylistConstraints
    public var createdAt: Date

    /// Spotify playlist ID (after creation)
    public var spotifyId: String?

    /// Cover art URL (after DALL-E generation)
    public var coverArtURL: URL?

    public init(
        id: UUID = UUID(),
        name: String,
        description: String? = nil,
        tracks: [Track] = [],
        constraints: PlaylistConstraints = .default,
        createdAt: Date = Date(),
        spotifyId: String? = nil,
        coverArtURL: URL? = nil
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.tracks = tracks
        self.constraints = constraints
        self.createdAt = createdAt
        self.spotifyId = spotifyId
        self.coverArtURL = coverArtURL
    }

    // MARK: - Computed Properties

    /// Total duration in seconds
    public var totalDurationSeconds: Double {
        tracks.reduce(0) { $0 + $1.durationSeconds }
    }

    /// Total duration formatted as "X hr Y min"
    public var formattedDuration: String {
        let totalMinutes = Int(totalDurationSeconds / 60)
        let hours = totalMinutes / 60
        let minutes = totalMinutes % 60

        if hours > 0 {
            return "\(hours) hr \(minutes) min"
        }
        return "\(minutes) min"
    }

    /// Unique artists in the playlist
    public var uniqueArtists: Set<String> {
        Set(tracks.flatMap { $0.artists })
    }

    /// Number of unique artists
    public var artistCount: Int {
        uniqueArtists.count
    }

    /// Average BPM of tracks with BPM data
    public var averageBPM: Double? {
        let bpms = tracks.compactMap { $0.bpm }
        guard !bpms.isEmpty else { return nil }
        return bpms.reduce(0, +) / Double(bpms.count)
    }

    /// BPM range in the playlist
    public var bpmRange: (min: Double, max: Double)? {
        let bpms = tracks.compactMap { $0.bpm }
        guard let min = bpms.min(), let max = bpms.max() else { return nil }
        return (min, max)
    }

    /// Percentage of tracks with MIK data
    public var mikCoveragePercent: Double {
        let mikCount = tracks.filter { $0.mikData != nil }.count
        guard !tracks.isEmpty else { return 0 }
        return Double(mikCount) / Double(tracks.count) * 100
    }

    /// Harmonic mixing score (percentage of compatible transitions)
    public var harmonicScore: Double {
        guard tracks.count > 1 else { return 100 }

        var compatibleTransitions = 0
        for i in 0..<(tracks.count - 1) {
            let current = tracks[i]
            let next = tracks[i + 1]

            if let currentKey = current.camelotKey,
               let nextKey = next.camelotKey,
               CamelotWheel.areCompatible(currentKey, nextKey) {
                compatibleTransitions += 1
            }
        }

        return Double(compatibleTransitions) / Double(tracks.count - 1) * 100
    }
}

// MARK: - Track Management

extension Playlist {
    /// Add a track to the playlist
    public mutating func addTrack(_ track: Track) {
        tracks.append(track)
    }

    /// Remove a track at index
    public mutating func removeTrack(at index: Int) {
        guard tracks.indices.contains(index) else { return }
        tracks.remove(at: index)
    }

    /// Move a track from one position to another
    public mutating func moveTrack(from source: Int, to destination: Int) {
        guard tracks.indices.contains(source),
              destination >= 0 && destination <= tracks.count else { return }

        let track = tracks.remove(at: source)
        tracks.insert(track, at: destination > source ? destination - 1 : destination)
    }

    /// Replace a track at index
    public mutating func replaceTrack(at index: Int, with newTrack: Track) {
        guard tracks.indices.contains(index) else { return }
        tracks[index] = newTrack
    }
}
