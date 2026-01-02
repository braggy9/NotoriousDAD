import Foundation

/// Camelot Wheel for harmonic mixing
/// The Camelot system uses numbers 1-12 with A (minor) or B (major) suffix
/// Compatible transitions: same key, +/-1 number, or A<->B at same number
public enum CamelotWheel {

    // MARK: - Key Mapping

    /// Convert Spotify pitch class (0-11) and mode (0/1) to Camelot key
    public static func fromSpotifyKey(pitchClass: Int, mode: Int) -> String {
        // Spotify: 0=C, 1=C#, 2=D, etc. Mode: 0=minor, 1=major
        let camelotMap: [Int: (minor: String, major: String)] = [
            0:  ("5A", "8B"),   // C minor / C major
            1:  ("12A", "3B"),  // C# minor / Db major
            2:  ("7A", "10B"),  // D minor / D major
            3:  ("2A", "5B"),   // D# minor / Eb major
            4:  ("9A", "12B"),  // E minor / E major
            5:  ("4A", "7B"),   // F minor / F major
            6:  ("11A", "2B"),  // F# minor / Gb major
            7:  ("6A", "9B"),   // G minor / G major
            8:  ("1A", "4B"),   // G# minor / Ab major
            9:  ("8A", "11B"),  // A minor / A major
            10: ("3A", "6B"),   // A# minor / Bb major
            11: ("10A", "1B"),  // B minor / B major
        ]

        guard let keys = camelotMap[pitchClass] else { return "1A" }
        return mode == 1 ? keys.major : keys.minor
    }

    /// Convert musical key notation to Camelot (e.g., "Am" -> "8A", "C" -> "8B")
    public static func fromMusicalKey(_ key: String) -> String? {
        let keyMap: [String: String] = [
            // Minor keys (A suffix)
            "Am": "8A", "A minor": "8A",
            "A#m": "3A", "Bbm": "3A", "A# minor": "3A", "Bb minor": "3A",
            "Bm": "10A", "B minor": "10A",
            "Cm": "5A", "C minor": "5A",
            "C#m": "12A", "Dbm": "12A", "C# minor": "12A", "Db minor": "12A",
            "Dm": "7A", "D minor": "7A",
            "D#m": "2A", "Ebm": "2A", "D# minor": "2A", "Eb minor": "2A",
            "Em": "9A", "E minor": "9A",
            "Fm": "4A", "F minor": "4A",
            "F#m": "11A", "Gbm": "11A", "F# minor": "11A", "Gb minor": "11A",
            "Gm": "6A", "G minor": "6A",
            "G#m": "1A", "Abm": "1A", "G# minor": "1A", "Ab minor": "1A",

            // Major keys (B suffix)
            "A": "11B", "A major": "11B",
            "A#": "6B", "Bb": "6B", "A# major": "6B", "Bb major": "6B",
            "B": "1B", "B major": "1B",
            "C": "8B", "C major": "8B",
            "C#": "3B", "Db": "3B", "C# major": "3B", "Db major": "3B",
            "D": "10B", "D major": "10B",
            "D#": "5B", "Eb": "5B", "D# major": "5B", "Eb major": "5B",
            "E": "12B", "E major": "12B",
            "F": "7B", "F major": "7B",
            "F#": "2B", "Gb": "2B", "F# major": "2B", "Gb major": "2B",
            "G": "9B", "G major": "9B",
            "G#": "4B", "Ab": "4B", "G# major": "4B", "Ab major": "4B",

            // Camelot notation pass-through
            "1A": "1A", "2A": "2A", "3A": "3A", "4A": "4A", "5A": "5A", "6A": "6A",
            "7A": "7A", "8A": "8A", "9A": "9A", "10A": "10A", "11A": "11A", "12A": "12A",
            "1B": "1B", "2B": "2B", "3B": "3B", "4B": "4B", "5B": "5B", "6B": "6B",
            "7B": "7B", "8B": "8B", "9B": "9B", "10B": "10B", "11B": "11B", "12B": "12B",
        ]

        return keyMap[key]
    }

    // MARK: - Compatibility

    /// Check if two Camelot keys are compatible for mixing
    public static func areCompatible(_ key1: String, _ key2: String) -> Bool {
        guard let parsed1 = parseKey(key1),
              let parsed2 = parseKey(key2) else {
            return false
        }

        let (num1, mode1) = parsed1
        let (num2, mode2) = parsed2

        // Same key
        if num1 == num2 && mode1 == mode2 {
            return true
        }

        // Same number, different mode (relative major/minor)
        if num1 == num2 {
            return true
        }

        // Adjacent numbers (same mode) - wrap around 12->1 and 1->12
        if mode1 == mode2 {
            let diff = abs(num1 - num2)
            if diff == 1 || diff == 11 {
                return true
            }
        }

        // Energy boost: +7 on wheel (same mode)
        if mode1 == mode2 {
            let diff = (num2 - num1 + 12) % 12
            if diff == 7 || diff == 5 {  // +7 or -7 (which is +5)
                return true
            }
        }

        return false
    }

    /// Get compatibility score (0-100) between two keys
    public static func compatibilityScore(_ key1: String, _ key2: String) -> Int {
        guard let parsed1 = parseKey(key1),
              let parsed2 = parseKey(key2) else {
            return 50  // Unknown keys get neutral score
        }

        let (num1, mode1) = parsed1
        let (num2, mode2) = parsed2

        // Perfect match
        if num1 == num2 && mode1 == mode2 {
            return 100
        }

        // Relative major/minor (same number)
        if num1 == num2 {
            return 90
        }

        // Adjacent number, same mode
        if mode1 == mode2 {
            let diff = abs(num1 - num2)
            if diff == 1 || diff == 11 {
                return 85
            }
        }

        // Energy boost (+7)
        if mode1 == mode2 {
            let diff = (num2 - num1 + 12) % 12
            if diff == 7 || diff == 5 {
                return 75
            }
        }

        // Different but not clashing
        if mode1 == mode2 {
            let diff = abs(num1 - num2)
            if diff == 2 || diff == 10 {
                return 60
            }
        }

        // Clashing keys
        return 30
    }

    /// Get all compatible keys for a given key
    public static func compatibleKeys(for key: String) -> [String] {
        guard let (num, mode) = parseKey(key) else { return [] }

        var compatible: [String] = []

        // Same key
        compatible.append("\(num)\(mode)")

        // Relative major/minor
        let otherMode = mode == "A" ? "B" : "A"
        compatible.append("\(num)\(otherMode)")

        // Adjacent numbers (same mode)
        let prev = num == 1 ? 12 : num - 1
        let next = num == 12 ? 1 : num + 1
        compatible.append("\(prev)\(mode)")
        compatible.append("\(next)\(mode)")

        return compatible
    }

    // MARK: - Helpers

    /// Parse Camelot key into number and mode
    private static func parseKey(_ key: String) -> (number: Int, mode: String)? {
        let trimmed = key.trimmingCharacters(in: .whitespaces).uppercased()

        guard let modeIndex = trimmed.lastIndex(where: { $0 == "A" || $0 == "B" }) else {
            return nil
        }

        let mode = String(trimmed[modeIndex])
        let numberStr = String(trimmed[..<modeIndex])

        guard let number = Int(numberStr), (1...12).contains(number) else {
            return nil
        }

        return (number, mode)
    }
}

// MARK: - Transition Analysis

extension CamelotWheel {
    /// Describe the transition between two keys
    public static func describeTransition(from key1: String, to key2: String) -> String {
        guard let (num1, mode1) = parseKey(key1),
              let (num2, mode2) = parseKey(key2) else {
            return "Unknown transition"
        }

        // Same key
        if num1 == num2 && mode1 == mode2 {
            return "Perfect match"
        }

        // Relative major/minor
        if num1 == num2 {
            return mode2 == "A" ? "To relative minor" : "To relative major"
        }

        // Adjacent
        if mode1 == mode2 {
            let diff = (num2 - num1 + 12) % 12
            if diff == 1 {
                return "Step up (+1)"
            }
            if diff == 11 {
                return "Step down (-1)"
            }
            if diff == 7 {
                return "Energy boost (+7)"
            }
        }

        let score = compatibilityScore(key1, key2)
        if score >= 60 {
            return "Compatible (\(score)%)"
        }

        return "Key change (caution)"
    }
}
