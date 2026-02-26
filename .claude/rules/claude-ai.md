# Claude AI Integration Patterns

## Models Used

- **NLP Constraint Extraction**: Claude Sonnet (via `@anthropic-ai/sdk`)
- **Playlist Naming**: Claude Sonnet
- Context window: ~200K tokens (enough for 500+ tracks with metadata)

## Two-Pass System (Playlist Generator)

**Pass 1: Constraint Extraction** (`lib/playlist-nlp.ts`)
- Parse natural language prompts into structured constraints
- Extract: Include artists, Reference artists, BPM range, energy, mood, genres, duration
- Handle special inputs: Spotify playlist URLs, Beatport charts

**Pass 2: Deterministic Selection** (`app/api/generate-playlist/route.ts`)
- Score tracks deterministically (no AI) using constraints from Pass 1
- Consider: harmonic compatibility, energy flow, BPM range, genre
- Track selection is NOT AI-based — it's a scoring algorithm

## Mix Generation NLP

The audio mix generator (`app/api/generate-mix/route.ts`) also uses Claude for:
- Parsing natural language prompts into track selection constraints
- Same constraint extraction pattern as playlist generator

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

## AI NOT Used For

- Track selection (deterministic scoring algorithm)
- Audio mixing (FFmpeg filter chains)
- Beat analysis (FFmpeg raw audio processing)
- Transition decisions (segment-aware rules)
