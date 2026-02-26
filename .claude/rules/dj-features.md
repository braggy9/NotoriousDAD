# DJ Features & Audio Processing Rules

## Audio Mix Engine (`lib/mix-engine.ts`)

The mix engine is the core of the project. Key architecture decisions:

### Lossless Pipeline
- All intermediate mix files use WAV (not MP3) to prevent quality degradation
- Only the final output is encoded to MP3 (single lossy encode)
- Each source track is decoded once, normalized, then mixed

### Loudness Normalization
- EBU R128 standard via FFmpeg `loudnorm` filter
- Target: -14 LUFS (Spotify/YouTube standard), -1 dBTP true peak, LRA=11
- Applied per-track in the filter chain before crossfading

### Transition Types
- **Filter sweep** (breakdown→buildup): Animated high-pass using `volume` expressions with `eval=frame`
- **EQ swap** (outro→intro): Bass reduction on outgoing, enhancement on incoming
- **Quick cut** (drop→drop): Minimal crossfade ≤2s
- **Exponential blend**: For harmonic matches (long smooth crossfade)
- **Linear blend**: For non-harmonic (short to minimize clash)

### Beat Analysis (`lib/beat-analyzer.ts`)
- Energy envelope extraction via FFmpeg raw audio (f32le at 20Hz sample rate)
- Onset/beat detection via energy derivative
- Segment classification: intro, verse, buildup, drop, breakdown, outro
- Downbeat detection for phrase boundary alignment

### Genre-Aware Crossfades
- House/Techno/Trance: 32 bars (~30s at 128 BPM)
- Drum & Bass: 16 bars (~14s at 174 BPM)
- Dubstep/Hip-Hop: 8 bars
- Disco/Funk: 16 bars
- Pop/Indie: 8 bars

### Phrase Boundary Enforcement
- Mix points snapped to nearest 8-bar (most genres) or 16-bar (house/techno) phrase boundary
- Uses detected downbeats from beat analysis
- 0.5s tolerance for snapping

## Harmonic Mixing (Camelot Wheel)

- Use MIK (Mixed In Key) data when available — more accurate than Spotify
- Camelot compatibility: same key, ±1 number (same letter), relative major/minor (same number)
- See `lib/camelot-wheel.ts` for the compatibility matrix
- Key priority: MIK analyzed > Spotify audio features > skip track

## BPM Handling

- Acceptable transition range: ±6 BPM for smooth mixing
- Double/half BPM conversions valid (128 ≈ 64 BPM)
- BPM adjustment via FFmpeg `atempo` filter (not pitch-preserving)
- Energy curve matters: don't jump from 120 to 140 mid-set

## Include vs Reference Artists

**Include Artists**: MUST appear in final playlist
- Search Spotify catalog (not just library)
- Target ~2 tracks per Include artist
- Implementation: `lib/spotify-artist-search.ts`

**Reference Artists**: Style guide only
- Influence track selection scoring
- Not required to appear in output

## Track Data Sources (Priority Order)

1. MIK Data (`data/matched-tracks.json`) — Professional analysis
2. Enhanced Database (`data/enhanced-track-database.json`) — 9,982 tracks
3. Spotify Catalog Search — For Include artists
4. Spotify Recommendations — Discovery

## Key Files

- `lib/mix-engine.ts` — FFmpeg audio mixing engine (core, 1,209 lines)
- `lib/beat-analyzer.ts` — Beat detection, energy analysis (509 lines)
- `lib/automix-optimizer.ts` — Camelot harmonic track ordering
- `lib/ai-transition-optimizer.ts` — AI transition recommendations
- `lib/spotify-audio-analyzer.ts` — Spotify analysis (deprecated API, fails silently)
- `lib/camelot-wheel.ts` — Harmonic compatibility
- `lib/mik-csv-parser.ts` — Mixed In Key import

## Known Limitations

- Spotify Audio Analysis API deprecated (late 2024) — `spotify-audio-analyzer.ts` silently fails, falls through to local beat analysis
- `atempo` is not pitch-preserving — tempo changes also shift pitch
- No beat-grid synchronization — beats may be slightly offset between tracks
