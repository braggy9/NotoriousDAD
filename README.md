# Notorious DAD - DJ Mix Generator

AI-powered DJ mix generator with two core features: Spotify playlist generation and audio mix generation with professional transitions.

## Features

### Spotify Playlist Generator
- **Natural language input** — "Include: Fred again. 30 tracks. Energy: build"
- **Deterministic scoring** — No AI guessing, reliable track selection
- **Personal library first** — 48,000+ tracks from MIK + Apple Music + Spotify
- **Harmonic mixing** — Camelot-based key compatibility
- **AI naming** — Creative playlist names via Claude
- **Cover art** — DALL-E generated artwork

### Audio Mix Generator
- **FFmpeg-powered** — Professional crossfades, EQ swaps, filter sweeps
- **Lossless pipeline** — WAV intermediaries, single MP3 encode at output
- **Loudness normalization** — EBU R128 at -14 LUFS across all tracks
- **Genre-aware transitions** — 32 bars for house/techno, 8 for hip-hop
- **Phrase-aligned mix points** — Snapped to 8/16-bar musical boundaries
- **Beat analysis** — Energy curves, segment detection, onset detection

## Quick Start

### Prerequisites
- Node.js 18+
- Spotify Premium account
- Anthropic API key (Claude)

### Setup

```bash
git clone https://github.com/braggy9/NotoriousDAD.git
cd dj-mix-generator
npm install
cp .env.example .env.local  # Edit with your credentials
npm run dev
```

### Environment Variables

```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...         # Optional: DALL-E cover art
POSTGRES_URL=...           # Optional: track deduplication
```

1. Create app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Add `http://localhost:3000/api/auth/callback` as redirect URI
3. Get API key from [Anthropic Console](https://console.anthropic.com/)

### Usage

1. Visit http://localhost:3000
2. Login with Spotify
3. Choose tab: **Playlist** (Spotify) or **Mix** (audio file)
4. Enter a natural language prompt
5. Get your mix

## Architecture

```
app/
├── api/
│   ├── generate-playlist/   # Spotify playlist creation
│   ├── generate-mix/        # Audio mix generation
│   ├── auth/                # Spotify OAuth
│   └── ...                  # Debug, health, export endpoints
├── page.tsx                 # Web UI (two tabs)
lib/
├── mix-engine.ts            # FFmpeg audio mixing (core)
├── beat-analyzer.ts         # Beat detection, energy analysis
├── automix-optimizer.ts     # Harmonic track ordering
├── playlist-nlp.ts          # Claude NLP constraint extraction
├── camelot-wheel.ts         # Harmonic compatibility matrix
├── genre-compatibility.ts   # Genre family mapping
└── ...                      # 30+ supporting modules
data/
├── matched-tracks.json      # 9,777 MIK tracks (14MB, tracked)
├── enhanced-track-database.json  # 9,982 tracks (5.7MB, tracked)
scripts/
├── deploy-hetzner.sh        # Deploy to mix server
├── archive/                 # Archived one-off scripts
```

## Deployments

| Environment | URL | Platform |
|-------------|-----|----------|
| Web App | https://dj-mix-generator.vercel.app/ | Vercel (auto-deploy) |
| Mix Server | https://mixmaster.mixtape.run/ | Hetzner CPX31 |

### Deploy to Hetzner

```bash
./scripts/deploy-hetzner.sh
```

### Deploy to Vercel

Push to `main` branch — auto-deploys.

## Tech Stack

- **Framework**: Next.js 16 (Turbopack)
- **Language**: TypeScript
- **AI**: Claude (Anthropic) for NLP + naming, DALL-E for cover art
- **Audio**: FFmpeg with acrossfade, loudnorm, highpass filters
- **Music API**: Spotify Web API
- **Database**: Neon Postgres (track deduplication)
- **Styling**: Tailwind CSS
- **Server**: PM2, nginx, FFmpeg, aubio on Hetzner

## License

MIT
