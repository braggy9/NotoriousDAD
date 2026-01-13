# Mix Generation Engine - Technical Analysis

**Date**: January 12, 2026
**System**: Notorious DAD Audio Mix Generator
**Server**: Hetzner CPX31 (mixmaster.mixtape.run)

---

## Overview

The mix generation system creates **actual audio mixes** (downloadable MP3 files) from your library of audio files stored on the Hetzner server. This is **distinct from the Spotify playlist generator**, which creates streaming playlists.

---

## Two Separate Systems

### System 1: **Spotify Playlist Generator** (Metadata-Based)
- **API Endpoint**: `/api/generate-playlist`
- **Input**: Natural language prompt
- **Data Sources**:
  - Apple Music matches (~40,000 tracks with playcounts)
  - MIK metadata (~9,982 tracks with BPM/key)
  - Spotify catalog search (for Include artists)
- **Output**: Spotify playlist URL (links to streaming tracks)
- **Uses AI**: Claude for track selection and playlist naming
- **No audio files needed**: Works with metadata only

### System 2: **Audio Mix Generator** (File-Based) ← Your Question
- **API Endpoint**: `/api/generate-mix`
- **Input**: Natural language prompt + track count
- **Data Sources**:
  - **ONLY files on Hetzner server** (currently 12,669 files, expanding to ~26,237)
  - MIK metadata from those files (BPM, Camelot key, energy)
- **Output**: Mixed MP3 audio file (downloadable)
- **Uses AI**: Claude for prompt parsing and genre filtering
- **Requires audio files**: Cannot mix tracks that don't exist on server

---

## Audio Mix Generation Pipeline

### Phase 1: Prompt Understanding (AI-Powered)

**Tool**: Claude Sonnet 4 API

**Input Example**: "energetic house mix for 30 tracks with building energy"

**Extraction**:
```typescript
{
  trackCount: 30,           // Explicit or default
  bpmRange: { min: 115, max: 135 },  // House music range
  energyRange: { min: 5, max: 9 },    // High energy
  genres: ["house"],        // Detected genre
  moods: ["energetic"],     // Mood descriptors
  energyCurve: "build"      // Energy progression
}
```

**Fallback**: If Claude API unavailable, uses regex-based parser

---

### Phase 2: Track Selection (Deterministic + AI Genre Filter)

**Step 1: Load Audio Library**
- Reads: `/var/www/notorious-dad/data/audio-library-analysis.json`
- Contains: All analyzed files on server with:
  - File path, artist, title
  - BPM (from aubio analysis)
  - Camelot key (from MIK tags or keyfinder-cli)
  - Energy level (1-10 scale)
  - Duration, file size

**Step 2: Filter by BPM**
```typescript
filtered = pool.filter(track =>
  track.bpm >= 115 && track.bpm <= 135
);
```

**Step 3: Filter by Energy**
```typescript
filtered = filtered.filter(track =>
  track.energy >= 5 && track.energy <= 9
);
```

**Step 4: Genre Filter (AI-Powered)**
- **If genres specified** (e.g., "house", "techno"):
  - Sends track list to Claude AI
  - Claude analyzes artist names and titles
  - Returns indices of tracks matching genre
  - Example: "Disclosure - Latch" → matches "house"
  - Example: "Foals - Alabaster" → might exclude (indie rock)

**Step 5: Expand if Needed**
- If not enough tracks after filtering:
  - Expands BPM range by ±15
  - Re-applies genre filter to expanded pool
  - If still not enough, relaxes genre filter

**Step 6: Shuffle & Select**
```typescript
shuffled = filtered.sort(() => Math.random() - 0.5);
return shuffled.slice(0, 30); // Take requested count
```

---

### Phase 3: Harmonic Ordering (MIK-Based)

**Tool**: `lib/automix-optimizer.ts` (Camelot Wheel algorithm)

**Input**: 30 selected tracks (random order)

**Process**:
1. Converts to Spotify-compatible format (for reusing playlist code)
2. Maps MIK data:
   - Camelot key → Spotify key number (0-11)
   - BPM → tempo
   - Energy (1-10) → energy (0-1)
3. Runs `optimizeTrackOrder()` with `prioritizeHarmonic: true`
4. Uses Camelot Wheel compatibility rules:
   - **Perfect mix**: Same key (8A → 8A)
   - **Energy boost**: +1 number (8A → 9A)
   - **Mood change**: Same number, switch letter (8A → 8B)
   - **Dramatic shift**: +7 (relative minor/major)

**Output**: Harmonically ordered track sequence
- Example: 8A → 9A → 9B → 10B → 10A → 11A (smooth progression)

---

### Phase 4: Audio Mixing (FFmpeg-Based)

**Tool**: `lib/mix-engine.ts` + FFmpeg

**Process for Each Transition**:

1. **Load Track Analysis**
   - Duration from file
   - Mix points (if pre-analyzed, otherwise auto-detect)
   - BPM and key from MIK data

2. **Calculate Crossfade Duration**
   ```typescript
   bars = 16; // Standard DJ mix (16 bars = 4 phrases)
   avgBPM = (track1.bpm + track2.bpm) / 2;
   crossfadeSeconds = (bars * 4 * 60) / avgBPM;
   // Example: 16 bars at 128 BPM = 30 seconds
   ```

3. **Determine Mix Points**
   - **Mix Out Point** (track 1): 97% of duration (keeps tracks long)
     - Example: 3-minute track → mix out at 2:55
   - **Mix In Point** (track 2): Usually 0 (start of track)
   - **Crossfade overlap**: 30 seconds (or calculated from bars)

4. **BPM Adjustment (if needed)**
   - If BPM difference > 1 and < 10:
     - Stretches track 2 to match track 1
     - Uses FFmpeg's `atempo` filter
     - Example: 125 BPM → 128 BPM (+2.4% speed)

5. **Build FFmpeg Command**
   ```bash
   ffmpeg -y \
     -i "track1.mp3" \
     -i "track2.mp3" \
     -filter_complex "\
       [0:a]atrim=0:175,asetpts=PTS-STARTPTS[a1]; \
       [1:a]atrim=0:,asetpts=PTS-STARTPTS,atempo=1.024[a2]; \
       [a1][a2]acrossfade=d=30:c1=tri:c2=tri[out]" \
     -map "[out]" \
     -codec:a libmp3lame -q:a 2 \
     "mix-temp.mp3"
   ```

6. **Iterative Mixing**
   - Mixes track 1 + track 2 → `temp1.mp3`
   - Mixes `temp1.mp3` + track 3 → `temp2.mp3`
   - Continues until all 30 tracks combined
   - Final output: `Session-Mix.mp3`

7. **Progress Tracking**
   - Analyzing: 0-20%
   - Processing: 20-80% (grows with each track)
   - Rendering: 80-90%
   - Complete: 100%

---

## What Uses MIK Data

**✅ Currently Used**:
1. **BPM filtering** - Selects tracks in BPM range
2. **Energy filtering** - Selects tracks matching energy level
3. **Camelot key ordering** - Harmonic progression between tracks
4. **Crossfade timing** - Calculates bars based on BPM
5. **BPM matching** - Stretches tracks to sync beats

**❌ NOT Currently Used** (but available):
1. **MIK mix points** - If v3 enhanced data exists (mixInPoint, mixOutPoint)
2. **Structural segments** - Intro/verse/drop detection
3. **Transition hints** - Preferred transition types

---

## What Uses Spotify Data

**In Mix Generation**: **NOTHING**

The audio mix generator does **NOT** use:
- ❌ Spotify catalog search
- ❌ Spotify recommendations
- ❌ Spotify audio features API
- ❌ Apple Music playcounts

**Why?** Because it needs **actual audio files**. Spotify only provides:
- Streaming links (can't download)
- Metadata (not audio)
- Preview clips (30 seconds, not full tracks)

---

## Integration Possibilities

### Option 1: Hybrid System (Playlist → Audio Mix)

**User Flow**:
1. Generate Spotify playlist with `/api/generate-playlist`
2. Get playlist tracks (with MIK metadata if available)
3. **Match tracks** to files on Hetzner server
4. **Filter** to only tracks that exist locally
5. Generate audio mix with `/api/generate-mix` using matched files

**Limitation**: Only ~12,669 tracks (soon ~26,237) on server vs ~48,000 in playlists

**Success Rate**:
- If all playlist tracks are in your MIK-analyzed folder: High
- If playlist includes Spotify-only tracks: Low (would need downloading)

### Option 2: Expand Library on Server

**Current**:
- 12,669 files on server (under 20MB, ~49% of library)
- **In progress**: Uploading 13,568 more files → 26,237 total (90% of library)

**Next Level**:
- Remove 20MB limit → Upload all 28,965 MIK files
- Would need +75GB storage (currently 149GB free, plenty of room)
- Cost: No increase (within current volume)

### Option 3: Enhanced Mix Points (Use Full MIK Data)

**Current**: Basic mix points (97% of track)

**Enhanced** (if you analyze with v3 system):
- Use MIK's detected mix in/out points
- Use structural segments (intro/drop/outro)
- Use transition hints (crossfade length recommendations)
- **Result**: More professional-sounding mixes

---

## Current Limitations

### 1. Library Size
- **On Server**: 12,669 files (expanding to ~26,237)
- **In MIK Library**: 28,965 files total
- **Missing**: 2,728 files over 20MB (9.4%)

### 2. No Spotify Integration for Audio
- Cannot download Spotify tracks
- Cannot use Spotify recommendations for audio mixes
- Can only mix files physically on server

### 3. Genre Detection Quality
- Relies on artist names and track titles
- Claude AI helps but not 100% accurate
- Example: "indie house remix" might get misclassified

### 4. Basic Mix Points
- Uses simple "97% of track" rule
- Could be improved with MIK's detailed analysis
- No breakdown/drop detection (yet)

---

## Recommendations

### Immediate (Happening Now)
✅ **Upload remaining under-20MB files** (13,568 files)
- Will give you 26,237 files total (90% coverage)
- No additional storage cost

### Short-term
1. **Remove 20MB size limit** → Upload all 28,965 files
   - Needs: +75GB storage (you have 149GB free)
   - Cost: $0 (within current volume)

2. **Integrate with Spotify playlists**
   - Add endpoint: `/api/playlist-to-mix`
   - Input: Spotify playlist URL
   - Match tracks to local files
   - Generate audio mix with matched tracks

3. **Improve genre filtering**
   - Add genre tags to audio-library-analysis.json
   - Use filename patterns (e.g., "[House]" in filename)
   - Could analyze with Spotify API if tracks are matched

### Long-term
1. **Enhanced Mix Points**
   - Run MIK v3 structural analysis
   - Store mix points, segments, transition hints
   - Use in FFmpeg mixing for pro-quality transitions

2. **Dynamic Library**
   - Add upload API (`/api/upload-track`)
   - Users can upload files via web interface
   - Auto-analyze with aubio/keyfinder on upload

3. **Spotify Download Integration**
   - Connect to spotify-library-downloader
   - Auto-download missing tracks from playlists
   - Requires: yt-dlp + YouTube matching

---

## Summary: What Actually Happens

**Your Input**: "energetic house mix, 30 tracks, building energy"

**Step-by-Step**:
1. Claude parses: house genre, 115-135 BPM, energy 5-9, build curve
2. Loads 12,669 files from server (soon 26,237)
3. Filters to ~500 tracks in BPM range
4. Filters to ~300 tracks with high energy
5. **Claude AI**: Filters to ~150 house tracks (genre detection)
6. Randomly selects 30 tracks
7. **Camelot algorithm**: Reorders for harmonic mixing (8A→9A→9B...)
8. **FFmpeg**: Mixes 30 tracks with 30-second crossfades
9. Returns: `Energetic-House-Build-Mix.mp3` (~1 hour, 111MB)

**What it uses**:
- ✅ MIK metadata (BPM, key, energy) from server files
- ✅ Claude AI (prompt parsing, genre filtering)
- ✅ Camelot Wheel (harmonic ordering)
- ✅ FFmpeg (audio mixing with crossfades)
- ❌ Spotify API (not used for audio mixing)
- ❌ Apple Music (not used for audio mixing)

**Limitation**: Can only mix tracks that physically exist on server.

---

**Last Updated**: January 12, 2026 10:30 AM UTC
