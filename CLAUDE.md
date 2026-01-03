# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Notorious DAD** - A DJ mix generator that creates seamless, beatmatched playlists using your personal music library (MIK + Apple Music) with professional harmonic mixing. Designed for djay Pro automix.

## Development Commands

```bash
# Development
npm run dev              # Start dev server at http://localhost:3000

# Production
npm run build           # Build for production
npm start              # Run production build

# Linting
npm run lint           # Run ESLint

# Apple Music Matching (run after re-authenticating)
npx tsx scripts/match-apple-music-v2.ts
```

## Core Architecture (v2.0 - Deterministic)

### Architecture Overview

The playlist generation uses a **hybrid approach**:
- **Claude AI** for NLP parsing (understanding prompts) and creative naming
- **Deterministic algorithms** for track selection (reliable, no AI guessing)
- **Camelot-based math** for harmonic ordering (professional DJ mixing)

### Data Sources

The system uses **YOUR personal music** from multiple sources:

| Source | File | Count | Purpose |
|--------|------|-------|---------|
| **MIK Library** | `data/matched-tracks.json` | 4,080 | Professional key/BPM analysis from Mixed In Key |
| **Apple Music** | `data/apple-music-checkpoint.json` | 27,632+ | Your listening history with playcounts |
| **Spotify Search** | (runtime) | Variable | Tracks from Include artists |

**Total pool: 30,000+ tracks** from your personal libraries.

### Selection Score Algorithm

Tracks are scored deterministically (no AI):

```
Selection Score = sum of:
- Apple Music playcount (0-40 points) - what you ACTUALLY play
- MIK data presence (20 points) - professional analysis available
- Constraint match (0-20 points) - fits BPM/energy requirements
- Artist match (20 points) - Include artists get priority
- Random factor (0-10 points) - variety
```

### Two-Phase Quality Approach

**Phase 1 - Selection**: Picks tracks weighted by personal listening habits (playcounts) and artist preferences. Include artists get strong priority (20 points + Spotify search).

**Phase 2 - Ordering**: After selection, tracks are reordered using `optimizeTrackOrder()` with `prioritizeHarmonic: true` for Camelot-based harmonic mixing and smooth BPM transitions.

> **Note**: Include artists are heavily weighted in selection. For a more balanced mix, use fewer Include artists or use them as Reference artists instead.

### Variety Enforcement

- Maximum 3 tracks per artist
- Minimum 10 different artists per playlist
- Include artists get 3 tracks each, rest filled with variety

### Pipeline Flow

```
1. Load Data Sources
   ├── MIK Library (4,080 tracks)
   └── Apple Music Checkpoint (27,632+ tracks)

2. Parse Constraints (Claude AI)
   └── Extract: Include artists, BPM, energy, mood, duration

3. Search Spotify (for Include artists)
   └── Add up to 30 tracks per Include artist

4. Calculate Selection Scores (deterministic)
   └── Score each track based on playcount, MIK data, constraints

5. Select Tracks (deterministic)
   ├── First pass: Add Include artist tracks (3 each)
   └── Second pass: Fill with highest-scored tracks (variety enforced)

6. Optimize Order (Camelot algorithm)
   └── Arrange for best harmonic transitions

7. Create Playlist
   ├── Generate name (Claude AI)
   ├── Generate cover art (DALL-E)
   └── Create in Spotify
```

## Key Files

### Playlist Generation
- `app/api/generate-playlist/route.ts` - Main endpoint (deterministic selection)
- `lib/playlist-nlp.ts` - NLP constraint extraction (Claude)
- `lib/automix-optimizer.ts` - Camelot-based harmonic ordering

### DJ Features
- `lib/camelot-wheel.ts` - Harmonic mixing compatibility
- `lib/mik-csv-parser.ts` - Parse Mixed In Key CSV exports

### Data Processing
- `scripts/match-apple-music-v2.ts` - Match Apple Music → Spotify
- `lib/token-manager.ts` - Spotify token management for scripts

### Creative Output
- `lib/playlist-namer.ts` - AI-generated playlist names
- `lib/cover-art-generator.ts` - AI cover art via DALL-E

## Data Files

```
data/
├── matched-tracks.json         # MIK library (4,080 tracks)
│   └── Format: { tracks: [{ spotifyTrack, mikData }] }
│
├── apple-music-checkpoint.json # Apple Music matches (27k+)
│   └── Format: { lastIndex, matches: [{ appleMusicTrack, spotifyTrack }] }
│
├── apple-music-tracks.json     # Parsed Apple Music library (48k)
│   └── Source: Exported from Apple Music
│
└── apple-music-matched.json    # Legacy format (deprecated)
```

## Environment Variables

Required in `.env.local` and Vercel:
```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=https://dj-mix-generator.vercel.app/api/auth/callback
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
```

## Apple Music Matching

### Current Status (Updated 2026-01-03)
- Total Apple Music tracks: 48,474
- Matched to Spotify: ~40,000 (82%+)
- With playcounts: ~7,000+
- Remaining to match: ~8,500

### Running the Matcher

1. Authenticate via web app (creates fresh tokens in `.spotify-token.json`)
2. Run: `npx tsx scripts/match-apple-music-v2.ts`
3. Progress saved to `data/apple-music-checkpoint.json`

### Rate Limits
- Matcher handles 429 (rate limit) automatically
- Saves progress every 100 tracks
- Can resume from checkpoint

## Include vs Reference Artists

**Include Artists** (MUST appear):
- Parsed from prompt: "Include: Fred again, Disclosure"
- 3 tracks per Include artist guaranteed
- Searched via Spotify catalog

**Reference Artists** (style guide):
- Parsed from prompt: "Reference: Chemical Brothers"
- Influence scoring but not required
- Used for similar artist discovery

## Playlist Naming Convention

All playlists prefixed with: `🎧 DAD: [Creative Name]`

Example: `🎧 DAD: Midnight Frequencies`

## Common Operations

### Generate a Playlist
```
Prompt: "Include: Fred again, Disclosure. 30 tracks. Energy: build"
```

### Check Logs
```bash
vercel logs dj-mix-generator.vercel.app --since 5m
```

### Deploy
```bash
./scripts/deploy.sh
```

## Architecture Evolution

| Date | Change |
|------|--------|
| Jan 3, 2026 | Fixed native app auth: parse request body once, accept tokens from body |
| Jan 3, 2026 | Added macOS app with same architecture as iOS |
| Jan 3, 2026 | Fixed artist null check in selection scoring |
| Jan 1, 2026 | **v2.0**: Switched to deterministic selection (removed Claude from track picking) |
| Jan 1, 2026 | Added Apple Music playcount weighting |
| Jan 1, 2026 | Integrated full Apple Music checkpoint (27k+ tracks) |
| Dec 31, 2025 | Added Spotify catalog search for Include artists |
| Dec 28, 2025 | Initial MIK + Spotify integration |

## iOS/macOS Native Apps

Both native apps use the same architecture and authentication pattern.

### Authentication Solution (2026-01-03)

**Problem**: Web API uses cookie-based auth, but native iOS/macOS apps can't use browser cookies.

**Solution**: Native apps send `refresh_token` directly in API request body:
```swift
let body: [String: Any] = [
    "prompt": prompt,
    "refresh_token": "AQB1..." // Long-lived refresh token
]
```

**API Implementation** (`app/api/generate-playlist/route.ts`):
1. Parse request body ONCE (critical - body stream can only be consumed once)
2. Try cookies first (web app)
3. Fall back to tokens from body (native apps)
4. Use refresh_token to get fresh access_token

### NotoriousDAD-iOS

Native SwiftUI app located in `NotoriousDAD-iOS/` directory.

**Key Files**:
- `NotoriousDAD-iOS/NotoriousDAD/Services/SpotifyManager.swift` - Spotify auth management
- `NotoriousDAD-iOS/NotoriousDAD/Views/ContentView.swift` - Main UI and API calls
- `NotoriousDAD-iOS/NotoriousDAD/Resources/spotify-tokens.json` - Bundled refresh token

**Building**:
```bash
cd NotoriousDAD-iOS
open NotoriousDAD.xcodeproj
# Build and run to device (requires Apple Developer account)
```

### NotoriousDAD-macOS

Native SwiftUI app located in `NotoriousDAD-macOS/` directory.

**Key Files**:
- `NotoriousDAD-macOS/NotoriousDAD/Views/ContentView.swift` - Main UI and API calls
- `NotoriousDAD-macOS/NotoriousDAD/Resources/spotify-tokens.json` - Bundled refresh token

**Building**:
```bash
cd NotoriousDAD-macOS
open NotoriousDAD.xcodeproj
# Build and run
```

Or via command line:
```bash
xcodebuild -project NotoriousDAD-macOS/NotoriousDAD.xcodeproj \
  -scheme "NotoriousDAD-macOS" -configuration Release build
```

### Token Setup (Both Apps)

Both apps include a bundled `spotify-tokens.json` with refresh_token. To update:
1. Authenticate via web app to get fresh tokens
2. Export tokens to app's `Resources/spotify-tokens.json`
3. Rebuild and reinstall app

**Note**: Spotify refresh tokens don't expire unless revoked by the user.

---

## Debugging

### Check Data Loading
Look for these logs in Vercel:
```
📦 STEP 1: Loading data sources...
  ✓ MIK Library: 4,080 tracks
  ✓ Apple Music: 27,632 matched tracks (X with playcounts)
  📊 Total pool: ~30,000 tracks
```

### Check Selection
```
🎯 STEP 5: Selecting tracks with variety enforcement...
  ✓ Added X tracks from Include artists
  ✓ Selected 30 tracks
  🎨 Artist variety: 15+ unique artists
```

### Common Issues

1. **"No MIK data found"**: Check `data/matched-tracks.json` exists and is valid JSON
2. **"No Apple Music checkpoint"**: Run matching script or check file path
3. **Token expired**: Re-authenticate via web app, then run scripts
