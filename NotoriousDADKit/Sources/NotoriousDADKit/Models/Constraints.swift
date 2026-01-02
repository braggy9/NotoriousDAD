import Foundation

/// Energy curve profile for the playlist
public enum EnergyCurve: String, Codable, Sendable, CaseIterable {
    case build = "build"           // Start low, end high
    case drop = "drop"             // Start high, end low
    case wave = "wave"             // Oscillate
    case steady = "steady"         // Maintain consistent energy
    case peakMiddle = "peak-middle" // Build to middle, then drop
}

/// Mood descriptor for track selection
public enum Mood: String, Codable, Sendable, CaseIterable {
    case energetic
    case chill
    case dark
    case uplifting
    case melancholic
    case aggressive
    case dreamy
    case groovy
}

/// BPM range constraint
public struct BPMRange: Codable, Sendable {
    public let min: Double
    public let max: Double

    public init(min: Double, max: Double) {
        self.min = min
        self.max = max
    }

    /// Check if a BPM falls within range (including half/double time)
    public func contains(_ bpm: Double) -> Bool {
        // Direct match
        if bpm >= min && bpm <= max {
            return true
        }
        // Half time match
        if (bpm * 2) >= min && (bpm * 2) <= max {
            return true
        }
        // Double time match
        if (bpm / 2) >= min && (bpm / 2) <= max {
            return true
        }
        return false
    }
}

/// Playlist generation constraints extracted from user prompt
public struct PlaylistConstraints: Codable, Sendable {
    /// Artists that MUST appear in the playlist
    public var includeArtists: [String]

    /// Artists used as style reference (not required)
    public var referenceArtists: [String]

    /// Target number of tracks
    public var trackCount: Int

    /// Target duration in minutes (if specified instead of track count)
    public var durationMinutes: Int?

    /// BPM range filter
    public var bpmRange: BPMRange?

    /// Energy curve profile
    public var energyCurve: EnergyCurve?

    /// Mood descriptors
    public var moods: [Mood]

    /// Genre filters
    public var genres: [String]

    /// Decades filter (e.g., ["1980s", "1990s"])
    public var decades: [String]

    /// Exclude specific artists
    public var excludeArtists: [String]

    /// Raw user prompt (for debugging)
    public var rawPrompt: String?

    public init(
        includeArtists: [String] = [],
        referenceArtists: [String] = [],
        trackCount: Int = 30,
        durationMinutes: Int? = nil,
        bpmRange: BPMRange? = nil,
        energyCurve: EnergyCurve? = nil,
        moods: [Mood] = [],
        genres: [String] = [],
        decades: [String] = [],
        excludeArtists: [String] = [],
        rawPrompt: String? = nil
    ) {
        self.includeArtists = includeArtists
        self.referenceArtists = referenceArtists
        self.trackCount = trackCount
        self.durationMinutes = durationMinutes
        self.bpmRange = bpmRange
        self.energyCurve = energyCurve
        self.moods = moods
        self.genres = genres
        self.decades = decades
        self.excludeArtists = excludeArtists
        self.rawPrompt = rawPrompt
    }

    /// Calculate track count from duration if needed
    public var effectiveTrackCount: Int {
        if let duration = durationMinutes {
            // Assume average track is 3.5 minutes
            return max(10, Int(Double(duration) / 3.5))
        }
        return trackCount
    }
}

// MARK: - Default Constraints

extension PlaylistConstraints {
    /// Default constraints for a 30-track mix
    public static var `default`: PlaylistConstraints {
        PlaylistConstraints(trackCount: 30)
    }

    /// Constraints for a 2-hour DJ set
    public static var twoHourSet: PlaylistConstraints {
        PlaylistConstraints(
            trackCount: 34,
            durationMinutes: 120,
            energyCurve: .build
        )
    }
}
