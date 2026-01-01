# Documentation Index

This project has extensive documentation. Reference these files for context:

## Architecture & Status
- `@HANDOVER-BRIEF.md` - Latest architecture review (Dec 31, 2025)
  - Critical issues identified
  - Include vs Reference artist clarification
  - Data pipeline diagrams

- `@IMPLEMENTATION-PLAN.md` - Corrected architecture plan
  - New data flow diagrams
  - Implementation steps
  - Success criteria

- `@PROJECT_STATUS_ANALYSIS_DEC_2025.md` - Comprehensive codebase analysis
  - What's working
  - Critical issues
  - Recommended fixes with code examples
  - File reference guide

## Project Memory
- `@CLAUDE.md` - Main project context (auto-loaded)
- `@README.md` - Setup and deployment guide
- `@claude-progress.txt` - Work-in-progress tracker

## Data Files
- `data/matched-tracks.json` - 4,080 MIK-analyzed tracks
- `data/apple-music-checkpoint.json` - Apple Music → Spotify matching
- `data/apple-music-matched.json` - Completed matches
- `data/apple-music-tracks.json` - Parsed Apple Music library

## When to Read What

**Starting a new session?**
→ Read `claude-progress.txt` first for current state

**Working on playlist generation?**
→ Read `IMPLEMENTATION-PLAN.md` for data flow

**Debugging auth/API issues?**
→ Read `PROJECT_STATUS_ANALYSIS_DEC_2025.md` for debug endpoints

**Understanding Include vs Reference?**
→ Read `HANDOVER-BRIEF.md` section on user requirements
