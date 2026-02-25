# Notorious D.A.D. — DJ Mix Generator

## What This Is
A PWA for generating AI-curated DJ playlists and professional mixes. Describe a vibe ("deep house warm-up set") and the AI searches Spotify, orders tracks by harmonic key and energy flow, selects transition techniques, and can render the mix via FFmpeg on the Hetzner server.

**Live at**: https://dj-mix-generator.vercel.app

## Architecture
- **Frontend**: Next.js 16 + React 19 + Tailwind 4 PWA, deployed to Vercel
- **AI**: Claude API for NLP prompt → track criteria / mix planning
- **Music**: Spotify Web API (PKCE OAuth) for search, playlists, audio features
- **Mixing**: Hetzner server (mixmaster.mixtape.run) running FFmpeg for audio processing
- **Harmonic System**: Camelot Wheel key compatibility for professional-quality transitions

## Phases
- Phase 1: Foundation (Next.js PWA, dark UI, Tailwind 4) — complete
- Phase 2: Spotify (OAuth PKCE, search, playlists, audio features) — complete
- Phase 3: AI Generator (Claude prompt → criteria → playlist) — complete
- Phase 4: Mix Engine (track ordering, transitions, FFmpeg, mix builder UI) — complete
- Phase 5: Library (track catalog browser) — pending
- Phase 6: Data Quality (Camelot enrichment, genre, BPM optimization) — pending

## Dev Commands
```bash
npm run dev      # Start dev server on localhost:3000
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint
```

## Environment Variables (.env.local)
```
ANTHROPIC_API_KEY=              # Claude API key
SPOTIFY_CLIENT_ID=              # From Spotify Developer Dashboard
SPOTIFY_REDIRECT_URI=           # http://localhost:3000/api/spotify/callback
HETZNER_API_URL=                # https://mixmaster.mixtape.run
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=  # Same as SPOTIFY_CLIENT_ID (client-side)
```

## Key Directories
```
app/                          # Next.js app router pages & API routes
app/api/generate/             # Claude AI → playlist criteria endpoint
app/api/mix-plan/             # Claude AI → mix plan (track ordering + transitions)
app/api/mix-execute/          # Proxy to Hetzner for FFmpeg audio mixing
app/api/mix-execute/status/   # Poll Hetzner for mix progress
app/api/spotify/              # Spotify OAuth + search + playlist + audio features
app/components/               # Shared React components
app/components/mix/           # Mix-specific: TrackQueue, TransitionCard, EnergyArc, CamelotBadge
app/mix/                      # Mix builder page
lib/                          # Business logic
lib/mix-engine.ts             # Track ordering (weighted graph + 2-opt), transition selection
lib/mix-types.ts              # MixTrack, Transition, MixPlan, MixStatus types
lib/camelot.ts                # Camelot Wheel harmonic key system
lib/ffmpeg-builder.ts         # FFmpeg filtergraph generation (6 transition types)
lib/mix-store.ts              # Client-side mix queue (localStorage)
lib/playlist-generator.ts     # Playlist criteria parsing, Spotify search, audio enrichment
lib/spotify.ts                # Spotify auth (PKCE), token management, authenticated fetch
public/                       # PWA manifest, service worker
```

## Mix Engine
The mix system uses Spotify's audio features (BPM, key, energy, danceability) to build DJ-quality mixes:

1. **Track Search**: Claude AI generates search criteria → Spotify API finds tracks → audio features enriched
2. **Camelot Keys**: Spotify pitch_class + mode converted to Camelot notation for harmonic mixing
3. **Track Ordering**: Weighted compatibility graph (key + BPM + energy) → nearest-neighbor → 2-opt optimization
4. **Transition Selection**: 6 types chosen per track pair — harmonic_blend, eq_swap, filter_sweep, echo_out, drop, crossfade
5. **Mix Points**: Bar-based timing (adjusted by energy level)
6. **Audio Rendering**: FFmpeg filtergraphs sent to Hetzner for processing

## Hetzner Server
- IP: 178.156.214.56
- Domain: mixmaster.mixtape.run
- Process manager: PM2
- Purpose: FFmpeg audio mixing execution

## Data Notes
- Spotify Audio Features API provides BPM, key, mode, energy, danceability per track
- Camelot keys derived from Spotify's pitch_class (0-11) + mode (0=minor, 1=major)
- Local track library (27K+) exists on Hetzner but mix engine primarily uses Spotify search

## Native Apps (Deprecated)
iOS/macOS apps reached Build 20 but are deprecated in favor of this PWA.
