# Documentation Index

## Project Documentation
- `CLAUDE.md` — Main project context (auto-loaded). Architecture, key files, deployments, algorithms.
- `CLAUDE.local.md` — Personal notes, testing prompts, debugging cheatsheet (gitignored).
- `README.md` — Public README with setup guide and architecture overview.

## Claude Code Rules (`.claude/rules/`)
- `dj-features.md` — Mix engine architecture, transition types, beat analysis, genre crossfades
- `claude-ai.md` — Claude AI integration patterns, NLP constraint extraction
- `spotify-api.md` — Spotify API patterns, token management, rate limits

## Key Data Files
- `data/matched-tracks.json` — 9,777 MIK-analyzed tracks matched to Spotify (14MB, tracked)
- `data/enhanced-track-database.json` — 9,982 tracks with full metadata (5.7MB, tracked)
- `data/apple-music-checkpoint.json` — ~40,000 Apple Music → Spotify matches (368MB, NOT tracked)

## When to Read What

**Working on audio mix quality?**
→ Read `lib/mix-engine.ts` + `lib/beat-analyzer.ts` + `.claude/rules/dj-features.md`

**Working on playlist generation?**
→ Read `app/api/generate-playlist/route.ts` + `lib/playlist-nlp.ts`

**Debugging auth/API issues?**
→ Read `.claude/rules/spotify-api.md` + debug endpoints in `app/api/debug/`

**Deploying to Hetzner?**
→ Read `scripts/deploy-hetzner.sh` + Hetzner section in `CLAUDE.md`
