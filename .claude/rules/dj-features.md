# DJ Features & Audio Processing Rules

## Harmonic Mixing (Camelot Wheel)

When working with harmonic mixing:
- Use MIK (Mixed In Key) data when available - it's more accurate than Spotify
- Camelot wheel compatibility: same key, +1/-1 number, or energy boost (+7)
- See `lib/camelot-wheel.ts` for the compatibility matrix
- Priority: MIK analyzed > Spotify audio features > skip track

## BPM Handling

- Acceptable BPM transition range: typically +/- 6 BPM for smooth mixing
- Double/half BPM conversions are valid (128 ≈ 64 BPM)
- Energy curve matters: don't jump from 120 to 140 mid-set

## Include vs Reference Artists

**Include Artists**: MUST appear in final playlist
- Search Spotify catalog (not just library)
- Target ~2 tracks per Include artist
- Prioritize: user's liked songs > MIK analyzed > popular tracks
- Implementation: `lib/spotify-artist-search.ts`

**Reference Artists**: Style guide only
- Influence track selection via Spotify Recommendations
- Not required to appear in playlist
- Used to find similar-sounding tracks

## Track Data Sources (Priority Order)

1. MIK Data (`data/matched-tracks.json`) - Professional analysis
2. User's Spotify Library - Personalization
3. Spotify Catalog Search - For Include artists
4. Spotify Recommendations - Discovery
5. Spotify Related Artists - Expanded discovery

## Key Files

- `lib/automix-optimizer.ts` - Track ordering for djay Pro
- `lib/camelot-wheel.ts` - Harmonic compatibility
- `lib/enhanced-track-selector.ts` - Claude AI curation
- `lib/mik-csv-parser.ts` - Mixed In Key import
