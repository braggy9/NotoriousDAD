# Handover: Track Downloading Architecture

**Date**: January 12, 2026
**Purpose**: Guide for implementing automatic track downloading from Spotify/Apple Music
**Target**: Next Claude Code session or developer
**Status**: Planning phase - not yet implemented

---

## Executive Summary

**Goal**: Automatically download audio files for tracks in Spotify playlists to enable audio mix generation

**Challenge**: Cannot download directly from Spotify or Apple Music (DRM, licensing, ToS)

**Solution**: Use existing `spotify-library-downloader` workflow via YouTube

**Key Insight**: You already have a working download system! Just need to integrate it with mix generator.

---

## Current Architecture

### System 1: Spotify Playlist Generator (Metadata)
```
User prompt → Claude AI → Track selection
                         ↓
                    Apple Music matches (40k tracks)
                    MIK metadata (10k tracks)
                    Spotify catalog search
                         ↓
                    Create Spotify playlist
                         ↓
                    Return playlist URL
```
**Files**: `/api/generate-playlist/route.ts`
**Output**: Streaming playlist (no downloads needed)

---

### System 2: Audio Mix Generator (Files)
```
User prompt → Claude AI → Parse constraints
                         ↓
                    Load server audio library
                    (12,669 → 26,237 files)
                         ↓
                    Filter by BPM/energy/genre
                         ↓
                    Harmonic ordering (Camelot)
                         ↓
                    FFmpeg mixing with crossfades
                         ↓
                    Return downloadable MP3
```
**Files**: `/api/generate-mix/route.ts`, `lib/mix-engine.ts`
**Limitation**: ONLY works with files on Hetzner server

---

## The Gap

**Problem**:
- User wants to generate audio mix from Spotify playlist
- Mix generator needs actual audio files
- Spotify playlist only has streaming links

**Example**:
```
User: "Generate audio mix from this playlist"
      https://open.spotify.com/playlist/37i9dQZF1DXa2PvUpywmrr

System checks server:
- Playlist has 50 tracks
- Server has 24 matching files (48%)
- 26 tracks missing (52%)

Result: Can only create partial mix
```

**What we need**: Automatic download of missing 26 tracks

---

## Why Direct Download Isn't Possible

### Spotify
- ❌ **DRM Protected**: All Spotify audio is encrypted
- ❌ **No API**: Spotify API only provides metadata, not audio streams
- ❌ **Terms of Service**: Downloading violates Spotify ToS
- ❌ **Premium Required**: Can't even stream without paying
- ⚠️ **Legal Risk**: Copyright violation in most jurisdictions

### Apple Music
- ❌ **DRM Protected**: FairPlay encryption on all downloads
- ❌ **No Export API**: Apple Music API doesn't provide download links
- ❌ **Subscription Required**: Files only accessible while subscribed
- ❌ **Offline Downloads Expire**: Even "downloaded" files have DRM checks
- ⚠️ **Legal Risk**: Circumventing DRM is illegal (DMCA Section 1201)

---

## The Legal Solution: YouTube via yt-dlp

### Why YouTube?
- ✅ **No DRM**: YouTube videos are not encrypted
- ✅ **Legal Gray Area**: Personal use downloads are tolerated
- ✅ **yt-dlp Tool**: Mature, reliable downloader
- ✅ **High Quality**: Often has 320kbps audio
- ✅ **Metadata**: Can extract artist/title from video info
- ⚠️ **Best Effort**: Not all tracks available, quality varies

### Legal Note
**For personal, non-commercial use only**. Downloading copyrighted music from YouTube may violate terms of service and copyright law in some jurisdictions. This is for:
- Personal DJ practice and mixtapes
- Educational purposes
- Tracks you already own licenses for (Spotify Premium, Apple Music subscription)

**Do not**:
- Distribute downloaded tracks
- Use for commercial purposes
- Share mixes publicly without proper licensing

---

## Existing Infrastructure: spotify-library-downloader

**Location**: `~/spotify-library-downloader`
**Purpose**: Already downloads Spotify tracks via YouTube!

### Current Workflow (Working!)
```
1. Get Spotify liked songs/playlists
   ↓
2. For each track, search YouTube
   (Artist + Title + "audio" or "official")
   ↓
3. Download via yt-dlp
   ↓
4. Save to ~/DJ Music/5-New-To-Analyze/
   ↓
5. Mixed In Key analyzes (BPM + key)
   ↓
6. Move to ~/DJ Music/2-MIK-Analyzed/
   ↓
7. Sync to mix generator via rsync
   ↓
8. Available for audio mixing!
```

### Key Scripts (Already Built!)
```bash
cd ~/spotify-library-downloader

# Download all playlists
npm run download-playlists-parallel

# Download specific playlist
npm run download-playlist -- "playlist_id"

# Watch for MIK-analyzed files
npm run mik-watch

# Export to mix generator
npm run sync-mix-generator
```

**Files**:
- `scripts/download-playlist.ts` - Main downloader
- `scripts/parallel-downloader.ts` - Batch processing
- `scripts/mik-watch.ts` - Auto-move analyzed files
- `scripts/sync-to-mix-generator.ts` - Export to dj-mix-generator

---

## Architecture Options

### Option A: Manual Workflow (Current - Already Working!)

**Process**:
1. User creates Spotify playlist
2. User runs spotify-library-downloader
3. Files download to `5-New-To-Analyze/`
4. User analyzes with MIK (drag-and-drop)
5. Files move to `2-MIK-Analyzed/`
6. User runs `npm run sync-mix-generator`
7. Files upload to Hetzner server
8. Available for mix generation

**Pros**:
- ✅ Already working today
- ✅ No new code needed
- ✅ User controls what downloads
- ✅ Quality check before upload

**Cons**:
- ❌ Manual steps
- ❌ Takes time (download + analysis)
- ❌ User needs to remember workflow

---

### Option B: Semi-Automated API (Recommended)

**New Feature**: "Queue downloads for missing tracks"

**Process**:
1. User requests mix from Spotify playlist
2. System matches tracks to server files
3. Shows: "24 of 50 tracks available, 26 missing"
4. User clicks "Download missing tracks"
5. System adds to download queue on server
6. Background job:
   - Searches YouTube for each track
   - Downloads via yt-dlp
   - Analyzes with aubio (BPM)
   - Extracts MIK tags if available
   - Adds to server library
7. System notifies when complete
8. User can retry mix generation

**Implementation**:

**New API Endpoints**:
```typescript
// Check what's missing
POST /api/check-playlist-coverage
{
  "playlistUrl": "https://open.spotify.com/playlist/..."
}
Response: {
  "totalTracks": 50,
  "availableTracks": 24,
  "missingTracks": [
    { "name": "Track 1", "artist": "Artist 1", "spotifyId": "..." }
  ]
}

// Queue downloads
POST /api/queue-downloads
{
  "tracks": [
    { "name": "Track 1", "artist": "Artist 1", "spotifyId": "..." }
  ]
}
Response: {
  "jobId": "download-job-123",
  "queuedCount": 26
}

// Check download progress
GET /api/download-status/{jobId}
Response: {
  "status": "processing",
  "completed": 12,
  "total": 26,
  "failed": 2,
  "eta": "15 minutes"
}
```

**Server-Side Implementation**:
```typescript
// lib/youtube-downloader.ts
import ytdlp from 'youtube-dl-exec';

async function downloadTrackFromYouTube(
  artist: string,
  title: string,
  outputDir: string
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  // 1. Search YouTube
  const query = `${artist} ${title} audio`;
  const searchResults = await ytdlp(query, {
    dumpSingleJson: true,
    flatPlaylist: true,
    defaultSearch: 'ytsearch',
  });

  const bestMatch = searchResults.entries[0]; // First result

  // 2. Download audio
  const outputPath = `${outputDir}/${artist} - ${title}.m4a`;
  await ytdlp(bestMatch.url, {
    format: 'bestaudio[ext=m4a]',
    output: outputPath,
    extractAudio: true,
  });

  // 3. Analyze BPM
  const bpm = await detectBPM(outputPath); // Using aubio

  // 4. Add to library
  await addToAudioLibrary({
    filePath: outputPath,
    artist,
    title,
    bpm,
    // ... other metadata
  });

  return { success: true, filePath: outputPath };
}
```

**Queue Management**:
```typescript
// lib/download-queue.ts
interface DownloadJob {
  id: string;
  tracks: Array<{ artist: string; title: string; spotifyId: string }>;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  progress: { completed: number; failed: number; total: number };
  createdAt: Date;
  completedAt?: Date;
}

// Use SQLite or JSON file for queue storage
// Process queue with background worker (similar to mix jobs)
```

**Pros**:
- ✅ User-triggered (control what downloads)
- ✅ Runs on server (no local machine needed)
- ✅ Queue system (can handle large batches)
- ✅ Progress tracking
- ✅ Integrates with mix generation

**Cons**:
- ⚠️ Needs yt-dlp installed on Hetzner
- ⚠️ YouTube search might find wrong tracks (fuzzy matching)
- ⚠️ Download time adds to mix generation time
- ⚠️ Storage costs (more files on server)

---

### Option C: Fully Automated Background Sync

**Process**:
1. User adds tracks to Spotify "Liked Songs"
2. Background job runs every 6 hours:
   - Fetches new liked songs
   - Checks which aren't on server
   - Downloads missing tracks
   - Analyzes and adds to library
3. User's mix generation always has latest tracks

**Implementation**: Cron job + spotify-library-downloader integration

**Pros**:
- ✅ Fully automated
- ✅ Library always up to date
- ✅ No user action needed

**Cons**:
- ❌ Downloads everything (storage costs)
- ❌ May download low-quality tracks
- ❌ No user control
- ❌ Higher server load

---

## Recommended Approach

### Phase 1: Enhance Existing Manual Workflow
**Time**: 1 day

Make spotify-library-downloader easier to use:

1. **Add playlist URL input**:
   ```bash
   npm run download-from-url -- "https://open.spotify.com/playlist/..."
   ```

2. **Auto-sync after download**:
   ```bash
   # After downloads complete, automatically:
   # 1. Analyze with aubio (skip MIK for now)
   # 2. Upload to Hetzner
   # 3. Update audio-library-analysis.json
   ```

3. **Create simple CLI**:
   ```bash
   ./scripts/sync-playlist-to-mix-generator.sh "playlist_url"
   # Handles: download → analyze → upload → done
   ```

**Deliverable**: Single command that takes Spotify playlist → files on server

---

### Phase 2: Server-Side Download Queue
**Time**: 1 week

Implement Option B (Semi-Automated API):

1. **Install yt-dlp on Hetzner**:
   ```bash
   ssh root@178.156.214.56
   apt-get update && apt-get install -y yt-dlp ffmpeg
   ```

2. **Create download API endpoints** (see Option B above)

3. **Build queue system** with job tracking

4. **Add UI in web app**:
   - "Download missing tracks" button
   - Progress indicator
   - "Ready to mix" notification when complete

**Deliverable**: Web-based track downloading

---

### Phase 3: Smart Matching & Quality
**Time**: 2 weeks

Improve YouTube search accuracy:

1. **Better search queries**:
   ```typescript
   // Try multiple search strategies
   const queries = [
     `${artist} ${title} official audio`,
     `${artist} ${title} audio`,
     `${title} ${artist}`,
     `${artist} ${title} hq`,
   ];
   // Pick best match based on:
   // - Duration (should be ~3-5 minutes for songs)
   // - Views (popular = likely correct)
   // - Title similarity
   ```

2. **Quality filtering**:
   - Prefer 320kbps or higher
   - Reject videos with spoken intro/outro
   - Check BPM matches expected range

3. **Fallback sources**:
   - Try SoundCloud if YouTube fails
   - Check Bandcamp for indie tracks

---

## File Storage Architecture

### Local Machine (Development/Initial)
```
~/spotify-library-downloader/
├── downloads/           # Raw YouTube downloads
├── analyzed/           # After MIK analysis
└── scripts/
    ├── download-from-youtube.ts
    ├── analyze-audio.ts
    └── upload-to-server.ts

~/dj-mix-generator/
└── scripts/
    └── sync-from-downloader.ts
```

### Hetzner Server (Production)
```
/var/www/notorious-dad/
├── audio-library/       # Main audio files (26,237 → ∞)
│   └── [Artist - Title.m4a]
│
├── data/
│   └── audio-library-analysis.json  # Metadata index
│
├── downloads/          # NEW: Temporary download location
│   └── [pending files during download]
│
└── scripts/
    ├── youtube-downloader.ts  # NEW: Server-side downloader
    └── download-queue-worker.ts  # NEW: Background processor
```

### Storage Planning
- **Current**: 111GB used of 260GB total (100GB volume + 160GB disk)
- **With full library**: ~175GB (28,965 files)
- **With downloads**: Add ~50GB buffer for new tracks
- **Total need**: ~225GB (within capacity!)

---

## Integration Points

### 1. Mix Generation → Download Trigger
```typescript
// In /api/generate-mix/route.ts
async function processMixJob(jobId: string, prompt: string, trackCount: number) {
  // ... existing code ...

  const mixableFiles = getMixableFiles(audioIndex);

  if (mixableFiles.length < constraints.trackCount) {
    // NEW: Offer to download more tracks
    return {
      status: 'insufficient_tracks',
      available: mixableFiles.length,
      needed: constraints.trackCount,
      suggestion: 'Would you like to download more tracks from your Spotify library?',
      downloadUrl: '/api/queue-downloads'
    };
  }
}
```

### 2. Spotify Playlist → Download Queue
```typescript
// NEW: /api/playlist-to-mix/route.ts
export async function POST(request: NextRequest) {
  const { playlistUrl } = await request.json();

  // 1. Get playlist tracks from Spotify
  const playlistTracks = await fetchSpotifyPlaylist(playlistUrl);

  // 2. Match to local library
  const matches = matchTracksToLibrary(playlistTracks, serverLibrary);

  // 3. Identify missing
  const missing = playlistTracks.filter(t => !matches.has(t.id));

  if (missing.length > 0) {
    return {
      status: 'partial_match',
      matched: matches.size,
      missing: missing.length,
      missingTracks: missing,
      downloadQueueUrl: '/api/queue-downloads'
    };
  }

  // 4. If all available, generate mix immediately
  return generateMixFromMatches(matches);
}
```

### 3. spotify-library-downloader Integration
```typescript
// In spotify-library-downloader project
// NEW: Export function for mix-generator to call

export async function downloadTrackForMixGenerator(
  spotifyTrack: { artist: string; title: string; id: string },
  outputDir: string
): Promise<{ success: boolean; filePath?: string }> {
  // Uses existing download-playlist.ts logic
  // Returns file path when complete
}
```

---

## Technical Requirements

### Server Dependencies
```bash
# On Hetzner server
apt-get update
apt-get install -y \
  yt-dlp \        # YouTube downloader
  ffmpeg \        # Audio processing
  aubio-tools \   # BPM detection (already installed)
  python3 \       # yt-dlp dependency
  atomicparsley   # MP4 metadata
```

### Node.js Packages
```json
{
  "dependencies": {
    "youtube-dl-exec": "^2.4.0",  // yt-dlp wrapper
    "music-metadata": "^8.1.4",    // Read audio metadata
    "levenshtein": "^1.0.5"        // Fuzzy string matching
  }
}
```

### Storage Capacity Check
```bash
# Before implementing, verify space
ssh root@178.156.214.56 'df -h'

# Expected:
# /dev/sda (disk): 160GB, ~30GB used, 130GB free
# /dev/sdb (volume): 100GB, 111GB used, -11GB free (OVER!)

# ACTION: Files are currently on volume (full), move some to main disk
```

---

## Security & Legal Considerations

### Terms of Service
- **YouTube**: Downloading violates ToS but rarely enforced for personal use
- **Spotify**: No downloading allowed, only streaming
- **Apple Music**: Offline downloads expire and are DRM-protected

### Copyright
- Downloaded tracks are copyrighted
- Personal use is generally tolerated
- Distribution or public performance requires licenses

### Recommendations
1. **Personal use only**: Don't share downloaded tracks
2. **Have legal licenses**: Keep Spotify Premium / Apple Music subscription
3. **Don't redistribute mixes**: Generated mixes contain copyrighted music
4. **Attribution**: Credit artists in mix tracklists
5. **Takedown policy**: Remove tracks if requested by rights holders

### Technical Safeguards
```typescript
// Rate limiting
const MAX_DOWNLOADS_PER_HOUR = 50;
const MAX_DOWNLOADS_PER_DAY = 200;

// Verification
async function verifyUserHasSpotifyPremium(userId: string): Promise<boolean> {
  // Check if user has active subscription
  // Only allow downloads if verified
}

// Logging
function logDownload(trackId: string, userId: string, source: string) {
  // Keep records for DMCA compliance
}
```

---

## Testing Strategy

### Unit Tests
```typescript
describe('YouTube Downloader', () => {
  it('should find correct video for track', async () => {
    const result = await searchYouTube('Disclosure', 'Latch');
    expect(result.title).toContain('Latch');
    expect(result.duration).toBeGreaterThan(180); // >3 minutes
  });

  it('should download audio successfully', async () => {
    const file = await downloadTrack('test track', 'test artist');
    expect(fs.existsSync(file.path)).toBe(true);
    expect(file.size).toBeGreaterThan(1000000); // >1MB
  });
});
```

### Integration Tests
```typescript
describe('Playlist to Mix', () => {
  it('should handle missing tracks gracefully', async () => {
    const response = await fetch('/api/playlist-to-mix', {
      method: 'POST',
      body: JSON.stringify({ playlistUrl: '...' })
    });

    const data = await response.json();
    expect(data.status).toBe('partial_match');
    expect(data.missing).toBeGreaterThan(0);
  });
});
```

### Manual Testing
1. Create test Spotify playlist with 10 tracks
2. Delete 5 matching files from server
3. Request mix generation
4. Verify system offers to download missing tracks
5. Download and verify files added to library
6. Re-generate mix successfully

---

## Monitoring & Observability

### Metrics to Track
```typescript
// Download success rate
downloads_total
downloads_successful
downloads_failed
downloads_duration_seconds

// Storage usage
audio_library_size_bytes
audio_library_file_count
disk_usage_percent

// Queue metrics
download_queue_length
download_queue_wait_time_seconds
```

### Alerts
- Download failure rate > 20%
- Disk usage > 85%
- Queue length > 100 tracks
- Average download time > 5 minutes

---

## Migration Path

### Step 1: Proof of Concept (1 day)
```bash
# Test downloading single track manually
cd ~/spotify-library-downloader
npm run download-single-track -- "Disclosure - Latch"

# Verify file quality
aubio-track "Disclosure - Latch.m4a"

# Upload to server
rsync "Disclosure - Latch.m4a" root@178.156.214.56:/var/www/notorious-dad/audio-library/
```

### Step 2: CLI Tool (2 days)
```bash
# Create command-line tool
./sync-playlist.sh "https://open.spotify.com/playlist/..."

# Should:
# 1. Fetch playlist tracks
# 2. Check which are missing on server
# 3. Download missing tracks via YouTube
# 4. Analyze with aubio
# 5. Upload to server
# 6. Print summary
```

### Step 3: Web API (1 week)
- Implement endpoints (see Option B)
- Add UI for download queue
- Test with real playlists

### Step 4: Production Deploy (2 days)
- Install dependencies on Hetzner
- Deploy API endpoints
- Monitor and optimize

---

## Common Issues & Solutions

### Issue: "Could not find track on YouTube"
**Solution**: Try alternative search queries, use Spotify track info (album, year)

### Issue: "Downloaded wrong track (cover version)"
**Solution**: Check duration and popularity, filter out karaoke/tutorial videos

### Issue: "Audio quality is poor"
**Solution**: Prefer official channels, check bitrate, reject videos < 128kbps

### Issue: "Server disk full during download"
**Solution**: Implement cleanup, delete failed downloads, move old files to cold storage

### Issue: "Download is very slow"
**Solution**: Use parallel downloads (max 3), cache frequently requested tracks

---

## Next Steps for Implementation

### For Next Claude Code Session

1. **Read this document** to understand architecture

2. **Review existing spotify-library-downloader**:
   ```bash
   cd ~/spotify-library-downloader
   cat README.md
   cat AUTOMATION.md
   ```

3. **Choose implementation approach**: Manual enhancement (Phase 1) or Server-side API (Phase 2)

4. **Install dependencies** on Hetzner if needed:
   ```bash
   ssh root@178.156.214.56
   apt-get install -y yt-dlp
   ```

5. **Create proof of concept**: Download 1 track, add to library, test mix generation

6. **Iterate**: Build on proof of concept, add error handling, scale up

---

## Resources

### Documentation
- **yt-dlp**: https://github.com/yt-dlp/yt-dlp
- **FFmpeg**: https://ffmpeg.org/documentation.html
- **aubio**: https://aubio.org/manpages.html

### Related Files
- `~/spotify-library-downloader/` - Existing download system
- `~/dj-mix-generator/lib/mix-engine.ts` - Mix generation code
- `~/dj-mix-generator/app/api/generate-mix/route.ts` - Mix API
- `~/dj-mix-generator/data/audio-library-analysis.json` - Server library index

### Testing Playlists
- Personal test playlist: Create one with 10 known tracks
- Public playlist: Use Spotify's "Today's Top Hits" for testing

---

**Last Updated**: January 12, 2026
**Status**: Planning complete, ready for implementation
**Estimated Effort**: 1-2 weeks for full server-side solution
**Legal Status**: For personal, non-commercial use only

---

## Quick Start for Next Session

```bash
# 1. Review existing downloader
cd ~/spotify-library-downloader
npm install
npm run download-playlist -- "37i9dQZF1DXa2PvUpywmrr"  # Test with small playlist

# 2. Check what was downloaded
ls -lh ~/Library/Mobile\ Documents/com~apple~CloudDocs/DJ\ Music/5-New-To-Analyze/

# 3. Upload to server
rsync -avz ~/Library/Mobile\ Documents/com~apple~CloudDocs/DJ\ Music/2-MIK-Analyzed/ \
  root@178.156.214.56:/var/www/notorious-dad/audio-library/

# 4. Test mix generation with newly added tracks
curl -X POST https://mixmaster.mixtape.run/api/generate-mix \
  -H "Content-Type: application/json" \
  -d '{"prompt":"house music","trackCount":10}'
```

**You're ready to implement automatic track downloading!** 🚀
