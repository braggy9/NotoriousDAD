# Implementation Plan - Corrected Architecture

**Date**: 2025-12-31
**Priority**: Fix fundamental architecture to meet user requirements

---

## User Requirements (Clarified)

### Include Artists
- **NOT**: "Only tracks from these artists"
- **YES**: "Feature these artists with ~2 tracks each in the mix"
- **Example**: "Include: Fred again, Rufus, Disclosure" = ~6 tracks total from these artists in a 34-track mix

### Reference Artists
- Use as style guide
- Find similar-sounding tracks
- Not required to be in playlist

### Primary Goal
**Quality of mix is ABSOLUTE PRIMARY consideration**
- Harmonic mixing (Camelot wheel)
- BPM matching
- Energy curve
- Smooth transitions
> Everything else is secondary to mix quality

### Data Sources (Use ALL)
1. ✅ MIK harmonic analysis (4,080 tracks)
2. ✅ Apple Music library (48,474 tracks → Spotify IDs)
3. ✅ Spotify search (for Include artists)
4. ✅ User's saved/liked tracks
5. ✅ Spotify recommendations

**Output**: Spotify playlist using ALL available data

---

## Current Data Pipeline (BROKEN)

```
┌─────────────────┐
│  MIK Analysis   │ 4,080 tracks with BPM/key/energy
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ matched-tracks  │ Spotify IDs + MIK data
│     .json       │ (Only 4,080 tracks)
└─────────────────┘

┌─────────────────────┐
│ Apple Music Export  │ 48,474 tracks (your full library)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Spotify Search    │ Find Spotify IDs for Apple Music tracks
│   (32% complete)    │ 15,600 matched so far
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ apple-music-        │ Spotify IDs (NO MIK DATA)
│ checkpoint.json     │ 15,600 tracks
└─────────────────────┘

❌ PROBLEM: Two separate datasets, never merged!
❌ PROBLEM: System only uses 4,080 tracks, ignores 15,600+
❌ PROBLEM: Doesn't search Spotify for Include artists
```

---

## Correct Data Pipeline (NEW)

```
┌──────────────────────────────────────────────────────────┐
│                    DATA SOURCES                          │
└──────────────────────────────────────────────────────────┘
           │
           ├─────────────────┬─────────────────┬────────────────┐
           │                 │                 │                │
           ▼                 ▼                 ▼                ▼
   ┌──────────────┐  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐
   │ MIK Analysis │  │   Apple     │  │   Spotify    │  │   Spotify   │
   │  (4,080)     │  │   Music     │  │   Search     │  │   Library   │
   │              │  │  (48,474)   │  │              │  │             │
   │ BPM, key,    │  │             │  │  Include     │  │  User's     │
   │ Camelot,     │  │ → Spotify   │  │  artists     │  │  saved      │
   │ energy       │  │   IDs       │  │              │  │  tracks     │
   └──────┬───────┘  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘
          │                 │                 │                 │
          │                 │                 │                 │
          └─────────────────┴─────────────────┴─────────────────┘
                                     │
                                     ▼
                        ┌────────────────────────┐
                        │   UNIFIED TRACK POOL   │
                        │                        │
                        │  All tracks with:      │
                        │  - Spotify metadata    │
                        │  - MIK data (if avail) │
                        │  - User library flag   │
                        │  - Audio features      │
                        └───────────┬────────────┘
                                    │
                                    ▼
                        ┌────────────────────────┐
                        │  SMART PRIORITIZATION  │
                        │                        │
                        │  Score each track:     │
                        │  1. Include artist     │
                        │  2. Has MIK data       │
                        │  3. In user library    │
                        │  4. Popularity         │
                        │  5. Harmonic fit       │
                        └───────────┬────────────┘
                                    │
                                    ▼
                        ┌────────────────────────┐
                        │   CONSTRAINT FILTER    │
                        │                        │
                        │  - BPM range           │
                        │  - Energy range        │
                        │  - Mood/vibe           │
                        │  - Duration target     │
                        └───────────┬────────────┘
                                    │
                                    ▼
                        ┌────────────────────────┐
                        │   CLAUDE AI SELECTION  │
                        │                        │
                        │  Select ~34 tracks:    │
                        │  - ~2 per Include      │
                        │  - Reference style     │
                        │  - Mix quality primary │
                        └───────────┬────────────┘
                                    │
                                    ▼
                        ┌────────────────────────┐
                        │   AUTOMIX OPTIMIZER    │
                        │                        │
                        │  Optimize order:       │
                        │  - Harmonic (Camelot)  │
                        │  - BPM transitions     │
                        │  - Energy curve        │
                        └───────────┬────────────┘
                                    │
                                    ▼
                        ┌────────────────────────┐
                        │   SPOTIFY PLAYLIST     │
                        │   (34 tracks)          │
                        └────────────────────────┘
```

---

## Implementation Steps

### Phase 1: Merge Data Sources (IMMEDIATE)

**1.1 Complete Apple Music Matching** (4-5 hours)
- Let current matching finish (32% → 100%)
- Result: All 48,474 tracks matched to Spotify IDs

**1.2 Merge MIK Data with Apple Music Matches**
```typescript
// NEW: scripts/merge-data-sources.ts
interface EnhancedTrack {
  spotifyId: string;
  spotifyMetadata: SpotifyTrack;
  mikData?: {
    bpm: number;
    camelotKey: string;
    energy: number;
    analyzed: boolean;
  };
  inUserLibrary: boolean;
  source: 'mik' | 'apple-music' | 'spotify-search';
}

async function mergeDataSources() {
  // 1. Load MIK data (4,080 tracks)
  const mikTracks = loadMikData();

  // 2. Load Apple Music matches (48,474 tracks)
  const appleMusicMatches = loadAppleMusicMatches();

  // 3. Merge by Spotify ID
  const merged = appleMusicMatches.map(track => ({
    ...track,
    mikData: mikTracks.find(m => m.spotifyId === track.spotifyId)?.mikData,
    inUserLibrary: true,
    source: mikTracks.find(m => m.spotifyId === track.spotifyId) ? 'mik' : 'apple-music'
  }));

  // 4. Save unified dataset
  await fs.writeFile('data/unified-library.json', JSON.stringify(merged));

  console.log(`✅ Merged ${merged.length} tracks`);
  console.log(`   ${merged.filter(t => t.mikData).length} with MIK analysis`);
  console.log(`   ${merged.filter(t => !t.mikData).length} without MIK analysis`);
}
```

**1.3 Enhance Non-MIK Tracks with Spotify Audio Features**
```typescript
// For tracks without MIK data, get Spotify audio features
const tracksWithoutMik = unified.filter(t => !t.mikData);
const audioFeatures = await getSpotifyAudioFeatures(tracksWithoutMik.map(t => t.spotifyId));

// Convert Spotify features to MIK-compatible format
const enhanced = tracksWithoutMik.map((track, i) => ({
  ...track,
  mikData: {
    bpm: audioFeatures[i].tempo,
    camelotKey: spotifyToCamelot(audioFeatures[i].key, audioFeatures[i].mode),
    energy: audioFeatures[i].energy * 10, // Normalize to 0-10
    analyzed: false, // Mark as Spotify-derived, not MIK
  }
}));
```

**Result**: Unified library with harmonic data for ALL tracks

---

### Phase 2: Add Spotify Artist Search (NEW)

**2.1 Implement Artist Search**
```typescript
// NEW: lib/spotify-artist-search.ts

async function getArtistTracks(
  artistName: string,
  accessToken: string,
  options: {
    limit?: number; // Default 30
    userLibrary?: Set<string>; // Spotify IDs in user's library
    mikData?: Map<string, MikData>; // MIK analysis by Spotify ID
  }
): Promise<EnhancedTrack[]> {

  // 1. Search for artist
  const searchResults = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const artist = searchResults.artists.items[0];

  if (!artist) {
    throw new Error(`Artist not found: ${artistName}`);
  }

  // 2. Get artist's top tracks (popular first)
  const topTracks = await fetch(
    `https://api.spotify.com/v1/artists/${artist.id}/top-tracks?market=US`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  // 3. Get audio features
  const trackIds = topTracks.tracks.map(t => t.id);
  const audioFeatures = await fetch(
    `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(',')}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  // 4. Enhance with MIK data and prioritization
  const enhanced = topTracks.tracks.map((track, i) => {
    const features = audioFeatures.audio_features[i];
    const inLibrary = options.userLibrary?.has(track.id) || false;
    const mikData = options.mikData?.get(track.id);

    return {
      spotifyId: track.id,
      spotifyMetadata: track,
      mikData: mikData || {
        bpm: features.tempo,
        camelotKey: spotifyToCamelot(features.key, features.mode),
        energy: features.energy * 10,
        analyzed: false,
      },
      inUserLibrary: inLibrary,
      source: mikData ? 'mik' : 'spotify-search',
      priority: calculatePriority({
        inLibrary,
        hasMikData: !!mikData,
        popularity: track.popularity,
      })
    };
  });

  // 5. Sort by priority and return top N
  return enhanced
    .sort((a, b) => b.priority - a.priority)
    .slice(0, options.limit || 30);
}

function calculatePriority(factors: {
  inLibrary: boolean;
  hasMikData: boolean;
  popularity: number;
}): number {
  let score = 0;

  if (factors.inLibrary) score += 100;      // User's saved tracks highest
  if (factors.hasMikData) score += 50;      // MIK-analyzed tracks second
  score += factors.popularity * 0.3;        // Popularity as tiebreaker

  return score;
}
```

**2.2 Update Playlist Generation to Use Spotify Search**
```typescript
// MODIFIED: app/api/generate-playlist/route.ts

// Build track pool from multiple sources
let trackPool: EnhancedTrack[] = [];

// 1. Load unified library (MIK + Apple Music)
const unifiedLibrary = await loadUnifiedLibrary();
const libraryIds = new Set(unifiedLibrary.map(t => t.spotifyId));
const mikDataMap = new Map(
  unifiedLibrary
    .filter(t => t.mikData)
    .map(t => [t.spotifyId, t.mikData])
);

// 2. For Include artists, search Spotify
if (constraints.artists && constraints.artists.length > 0) {
  console.log(`🔍 Searching Spotify for Include artists...`);

  for (const artist of constraints.artists) {
    const artistTracks = await getArtistTracks(artist, accessToken, {
      limit: 30,  // Get 30 tracks per artist
      userLibrary: libraryIds,
      mikData: mikDataMap,
    });

    console.log(`  ✓ ${artist}: ${artistTracks.length} tracks (${artistTracks.filter(t => t.inUserLibrary).length} in library, ${artistTracks.filter(t => t.mikData?.analyzed).length} MIK-analyzed)`);

    trackPool.push(...artistTracks);
  }
}

// 3. Add unified library tracks for Reference artists and variety
trackPool.push(...unifiedLibrary);

// 4. Deduplicate by Spotify ID
const uniqueTracks = Array.from(
  new Map(trackPool.map(t => [t.spotifyId, t])).values()
);

console.log(`📊 Track pool: ${uniqueTracks.length} unique tracks`);
console.log(`   ${uniqueTracks.filter(t => t.inUserLibrary).length} in user library`);
console.log(`   ${uniqueTracks.filter(t => t.mikData?.analyzed).length} with MIK analysis`);
console.log(`   ${uniqueTracks.filter(t => t.source === 'spotify-search').length} from Spotify search`);

// 5. Filter by constraints (BPM, energy, etc.)
const filtered = filterTracksByConstraints(uniqueTracks, constraints);

// 6. Claude AI selection with Include artist enforcement
const selected = await selectTracksWithClaude(filtered, constraints, {
  includeArtistTarget: 2, // ~2 tracks per Include artist
  totalTracks: 34,
  prioritizeMikData: true,
});

// 7. Optimize order for harmonic mixing
const optimized = optimizeTrackOrder(selected, {
  useMikData: true, // Prefer MIK data over Spotify features
  energyCurve: constraints.energyCurve,
  prioritizeHarmonic: true,
});
```

---

### Phase 3: Update Claude AI Selection

**3.1 Modified Track Selection Prompt**
```typescript
// MODIFIED: lib/enhanced-track-selector.ts

const prompt = `You are selecting tracks for a 2-hour DJ mix (${targetTracks} tracks).

INCLUDE ARTISTS (MUST feature prominently):
${includeArtists.map(a => `- ${a}: Select ~2 tracks`).join('\n')}
Target: ${includeArtists.length * 2} tracks total from Include artists

REFERENCE ARTISTS (style guide, not required):
${referenceArtists.join(', ')}

AVAILABLE TRACKS (${tracks.length}):
${tracks.map((t, i) => {
  const priority = t.inUserLibrary ? '⭐' : '';
  const mik = t.mikData?.analyzed ? '🎹' : '';
  return `${i + 1}. ${mik}${priority} "${t.name}" by ${t.artists} | Key: ${t.camelotKey} | BPM: ${t.bpm} | Energy: ${t.energy}/10`;
}).join('\n')}

Legend:
⭐ = In user's library (PRIORITIZE)
🎹 = MIK-analyzed (superior harmonic data)

YOUR TASK:
1. Select EXACTLY ${targetTracks} tracks
2. Include ~2 tracks per Include artist (${includeArtists.length * 2} tracks total)
3. Fill remaining ${targetTracks - (includeArtists.length * 2)} with tracks matching Reference style
4. PRIORITIZE tracks with ⭐ (user's library)
5. PRIORITIZE tracks with 🎹 (MIK analysis) for better harmonic mixing
6. Ensure harmonic compatibility (Camelot wheel)
7. Maintain smooth BPM transitions
8. Build to requested energy curve: ${energyCurve}

PRIMARY GOAL: Create the highest quality harmonic mix possible.

Respond with ONLY a JSON array of track indices:
[1, 5, 12, ...]`;
```

---

## Data Merging Strategy

### Step 1: Match by Track Signature
```typescript
function matchTracks(mikTrack: MikTrack, appleTrack: AppleTrack): number {
  // Calculate similarity score (0-100)
  let score = 0;

  // Exact match on title + artist
  if (
    normalize(mikTrack.title) === normalize(appleTrack.name) &&
    normalize(mikTrack.artist) === normalize(appleTrack.artist)
  ) {
    score = 100;
  }

  // Fuzzy match
  else {
    const titleSim = similarity(mikTrack.title, appleTrack.name);
    const artistSim = similarity(mikTrack.artist, appleTrack.artist);
    score = (titleSim + artistSim) / 2 * 100;
  }

  // BPM similarity (if available)
  if (mikTrack.bpm && appleTrack.bpm) {
    const bpmDiff = Math.abs(mikTrack.bpm - appleTrack.bpm);
    if (bpmDiff < 2) score += 20;
  }

  return score;
}
```

### Step 2: Merge Datasets
```typescript
const merged = appleMusicMatches.map(appleTrack => {
  // Find best MIK match
  const mikMatches = mikTracks
    .map(mik => ({ mik, score: matchTracks(mik, appleTrack) }))
    .filter(m => m.score > 80) // 80% confidence threshold
    .sort((a, b) => b.score - a.score);

  const bestMatch = mikMatches[0]?.mik;

  return {
    spotifyId: appleTrack.spotifyId,
    spotifyMetadata: appleTrack.spotifyTrack,
    mikData: bestMatch ? {
      bpm: bestMatch.bpm,
      camelotKey: bestMatch.camelotKey,
      energy: bestMatch.energy,
      analyzed: true,
      confidence: mikMatches[0].score,
    } : undefined,
    inUserLibrary: true,
    source: bestMatch ? 'mik-matched' : 'apple-music-only',
  };
});
```

---

## Expected Results

### Before (Current):
- Track pool: 4,080 tracks (MIK only)
- Fred again tracks: 0
- Rufus tracks: 1
- Playlist quality: 15/100, 0% harmonic

### After (New Architecture):
- Track pool: 48,474 (library) + ~90 (Spotify search for 3 Include artists)
- Fred again tracks: ~30 available, ~2 selected
- Rufus tracks: ~30 available, ~2 selected
- Playlist composition: ~6 tracks from Include artists, ~28 from library/similar
- Mix quality: Target >70/100, >60% harmonic

---

## Timeline

### Immediate (Tonight):
1. ✅ Let Apple Music matching complete (4-5 hours)
2. ⏱️ Create data merge script
3. ⏱️ Test unified library loading

### Tomorrow:
4. ⏱️ Implement Spotify artist search
5. ⏱️ Update playlist generation to use new track pool
6. ⏱️ Update Claude AI selection prompt
7. ⏱️ Test with real prompts

### Testing:
```
Test Prompt:
"Long run mix for 2 hours. Include: Fred again, Rufus du sol, disclosure. Reference: fatboy slim, tame impala, chemical brothers."

Expected:
- 34 tracks total
- ~2 Fred again (from Spotify search + library if available)
- ~2 Rufus (from Spotify search + library)
- ~2 Disclosure (from Spotify search + library)
- ~28 tracks similar to Reference artists (from library)
- Mix quality >70/100
- Harmonic mixing >60%
```

---

## Success Criteria

1. ✅ Uses ALL 48,474 library tracks
2. ✅ Searches Spotify for Include artists
3. ✅ Prioritizes user's saved/liked tracks
4. ✅ Uses MIK data for superior harmonic analysis
5. ✅ Includes ~2 tracks per Include artist
6. ✅ Mix quality >70/100
7. ✅ Harmonic mixing >60%
8. ✅ Smooth BPM transitions
9. ✅ Matches or exceeds Spotify AI quality

---

## File Changes Required

### New Files:
- `scripts/merge-data-sources.ts` - Merge MIK + Apple Music data
- `lib/spotify-artist-search.ts` - Search Spotify for artists
- `data/unified-library.json` - Merged dataset (will be ~200MB)

### Modified Files:
- `app/api/generate-playlist/route.ts` - Use unified library + Spotify search
- `lib/enhanced-track-selector.ts` - Update Claude prompt for ~2 tracks per artist
- `lib/playlist-nlp.ts` - Already correct
- `lib/automix-optimizer.ts` - Prefer MIK data over Spotify features

### Data Files:
- `data/matched-tracks.json` - Keep for reference (4,080 MIK tracks)
- `data/apple-music-checkpoint.json` - Complete matching (→ 100%)
- `data/unified-library.json` - NEW: Merged dataset
- `.vercelignore` - Exclude large data files

---

## Next Steps

**User Decision Required:**
1. ✅ Approve this architecture?
2. ⏱️ Wait for Apple Music matching to complete (~4-5 hours)?
3. ⏱️ Implement data merge + Spotify search (~1 day)?

**Or:**
- Alternative: Skip Apple Music matching, use only Spotify search + current MIK data?
