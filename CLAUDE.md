# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 📌 Primary Reference

**GitHub Repository**: https://github.com/braggy9/dj-mix-generator

**Quick Start for New Sessions**:
```
Read project documentation from GitHub:
https://github.com/braggy9/dj-mix-generator/blob/main/CLAUDE.md
or local path: /Users/tombragg/dj-mix-generator/CLAUDE.md
```

**Repository Status** (Updated Jan 16, 2026):
- ✅ 22+ commits pushed successfully
- ✅ Build 10 changes included (iOS/macOS apps)
- ✅ Repository size: 317MB (cleaned)
- ✅ No large files in history
- ✅ Enhanced track database (9,982 tracks)

## Project Overview

**Notorious DAD** - A DJ mix generator that creates seamless, beatmatched playlists using your personal music library (MIK + Apple Music) with professional harmonic mixing. Designed for djay Pro automix.

### Related Projects
- **[Spotify Library Downloader](https://github.com/braggy9/spotify-library-downloader)** - Audio library management and MIK sync
  - Downloads tracks via YouTube (yt-dlp)
  - Mixed In Key analysis integration
  - Syncs MIK data to this project via `npm run sync-mix-generator`

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

### Two Distinct Systems

**IMPORTANT**: This project has TWO separate generation systems:

1. **Spotify Playlist Generator** (`/api/generate-playlist`)
   - Input: Natural language prompt
   - Uses: Apple Music matches (~40k tracks) + MIK metadata + Spotify catalog
   - Output: **Spotify playlist URL** (streaming links)
   - Can create playlists with ~48,000 tracks
   - No audio files needed

2. **Audio Mix Generator** (`/api/generate-mix`)
   - Input: Natural language prompt + track count
   - Uses: **ONLY files on Hetzner server** (29,024 files, 209GB)
   - Analyzed: 4,978 tracks (17%) with BPM/key/genre metadata
   - Output: **Downloadable MP3 mix file** (with crossfades)
   - Limited to tracks physically stored on server
   - Cannot use Spotify/Apple Music tracks
   - **Note**: Full library analysis in progress (28,000 files)

See `MIX-GENERATION-ANALYSIS.md` for detailed comparison and pipeline explanation.

### Playlist Generation Architecture (Metadata-Based)

The Spotify playlist generation uses a **hybrid approach**:
- **Claude AI** for NLP parsing (understanding prompts) and creative naming
- **Deterministic algorithms** for track selection (reliable, no AI guessing)
- **Camelot-based math** for harmonic ordering (professional DJ mixing)

### Data Sources

The system uses **YOUR personal music** from multiple sources:

| Source | File | Count | Purpose |
|--------|------|-------|---------|
| **MIK Library** | `data/matched-tracks.json` | 6,996 | Professional key/BPM analysis from Mixed In Key (70% match rate) |
| **Apple Music** | `data/apple-music-checkpoint.json` | 27,632+ | Your listening history with playcounts |
| **Spotify Search** | (runtime) | Variable | Tracks from Include artists |

**Total pool: 34,000+ tracks** from your personal libraries.
**Last sync:** January 7, 2026 - Processed 9,933 MIK tracks → 6,996 matched to Spotify

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

### Spotify Playlist Generation (Metadata-Based)
- `app/api/generate-playlist/route.ts` - Main endpoint (deterministic selection)
- `lib/playlist-nlp.ts` - NLP constraint extraction (Claude)
- `lib/automix-optimizer.ts` - Camelot-based harmonic ordering
- Uses: Apple Music matches + MIK metadata + Spotify catalog
- Output: Spotify playlist URL (streaming)

### Audio Mix Generation (File-Based)
- `app/api/generate-mix/route.ts` - Audio mix generation endpoint with genre filtering
- `lib/mix-engine.ts` - FFmpeg-based audio mixing with crossfades
- `lib/audio-library-indexer.ts` - Server audio library management
- `lib/beat-analyzer.ts` - BPM detection via aubio
- `scripts/add-genre-to-analysis.ts` - Genre extraction from audio file metadata (deployed Feb 9, 2026)
- `scripts/analyze-local-library.ts` - Portable analysis script for iCloud Drive files
- Uses: **ONLY files on Hetzner server** (29,024 files, 209GB)
- Output: Downloadable MP3 mix file
- **See**: `MIX-GENERATION-ANALYSIS.md` for detailed pipeline explanation

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

| Symlink | Source | Purpose |
|---------|--------|---------|
| [SPOTIFY-DOWNLOADER.md](./SPOTIFY-DOWNLOADER.md) | `~/spotify-library-downloader/README.md` | Main docs - features, usage, workflow |
| [SPOTIFY-AUTOMATION.md](./SPOTIFY-AUTOMATION.md) | `~/spotify-library-downloader/AUTOMATION.md` | launchd scheduling, daily automation |

**Note**: Symlinks are gitignored - only exist on your local machine.

### Syncing MIK Data to DJ Mix Generator

After MIK analyzes new tracks, update the playlist generator:

```bash
cd ~/spotify-library-downloader
npm run sync-mix-generator
```

This exports all MIK-analyzed tracks to `~/dj-mix-generator/data/matched-tracks.json` for playlist generation.

## Environment Variables

Required in `.env.local` and Vercel:
```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=https://dj-mix-generator.vercel.app/api/auth/callback
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
```

## 🌐 Digital Infrastructure (Three-Layer Architecture)

All three layers are active and connected:

### 1. GitHub (Source Code) ✅
- **Repository**: https://github.com/braggy9/dj-mix-generator
- **Status**: 22+ commits, clean history, no large files
- **Size**: 317MB (cleaned from ~800MB+)
- **Branch**: main
- **Includes**: All Build 10 changes, enhanced database, full documentation

### 2. Hetzner (Production Server) ✅
- **Primary URL**: https://mixmaster.mixtape.run/
- **Audio Library**: 14,382 files (141GB, growing to 26,237)
- **Track Database**: 9,982 tracks with full metadata
- **Purpose**: Audio mix generation, API backend
- **Stack**: Node.js 22, PM2, nginx, FFmpeg, aubio

### 3. Vercel (Web App) ⏳ Auto-Deploy
- **URL**: https://dj-mix-generator.vercel.app/
- **Status**: Auto-deploys from GitHub on code changes
- **Purpose**: Web interface for playlist generation
- **Deployment**: Automatic via GitHub integration

### 4. TestFlight (iOS App) 📱
- **Version**: 2.2.0 (Build 12)
- **Platform**: iOS (iPhone/iPad)
- **Status**: Archived, ready for upload
- **Features**: Playlist generation, audio mix generation, mashup finder, Spotify integration
- **Archive**: `builds/NotoriousDAD-Build12.xcarchive`

### 5. macOS App 💻
- **Version**: 2.2.0 (Build 12)
- **Platform**: macOS
- **Status**: Deployed to `/Applications/`
- **Features**: Same as iOS app

**Everything is connected and ready to share!**

---

## Hetzner Cloud Deployment

### Server Details
- **Domains**:
  - `https://mixmaster.mixtape.run/` (primary)
  - `https://mixtape.run/`
  - `https://www.mixtape.run/`
- **Provider**: Hetzner Cloud (migrated from DigitalOcean Jan 12, 2026)
- **Server**: CPX31 (€17.59/mo ~$19/mo)
- **Volume**: 100GB ext4 storage (€10/mo ~$11/mo)
- **Total Cost**: €27.59/mo (~$30/mo - saves $18/mo vs DigitalOcean)
- **IP**: 178.156.214.56
- **OS**: Ubuntu 24.04 LTS
- **Server Disk**: 160GB NVMe SSD (OS + app)
- **Audio Storage**: 100GB volume (mounted at /mnt/HC_Volume_104378843, symlinked to /var/www/notorious-dad/audio-library)
- **Total Storage**: 260GB (fits 249GB library with headroom)
- **RAM**: 8GB
- **CPU**: 4 vCPUs
- **Location**: Ashburn, VA (us-east)
- **Stack**: Node.js 22, nginx (reverse proxy), PM2 (process manager), FFmpeg
- **Audio Analysis**: aubio (BPM), MIK tag extraction
- **CDN/SSL**: Cloudflare (proxied, Flexible SSL mode)
- **DNS**: Cloudflare nameservers

### Migration Notes
- **Migrated**: January 12, 2026 (completed)
- **Reason**: Storage requirements (249GB audio library) + cost savings
- **Previous**: DigitalOcean 116GB disk @ $48/mo
- **Current**: Hetzner CPX31 + 100GB volume @ $30/mo
- **Savings**: $18/month ($216/year)
- **Data Migrated**: 112GB audio library (12,670 files) + analysis data

### Deployment
```bash
# Deploy from local machine
./scripts/deploy-hetzner.sh
```

**Important Build Note:** Next.js 16's Turbopack doesn't handle symlinks pointing outside the project root. The `audio-library` symlink causes build errors. Current workaround in deployment script:
```bash
# Temporarily move symlink during build
mv audio-library audio-library-temp
npm run build
mv audio-library-temp audio-library
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

**IMPORTANT**: Audio mix generation (`/api/generate-mix`) can **ONLY** use files stored on this server. It does NOT use Spotify/Apple Music tracks.

### Overview
- **Location**: `/var/www/notorious-dad/audio-library/` (symlink to `/mnt/HC_Volume_104378843`)
- **Total Files**: **29,024 files (209GB)** on Hetzner server
- **Analyzed**: **4,978 tracks (17%)** - remaining 24,046 tracks need analysis
- **Genre Tags**: **3,046 tracks (68% of analyzed)** - extracted Feb 9, 2026 via `add-genre-to-analysis.ts`
- **Size Limit**: Under 20MB per file (excludes large DJ mixes)
- **Storage**: 100GB volume with room to grow
- **Analysis**: BPM detection via aubio, key detection via MIK tags + keyfinder-cli, genre from ID3 tags
- **Data**: `/var/www/notorious-dad/data/audio-library-analysis.json`
- **Important**: Use `-L` flag with find/du to follow symlinks (e.g., `find -L /path` or `du -shL /path`)

### Uploading Audio Files
```bash
# From local machine - uploads MIK-analyzed files under 20MB
rsync -avz --progress --max-size=20M \
  "/Users/tombragg/Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed/" \
  root@178.156.214.56:/var/www/notorious-dad/audio-library/

# To upload ALL files (remove size limit) - needs sufficient storage
rsync -avz --progress \
  "/Users/tombragg/Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed/" \
  root@178.156.214.56:/var/www/notorious-dad/audio-library/
```

### Server-Side Scripts
```bash
# Analyze all audio files (BPM detection)
bash /var/www/notorious-dad/scripts/analyze-library.sh

# Monitor and auto-restart analysis if it stops
bash /var/www/notorious-dad/scripts/monitor-analysis.sh

# Extract genre tags from existing analyzed files (deployed Feb 9, 2026)
npx tsx /var/www/notorious-dad/scripts/add-genre-to-analysis.ts
```

### Portable Analysis (Other Mac via iCloud Drive)
```bash
# Run full library analysis on any Mac with iCloud Drive access
# See ANALYZE-ON-OTHER-MAC.md for complete setup instructions

cd ~/Desktop  # or wherever script is copied
tsx analyze-local-library.ts

# After completion (~8-15 hours for 28,000 files):
rsync -avz ~/Desktop/audio-library-analysis.json root@178.156.214.56:/var/www/notorious-dad/data/
ssh root@178.156.214.56 'cd /var/www/notorious-dad && pm2 restart notorious-dad'
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
      "analyzedAt": "2026-01-06T10:00:00Z",
      "genre": "House"  // NEW (v4): Added Feb 9, 2026 via add-genre-to-analysis.ts
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

## Mix Recipe Feature

The **Mix Recipe API** (`/api/mix-recipe`) analyzes Spotify playlists for DJ mixing:

### What it does:
- ✅ Analyzes harmonic compatibility between tracks
- ✅ Generates transition recommendations (key changes, BPM shifts)
- ✅ Creates cue sheets for djay Pro
- ✅ Exports mix notes in Markdown or JSON format
- ✅ Calculates mix difficulty score

### What it doesn't do:
- ❌ Generate actual audio files (only analysis/planning)
- ❌ Download Spotify tracks (uses Spotify API metadata only)

### Usage:
```
GET /api/mix-recipe?playlistId=spotify:playlist:xxxxx&format=json|markdown|cuesheet
POST /api/mix-recipe { tracks: [...], playlistName: "Mix" }
```

### Future enhancement:
To generate audio mixes from Spotify playlists, you'd need to:
1. Match playlist tracks to audio library files
2. Find which tracks exist locally
3. Pass matched local files to `/api/generate-mix`
4. Handle missing tracks gracefully

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

| Platform | Version | Build | Location | Display |
|----------|---------|-------|----------|---------|
| **Web App** | 2.2.0 | N/A | `package.json` | Footer on main page |
| **iOS App** | 2.2.0 | **20** | `Info.plist` CFBundleVersion | Settings → About → Version |
| **macOS App** | 2.2.0 | **13** | `Info.plist` CFBundleVersion | Settings → About → Version |

**Version History:**
- **2.2.0 Build 20** (2026-02-13): **Spotify Playlist Connection FIXED** - iOS Mix Generator now includes Spotify `refresh_token` when using playlist URL feature. Users can paste Spotify playlist URLs to generate audio mixes from those tracks. Loads token from bundled `spotify-tokens.json`. Synced with Phase 1 server enhancements (all 10 music theory improvements automatically available).
- **2.2.0 Build 19** (2026-02-10): **Download button FIXED** - Fixed filename extraction (now parses URL query parameter instead of temp name) and threading issue (completion handlers now dispatch to main thread). Share sheet now works correctly. Genre filtering from Build 18 remains deployed on server.
- **2.2.0 Build 18** (2026-02-09): Download button debug logging - added comprehensive emoji-prefixed logging to `AudioPlayerManager.swift` and `MixGeneratorViewRedesign.swift`, added red error banner UI, investigating download timeout issue. **Genre filtering fixed on server** - `add-genre-to-analysis.ts` deployed, 3,046 tracks tagged (68% of analyzed), `filterByGenre()` now uses actual metadata.
- **2.2.0 Build 16** (2026-01-23): Enhanced debugging and monitoring - fixed server health check endpoint, added comprehensive debug logging throughout mix generation pipeline, improved error handling and reporting. **Server deployment complete and verified working.**
- **2.2.0 Build 13** (2026-01-22): **CRITICAL FIX** - Enhanced database (9,982 tracks) now properly included in both apps, track library count corrected, Playlist Generator 401 auth issue identified (requires new Anthropic API key)
- **2.2.0 Build 12** (2026-01-21): Mashup Finder integration complete, Hetzner server fixed and stable, iOS archived for TestFlight, macOS deployed to /Applications/
- **2.2.0 Build 10** (2026-01-16): Fixed enhanced database integration (9,982 tracks), view title clarity, NotoriousDADKit Track model
- **2.2.0 Build 9** (2026-01-14): Mix duration fix, tab naming updates, Hetzner endpoint integration
- **2.2.0 Build 4** (2026-01-08): Electric Gold UI redesign - dark mode, larger touch targets, stepped flows, haptic feedback, prompt templates, error recovery with retry, mix duration slider
- **2.1.0 Build 2** (2026-01-07): Added streaming audio player + Mix Generator UI
- **2.0.0** (2026-01-01): Deterministic selection architecture
- **1.0.0** (2025-12-28): Initial MIK + Spotify integration

When incrementing versions, update all three files:
1. `package.json` → `"version"`
2. `NotoriousDAD-iOS/NotoriousDAD/Info.plist` → `CFBundleShortVersionString`
3. `NotoriousDAD-macOS/NotoriousDAD/Info.plist` → `CFBundleShortVersionString`

## Architecture Evolution

| Date | Change |
|------|--------|
| **Feb 13, 2026** | **Build 20 - Spotify Playlist Fix**: Fixed iOS Mix Generator to include `refresh_token` when using Spotify playlist URLs. Added `loadSpotifyRefreshToken()` helper function to load token from bundled `spotify-tokens.json`. Now users can paste Spotify playlist URLs and generate audio mixes from those tracks. Also confirmed iOS/macOS apps are up-to-date with Phase 1 server enhancements (no client code changes needed - all improvements are server-side). |
| **Feb 9, 2026** | **Genre Filtering Fix**: Created `scripts/add-genre-to-analysis.ts` to extract genre tags from audio file metadata via ffprobe. Ran on server: 3,046 tracks (68% of analyzed) now have genre tags. Updated `app/api/generate-mix/route.ts` `filterByGenre()` to use actual genre tags instead of AI guessing. Tested successfully: "disco tracks" prompt now finds 27 tracks vs 0 before. |
| **Feb 9, 2026** | **Genre Data Structure**: Added `genre?: string` field to CloudAudioTrack interface, passed through `cloudTrackToIndexed()` function, with genre aliases (house → deep house, tech house, etc.) for flexible matching. Falls back to Claude AI only for tracks without genre tags. |
| **Feb 9, 2026** | **Build 18**: Added comprehensive debug logging to iOS download button (`AudioPlayerManager.swift` and `MixGeneratorViewRedesign.swift`) with emoji prefixes for easy Console.app filtering. Added red error banner UI to display download failures. Investigating download timeout issue. |
| **Feb 9, 2026** | **Portable Analysis Script**: Created `scripts/analyze-local-library.ts` for running full library analysis on other Mac via iCloud Drive. Analyzes ~28,000 files (8-15 hours), extracts genre/duration/artist/title/BPM from tags, saves to Desktop, with rsync upload command. Documentation in `ANALYZE-ON-OTHER-MAC.md`. |
| **Feb 9, 2026** | **Library Status Documented**: Hetzner server has 29,024 files (209GB) but only 4,978 analyzed (17%). Identified 24,046 unanalyzed tracks. No background processes running. Local MIK-Analyzed has 27,995 files (33GB). Server has +1,029 additional files and +176GB more data. |
| **Feb 9, 2026** | **Genre Distribution**: Top genres in analyzed portion: Alternative (555), Electronic (404), Pop (307), Indie (236), Rock (221), Dance (185), Disco/Nu-Disco (27). Limited disco/house content identified. |
| Jan 23, 2026 | **Build 16**: Enhanced debugging/monitoring - fixed health check endpoint, comprehensive logging, improved error handling |
| Jan 22, 2026 | **Build 13**: Critical database fix - enhanced database (9,982 tracks) properly bundled in apps, Playlist Generator API key issue identified |
| Jan 21, 2026 | **Build 12**: Mashup Finder deployed to iOS/macOS, Hetzner server rebuilt and stable, enhanced database confirmed working |
| Jan 16, 2026 | **Build 10**: Fixed LibraryManager to load enhanced-track-database.json (9,982 tracks) |
| Jan 16, 2026 | Updated iOS/macOS apps with NotoriousDADKit Track model integration |
| Jan 16, 2026 | Fixed view titles: "Create Mix" → "Generate Playlist", "Audio Mix" → "Mix" |
| Jan 16, 2026 | Bundled enhanced track database in iOS/macOS apps for offline use |
| Jan 16, 2026 | Fixed duplicate ThemedTextField error in consolidated ContentView.swift |
| Jan 8, 2026 | Added SpotifyPlaybackManager for deep link playback (opens playlists in Spotify app) |
| Jan 8, 2026 | Added server-side user APIs (`/api/user/templates`, `/api/user/history`) for cross-device sync |
| Jan 8, 2026 | Added HistoryManager for tracking generation history (syncs to server) |
| Jan 8, 2026 | Replaced CloudKit with DigitalOcean server-side storage (architectural consistency) |
| Jan 8, 2026 | Added background refresh with BGTaskScheduler (auto-refresh every 6h) |
| Jan 8, 2026 | Added DJ filters: Key (Camelot wheel) and BPM range with genre presets |
| Jan 8, 2026 | Added CacheManager for offline library access (~50ms startup vs ~2s) |
| Jan 8, 2026 | Added mix duration slider (presets + custom 8-60 tracks) |
| Jan 8, 2026 | Added NetworkManager with exponential backoff retry logic |
| Jan 8, 2026 | Added error recovery UI with retry buttons for retryable errors |
| Jan 8, 2026 | Added HapticManager for consistent iOS haptic feedback |
| Jan 8, 2026 | Added PromptTemplate system with save/load/delete and 4 default templates |
| Jan 8, 2026 | Applied Electric Gold theme to macOS app |
| Jan 8, 2026 | **v2.2.0**: Complete UI/UX redesign with Electric Gold theme |
| Jan 8, 2026 | Deployed iOS app to TestFlight (v2.2.0 build 4) |
| Jan 8, 2026 | Added AppTheme design system (colors, typography, spacing, animations) |
| Jan 8, 2026 | Redesigned all views: GenerateView, MixGeneratorView, LibraryView, SettingsView |
| Jan 8, 2026 | New app icon: vinyl record with gold label and waveform accent |
| Jan 7, 2026 | Deployed iOS app to TestFlight (v2.1.0 build 2) |
| Jan 7, 2026 | Synced MIK library: 6,996 tracks (70% match rate from 9,933 MIK files) |
| Jan 7, 2026 | Fixed DigitalOcean deployment to include matched-tracks.json |
| Jan 7, 2026 | Removed alpha channel from iOS app icon for TestFlight compliance |
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

## NotoriousDADKit (Swift Package)

Located at `/Users/tombragg/dj-mix-generator/NotoriousDADKit` - a local Swift Package that provides shared models and logic for iOS/macOS apps.

**Purpose**: Centralize core data structures and business logic to maintain consistency across platforms.

**Key Components**:

**Models** (`Sources/NotoriousDADKit/Models/`):
- `Track.swift` - Main track model with all metadata (Spotify ID, MIK data, audio features)
- `Constraints.swift` - Playlist generation constraints (BPM range, energy, mood)
- `Playlist.swift` - Playlist metadata and track collections

**Track Model Structure**:
```swift
public struct Track: Identifiable, Codable, Sendable {
    public let id: String             // Spotify ID
    public let uri: String            // Spotify URI
    public let name: String
    public let artists: [String]
    public let album: String
    public let durationMs: Int
    public let popularity: Int?       // 0-100
    public var source: TrackSource    // .mikLibrary, .spotifyLibrary, etc.
    public var mikData: MIKData?      // MIK analysis (key, BPM, energy)
    public var audioFeatures: AudioFeatures?  // Spotify features
    public var camelotKey: String?
    public var appleMusicPlayCount: Int
    public var selectionScore: Double
}
```

**MIK Data**:
```swift
public struct MIKData: Codable, Sendable {
    public let key: String?      // Camelot key (e.g., "8A", "11B")
    public let bpm: Double?
    public let energy: Int?      // 1-10 scale
    public let cuePoints: [Double]?
}
```

**Track Sources**:
```swift
public enum TrackSource: String, Codable {
    case mikLibrary        // MIK-analyzed files
    case appleMusic        // Apple Music matches
    case spotifySearch     // Spotify catalog search
    case spotifyLibrary    // User's Spotify library
    case recommendations   // Spotify recommendations
}
```

**Camelot Wheel** (`Sources/NotoriousDADKit/Camelot/`):
- Harmonic mixing compatibility calculations
- Key transition analysis for DJ mixing

**Selection Engine** (`Sources/NotoriousDADKit/Selection/`):
- Track selection algorithms
- Harmonic optimization for smooth transitions

**Integration**:
- iOS app: `import NotoriousDADKit` in LibraryManager, SpotifyManager
- macOS app: Same shared package via Xcode local package reference
- Ensures model consistency between platforms

## iOS/macOS Native Apps

Both native apps use the same architecture and authentication pattern, sharing models via NotoriousDADKit.

### Features
1. **Playlist Generation** - Create Spotify playlists from natural language prompts
2. **Mix Generation** - Generate audio mixes from your uploaded library (server-side)
   - Style presets: Beach Day, Workout, Dinner Party, Late Night, Road Trip, House Party
   - Duration: Presets (30min, 1hr, 2hr) + custom slider (8-60 tracks)
   - Auto-discovers server at `mixmaster.mixtape.run`
   - **NEW (v2.2.0 Build 10):** Spotify playlist integration - paste playlist URL to generate mix from those tracks (backend integrated Jan 16, 2026)
3. **Prompt Templates** - Save and load favorite prompt configurations
   - 4 default templates: Workout, Dinner Party, House Party, Sunset Session
   - Save current settings as new templates
   - Long-press to delete custom templates
4. **Error Recovery** - Smart retry with exponential backoff
   - Automatic retry for network/timeout errors (3 attempts)
   - Manual retry button for user-initiated recovery
   - Non-retryable errors (auth, invalid input) skip retry
5. **Haptic Feedback** - Consistent tactile feedback throughout
   - Light taps for selections/toggles
   - Medium taps for button presses
   - Success/error notifications for generation results
6. **Offline Cache** - Instant startup with cached library
   - Tracks cached to disk for offline access
   - ~50ms load time vs ~2s from bundle
   - Auto-refresh when cache is >24h old
7. **DJ Filters** - Filter library by Key and BPM
   - Camelot wheel key selection (1A-12A, 1B-12B)
   - BPM range slider with genre presets (House/Techno/D&B)
   - Active filter pills with quick-remove
8. **Background Refresh** - Keep library up to date
   - BGTaskScheduler for iOS background refresh
   - Automatic refresh every 6 hours when app is backgrounded
   - Refresh on app activation if cache is stale
9. **Background Audio Playback** - **NEW (v2.2.0 Build 6)**
   - Music continues when app is backgrounded or screen locked
   - Lock screen controls (play/pause, skip)
   - Support for AirPlay and Bluetooth audio
10. **Background Mix Generation** - **NEW (v2.2.0 Build 6)**
    - Mix generation continues in background (~3-5 min for 1-hour mix)
    - Push notification when complete
    - Extended timeout (20 minutes) for long mixes
11. **Expandable Tracklist** - **NEW (v2.2.0 Build 6)**
    - Tap "+ X more tracks" to see full tracklist
    - View all tracks with BPM and key info
    - Useful for DJ reference and harmonic mixing

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
- `NotoriousDAD-iOS/NotoriousDAD/Services/SpotifyPlaybackManager.swift` - Deep link playback (opens Spotify app)
- `NotoriousDAD-iOS/NotoriousDAD/Services/TemplateManager` - Prompt templates (syncs to server)
- `NotoriousDAD-iOS/NotoriousDAD/Services/HistoryManager` - Generation history (syncs to server)
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

### Electric Gold Design System (v2.2.0)

The iOS app uses a custom design system defined in `AppTheme.swift`:

**Color Palette:**
| Token | Value | Usage |
|-------|-------|-------|
| `gold` | #FFD700 | Primary accent, buttons, selected states |
| `goldDeep` | #D9A522 | Gradient endpoints, hover states |
| `background` | #0F0F14 | Main screen background |
| `surface` | #1A1A1E | Cards, list items |
| `surfaceElevated` | #242428 | Modals, elevated cards |
| `textPrimary` | #FFFFFF | Headings, primary text |
| `textSecondary` | #A6A6A6 | Captions, metadata |
| `accentCyan` | #33CCEE | MIK data indicators |
| `accentPink` | #FF6699 | Apple Music indicators |

**Typography:** System rounded fonts (SF Pro Rounded) for friendly, modern feel.

**Spacing Scale:** `xxs(4)`, `xs(8)`, `sm(12)`, `md(16)`, `lg(24)`, `xl(32)`, `xxl(48)`

**Touch Targets:** Minimum 60pt height for all interactive elements.

**Key Components:**
- `PrimaryButtonStyle` - Gold gradient with press animation
- `SecondaryButtonStyle` - Gold outline with translucent fill
- `CardStyle` - Surface background with rounded corners
- `GoldGradient` - Reusable gold gradient modifier

### TestFlight Deployment

**Latest:** iOS Build 10 (Jan 16, 2026)
- **Version:** 2.2.0 (Build 10)
- **Platform:** iOS (iPhone/iPad)
- **Access:** Internal testing (up to 100 testers)
- **Changes:** Enhanced database (9,982 tracks), fixed view titles, NotoriousDADKit integration

**Previous Builds:**
- Build 9: Tab naming fixes, Hetzner endpoint
- Build 4: Electric Gold UI redesign

**TestFlight Process:**
1. Archive app in Xcode (Product → Archive)
2. Upload via Organizer → Distribute App → App Store Connect
3. Wait for processing (~5-10 minutes)
4. Add testers in App Store Connect → TestFlight tab
5. Testers receive invite via TestFlight app

**Common Issues Fixed:**
- ❌ App icon alpha channel → Use sips to convert JPEG→PNG
- ❌ Build warnings → Fix unused variables
- ❌ Uncommitted changes → Commit before archiving

---

## ⚠️ Known Issues - Xcode Cloud

### Xcode Cloud Continuous Failures (Jan 23, 2026)
**Status:** ⚠️ NON-BLOCKING - False positive errors

**Symptoms:** Email notifications for failed builds (Build 10, 11, 12...) on every Git push

**Cause:** Xcode Cloud configured with incorrect scheme names:
- Expects: `NotoriousDAD`
- Actual: `NotoriousDAD-iOS`, `NotoriousDAD-macOS`

**Impact:** NONE - These are CI build failures only. All production systems working:
- ✅ iOS app (Build 16) working
- ✅ Server healthy and operational
- ✅ All APIs functional

**Fix:** Disable Xcode Cloud via App Store Connect (see `XCODE-CLOUD-DISABLE.md`)

---

## Known Issues

### ✅ FIXED: iOS Download Button Not Working (2026-02-10)

**Issue**: Download button didn't work - download completed to 100% but showed black screen instead of share sheet.

**Root Causes Found:**
1. **Filename extraction**: Code tried to use temp download name (`CFNetworkDownload_qgG3B1.tmp`) instead of extracting actual filename from URL query parameter
2. **Threading issue**: URLSession delegate callbacks happen on background thread, but completion handler updated SwiftUI @Published properties without dispatching to main thread → black screen/hang

**Fix Applied** (Build 19):
1. **Filename extraction** (`AudioPlayerManager.swift:165-183`):
   - Store original download URL in `downloadURL` property
   - Extract `file` query parameter from URL (`?file=House-Mix.mp3`)
   - Use extracted filename as destination instead of temp name

2. **Threading fix** (`AudioPlayerManager.swift:186-195`):
   - Wrap all completion handler calls in `DispatchQueue.main.async`
   - All SwiftUI state updates now happen on main thread
   - Share sheet displays correctly

**Files Modified:**
- `NotoriousDAD-iOS/NotoriousDAD/Services/AudioPlayerManager.swift`

**Status**: ✅ FIXED - Download completes, filename correct, share sheet appears (awaiting final user test)

### ✅ FIXED: Genre Mismatch (House/Disco → Indie/Electronic) (2026-02-09)

**Issue**: Mix requested "upbeat house and disco" but generated indie/electronic tracks.

**Root Cause**: Audio library analysis didn't extract genre tags from files. `filterByGenre()` sent track list to Claude AI to guess genres from artist names only.

**Fix Applied**:
1. Created `scripts/add-genre-to-analysis.ts` - extracts genre from audio file metadata via ffprobe
2. Ran on server - added genre tags to 3,046 tracks (68% of analyzed tracks)
3. Updated `app/api/generate-mix/route.ts` - `filterByGenre()` now uses actual genre tags
4. Deployed to server and tested successfully

**Results**:
- Test prompt "disco tracks" now finds 27 disco tracks (vs 0 before)
- Genre filtering works correctly
- **Caveat**: Only 4,978 tracks analyzed out of 29,024 total on server (17%)
- Full library analysis running on other Mac (~8-15 hours for 28,000 files)

**Genre Distribution (analyzed portion)**:
- Alternative: 555 tracks
- Electronic: 404 tracks
- Pop: 307 tracks
- Indie: 236 tracks
- Rock: 221 tracks
- Dance: 185 tracks
- Disco/Nu-Disco: 27 tracks (limited)

### ⚠️ LOW PRIORITY: Anthropic API Key Expired (2026-02-09)

**Issue**: Playlist Generator shows 401 authentication error.

**Affects**:
- **Spotify Playlist Generator** (`/api/generate-playlist`) - Creates Spotify playlist URLs
- Does NOT affect Mix Generator (audio MP3 files)

**Fix Needed**: Get new API key from console.anthropic.com and update `.env.local`:
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

**Status**: Not urgent - Mix Generator (primary feature) works fine. Playlist Generator is separate feature.

### ✅ FIXED: Audio Mix Duration Issue (2026-01-14)

**Issue**: Audio mixes were only 10-11 minutes long instead of requested 1 hour.

**Root Cause**: Server audio library analysis file (`data/audio-library-analysis.json`) had corrupted duration data - all tracks showed `duration: 0.0`.

**Fix Applied**:
1. Re-analyzed all 4,978 existing tracks with ffprobe
2. Fixed durations: Average now 247 seconds (4.1 minutes per track)
3. Added ~8,660 missing tracks from Hetzner volume to analysis file
4. Total library now: **13,638 tracks** (up from 4,978)

**Expected Mix Durations Now**:
- 30 min request (12 tracks): ~35-40 min output ✅
- 1 hour request (20 tracks): ~65-80 min output ✅
- 2 hour request (40 tracks): ~130-160 min output ✅

**Server**: Hetzner CPX31 + 100GB volume @ `mixmaster.mixtape.run`

### ✅ FIXED: iOS App Library Connection (2026-01-14)

**Issue**: iOS app still pointing to old Vercel endpoint, missing 3,000 tracks.

**Fix**: Updated `LibraryManager.swift:154`:
- **Old**: `https://dj-mix-generator.vercel.app/api` (6,996 tracks)
- **New**: `https://mixmaster.mixtape.run/api` (9,982 tracks)

**Deployment**: Will be in Build 9 on TestFlight

### ✅ FIXED: iOS App Tab Naming Confusion (2026-01-14)

**Issue**: Both tabs mentioned "mix" - users couldn't distinguish between Spotify playlist generation vs audio mix generation.

**Fix**: Renamed tabs for clarity:
- Tab 0: ~~"Create"~~ → **"Playlist"** (Spotify streaming playlists, ~48k tracks)
- Tab 1: ~~"Audio Mix"~~ → **"Mix"** (Downloadable MP3 files, server files only)
- Tab 2: ~~"Library"~~ → **"Tracks"** (Browse your track library)

**Deployment**: Build 10 on TestFlight (2026-01-16)

### ✅ FIXED: iOS App Track Database Issues (2026-01-16)

**Issue**: Build 9 showed incorrect track counts and view titles:
- Track count: 6,886 (should be 9,982)
- MIK tracks: 8,176 (should be ~9,792)
- Tab 0 title: "Create Mix" (should be "Generate Playlist")
- Tab 1 title: "Audio Mix" (should be "Mix")

**Root Causes**:
1. Old `matched-tracks.json` bundled instead of `enhanced-track-database.json`
2. LibraryManager using incompatible parser for new database format
3. View titles not updated in ContentView.swift
4. NotoriousDADKit Track model parameters mismatched

**Fix Applied** (Build 10):
1. Bundled `enhanced-track-database.json` (9,982 tracks) in iOS/macOS apps
2. Updated LibraryManager.parseEnhancedTracks() to use NotoriousDADKit.Track model
3. Fixed view titles throughout ContentView.swift
4. Properly mapped energy scale (0.0-1.0 → 0-10) and TrackSource enums

**Build 10 Changes**:
- iOS: CFBundleVersion 9 → 10
- macOS: CFBundleVersion 9 → 10
- Enhanced database parser with proper Track/MIKData/TrackSource types
- All view titles updated for clarity

**Deployment**: Build 10 on TestFlight (2026-01-16)

### ✅ FIXED: GitHub Push Unblocked (2026-01-16)

**Issue (RESOLVED):** Large files were blocking GitHub push:
- `apple-music-checkpoint.json.backup` (351 MB)
- SpotifyAPI pack files (71 MB)

**Solution Applied:**
Used `git-filter-repo` to strip all blobs >50MB from entire git history:
```bash
git filter-repo --strip-blobs-bigger-than 50M --force
git push origin main --force
```

**Current Status:**
- ✅ GitHub repository: `https://github.com/braggy9/dj-mix-generator.git`
- ✅ All 21 commits pushed successfully
- ✅ Repository size: 317MB (cleaned)
- ✅ No large files remaining in history
- ✅ Vercel will auto-deploy latest code on next push

**Repository Access:**
- Public URL: https://github.com/braggy9/dj-mix-generator
- Clone: `git clone https://github.com/braggy9/dj-mix-generator.git`
- For other Claude sessions: Reference this GitHub URL or local path `/Users/tombragg/dj-mix-generator/CLAUDE.md`

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
