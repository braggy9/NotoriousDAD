# Notorious D.A.D.

AI-powered DJ mix generator. Describe a vibe, get a professionally structured mix with harmonic key matching, intelligent track ordering, and automated transitions.

**Live**: https://dj-mix-generator.vercel.app

## Features

- **AI Mix Planning** — Describe what you want ("deep house sunset session") and Claude AI builds a mix plan with optimized track order and transition techniques
- **Spotify Integration** — Searches Spotify for tracks, enriches with audio features (BPM, key, energy), saves playlists back to your account
- **Harmonic Mixing** — Camelot Wheel key system ensures tracks blend musically
- **6 Transition Types** — Harmonic blend, EQ swap, filter sweep, echo out, drop, crossfade — chosen automatically based on track compatibility
- **Energy Arc** — Visualizes energy flow across your set
- **Drag-and-Drop** — Reorder tracks and transitions recalculate in real time
- **Audio Rendering** — FFmpeg processing via Hetzner server for actual mixed audio output
- **PWA** — Install on your phone or desktop for an app-like experience

## Stack

Next.js 16 / React 19 / Tailwind 4 / Claude API / Spotify Web API / FFmpeg / Vercel / Hetzner

## Setup

```bash
npm install
cp .env.local.example .env.local  # Add your API keys
npm run dev
```

## Deployment

Deployed automatically to Vercel on push to `main`.
