import Foundation

/// Source of the track data
public enum TrackSource: String, Codable, Sendable {
    case mikLibrary = "mik-library"
    case appleMusic = "apple-music"
    case spotifySearch = "spotify-search"
    case spotifyLibrary = "spotify-library"
    case recommendations = "recommendations"
}

/// Mixed In Key analysis data
public struct MIKData: Codable, Sendable {
    public let key: String?           // e.g., "8A", "11B"
    public let bpm: Double?
    public let energy: Int?           // 1-10 scale
    public let cuePoints: [Double]?

    public init(key: String? = nil, bpm: Double? = nil, energy: Int? = nil, cuePoints: [Double]? = nil) {
        self.key = key
        self.bpm = bpm
        self.energy = energy
        self.cuePoints = cuePoints
    }
}

/// Spotify audio features
public struct AudioFeatures: Codable, Sendable {
    public let danceability: Double    // 0.0 - 1.0
    public let energy: Double          // 0.0 - 1.0
    public let key: Int               // 0-11 (pitch class)
    public let mode: Int              // 0 = minor, 1 = major
    public let tempo: Double          // BPM
    public let valence: Double        // 0.0 - 1.0 (musical positivity)
    public let acousticness: Double   // 0.0 - 1.0
    public let instrumentalness: Double // 0.0 - 1.0

    public init(
        danceability: Double,
        energy: Double,
        key: Int,
        mode: Int,
        tempo: Double,
        valence: Double,
        acousticness: Double = 0,
        instrumentalness: Double = 0
    ) {
        self.danceability = danceability
        self.energy = energy
        self.key = key
        self.mode = mode
        self.tempo = tempo
        self.valence = valence
        self.acousticness = acousticness
        self.instrumentalness = instrumentalness
    }
}

/// A track with all available metadata from various sources
public struct Track: Identifiable, Codable, Sendable {
    public let id: String             // Spotify ID
    public let uri: String            // Spotify URI
    public let name: String
    public let artists: [String]
    public let album: String
    public let durationMs: Int
    public let popularity: Int?       // 0-100

    // Data source
    public var source: TrackSource

    // Mixed In Key data (if available)
    public var mikData: MIKData?

    // Spotify audio features (if fetched)
    public var audioFeatures: AudioFeatures?

    // Camelot key (computed from MIK or Spotify)
    public var camelotKey: String?

    // Apple Music playcount (if available)
    public var appleMusicPlayCount: Int

    // Computed selection score
    public var selectionScore: Double

    public init(
        id: String,
        uri: String,
        name: String,
        artists: [String],
        album: String,
        durationMs: Int,
        popularity: Int? = nil,
        source: TrackSource = .spotifySearch,
        mikData: MIKData? = nil,
        audioFeatures: AudioFeatures? = nil,
        camelotKey: String? = nil,
        appleMusicPlayCount: Int = 0,
        selectionScore: Double = 0
    ) {
        self.id = id
        self.uri = uri
        self.name = name
        self.artists = artists
        self.album = album
        self.durationMs = durationMs
        self.popularity = popularity
        self.source = source
        self.mikData = mikData
        self.audioFeatures = audioFeatures
        self.camelotKey = camelotKey
        self.appleMusicPlayCount = appleMusicPlayCount
        self.selectionScore = selectionScore
    }

    /// Primary artist name
    public var artistName: String {
        artists.first ?? "Unknown Artist"
    }

    /// Duration in seconds
    public var durationSeconds: Double {
        Double(durationMs) / 1000.0
    }

    /// BPM from MIK or Spotify audio features
    public var bpm: Double? {
        mikData?.bpm ?? audioFeatures?.tempo
    }

    /// Energy level (normalized to 0-1)
    public var energyLevel: Double? {
        if let mikEnergy = mikData?.energy {
            return Double(mikEnergy) / 10.0
        }
        return audioFeatures?.energy
    }
}

// MARK: - Hashable & Equatable

extension Track: Hashable {
    public static func == (lhs: Track, rhs: Track) -> Bool {
        lhs.id == rhs.id
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}
