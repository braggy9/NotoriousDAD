# Mix Generation Enhancement Roadmap

**Date**: January 12, 2026 (Updated: January 13, 2026)
**Focus**: Audio Mix Generation (downloadable MP3s)
**Current Status**: 13,016 files on server (44.9% of MIK library), basic mixing operational

---

## Current Capabilities ✅

- **Audio Library**: 13,016 tracks on Hetzner (44.9% of MIK library, growing to 26,237)
- **Mix Generation**: FFmpeg-based with crossfades
- **Track Selection**: BPM/energy filtering + Claude AI genre detection
- **Harmonic Ordering**: Camelot Wheel algorithm
- **Mix Quality**: Professional crossfades (16-32 bars)

---

## Short-term Enhancements (1-2 weeks)

### 1. ⭐ Complete Library Upload (HIGH PRIORITY)

**Goal**: Upload remaining 2,728 files (9.4% of library) currently blocked by 20MB limit

**Why**:
- Gets you to 100% coverage of MIK-analyzed tracks
- No additional cost (149GB free space available)
- Larger files are often full-length club edits (valuable for DJing)

**Implementation**:
```bash
# Remove size limit, upload everything
rsync -avz --progress \
  "/Users/tombragg/Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed/" \
  root@178.156.214.56:/var/www/notorious-dad/audio-library/
```

**Effort**: 2-3 hours upload time
**Impact**: 100% library coverage (28,965 files)

---

### 2. ⭐ Playlist-to-Mix Integration (HIGH VALUE)

**Goal**: Generate audio mixes from Spotify playlists

**User Flow**:
1. User provides Spotify playlist URL
2. System matches playlist tracks to local files on server
3. Shows match rate (e.g., "24 of 30 tracks available locally")
4. Generates audio mix with available tracks
5. Lists missing tracks (for future download)

**Implementation**:

**New API Endpoint**: `/api/playlist-to-mix`
```typescript
POST /api/playlist-to-mix
{
  "playlistUrl": "https://open.spotify.com/playlist/...",
  "trackCount": 30  // Optional: use all or limit
}

// Response:
{
  "jobId": "mix-...",
  "matchedTracks": 24,
  "totalTracks": 30,
  "missingTracks": [
    { "name": "Track 1", "artist": "Artist 1" },
    // ... 6 missing tracks
  ]
}
```

**Files to Modify**:
1. Create `app/api/playlist-to-mix/route.ts`
2. Add `lib/spotify-playlist-matcher.ts` (matches Spotify tracks → local files)
3. Reuse existing `lib/mix-engine.ts` (no changes needed)

**Match Algorithm**:
```typescript
function matchTrackToLocal(
  spotifyTrack: SpotifyTrack,
  localLibrary: IndexedAudioFile[]
): IndexedAudioFile | null {
  // Priority 1: Exact Spotify ID match (from matched-tracks.json)
  // Priority 2: Artist + title fuzzy match (Levenshtein distance)
  // Priority 3: Artist match + similar BPM/key
}
```

**Effort**: 1 day development
**Impact**: Bridges Spotify playlists → audio mixes

---

### 3. Enhanced Mix Points (MEDIUM PRIORITY)

**Goal**: Use MIK's detailed structural analysis for better transitions

**Current**: Uses simple 97% rule (mix out at 97% of track)

**Enhanced**: Use MIK v3 mix points
- Detected intro/outro points
- Drop locations
- Breakdown sections
- Ideal crossfade duration per track

**Implementation**:

**Step 1**: Export enhanced MIK data
```bash
cd ~/spotify-library-downloader
npm run export-mik-enhanced  # New script to create
```

**Step 2**: Update cloud library format
```typescript
// Add to audio-library-analysis.json
interface CloudAudioTrack {
  // ... existing fields
  mixPoints?: {
    mixInPoint: number;      // Seconds into track
    mixOutPoint: number;     // When to start fade out
    dropPoint?: number;      // Main drop/peak
    breakdownPoint?: number; // Breakdown/build section
  };
  segments?: Array<{
    type: 'intro' | 'verse' | 'buildup' | 'drop' | 'breakdown' | 'outro';
    startTime: number;
    endTime: number;
    avgEnergy: number;
  }>;
}
```

**Step 3**: Use in mix engine (already supported!)
- `lib/mix-engine.ts` already checks for `mixPoints` and uses them
- Just need to populate the data

**Effort**: 1 day for MIK export + testing
**Impact**: More professional-sounding mixes with perfect transitions

---

### 4. Genre Detection Improvements (LOW PRIORITY)

**Goal**: Better genre filtering accuracy

**Current Issues**:
- Relies on artist names and titles
- Claude AI helps but ~80% accuracy
- Example: "indie house remix" might get misclassified

**Solutions**:

**Option A**: Add genre tags to library
```bash
# Add genre to audio-library-analysis.json
# Extract from MIK or ID3 tags
{
  "genre": "House",
  "subgenre": "Deep House",
  "tags": ["electronic", "dance", "4x4"]
}
```

**Option B**: Use Spotify Audio Features API
```typescript
// For matched tracks, get Spotify's genre classification
// Store in matched-tracks.json
{
  "spotifyGenres": ["house", "dance", "electronic"]
}
```

**Option C**: Filename pattern detection
```typescript
// Many files have genre in brackets
// "[House] Artist - Track.mp3"
// "Artist - Track (Tech House Remix).mp3"
function extractGenreFromFilename(filename: string): string[] {
  // Regex patterns for common genre formats
}
```

**Effort**: 1-2 days
**Impact**: Better track selection for genre-specific mixes

---

## Medium-term Enhancements (1-2 months)

### 5. Smart Transition Types

**Goal**: Vary transition styles based on track energy and structure

**Current**: Uses same crossfade type for all transitions

**Enhanced**: Choose transition type dynamically
- **Long Blend** (32 bars): Low energy → low energy (ambient, downtempo)
- **Standard Crossfade** (16 bars): Most transitions
- **Quick Cut** (4 bars): High energy → high energy (techno, drum & bass)
- **Breakdown Drop**: Track 1 breakdown → Track 2 drop (creates excitement)
- **Echo Out**: Track 1 fades with echo → Track 2 drops in clean

**Implementation**: Already partially built in `lib/mix-engine.ts:98-140`
- Just needs logic to select transition type based on:
  - Energy delta (track1.energy - track2.energy)
  - Genre match
  - Detected drops/breakdowns

**Effort**: 2-3 days
**Impact**: More dynamic, DJ-quality mixes

---

### 6. Energy Curve Implementation

**Goal**: Shape mix energy over time (warm up, peak, cool down)

**Current**: Random track order, then harmonic reordering

**Enhanced**: Score tracks by target energy at each position
```typescript
// For a "build" curve (warm up set):
// Position 1-5:   Energy 3-5 (chill start)
// Position 6-15:  Energy 5-7 (building)
// Position 16-20: Energy 7-9 (peak)

function getTargetEnergyForPosition(
  position: number,
  totalTracks: number,
  curve: 'build' | 'peak' | 'chill' | 'steady'
): { min: number; max: number } {
  // Calculate ideal energy range for this position in mix
}
```

**Effort**: 2 days
**Impact**: Mixes feel like professional DJ sets with narrative arc

---

### 7. Web Upload Interface

**Goal**: Allow users to upload tracks via web interface

**Current**: Must SSH to server and use rsync

**New Workflow**:
1. User visits https://mixmaster.mixtape.run/upload
2. Drag-and-drop audio files or select from computer
3. Server analyzes files with aubio/keyfinder
4. Adds to audio-library-analysis.json automatically
5. Available immediately for mix generation

**Implementation**:
```typescript
// New endpoint
POST /api/upload-track
Content-Type: multipart/form-data

// Process with:
// 1. Save to /var/www/notorious-dad/audio-library/
// 2. Run aubio BPM detection
// 3. Extract MIK tags if present
// 4. Update audio-library-analysis.json
// 5. Return track metadata
```

**Security Considerations**:
- File size limit (50MB)
- File type validation (.mp3, .m4a, .flac, .wav only)
- Virus scanning (clamav)
- Rate limiting (5 files per minute)
- Authentication (require Spotify login)

**Effort**: 3-4 days
**Impact**: Easy library expansion without SSH

---

## Long-term Enhancements (3+ months)

### 8. Spotify Download Integration

**Goal**: Auto-download missing tracks from Spotify playlists

**Challenge**: Can't download directly from Spotify (DRM, ToS)

**Solution**: Use existing spotify-library-downloader workflow
1. Match Spotify track → YouTube video (via yt-dlp)
2. Download audio from YouTube
3. Analyze with MIK (BPM/key)
4. Upload to server

**See**: `HANDOVER-TRACK-DOWNLOADING.md` for detailed implementation guide

**Legal Note**: For personal use only, respects copyright

**Effort**: 1-2 weeks (integrate existing tools)
**Impact**: Can generate mixes from ANY Spotify playlist

---

### 9. Real-time Mix Preview

**Goal**: Preview mix in browser before downloading

**Implementation**:
- Generate mix in chunks
- Stream via HTTP range requests
- Show waveform visualization
- Allow adjusting crossfade points before final render

**Technology**: Web Audio API + Canvas

**Effort**: 2 weeks
**Impact**: Better user experience, fewer re-generates

---

### 10. Collaborative Mixing

**Goal**: Multiple users can contribute tracks to a mix

**Features**:
- Share mix URL with friends
- Friends suggest tracks from their libraries
- Vote on track order
- Final mix includes everyone's contributions

**Effort**: 3-4 weeks
**Impact**: Social feature, expands use case

---

## Recommended Priority Order

### Phase 1 (This Month)
1. ✅ **Complete library upload** (remove 20MB limit) - 3 hours
2. ⭐ **Playlist-to-mix integration** - 1 day
3. ⭐ **Enhanced mix points** (use MIK v3 data) - 1 day

**Result**: Seamless Spotify playlist → audio mix workflow

### Phase 2 (Next Month)
4. **Smart transition types** - 2-3 days
5. **Energy curve implementation** - 2 days
6. **Genre detection improvements** - 1-2 days

**Result**: Professional-quality mixes with dynamic transitions

### Phase 3 (Future)
7. **Web upload interface** - 3-4 days
8. **Spotify download integration** - 1-2 weeks
9. **Real-time preview** - 2 weeks

**Result**: Complete end-to-end platform

---

## Quick Wins (Do Today)

### Remove 20MB Size Limit
Already running! Upload will expand library to 28,965 files.

### Test Enhanced Mix Points
Your MIK files already have some analysis data:
```bash
# Check if mix points exist in MIK database
cd ~/spotify-library-downloader
npm run check-mik-mix-points  # If script exists
```

### Create Playlist-to-Mix Proof of Concept
```bash
# Create a simple script that:
# 1. Gets tracks from Spotify playlist
# 2. Matches to local files
# 3. Prints match rate
node scripts/test-playlist-matching.js "https://open.spotify.com/playlist/..."
```

---

## Metrics to Track

**Library Coverage**:
- Files on server: 13,016 (current) → 26,237 (target under-20MB) → 28,965 (100%)
- Match rate: Spotify tracks → local files (target: 60%+)

**Mix Quality**:
- Harmonic compatibility: % of transitions that are Camelot-compatible (target: 80%+)
- Energy flow smoothness: Standard deviation of energy changes (target: <1.5)
- Transition quality score: User ratings (target: 4+/5)

**Performance**:
- Mix generation time: Currently ~28s for 3 tracks (target: <2 min for 30 tracks)
- Server load: CPU usage during mixing (target: <70%)
- Disk space: Library size vs available (currently: 111GB used, 149GB free)

---

**Last Updated**: January 12, 2026
**Next Review**: After Phase 1 completion
