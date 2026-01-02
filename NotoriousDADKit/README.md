# NotoriousDADKit

A Swift package for deterministic DJ playlist generation with harmonic mixing support.

## Features

- **Deterministic Track Selection** - Reliable algorithm-based selection (no AI guessing)
- **Camelot Wheel Harmonic Mixing** - Professional key compatibility analysis
- **Apple Music Playcount Weighting** - Prioritize tracks you actually listen to
- **Variety Enforcement** - Ensures diverse artist representation
- **Cross-Platform** - Works on iOS 16+, macOS 13+

## Installation

### Swift Package Manager

Add to your `Package.swift`:

```swift
dependencies: [
    .package(path: "../NotoriousDADKit")
]
```

Or add via Xcode: File → Add Package Dependencies → Add Local...

## Quick Start

```swift
import NotoriousDADKit

// 1. Create your track pool
let tracks: [Track] = loadTracksFromMusicKit()

// 2. Define constraints
let constraints = PlaylistConstraints(
    includeArtists: ["Fred again", "Disclosure"],
    trackCount: 30,
    energyCurve: .build
)

// 3. Generate playlist
let playlist = await generatePlaylist(
    from: tracks,
    constraints: constraints,
    name: "DAD: Saturday Night"
)

// 4. Access ordered tracks
for track in playlist.tracks {
    print("\(track.name) - \(track.artistName) [\(track.camelotKey ?? "?")]")
}
```

## Core Components

### Models

- `Track` - A track with metadata from various sources (MIK, Spotify, Apple Music)
- `Playlist` - A generated playlist with ordered tracks and analysis
- `PlaylistConstraints` - User requirements (artists, BPM, energy, duration)

### Selection

- `SelectionEngine` - Deterministic track selection with scoring algorithm
- `HarmonicOptimizer` - Orders tracks for smooth DJ transitions

### Camelot

- `CamelotWheel` - Harmonic key compatibility utilities

## Selection Scoring

Each track receives a score (0-100) based on:

| Factor | Points | Description |
|--------|--------|-------------|
| Apple Music Playcount | 0-40 | What you actually listen to |
| MIK Data | 20 | Has professional analysis |
| Constraint Match | 0-20 | Fits BPM/energy requirements |
| Artist Match | 10-20 | Include/Reference artist |
| Random | 0-10 | Variety factor |

## Harmonic Mixing

The `CamelotWheel` provides compatibility analysis:

```swift
// Check if keys mix well
CamelotWheel.areCompatible("8A", "9A")  // true (adjacent)
CamelotWheel.areCompatible("8A", "8B")  // true (relative major)

// Get compatibility score (0-100)
CamelotWheel.compatibilityScore("8A", "9A")  // 85

// Convert from Spotify audio features
let key = CamelotWheel.fromSpotifyKey(pitchClass: 9, mode: 0)  // "8A"
```

## Variety Enforcement

The selection engine ensures diverse playlists:

- Maximum 3 tracks per artist
- Minimum 10 unique artists per playlist
- Include artists get 3 guaranteed tracks each

## Integration with MusicKit

```swift
import MusicKit
import NotoriousDADKit

// Request authorization
let status = await MusicAuthorization.request()

// Load songs with play counts
let request = MusicLibraryRequest<Song>()
let response = try await request.response()

// Convert to NotoriousDADKit tracks
let tracks: [Track] = response.items.map { song in
    Track(
        id: song.id.rawValue,
        uri: "apple:\(song.id.rawValue)",
        name: song.title,
        artists: [song.artistName],
        album: song.albumTitle ?? "",
        durationMs: Int(song.duration ?? 0) * 1000,
        appleMusicPlayCount: song.playCount ?? 0
    )
}
```

## License

MIT

## Author

Built for Notorious DAD DJ Mix Generator
