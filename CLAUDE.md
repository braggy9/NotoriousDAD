# CLAUDE.md — Notorious DAD

DJ mix generator with two core features: Spotify playlist generation (web/Vercel) and audio mix generation (Hetzner server).

**GitHub**: https://github.com/braggy9/NotoriousDAD
**Version**: 2.3.0 | **Stack**: Next.js 16, TypeScript, Tailwind CSS

## Commands

```bash
npm run dev          # Dev server at http://localhost:3000
npm run build        # Production build (Turbopack)
npm run lint         # ESLint
```

## Two Core Systems

### 1. Spotify Playlist Generator (`/api/generate-playlist`)
- **Input**: Natural language prompt (e.g. "Include: Fred again. 30 tracks. Energy: build")
- **Process**: Claude NLP parses constraints → deterministic scoring → Camelot harmonic ordering → Spotify playlist creation
- **Data**: MIK library (9,777 tracks) + Apple Music matches (~40K) + Spotify search
- **Output**: Spotify playlist URL
- **Deploy**: Vercel (auto-deploy from GitHub)

### 2. Audio Mix Generator (`/api/generate-mix`)
- **Input**: Natural language prompt + track count
- **Process**: Constraint parsing → track selection → beat analysis → FFmpeg mixing with pro transitions
- **Data**: Cloud library JSON (`data/audio-library-analysis.json`) — 16,383 tracks, 196GB audio files on Hetzner
- **Output**: Downloadable MP3 mix file
- **Deploy**: Hetzner server at `mixmaster.mixtape.run`

## Mix Engine Architecture

The audio mix engine (`lib/mix-engine.ts`) uses FFmpeg for professional-quality transitions:

- **Lossless intermediaries**: WAV between transitions, single MP3 encode at final output
- **EBU R128 loudness normalization**: All tracks normalized to -14 LUFS (Spotify standard)
- **Animated filter sweep**: Time-varying dry/wet crossfade simulating DJ high-pass filter knob
- **EQ swap transitions**: Bass reduction on outgoing, enhancement on incoming (outro→intro)
- **Genre-aware crossfades**: House/techno=32 bars, D&B=16, hip-hop/dubstep=8
- **Phrase boundary enforcement**: Mix points snapped to 8/16-bar boundaries
- **Segment-aware transitions**: Different effects for breakdown→buildup, drop→drop, etc.
- **Beat analysis**: Energy envelope extraction, onset detection, segment classification (`lib/beat-analyzer.ts`)

### Transition Types
| Segments | Filter | Description |
|----------|--------|-------------|
| breakdown → buildup | Filter sweep | Animated high-pass 0→2.5kHz via volume expressions |
| outro → intro | EQ swap | Bass swap between outgoing/incoming |
| drop → drop | Quick cut | Minimal crossfade (≤2s) |
| harmonic match | Exponential blend | Long smooth crossfade |
| non-harmonic | Linear blend | Short crossfade to minimize clash |

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `lib/mix-engine.ts` | 1,209 | FFmpeg audio mixing engine (core) |
| `lib/beat-analyzer.ts` | 509 | Beat detection, energy analysis, segment classification |
| `lib/automix-optimizer.ts` | 251 | Camelot harmonic track ordering |
| `lib/ai-transition-optimizer.ts` | 379 | AI transition recommendations |
| `lib/spotify-audio-analyzer.ts` | 374 | Spotify analysis integration (deprecated API) |
| `app/api/generate-mix/route.ts` | ~950 | Audio mix generation API (cloud library loader, camelotKey decoder) |
| `app/api/generate-playlist/route.ts` | 1,045 | Spotify playlist generation API |
| `app/page.tsx` | 489 | Web UI (two tabs: Playlist + Mix) |
| `lib/playlist-nlp.ts` | — | Claude NLP constraint extraction |
| `lib/camelot-wheel.ts` | — | Harmonic compatibility matrix |
| `lib/genre-compatibility.ts` | — | Artist → genre family mapping |
| `lib/playlist-namer.ts` | — | Claude-generated playlist names |
| `lib/cover-art-generator.ts` | — | DALL-E cover art generation |

## Data Files

| File | Size | Tracked? | Purpose |
|------|------|----------|---------|
| `data/matched-tracks.json` | 14MB | Yes | MIK-analyzed tracks matched to Spotify |
| `data/enhanced-track-database.json` | 5.7MB | Yes | Full track database (9,982 tracks) |
| `data/apple-music-checkpoint.json` | 368MB | No | Apple Music → Spotify matches |
| `data/audio-library-analysis.json` | ~313MB | **No** (Hetzner only) | Active cloud library — 16,383 tracks, BPM+key+genre enriched |
| `data/audio-library-analysis-bpm-enriched.json` | ~358MB | **No** (Hetzner only) | Recovery backup — MIK-enriched source data |

## Environment Variables

Required in `.env.local`:
```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback   # local
ANTHROPIC_API_KEY=...      # Claude for NLP + naming
OPENAI_API_KEY=...         # DALL-E cover art (optional)
POSTGRES_URL=...           # Neon Postgres (track deduplication)
```

Production redirect URI: `https://dj-mix-generator.vercel.app/api/auth/callback`

## Deployments

### Vercel (Web App)
- **URL**: https://dj-mix-generator.vercel.app/
- Auto-deploys from GitHub main branch

### Hetzner (Mix Server)
- **URL**: https://mixmaster.mixtape.run/
- **Server**: CPX31, Ubuntu 24.04, 8GB RAM, 344GB block storage (134GB free as of 2026-03-03)
- **IP**: 178.156.214.56
- **Stack**: Node.js 22, PM2, nginx, FFmpeg, aubio, essentia
- **Deploy**: `./scripts/deploy-hetzner.sh` (excludes `data/audio-library-analysis*.json` to protect Hetzner-only files)
- **SSH**: `ssh root@178.156.214.56`
- **Logs**: `pm2 logs notorious-dad`
- **Audio library**: `/mnt/HC_Volume_104378843/audio-library/` (~196GB, 27,686 files)

### Spotify Dashboard
Both redirect URIs must be registered:
- `https://dj-mix-generator.vercel.app/api/auth/callback`
- `https://mixmaster.mixtape.run/api/auth/callback`

## Selection Score Algorithm

Tracks scored deterministically (no AI):
- In library: +30 | MIK data: +20 | BPM match: +20 (mismatch: -50)
- Artist match: +20 (Include) / +10 (Reference)
- Energy mismatch: -30 | Genre incompatible: -200
- Quality bonus: 0-15 | Random variety: 0-10
- Dedup penalty: -25 (recently used)

## Include vs Reference Artists

- **Include**: MUST appear in playlist. Searched via Spotify catalog. ~2-3 tracks each.
- **Reference**: Style guide only. Influence scoring, not required in output.

## Native Apps (Frozen)

iOS and macOS SwiftUI apps exist in `NotoriousDAD-iOS/` and `NotoriousDAD-macOS/` with shared `NotoriousDADKit` package. These are **frozen** — the web app is the primary client. Don't invest further without explicit request.

## Library Enrichment Scripts (Hetzner)

These scripts live in `scripts/` and run directly on the Hetzner server against the active library:

| Script | Purpose |
|--------|---------|
| `scripts/bpm-enrich-pipeline.py` | aubio BPM detection for tracks missing BPM. Supports `--resume`. |
| `scripts/dedup-library.py` | Normalized artist+title deduplication with quality scoring. |
| `scripts/genre-pipeline.py` | Claude Haiku batch genre classification (50 tracks/request). |

### camelotKey Encoding
MIK exports keys as base64-encoded JSON (e.g. `eyJhbGdvcml0aG0iOjk0LCJrZXkiOiI5QiIsInNvdXJjZSI6Im1peGVkaW5rZXkifQ==`).
Decoded: `{"algorithm":94,"key":"9B","source":"mixedinkey"}`.
The `decodeCamelotKey()` helper in `route.ts` handles both plain Camelot strings and base64-JSON transparently.

### Current Library Stats (2026-03-03)
- **16,383 tracks** (after deduplication, 1,741 removed)
- **93% BPM coverage** (aubio-analyzed)
- **100% key coverage** (MIK data, decoded from base64 at runtime)
- **99% genre coverage** (Claude Haiku classified)
- **19% beat analysis** (full segments/energyCurve/mixPoints for ~3,251 tracks)
- **81% fallback mix points** (mixIn=first 16s skipped, mixOut=85% of duration)

## Archived Scripts

One-off data pipeline scripts are in `scripts/archive/`. Active scripts remain in `scripts/`.

## Related Project

**[spotify-library-downloader](https://github.com/braggy9/spotify-library-downloader)** (`~/spotify-library-downloader`):
- Downloads Spotify tracks via yt-dlp
- Mixed In Key analysis integration
- `npm run sync-mix-generator` syncs MIK data to this project's `data/matched-tracks.json`
