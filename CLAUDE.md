# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Notorious DAD** - An AI-powered DJ mix generator that creates seamless, beatmatched playlists using Spotify's catalog and Claude AI's curation capabilities. Designed for djay Pro automix with professional DJ features.

## Development Commands

```bash
# Development
npm run dev              # Start dev server at http://localhost:3000

# Production
npm run build           # Build for production
npm start              # Run production build

# Linting
npm run lint           # Run ESLint
```

### First-Time Database Setup

After starting the dev server, initialize the database by visiting:
1. `http://localhost:3000/api/init-db` - Core tables
2. `http://localhost:3000/api/init-analytics` - Analytics tables

## Core Architecture

### Two-Pass AI System

The playlist generation uses a sophisticated two-pass approach:

**PASS 1: Constraint Extraction (`lib/playlist-nlp.ts`)**
- Uses Claude AI to parse natural language prompts into structured constraints
- Extracts: Include artists, Reference artists, BPM range, energy, mood, genres, duration
- Handles special inputs: Spotify playlist URLs, Beatport charts, Apple Music playlists

**PASS 2: Intelligent Track Selection (`lib/enhanced-track-selector.ts`)**
- Uses Claude Sonnet 4.5 to select optimal tracks from filtered pool
- Considers: harmonic compatibility, energy flow, user preferences, track popularity
- Prioritizes user's liked songs and top artists for personalization

### Critical Architecture Patterns

#### Include vs Reference Artists

**Include Artists** (MUST be in playlist):
- System searches Spotify catalog for artist's discography (not just user's library)
- Priority: User's liked songs → MIK analyzed tracks → Popular tracks
- Builds candidate pool of ~100+ tracks per Include artist
- Implementation: `lib/spotify-artist-search.ts` (`searchMultipleArtists()`)

**Reference Artists** (style guide):
- Used as vibe/style influence for Claude AI
- Not required to appear in final playlist
- Informs track selection through Spotify Recommendations API

#### Data Source Priority

The system merges tracks from multiple sources (in priority order):
1. **MIK Data** (`data/matched-tracks.json`) - Professional key/BPM analysis from Mixed In Key
2. **Spotify User Library** - User's saved tracks with audio features
3. **Spotify Catalog Search** - Searched tracks from Include artists
4. **Spotify Recommendations** - AI-discovered similar tracks
5. **Spotify Related Artists** - Expanded discovery based on reference artists
6. **User's Liked Songs** - Fetch via `/v1/me/tracks` endpoint

Each source is merged into a unified track pool with deduplication by Spotify track ID.

#### Token Management Pattern

All API routes that use Spotify must implement token refresh logic:

```typescript
let accessToken = request.cookies.get('spotify_access_token')?.value;
const refreshToken = request.cookies.get('spotify_refresh_token')?.value;

// Try API call
let response = await fetch(spotifyEndpoint, {
  headers: { Authorization: `Bearer ${accessToken}` }
});

// If 401 and have refresh token, refresh and retry
if (!response.ok && response.status === 401 && refreshToken) {
  const newTokenData = await refreshAccessToken(refreshToken);
  accessToken = newTokenData.access_token;
  // Retry API call with new token
  response = await fetch(spotifyEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}
```

See `app/api/generate-playlist/route.ts:45-69` for reference implementation.

### Key Library Files

**Playlist Generation Pipeline:**
- `playlist-nlp.ts` - NLP constraint extraction (Pass 1)
- `enhanced-track-selector.ts` - Claude AI curation (Pass 2)
- `spotify-recommendations.ts` - Spotify Recommendations API + Related Artists
- `spotify-artist-search.ts` - Search Spotify catalog for Include artists
- `automix-optimizer.ts` - Track ordering for djay Pro (harmonic + BPM + energy)

**DJ Features:**
- `camelot-wheel.ts` - Harmonic mixing compatibility (Camelot Wheel system)
- `mik-csv-parser.ts` - Parse Mixed In Key CSV exports
- `track-matcher.ts` - Match Apple Music → Spotify for MIK integration

**Smart Naming & Visuals:**
- `playlist-namer.ts` - AI-generated creative playlist names with emojis
- `cover-art-generator.ts` - AI-generated cover art via DALL-E

**Data Parsers:**
- `playlist-seed-parser.ts` - Analyze Spotify playlist URLs for vibe matching
- `apple-music-parser.ts` - Parse Apple Music playlists for cross-platform matching
- `beatport-scraper.ts` - Beatport chart integration (sample data)

**Export:**
- `djay-pro-export.ts` - Export playlists to djay Pro format

### API Route Structure

**Core Routes:**
- `POST /api/generate-playlist` - Main playlist generation (2-pass system)
- `POST /api/upload-mik-data` - Upload Mixed In Key CSV for professional analysis
- `GET /api/export-playlist` - Export playlist to djay Pro format

**Authentication:**
- `GET /api/auth` - Initiate Spotify OAuth flow
- `GET /api/auth/callback` - OAuth callback (sets httpOnly cookies)
- `GET /api/auth/logout` - Clear auth cookies

**Debug Endpoints** (useful for troubleshooting):
- `GET /api/debug/env` - Verify environment variables
- `GET /api/debug/auth` - Check auth cookie status
- `GET /api/debug/token` - Test Spotify token validity
- `GET /api/debug/spotify-test` - Test Spotify API connectivity
- `GET /api/debug/cookies` - Inspect all cookies

### Environment Variables

Required for operation (see `.env.example`):
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` - Spotify API credentials
- `SPOTIFY_REDIRECT_URI` - OAuth callback URL
- `ANTHROPIC_API_KEY` - Claude AI for intelligent curation
- `OPENAI_API_KEY` - DALL-E for cover art generation
- `POSTGRES_URL` / `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING` - Database
- `NEXTAUTH_URL` / `NEXTAUTH_SECRET` - Session management

**Environment validation** is enforced in critical routes via `lib/envValidation.js`.

### Data Storage

**File-based:**
- `data/matched-tracks.json` - MIK-matched tracks (Spotify + MIK analysis merged)
- Stored tracks include: `{ spotifyTrack, mikData: { bpm, camelotKey, energy } }`

**Database Tables:**
- Core: playlists, reviews, feedback, tracks, taste_profiles
- Analytics: track_replacements, playlist_contexts, track_transitions

### Spotify API Integration Notes

**Rate Limits:**
- Batch audio features: 100 tracks per request (`/v1/audio-features?ids=...`)
- Batch artists: 50 artists per request (`/v1/artists?ids=...`)
- Recommendations: max 5 seed artists/tracks/genres combined

**Token Lifespan:**
- Access tokens expire after 1 hour
- Refresh tokens are long-lived (no expiration)
- Always implement refresh logic in routes that make Spotify API calls

**Playlist Creation:**
- Name limit: 100 characters
- Description limit: 300 characters
- Must sanitize control characters and normalize whitespace
- See `app/api/generate-playlist/route.ts:536-557` for sanitization logic

### Claude AI Integration

**Models Used:**
- `claude-sonnet-4-5-20250929` - Main model for constraint extraction and track selection
- Context window: ~200K tokens (enough for 500 tracks with metadata)

**Prompt Engineering:**
- Include track metadata: name, artist, key, BPM, energy, mood, danceability
- Mark user's top artists with ⭐ emoji
- Mark liked songs with 💚 emoji for prioritization
- Emphasize "djay Pro automix" for seamless transition focus
- Request structured JSON output for parsing

### Common Gotchas

1. **Auth Cookie Path**: Cookies must set `path: '/'` and `sameSite: 'lax'` or auth breaks across routes
2. **MIK Data Loading**: If `data/matched-tracks.json` doesn't exist, fallback to user's top tracks
3. **Track Deduplication**: Always use `Set` with track IDs when merging sources
4. **Camelot Key Fallback**: If track lacks MIK data, convert Spotify key/mode to Camelot
5. **Empty Constraint Fields**: Claude may return `undefined` or `null` for unused constraints - always check before using
6. **Spotify Search vs Library**: For Include artists, ALWAYS search Spotify catalog, not just library
7. **Token Refresh Timing**: If a route makes multiple Spotify calls, only update cookie at the end

### Testing Locally

1. Set environment variables in `.env.local`
2. Run `npm run dev`
3. Visit `http://localhost:3000`
4. Click "Login with Spotify" to authenticate
5. Test constraint extraction:
   - "Include: Fred again | Duration: 34 tracks | Energy: build"
   - "Reference: Chemical Brothers | BPM: 128-135 | Mood: energetic"
6. Use debug endpoints to troubleshoot auth issues

### Architecture Evolution

See `HANDOVER-BRIEF.md` for recent architectural changes. Key improvements:
- **Dec 31, 2025**: Added Spotify catalog search for Include artists (no longer library-only)
- System now searches ~30 tracks per Include artist from Spotify
- Prioritizes user's liked songs, then popular tracks
- MIK data used for harmonic analysis when available, not as hard requirement

### Code Style Notes

- TypeScript is used for all new code (`.ts` / `.tsx`)
- Legacy files may be `.js` (e.g., `envValidation.js`)
- Console logs use emoji prefixes: 🔍 (search), ✓ (success), ❌ (error), ⚠️ (warning)
- API routes return detailed debug info in development mode
- Error responses include `hint` field for user-facing guidance
