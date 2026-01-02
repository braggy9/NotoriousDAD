// NotoriousDADKit
// A Swift package for deterministic DJ playlist generation
// with harmonic mixing support.

/// Re-export all public types
@_exported import struct Foundation.UUID
@_exported import struct Foundation.Date
@_exported import struct Foundation.URL

// MARK: - Models
// Track, Playlist, PlaylistConstraints, etc.

// MARK: - Selection
// SelectionEngine - Deterministic track selection
// HarmonicOptimizer - Camelot-based track ordering

// MARK: - Camelot
// CamelotWheel - Harmonic mixing utilities

/// Package version
public let notoriousDADKitVersion = "1.0.0"

/// Quick playlist generation with default settings
public func generatePlaylist(
    from tracks: [Track],
    constraints: PlaylistConstraints,
    name: String = "DAD Mix"
) async -> Playlist {
    // 1. Select tracks using deterministic algorithm
    let engine = SelectionEngine()
    let selected = await engine.selectTracks(from: tracks, constraints: constraints)

    // 2. Optimize order for harmonic mixing
    let optimizer = HarmonicOptimizer()
    let ordered = optimizer.optimize(selected)

    // 3. Create playlist
    return Playlist(
        name: name,
        tracks: ordered,
        constraints: constraints
    )
}
