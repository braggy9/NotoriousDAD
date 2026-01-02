import Foundation

/// Optimizes track order for harmonic DJ mixing
public struct HarmonicOptimizer: Sendable {

    public init() {}

    /// Optimize track order for harmonic mixing using nearest-neighbor algorithm
    /// Starting from track with best "opener" qualities
    public func optimize(_ tracks: [Track]) -> [Track] {
        guard tracks.count > 2 else { return tracks }

        var remaining = tracks
        var ordered: [Track] = []

        // Find best opening track (prefer tracks with MIK data and moderate energy)
        let opener = findOpener(from: remaining)
        ordered.append(opener)
        remaining.removeAll { $0.id == opener.id }

        // Greedily add most compatible track
        while !remaining.isEmpty {
            let current = ordered.last!
            let next = findBestNext(after: current, from: remaining)
            ordered.append(next)
            remaining.removeAll { $0.id == next.id }
        }

        return ordered
    }

    /// Find the best opening track
    private func findOpener(from tracks: [Track]) -> Track {
        // Score tracks as openers
        let scored = tracks.map { track -> (Track, Double) in
            var score: Double = 0

            // Prefer tracks with key data
            if track.camelotKey != nil {
                score += 20
            }

            // Prefer moderate energy for opener (0.3-0.6)
            if let energy = track.energyLevel {
                if energy >= 0.3 && energy <= 0.6 {
                    score += 15
                }
            }

            // Prefer moderate BPM for opener
            if let bpm = track.bpm {
                if bpm >= 115 && bpm <= 128 {
                    score += 10
                }
            }

            // Prefer tracks with MIK data
            if track.mikData != nil {
                score += 10
            }

            return (track, score)
        }

        // Return highest scored
        return scored.max { $0.1 < $1.1 }?.0 ?? tracks[0]
    }

    /// Find the best next track after current
    private func findBestNext(after current: Track, from candidates: [Track]) -> Track {
        let scored = candidates.map { candidate -> (Track, Double) in
            var score: Double = 0

            // Harmonic compatibility (most important)
            if let currentKey = current.camelotKey,
               let candidateKey = candidate.camelotKey {
                score += Double(CamelotWheel.compatibilityScore(currentKey, candidateKey))
            } else {
                // No key data - neutral score
                score += 50
            }

            // BPM compatibility (prefer within 6 BPM)
            if let currentBPM = current.bpm, let candidateBPM = candidate.bpm {
                let bpmDiff = abs(currentBPM - candidateBPM)
                if bpmDiff <= 3 {
                    score += 20
                } else if bpmDiff <= 6 {
                    score += 15
                } else if bpmDiff <= 10 {
                    score += 5
                }
                // Check half/double time
                let halfDiff = abs(currentBPM - candidateBPM * 2)
                let doubleDiff = abs(currentBPM * 2 - candidateBPM)
                if halfDiff <= 6 || doubleDiff <= 6 {
                    score += 10
                }
            }

            // Energy flow (gradual changes preferred)
            if let currentEnergy = current.energyLevel,
               let candidateEnergy = candidate.energyLevel {
                let energyDiff = abs(currentEnergy - candidateEnergy)
                if energyDiff <= 0.15 {
                    score += 10
                } else if energyDiff <= 0.3 {
                    score += 5
                }
            }

            return (candidate, score)
        }

        // Return highest scored
        return scored.max { $0.1 < $1.1 }?.0 ?? candidates[0]
    }

    /// Analyze transitions in an ordered playlist
    public func analyzeTransitions(_ tracks: [Track]) -> [TransitionAnalysis] {
        guard tracks.count > 1 else { return [] }

        var analyses: [TransitionAnalysis] = []

        for i in 0..<(tracks.count - 1) {
            let from = tracks[i]
            let to = tracks[i + 1]

            let analysis = TransitionAnalysis(
                fromTrack: from,
                toTrack: to,
                harmonicScore: calculateHarmonicScore(from: from, to: to),
                bpmChange: calculateBPMChange(from: from, to: to),
                energyChange: calculateEnergyChange(from: from, to: to),
                description: describeTransition(from: from, to: to)
            )

            analyses.append(analysis)
        }

        return analyses
    }

    // MARK: - Helpers

    private func calculateHarmonicScore(from: Track, to: Track) -> Int {
        guard let fromKey = from.camelotKey,
              let toKey = to.camelotKey else {
            return 50  // Unknown
        }
        return CamelotWheel.compatibilityScore(fromKey, toKey)
    }

    private func calculateBPMChange(from: Track, to: Track) -> Double? {
        guard let fromBPM = from.bpm, let toBPM = to.bpm else {
            return nil
        }
        return toBPM - fromBPM
    }

    private func calculateEnergyChange(from: Track, to: Track) -> Double? {
        guard let fromEnergy = from.energyLevel,
              let toEnergy = to.energyLevel else {
            return nil
        }
        return toEnergy - fromEnergy
    }

    private func describeTransition(from: Track, to: Track) -> String {
        var parts: [String] = []

        // Key transition
        if let fromKey = from.camelotKey, let toKey = to.camelotKey {
            parts.append(CamelotWheel.describeTransition(from: fromKey, to: toKey))
        }

        // BPM change
        if let bpmChange = calculateBPMChange(from: from, to: to) {
            if abs(bpmChange) <= 2 {
                parts.append("Steady BPM")
            } else if bpmChange > 0 {
                parts.append("+\(Int(bpmChange)) BPM")
            } else {
                parts.append("\(Int(bpmChange)) BPM")
            }
        }

        // Energy change
        if let energyChange = calculateEnergyChange(from: from, to: to) {
            if energyChange > 0.1 {
                parts.append("Energy up")
            } else if energyChange < -0.1 {
                parts.append("Energy down")
            }
        }

        return parts.isEmpty ? "Transition" : parts.joined(separator: " | ")
    }
}

/// Analysis of a single transition between tracks
public struct TransitionAnalysis: Codable, Sendable {
    public let fromTrack: Track
    public let toTrack: Track
    public let harmonicScore: Int      // 0-100
    public let bpmChange: Double?
    public let energyChange: Double?
    public let description: String

    /// Is this a smooth transition?
    public var isSmooth: Bool {
        harmonicScore >= 70
    }

    /// Warning level for the transition
    public var warningLevel: WarningLevel {
        switch harmonicScore {
        case 80...100: return .none
        case 60..<80: return .mild
        case 40..<60: return .moderate
        default: return .severe
        }
    }

    public enum WarningLevel: String, Codable, Sendable {
        case none
        case mild
        case moderate
        case severe
    }
}
