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
│   └── Source: spotify-library-downloader sync-mix-generator script
│
├── apple-music-checkpoint.json # Apple Music matches (27k+)
│   └── Format: { lastIndex, matches: [{ appleMusicTrack, spotifyTrack }] }
│
├── apple-music-tracks.json     # Parsed Apple Music library (48k)
│   └── Source: Exported from Apple Music
│
└── apple-music-matched.json    # Legacy format (deprecated)
```

## Spotify Library Downloader Integration

The **[spotify-library-downloader](file:///Users/tombragg/spotify-library-downloader)** project automates the workflow for populating your DJ library:

### Data Pipeline

```
Spotify Library (Liked Songs + Playlists)
          ↓
  yt-dlp download via YouTube
          ↓
  ~/DJ Music/5-New-To-Analyze/
          ↓
  Mixed In Key analysis (BPM + Key detection)
          ↓
  ~/DJ Music/2-MIK-Analyzed/
          ↓
  npm run sync-mix-generator
          ↓
  ~/dj-mix-generator/data/matched-tracks.json  ← Used by playlist generator
```

### Key Scripts

| Script | Purpose |
|--------|---------|
| `npm run download-playlists-parallel` | Download all Spotify tracks (400 tracks/hour) |
| `npm run mik-watch` | Auto-move analyzed files |
| `npm run sync-mix-generator` | Export MIK data to this project |

### Documentation

See symlinked docs: [SPOTIFY-DOWNLOADER.md](./SPOTIFY-DOWNLOADER.md) (symlink to `~/spotify-library-downloader/README.md`)

**Note**: The symlink is gitignored - only exists on your local machine.

## Environment Variables

Required in `.env.local` and Vercel:
```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=https://dj-mix-generator.vercel.app/api/auth/callback
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
```

## DigitalOcean Cloud Deployment

### Server Details
- **Domain**: `https://mixmaster.mixtape.run/`
- **IP**: `129.212.248.171`
- **OS**: Ubuntu 24.04 LTS
- **Disk**: 80GB (upgraded from 50GB on Jan 5, 2026)
- **RAM**: 4GB
- **Stack**: Node.js 22, nginx (reverse proxy + SSL), PM2 (process manager), FFmpeg
- **Audio Analysis**: aubio (BPM), keyfinder-cli (musical key)
- **SSL**: Let's Encrypt (auto-renews via certbot)

### Deployment
```bash
# Deploy from local machine
./scripts/deploy-digitalocean.sh
```

### Server Management (SSH)
```bash
# Check app status
pm2 status

# View logs
pm2 logs notorious-dad

# Restart app
pm2 restart notorious-dad

# Check nginx
sudo systemctl status nginx

# Renew SSL (auto, but manual if needed)
sudo certbot renew
```

### Spotify Dashboard Configuration

**IMPORTANT**: Add both redirect URIs to your Spotify Developer Dashboard:

1. Go to https://developer.spotify.com/dashboard
2. Select your app → Settings → Edit
3. Add these Redirect URIs:
   - `https://dj-mix-generator.vercel.app/api/auth/callback` (Vercel)
   - `https://mixmaster.mixtape.run/api/auth/callback` (Cloud server)
4. Save changes

The server `.env.local` uses the cloud server redirect URI.

## Audio Library System (Server-Side)

The server hosts your actual audio files for mix generation (separate from Spotify playlist generation).

### Overview
- **Location**: `/var/www/notorious-dad/audio-library/`
- **Capacity**: ~9,400 files (under 20MB each)
- **Analysis**: BPM detection via aubio, key detection via keyfinder-cli
- **Data**: `/var/www/notorious-dad/data/audio-library-analysis.json`

### Uploading Audio Files
```bash
# From local machine - uploads MIK-analyzed files under 20MB
rsync -avz --progress --max-size=20M \
  "/Users/tombragg/Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed/" \
  root@129.212.248.171:/var/www/notorious-dad/audio-library/
```

### Server-Side Scripts
```bash
# Analyze all audio files (BPM detection)
bash /var/www/notorious-dad/scripts/analyze-library.sh

# Monitor and auto-restart analysis if it stops
bash /var/www/notorious-dad/scripts/monitor-analysis.sh
```

### Analysis Data Format
```json
{
  "tracks": [
    {
      "id": "track_1704567890_abc123",
      "filePath": "/var/www/notorious-dad/audio-library/Artist - Track.m4a",
      "fileName": "Artist - Track.m4a",
      "artist": "Artist",
      "title": "Track",
      "bpm": 128.0,
      "bpmConfidence": 0.8,
      "key": "Unknown",
      "camelotKey": "8A",
      "energy": 5,
      "duration": 240.5,
      "fileSize": 8500000,
      "analyzedAt": "2026-01-06T10:00:00Z"
    }
  ]
}
```

### Mix Generation API
```bash
# Generate a mix from audio library
curl -X POST https://mixmaster.mixtape.run/api/generate-mix \
  -H "Content-Type: application/json" \
  -d '{"prompt": "chill vibes for dinner", "duration": 60}'
```

### DigitalOcean API Management
A DigitalOcean API token is stored locally for server management:
- **File**: `.digitalocean-token` (gitignored)
- **Droplet ID**: 542000423
- **Size**: s-2vcpu-4gb (80GB disk, 4GB RAM, $24/mo)

```bash
# Check droplet status via API
curl -s -X GET "https://api.digitalocean.com/v2/droplets/542000423" \
  -H "Authorization: Bearer $(cat .digitalocean-token)"
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

## Versioning

All platforms use **semantic versioning** (MAJOR.MINOR.PATCH):

| Platform | Version | Location | Display |
|----------|---------|----------|---------|
| **Web App** | 2.1.0 | `package.json` | Footer on main page |
| **iOS App** | 2.1.0 | `Info.plist` | Settings → About → Version |
| **macOS App** | 2.1.0 | `Info.plist` | Settings → About → Version |

**Version History:**
- **2.1.0** (2026-01-07): Added streaming audio player + Mix Generator UI
- **2.0.0** (2026-01-01): Deterministic selection architecture
- **1.0.0** (2025-12-28): Initial MIK + Spotify integration

When incrementing versions, update all three files:
1. `package.json` → `"version"`
2. `NotoriousDAD-iOS/NotoriousDAD/Info.plist` → `CFBundleShortVersionString`
3. `NotoriousDAD-macOS/NotoriousDAD/Info.plist` → `CFBundleShortVersionString`

## Architecture Evolution

| Date | Change |
|------|--------|
| Jan 6, 2026 | Added server-side audio library with BPM analysis (aubio) |
| Jan 6, 2026 | Created Mix Generation API (`/api/generate-mix`) for audio mixes |
| Jan 6, 2026 | Added auto-restart monitor script for analysis reliability |
| Jan 5, 2026 | Resized DigitalOcean droplet to 80GB for full library storage |
| Jan 5, 2026 | Deployed audio upload pipeline with rsync |
| Jan 4, 2026 | Added Mix Generator UI to iOS and macOS apps |
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

### Features
1. **Playlist Generation** - Create Spotify playlists from natural language prompts
2. **Mix Generation** - Generate audio mixes from your uploaded library (server-side)
   - Style presets: Beach Day, Workout, Dinner Party, Late Night, Road Trip, House Party
   - Duration options: 30min, 1hr, 2hr
   - Auto-discovers server at `mixmaster.mixtape.run`

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
