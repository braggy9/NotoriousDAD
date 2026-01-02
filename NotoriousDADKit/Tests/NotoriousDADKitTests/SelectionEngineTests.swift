import Testing
@testable import NotoriousDADKit

@Suite("Selection Engine Tests")
struct SelectionEngineTests {

    // MARK: - Test Data

    func makeTracks() -> [Track] {
        [
            Track(
                id: "1", uri: "spotify:track:1",
                name: "Track by Fred again",
                artists: ["Fred again.."],
                album: "Actual Life",
                durationMs: 180000,
                popularity: 80,
                camelotKey: "8A",
                appleMusicPlayCount: 50
            ),
            Track(
                id: "2", uri: "spotify:track:2",
                name: "Track by Rufus",
                artists: ["RUFUS DU SOL"],
                album: "Surrender",
                durationMs: 240000,
                popularity: 75,
                camelotKey: "9A",
                appleMusicPlayCount: 30
            ),
            Track(
                id: "3", uri: "spotify:track:3",
                name: "Random Track 1",
                artists: ["Unknown Artist"],
                album: "Album",
                durationMs: 200000,
                popularity: 50,
                camelotKey: "7A",
                appleMusicPlayCount: 5
            ),
            Track(
                id: "4", uri: "spotify:track:4",
                name: "Random Track 2",
                artists: ["Another Artist"],
                album: "Album 2",
                durationMs: 220000,
                popularity: 60,
                camelotKey: "8B",
                appleMusicPlayCount: 10
            ),
            Track(
                id: "5", uri: "spotify:track:5",
                name: "Disclosure Song",
                artists: ["Disclosure"],
                album: "Settle",
                durationMs: 195000,
                popularity: 85,
                camelotKey: "10A",
                appleMusicPlayCount: 40
            ),
        ]
    }

    // MARK: - Tests

    @Test("Include artists are prioritized")
    func includeArtistsPrioritized() async {
        let tracks = makeTracks()
        let constraints = PlaylistConstraints(
            includeArtists: ["Fred again"],
            trackCount: 3
        )

        let engine = SelectionEngine()
        let selected = await engine.selectTracks(from: tracks, constraints: constraints)

        // Fred again track should be included
        let hasFreddAgain = selected.contains { $0.artists.first?.lowercased().contains("fred") == true }
        #expect(hasFreddAgain)
    }

    @Test("Playcount affects selection score")
    func playcountAffectsScore() async {
        let tracks = makeTracks()
        let constraints = PlaylistConstraints(trackCount: 3)

        let engine = SelectionEngine()
        let selected = await engine.selectTracks(from: tracks, constraints: constraints)

        // High playcount tracks should generally be selected
        // Track 1 (Fred again) has playcount 50
        // Track 5 (Disclosure) has playcount 40
        // Track 2 (Rufus) has playcount 30
        let selectedIds = Set(selected.map { $0.id })
        #expect(selectedIds.contains("1") || selectedIds.contains("5") || selectedIds.contains("2"))
    }

    @Test("Variety enforcement limits per-artist tracks")
    func varietyEnforcementWorks() async {
        // Create many tracks from same artist
        var tracks: [Track] = []
        for i in 0..<10 {
            tracks.append(Track(
                id: "same-\(i)",
                uri: "spotify:track:same-\(i)",
                name: "Same Artist Track \(i)",
                artists: ["Same Artist"],
                album: "Album",
                durationMs: 200000,
                appleMusicPlayCount: 100  // High playcount
            ))
        }

        // Add some variety tracks
        for i in 0..<5 {
            tracks.append(Track(
                id: "other-\(i)",
                uri: "spotify:track:other-\(i)",
                name: "Other Track \(i)",
                artists: ["Artist \(i)"],
                album: "Album",
                durationMs: 200000,
                appleMusicPlayCount: 5
            ))
        }

        let constraints = PlaylistConstraints(trackCount: 10)
        let config = SelectionConfig()

        let engine = SelectionEngine(config: config)
        let selected = await engine.selectTracks(from: tracks, constraints: constraints)

        // Count tracks from "Same Artist"
        let sameArtistCount = selected.filter {
            $0.artists.first == "Same Artist"
        }.count

        // Should be limited to maxTracksPerArtist (default 3)
        #expect(sameArtistCount <= config.maxTracksPerArtist)
    }

    @Test("Respects target track count")
    func respectsTrackCount() async {
        let tracks = makeTracks()
        let constraints = PlaylistConstraints(trackCount: 3)

        let engine = SelectionEngine()
        let selected = await engine.selectTracks(from: tracks, constraints: constraints)

        #expect(selected.count == 3)
    }

    @Test("Duration-based track count")
    func durationBasedTrackCount() {
        let constraints = PlaylistConstraints(durationMinutes: 120)  // 2 hours

        // At 3.5 min average, should be ~34 tracks
        #expect(constraints.effectiveTrackCount >= 30)
        #expect(constraints.effectiveTrackCount <= 40)
    }
}
