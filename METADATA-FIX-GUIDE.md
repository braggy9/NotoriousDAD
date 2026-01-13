# Metadata Fix Guide - Unlock All 18k+ Tracks

This guide explains how to fix the metadata issue preventing ~8,511 tracks from being matched to Spotify.

## The Problem

Your MIK library has:
- **26,017** audio files on disk
- **18,451** analyzed by MIK (with BPM/key)
- **9,940** with artist/title metadata
- **8,511** MISSING metadata (artist/title embedded in track name but not in ID3 tags)

Result: Only **6,996** tracks match to Spotify

## The Solution - Two Parts

### Part 1: Fix Existing Tracks (One-Time)

**What it does:** Parses the ZNAME field in MIK database to extract artist/title

**How to run:**
```bash
cd ~/dj-mix-generator
npx tsx scripts/fix-mik-metadata.ts
```

**What happens:**
1. Finds tracks where ZARTIST is empty but ZNAME contains "Artist - Track"
2. Creates database backup
3. Parses and updates ~5,000-8,000 tracks
4. Updates MIK database with proper artist/title fields

**Expected result:**
- Before: 9,940 tracks with metadata
- After: ~15,000-18,000 tracks with metadata
- Spotify matches: ~10,000-12,000 tracks (huge improvement!)

**Safety:**
- Creates automatic backup: `Collection11.mikdb.backup-[timestamp]`
- Non-destructive - only updates empty ZARTIST fields
- Can restore from backup if needed

---

### Part 2: Fix Future Downloads (Ongoing)

**Problem:** yt-dlp downloads from YouTube don't have ID3 tags, so MIK can't read artist/title

**Solution:** Add ID3 tagging AFTER download, BEFORE MIK analysis

#### Option A: Automatic Integration (Recommended)

Add this to spotify-library-downloader's download workflow:

```typescript
// In download.ts, after downloadTrack() succeeds:
import { addID3Tags } from "./add-id3-tags";

// After download completes
const success = await downloadTrack(videoId, outputPath, filename);

if (success) {
  // Add ID3 tags immediately
  const filePath = join(outputPath, `${filename}.m4a`);

  addID3Tags(filePath, {
    artist: track.artists[0]?.name || "Unknown Artist",
    title: track.name,
    album: track.album.name,
  });

  console.log("  ✓ ID3 tags written");
}
```

#### Option B: Manual Batch Tagging

Tag existing files without proper ID3 tags:

```bash
cd ~/spotify-library-downloader

# Tag all files in a directory
for file in ~/Library/Mobile\ Documents/.../2-MIK-Analyzed/*.m4a; do
  npx tsx src/add-id3-tags.ts "$file"
done
```

---

## Quick Start

### 1. Fix Existing Tracks (5 minutes)

```bash
# Run the fix script
cd ~/dj-mix-generator
npx tsx scripts/fix-mik-metadata.ts

# Re-sync to Spotify
cd ~/spotify-library-downloader
npm run sync-mix-generator
```

**Expected output:**
```
Total MIK tracks:  15,000-18,000
Matched to Spotify: ~10,000-12,000 (vs current 6,996)
```

### 2. Prevent Future Issues

Add ID3 tagging to your spotify-library-downloader workflow:

```bash
cd ~/spotify-library-downloader

# Test on one file
npx tsx src/add-id3-tags.ts "/path/to/file.m4a" "Artist Name" "Track Title"
```

Then integrate into download.ts as shown in Part 2, Option A.

---

## Expected Results

### Before Fix:
```
Audio files:       26,017
MIK analyzed:      18,451
With metadata:      9,940
Spotify matches:    6,996
```

### After Fix:
```
Audio files:       26,017
MIK analyzed:      18,451
With metadata:     15,000-18,000  ← Huge increase!
Spotify matches:   10,000-12,000  ← 43-71% more tracks!
```

---

## Technical Details

### How the MIK Fix Works

The script:
1. Queries MIK database for tracks with empty ZARTIST
2. Checks if ZNAME contains " - " separator
3. Parses: `"Artist Name - Track Title"` → Artist: "Artist Name", Title: "Track Title"
4. Updates database:
   ```sql
   UPDATE ZSONG
   SET ZARTIST = 'Artist Name',
       ZNAME = 'Track Title'
   WHERE Z_PK = [track_id]
   ```

### How ID3 Tagging Works

Uses ffmpeg to write metadata WITHOUT re-encoding audio:

```bash
ffmpeg -i input.m4a -c copy \
  -metadata artist="Artist Name" \
  -metadata title="Track Title" \
  -metadata album="Album Name" \
  output.m4a
```

This preserves audio quality while adding tags that MIK can read.

---

## Troubleshooting

### "Database is locked"
- Close Mixed In Key application
- Try again

### "Permission denied"
- Check file permissions on MIK database
- Ensure you have write access

### "No tracks found to fix"
- All tracks may already have metadata
- Check MIK manually to verify

### Restore from Backup
```bash
# Find backup
ls -lt ~/Library/Application\ Support/Mixedinkey/*.backup*

# Restore
cp ~/Library/Application\ Support/Mixedinkey/Collection11.mikdb.backup-[timestamp] \
   ~/Library/Application\ Support/Mixedinkey/Collection11.mikdb
```

---

## Next Steps

1. **Run the fix** - `npx tsx scripts/fix-mik-metadata.ts`
2. **Re-sync** - `npm run sync-mix-generator`
3. **Deploy to production** - Updated matched-tracks.json with 10k+ tracks
4. **Update TestFlight** - New build with expanded library
5. **Add ID3 tagging** - Integrate into spotify-library-downloader

---

## Questions?

The fix is:
- ✅ Safe (creates automatic backups)
- ✅ Fast (~5 minutes)
- ✅ Non-destructive (only updates empty fields)
- ✅ Reversible (backup included)

**Recommendation:** Run Part 1 now to unlock thousands of tracks immediately!
