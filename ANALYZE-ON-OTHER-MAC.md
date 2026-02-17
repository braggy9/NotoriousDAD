# Run Audio Analysis on Another Mac

This guide shows you how to analyze your entire DJ library on another MacBook.

## Why Run on Another Mac?

- **Your audio files are in iCloud** - accessible from any Mac
- **CPU intensive** - can take 12-24 hours, better on a machine you're not using
- **No server needed** - runs completely locally, then uploads results

## What This Does

The script will:
1. ✅ Scan all 28,000 audio files in iCloud DJ Music folder
2. ✅ Extract metadata: genre, duration, artist, title, BPM (from tags)
3. ✅ Generate analysis JSON file (saved to Desktop)
4. ✅ Show upload command to push to server

## Prerequisites on Other Mac

You need:
- ✅ **iCloud Drive synced** - DJ Music folder downloaded
- ✅ **Node.js/tsx installed** - for running the script
- ✅ **ffprobe installed** - for reading audio metadata

### Quick Setup on Other Mac

```bash
# 1. Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install ffmpeg (includes ffprobe)
brew install ffmpeg

# 3. Install Node.js
brew install node

# 4. Install tsx globally
npm install -g tsx

# 5. Verify installations
ffprobe -version
node --version
tsx --version
```

## Transfer Script to Other Mac

### Option 1: Via iCloud Drive (Easiest)

```bash
# On this Mac - copy script to iCloud
cp /Users/tombragg/dj-mix-generator/scripts/analyze-local-library.ts ~/Desktop/

# Then on other Mac - it will appear on Desktop
# Move it somewhere permanent:
mkdir -p ~/dj-scripts
mv ~/Desktop/analyze-local-library.ts ~/dj-scripts/
```

### Option 2: Via AirDrop

1. Right-click on: `/Users/tombragg/dj-mix-generator/scripts/analyze-local-library.ts`
2. Share → AirDrop → Select other Mac
3. On other Mac, save to: `~/dj-scripts/analyze-local-library.ts`

### Option 3: Via GitHub

```bash
# On this Mac - commit and push
cd /Users/tombragg/dj-mix-generator
git add scripts/analyze-local-library.ts ANALYZE-ON-OTHER-MAC.md
git commit -m "Add portable analysis script"
git push

# On other Mac - clone repo
cd ~
git clone https://github.com/braggy9/dj-mix-generator.git
cd dj-mix-generator/scripts
```

## Running the Analysis

### On Other Mac:

```bash
# 1. Navigate to script location
cd ~/dj-scripts  # or wherever you saved it

# 2. Make executable (if needed)
chmod +x analyze-local-library.ts

# 3. Run the analysis
tsx analyze-local-library.ts
```

### What You'll See:

```
🎵 Portable Audio Library Analyzer
============================================================
Machine: Toms-MacBook-Pro.local
User: tombragg

📂 Scanning: /Users/tombragg/Library/Mobile Documents/.../DJ Music/2-MIK-Analyzed
   This may take a few minutes...

✅ Found 28000 audio files

🔍 Analyzing tracks...
   This will take a while. Progress updates every 100 files.

   Progress: 100/28000 (0%) - ETA: 180m
   Progress: 200/28000 (1%) - ETA: 175m
   ...
```

**Time Estimate:**
- ~28,000 files
- ~1-2 seconds per file
- **Total: 8-15 hours** (run overnight)

### Output:

When complete:
- ✅ File saved to: `~/Desktop/audio-library-analysis.json`
- 📊 Shows genre distribution
- 📊 Shows BPM coverage
- 📤 Shows upload command

## Upload Results to Server

After analysis completes, upload to Hetzner:

```bash
# Copy the command shown at the end, or run:
rsync -avz ~/Desktop/audio-library-analysis.json root@178.156.214.56:/var/www/notorious-dad/data/

# Restart server to use new analysis
ssh root@178.156.214.56 'cd /var/www/notorious-dad && pm2 restart notorious-dad'
```

## Monitoring Progress

### If You Need to Stop & Resume:

The script doesn't have resume capability yet, but you can:
1. Let it run completely (8-15 hours)
2. Keep other Mac plugged in and awake
3. Use `caffeinate` to prevent sleep:

```bash
caffeinate -i tsx analyze-local-library.ts
```

### Check Progress:

Open another terminal window:
```bash
# Watch the output file grow
ls -lh ~/Desktop/audio-library-analysis.json

# See how many tracks analyzed so far
grep -c '"id":' ~/Desktop/audio-library-analysis.json
```

## Troubleshooting

### "iCloud DJ Music folder not found"
- Open Finder → iCloud Drive → DJ Music
- Right-click → Download Now
- Wait for sync to complete (may take hours)
- Check: `~/Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed`

### "ffprobe: command not found"
```bash
brew install ffmpeg
```

### "tsx: command not found"
```bash
npm install -g tsx
# or use npx:
npx tsx analyze-local-library.ts
```

### Script crashes or hangs
- Check available disk space (need ~500MB for analysis file)
- Make sure other Mac isn't in low power mode
- Try smaller test first: move 100 files to test folder

## Expected Results

After uploading, your server will have:
- ✅ **~28,000 tracks analyzed** (vs 4,978 now)
- ✅ **More genres available** for filtering
- ✅ **Better mix generation** with larger pool

## What Gets Analyzed

For each audio file:
- ✅ **Genre** (from ID3 tags)
- ✅ **Duration** (from ffprobe)
- ✅ **Artist/Title** (from tags or filename)
- ✅ **BPM** (from MIK tags if present)
- ✅ **Key** (from MIK tags if present)
- ✅ **Energy** (from MIK tags if present)
- ❌ **BPM detection** (not included - would take 100+ hours)

**Note:** BPM/Key/Energy will only be available for files that already have MIK tags. The main benefit is getting **genre tags for ALL files**, not just 4,978.

## After Upload

Test the results:
1. Generate a new mix on iOS app
2. Try "Upbeat house and disco" prompt
3. Should now search through all 28,000 tracks
4. Better genre matching with complete library

## Alternative: Run on iCloud Server

If you have access to a cloud Mac (like MacStadium), you could also:
1. Upload script there
2. Run 24/7 without interruption
3. Faster upload to Hetzner (better bandwidth)

---

**Questions?** Check logs while running or contact Tom.
