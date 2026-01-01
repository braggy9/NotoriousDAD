# Claude AI Integration Patterns

## Models Used

- **Track Selection**: `claude-sonnet-4-5-20250929` (main model)
- Context window: ~200K tokens (enough for 500+ tracks with metadata)

## Two-Pass System

**Pass 1: Constraint Extraction** (`lib/playlist-nlp.ts`)
- Parse natural language prompts into structured constraints
- Extract: Include artists, Reference artists, BPM range, energy, mood, genres, duration
- Handle special inputs: Spotify playlist URLs, Beatport charts, Apple Music playlists

**Pass 2: Track Selection** (`lib/enhanced-track-selector.ts`)
- Select optimal tracks from filtered pool
- Consider: harmonic compatibility, energy flow, user preferences, popularity
- Prioritize user's liked songs and top artists

## Prompt Engineering

When building prompts for track selection:
- Include track metadata: name, artist, key, BPM, energy, mood, danceability
- Mark user's top artists with star emoji
- Mark liked songs with heart emoji for prioritization
- Emphasize "djay Pro automix" for transition focus
- Request structured JSON output

## Empty Constraint Handling

Claude may return `undefined` or `null` for unused constraints.
ALWAYS check before using:
```typescript
if (constraints.bpmRange?.min && constraints.bpmRange?.max) {
  // safe to use
}
```

## Smart Playlist Naming

`lib/playlist-namer.ts` uses Claude to generate creative names.
Include context about mood, artists, and duration for better names.
