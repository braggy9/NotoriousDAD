import Testing
@testable import NotoriousDADKit

@Suite("Camelot Wheel Tests")
struct CamelotWheelTests {

    @Test("Same key is compatible")
    func sameKeyCompatible() {
        #expect(CamelotWheel.areCompatible("8A", "8A") == true)
        #expect(CamelotWheel.areCompatible("11B", "11B") == true)
    }

    @Test("Adjacent keys are compatible")
    func adjacentKeysCompatible() {
        // +1
        #expect(CamelotWheel.areCompatible("8A", "9A") == true)
        // -1
        #expect(CamelotWheel.areCompatible("8A", "7A") == true)
        // Wrap around 12->1
        #expect(CamelotWheel.areCompatible("12A", "1A") == true)
        // Wrap around 1->12
        #expect(CamelotWheel.areCompatible("1B", "12B") == true)
    }

    @Test("Relative major/minor compatible")
    func relativeMajorMinorCompatible() {
        #expect(CamelotWheel.areCompatible("8A", "8B") == true)
        #expect(CamelotWheel.areCompatible("5B", "5A") == true)
    }

    @Test("Energy boost (+7) compatible")
    func energyBoostCompatible() {
        // 8A + 7 = 3A (wrapping: 8+7=15, 15-12=3)
        // Actually +7 on wheel: from 8A, +7 would be 3A
        #expect(CamelotWheel.areCompatible("1A", "8A") == true)  // 1+7=8
        #expect(CamelotWheel.areCompatible("6B", "1B") == true)  // 6+7=13->1
    }

    @Test("Non-adjacent same-mode keys less compatible (unless energy boost)")
    func nonAdjacentLessCompatible() {
        // 8A to 3A is +7 (energy boost) so it's actually compatible at 75
        // Test with truly incompatible keys (e.g., 8A to 4A = +8, not a valid move)
        let score = CamelotWheel.compatibilityScore("8A", "4A")
        #expect(score < 70)
    }

    @Test("Spotify key conversion")
    func spotifyKeyConversion() {
        // C major (pitch 0, mode 1) -> 8B
        #expect(CamelotWheel.fromSpotifyKey(pitchClass: 0, mode: 1) == "8B")
        // A minor (pitch 9, mode 0) -> 8A
        #expect(CamelotWheel.fromSpotifyKey(pitchClass: 9, mode: 0) == "8A")
        // E minor (pitch 4, mode 0) -> 9A
        #expect(CamelotWheel.fromSpotifyKey(pitchClass: 4, mode: 0) == "9A")
    }

    @Test("Musical key conversion")
    func musicalKeyConversion() {
        #expect(CamelotWheel.fromMusicalKey("Am") == "8A")
        #expect(CamelotWheel.fromMusicalKey("C") == "8B")
        #expect(CamelotWheel.fromMusicalKey("C major") == "8B")
        #expect(CamelotWheel.fromMusicalKey("F# minor") == "11A")
    }

    @Test("Compatible keys list")
    func compatibleKeysList() {
        let compatible = CamelotWheel.compatibleKeys(for: "8A")
        #expect(compatible.contains("8A"))  // Same
        #expect(compatible.contains("8B"))  // Relative major
        #expect(compatible.contains("7A"))  // -1
        #expect(compatible.contains("9A"))  // +1
    }

    @Test("Transition description")
    func transitionDescription() {
        let same = CamelotWheel.describeTransition(from: "8A", to: "8A")
        #expect(same == "Perfect match")

        let stepUp = CamelotWheel.describeTransition(from: "8A", to: "9A")
        #expect(stepUp == "Step up (+1)")

        let relative = CamelotWheel.describeTransition(from: "8A", to: "8B")
        #expect(relative == "To relative major")
    }
}
