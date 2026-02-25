# Notorious D.A.D. — DJ Mix Generator

## What This Is
A PWA for generating AI-curated DJ playlists and mixes. Type a prompt like "upbeat house for a summer BBQ" and get a Spotify playlist. Build mix queues and generate crossfade mixes via the Hetzner server.

## Architecture
- **Frontend**: Next.js 16 + React 19 + Tailwind 4 PWA, deployed to Vercel
- **AI**: Claude API for NLP prompt → track criteria conversion
- **Music**: Spotify Web API (PKCE OAuth) for search, playlists, audio features
- **Mixing**: Hetzner server (mixmaster.mixtape.run) running FFmpeg for audio mixing
- **Library**: 27,634 analyzed tracks with MIK Camelot keys, genres, BPM data

## Dev Commands
```bash
npm run dev      # Start dev server on localhost:3000
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint
```

## Environment Variables (.env.local)
```
ANTHROPIC_API_KEY=           # Claude API key
SPOTIFY_CLIENT_ID=           # From Spotify Developer Dashboard
SPOTIFY_REDIRECT_URI=        # http://localhost:3000/api/spotify/callback
HETZNER_API_URL=             # https://mixmaster.mixtape.run
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=  # Same as SPOTIFY_CLIENT_ID (client-side)
```

## Key Directories
```
app/                    # Next.js app router pages & API routes
app/api/generate/       # Claude AI endpoint
app/api/spotify/        # Spotify OAuth + search + playlist
app/api/library/        # Track catalog API
app/api/mix/            # Proxy to Hetzner for mix generation
app/components/         # Shared React components
lib/                    # Business logic (spotify, playlist-generator, library, mix-store)
public/                 # PWA manifest, service worker, icons
```

## Hetzner Server
- IP: 178.156.214.56
- Domain: mixmaster.mixtape.run
- Process manager: PM2
- Purpose: FFmpeg audio mixing, track library API

## Data Notes
- Track keys are base64-encoded MIK JSON — decode server-side
- ~45% have Camelot keys, ~28% have genre, ~3.5% have BPM
- Spotify Audio Features API can enrich missing BPM/genre data

## Native Apps (Deprecated)
iOS/macOS apps reached Build 20 but are deprecated in favor of this PWA.
Source only exists on the home MacBook Pro.
