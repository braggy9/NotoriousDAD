import Foundation

/// Configuration for the selection algorithm
public struct SelectionConfig: Sendable {
    /// Maximum points for Apple Music playcount
    public var maxPlaycountPoints: Double = 40

    /// Points for having MIK data
    public var mikDataPoints: Double = 20

    /// Maximum points for constraint matching
    public var maxConstraintPoints: Double = 20

    /// Points for Include artist match
    public var includeArtistPoints: Double = 20

    /// Points for Reference artist match
    public var referenceArtistPoints: Double = 10

    /// Maximum random factor points (for variety)
    public var maxRandomPoints: Double = 10

    /// Maximum tracks per artist (variety enforcement)
    public var maxTracksPerArtist: Int = 3

    /// Minimum unique artists in playlist
    public var minUniqueArtists: Int = 10

    /// Tracks per Include artist to guarantee
    public var tracksPerIncludeArtist: Int = 3

    public init() {}
}

/// Deterministic track selection engine
/// Selects tracks based on scoring algorithm, not AI
public actor SelectionEngine {
    private let config: SelectionConfig

    public init(config: SelectionConfig = SelectionConfig()) {
        self.config = config
    }

    // MARK: - Main Selection

    /// Select tracks for a playlist based on constraints
    public func selectTracks(
        from pool: [Track],
        constraints: PlaylistConstraints
    ) -> [Track] {
        var scoredTracks = pool.map { track in
            var mutableTrack = track
            mutableTrack.selectionScore = calculateScore(
                track: track,
                constraints: constraints
            )
            return mutableTrack
        }

        // Sort by score descending
        scoredTracks.sort { $0.selectionScore > $1.selectionScore }

        var selected: [Track] = []
        var artistCounts: [String: Int] = [:]
        let targetCount = constraints.effectiveTrackCount

        // Build Include artist set for lookup (used for variety enforcement)
        _ = Set(constraints.includeArtists.map { $0.lowercased() })

        // PASS 1: Add Include artist tracks first (guaranteed)
        for artistName in constraints.includeArtists {
            let artistLower = artistName.lowercased()
            var addedForArtist = 0

            for track in scoredTracks {
                guard addedForArtist < config.tracksPerIncludeArtist else { break }

                let trackArtistLower = track.artistName.lowercased()
                if trackArtistLower.contains(artistLower) || artistLower.contains(trackArtistLower) {
                    // Check variety constraint
                    let currentCount = artistCounts[trackArtistLower, default: 0]
                    if currentCount < config.maxTracksPerArtist && !selected.contains(track) {
                        selected.append(track)
                        artistCounts[trackArtistLower, default: 0] += 1
                        addedForArtist += 1
                    }
                }
            }
        }

        // PASS 2: Fill remaining slots with highest-scored tracks
        for track in scoredTracks {
            guard selected.count < targetCount else { break }
            guard !selected.contains(track) else { continue }

            let artistLower = track.artistName.lowercased()
            let currentCount = artistCounts[artistLower, default: 0]

            // Enforce variety: max tracks per artist
            if currentCount >= config.maxTracksPerArtist {
                continue
            }

            // Add to selection
            selected.append(track)
            artistCounts[artistLower, default: 0] += 1
        }

        // Verify minimum artist variety
        let uniqueArtistCount = Set(selected.map { $0.artistName.lowercased() }).count
        if uniqueArtistCount < config.minUniqueArtists && selected.count >= config.minUniqueArtists {
            // Try to increase variety by swapping duplicates
            selected = enforceVariety(selected, from: scoredTracks)
        }

        return selected
    }

    // MARK: - Scoring

    /// Calculate selection score for a track (0-100 scale)
    private func calculateScore(
        track: Track,
        constraints: PlaylistConstraints
    ) -> Double {
        var score: Double = 0

        // 1. Apple Music playcount (0-40 points)
        let playcountScore = min(Double(track.appleMusicPlayCount) * 4, config.maxPlaycountPoints)
        score += playcountScore

        // 2. MIK data presence (20 points)
        if track.mikData != nil || track.camelotKey != nil {
            score += config.mikDataPoints
        }

        // 3. Constraint matching (0-20 points)
        score += calculateConstraintScore(track: track, constraints: constraints)

        // 4. Artist matching (0-20 points)
        score += calculateArtistScore(track: track, constraints: constraints)

        // 5. Random factor for variety (0-10 points)
        score += Double.random(in: 0...config.maxRandomPoints)

        return score
    }

    /// Calculate score based on constraint matching
    private func calculateConstraintScore(
        track: Track,
        constraints: PlaylistConstraints
    ) -> Double {
        var score: Double = 0
        var checks = 0
        var matches = 0

        // BPM range check
        if let bpmRange = constraints.bpmRange, let trackBPM = track.bpm {
            checks += 1
            if bpmRange.contains(trackBPM) {
                matches += 1
            }
        }

        // Energy check (if energy curve specified)
        if constraints.energyCurve != nil, let energy = track.energyLevel {
            checks += 1
            // For now, any track with energy data gets partial credit
            if energy >= 0.3 && energy <= 0.9 {
                matches += 1
            }
        }

        // Genre check (if specified)
        // Note: Would need genre data on track - skip for now

        // Calculate proportional score
        if checks > 0 {
            score = (Double(matches) / Double(checks)) * config.maxConstraintPoints
        } else {
            // No constraints to check - give neutral score
            score = config.maxConstraintPoints / 2
        }

        return score
    }

    /// Calculate score based on artist matching
    private func calculateArtistScore(
        track: Track,
        constraints: PlaylistConstraints
    ) -> Double {
        let trackArtistLower = track.artistName.lowercased()

        // Check Include artists (highest priority)
        for artist in constraints.includeArtists {
            let artistLower = artist.lowercased()
            if trackArtistLower.contains(artistLower) || artistLower.contains(trackArtistLower) {
                return config.includeArtistPoints
            }
        }

        // Check Reference artists (lower priority)
        for artist in constraints.referenceArtists {
            let artistLower = artist.lowercased()
            if trackArtistLower.contains(artistLower) || artistLower.contains(trackArtistLower) {
                return config.referenceArtistPoints
            }
        }

        return 0
    }

    // MARK: - Variety Enforcement

    /// Enforce minimum artist variety by swapping tracks
    private func enforceVariety(_ selected: [Track], from pool: [Track]) -> [Track] {
        var result = selected
        var artistCounts: [String: Int] = [:]

        // Count current artists
        for track in result {
            let artist = track.artistName.lowercased()
            artistCounts[artist, default: 0] += 1
        }

        // Find artists with too many tracks
        let overRepresented = artistCounts.filter { $0.value > config.maxTracksPerArtist }

        // For each over-represented artist, try to swap excess tracks
        for (artist, count) in overRepresented {
            let excess = count - config.maxTracksPerArtist

            // Find indices of tracks by this artist
            let indices = result.indices.filter {
                result[$0].artistName.lowercased() == artist
            }

            // Try to swap excess tracks
            for i in 0..<min(excess, indices.count) {
                let indexToSwap = indices[indices.count - 1 - i]  // Remove from end

                // Find a replacement track
                let usedArtists = Set(result.map { $0.artistName.lowercased() })
                if let replacement = pool.first(where: {
                    !usedArtists.contains($0.artistName.lowercased()) &&
                    !result.contains($0)
                }) {
                    result[indexToSwap] = replacement
                }
            }
        }

        return result
    }
}

// MARK: - Convenience Extension

extension SelectionEngine {
    /// Quick select with default config
    public static func select(
        from pool: [Track],
        constraints: PlaylistConstraints
    ) async -> [Track] {
        let engine = SelectionEngine()
        return await engine.selectTracks(from: pool, constraints: constraints)
    }
}
