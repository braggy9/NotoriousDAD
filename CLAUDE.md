# CLAUDE.md — Notorious DAD

DJ mix generator with two core features: Spotify playlist generation (web/Vercel) and audio mix generation (Hetzner server).

**GitHub**: https://github.com/braggy9/dj-mix-generator
**Version**: 2.2.0 | **Stack**: Next.js 16, TypeScript, Tailwind CSS

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
- **Process**: Constraint parsing → track selection from server library → FFmpeg crossfade mixing
- **Data**: Audio files on Hetzner server (29K files, 209GB)
- **Output**: Downloadable MP3 mix file
- **Deploy**: Hetzner server at `mixmaster.mixtape.run`

## Key Files

| File | Purpose |
|------|---------|
| `app/api/generate-playlist/route.ts` | Spotify playlist generation (1,045 lines) |
| `app/api/generate-mix/route.ts` | Audio mix generation |
| `app/page.tsx` | Web UI (two tabs: Playlist + Mix) |
| `lib/playlist-nlp.ts` | Claude NLP constraint extraction |
| `lib/automix-optimizer.ts` | Camelot harmonic track ordering |
| `lib/mix-engine.ts` | FFmpeg audio mixing engine |
| `lib/camelot-wheel.ts` | Harmonic compatibility matrix |
| `lib/genre-compatibility.ts` | Artist → genre family mapping |
| `lib/playlist-namer.ts` | Claude-generated playlist names |
| `lib/cover-art-generator.ts` | DALL-E cover art generation |

## Data Files

| File | Size | Tracked? | Purpose |
|------|------|----------|---------|
| `data/matched-tracks.json` | 14MB | Yes | MIK-analyzed tracks matched to Spotify |
| `data/enhanced-track-database.json` | 5.7MB | Yes | Full track database (9,982 tracks) |
| `data/apple-music-checkpoint.json` | 368MB | No | Apple Music → Spotify matches |
| `apple-music-library.xml` | 77MB | No | Apple Music library export |

## Environment Variables

Required in `.env.local`:
```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback   # local
ANTHROPIC_API_KEY=...      # Claude for NLP + naming
OPENAI_API_KEY=...         # DALL-E cover art (optional)
```

Production redirect URI: `https://dj-mix-generator.vercel.app/api/auth/callback`

## Deployments

### Vercel (Web App)
- **URL**: https://dj-mix-generator.vercel.app/
- Auto-deploys from GitHub main branch

### Hetzner (Mix Server)
- **URL**: https://mixmaster.mixtape.run/
- **Server**: CPX31, Ubuntu 24.04, 8GB RAM, 260GB storage
- **IP**: 178.156.214.56
- **Stack**: Node.js 22, PM2, nginx, FFmpeg, aubio
- **Deploy**: `./scripts/deploy-hetzner.sh`
- **SSH**: `ssh root@178.156.214.56`
- **Logs**: `pm2 logs notorious-dad`

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

## Archived Scripts

One-off data pipeline scripts are in `scripts/archive/`. Active scripts remain in `scripts/`.

## Related Project

**[spotify-library-downloader](https://github.com/braggy9/spotify-library-downloader)** (`~/spotify-library-downloader`):
- Downloads Spotify tracks via yt-dlp
- Mixed In Key analysis integration
- `npm run sync-mix-generator` syncs MIK data to this project's `data/matched-tracks.json`
