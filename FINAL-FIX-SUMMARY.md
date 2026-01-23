# Final Fix Summary - Mix Generation Timeout Issue

**Date:** January 23, 2026
**Build:** 2.2.0 (Build 16)
**Issue:** iOS app timing out during mix generation (stuck at 20%)

---

## Root Cause Identified

**The Problem:**
- Server uses synchronous FFmpeg execution (`execSync`, `execAsync`)
- FFmpeg runs at 100%+ CPU during audio mixing
- Node.js single-threaded event loop becomes completely blocked
- Server CANNOT respond to ANY HTTP requests while FFmpeg runs
- iOS app times out waiting for status updates

**Why Previous Fixes Failed:**
1. **Extended timeouts (300s):** Didn't help - server wasn't slow, it was completely blocked
2. **execAsync conversion:** Still blocks when CPU is maxed out
3. **Async/await:** Doesn't prevent event loop blocking when CPU saturated

---

## Solution Implemented

### Spawn-Based Non-Blocking Execution

Created new `execFFmpegAsync()` function using `spawn()` instead of `exec()`:

```typescript
function execFFmpegAsync(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
}
```

**Key Difference:**
- `spawn()` creates a true child process that runs independently
- Node.js event loop can process HTTP requests while child runs
- Async promise allows proper await without blocking

### Files Modified

1. **lib/mix-engine.ts:**
   - Added `execFFmpegAsync()` function
   - Updated `mixTwoTracks()` to use spawn (line 288)
   - Updated final encoding to use spawn (line 475)

2. **NotoriousDAD-iOS/NotoriousDAD/Views/MixGeneratorViewRedesign.swift:**
   - Extended initial request timeout to 300 seconds
   - Extended status polling timeout to 300 seconds
   - Reduced polling frequency to 10 seconds

3. **BUILD-16-STATUS.md:**
   - Documented the issue and fix

---

## Expected Behavior After Fix

### Server-Side:
- ✅ Responds to `/api/health` checks during mix generation
- ✅ Accepts new `/api/generate-mix` requests while mixing
- ✅ Handles `/api/mix-status/{jobId}` polls in real-time
- ✅ FFmpeg runs independently without blocking HTTP

### iOS App:
- ✅ Receives immediate response to initial POST request
- ✅ Gets real-time status updates during mixing
- ✅ Shows progress bar updating through 0-100%
- ✅ Completes mix generation without timeout
- ✅ Downloads completed MP3 file

---

## Deployment Status

**Deployed to Hetzner Server:**
- ✅ Code uploaded to `/var/www/notorious-dad/lib/mix-engine.ts`
- ⏳ Waiting for current mix to complete before restart
- ⏳ PM2 will restart with new code automatically
- ⏳ Testing required after restart

**iOS App:**
- ✅ Extended timeouts deployed to device
- ✅ Build 16 installed with fixes

---

## Testing Plan

### Automated Test Script

Created `test-mix-generation.sh` to verify:
1. Health endpoint responds instantly before mix
2. Mix generation starts successfully
3. **Critical:** Status polls work WHILE FFmpeg is running
4. Health endpoint responds WHILE mix is running
5. Mix completes successfully

### Manual Testing

When user returns:
1. Open Mix tab in iOS app
2. Select "Beach Day" preset (30 min mix)
3. Tap "Generate Mix"
4. **Expected:** Progress bar updates smoothly from 0-100%
5. **Expected:** Mix completes and downloads
6. **Expected:** No timeout errors

---

## What Changed vs. Previous Attempts

| Previous Attempt | Why It Failed | Final Solution |
|-----------------|---------------|----------------|
| Increase timeouts to 120s | Server was blocked, not slow | Non-blocking execution |
| Use execAsync | Still blocks at CPU saturation | Spawn-based child process |
| Increase timeouts to 300s | Doesn't solve blocking | Combined with spawn fix |
| Poll every 3 seconds | Too frequent, added load | Poll every 10 seconds |

---

## Files Changed

```
lib/mix-engine.ts                                           # Core fix
NotoriousDAD-iOS/NotoriousDAD/Views/MixGeneratorViewRedesign.swift  # Timeout increases
BUILD-16-STATUS.md                                         # Documentation
test-mix-generation.sh                                     # Test script
FINAL-FIX-SUMMARY.md                                       # This file
```

---

## Git Commit

```
commit e6927ba
Author: Tom Bragg
Date:   Thu Jan 23 06:35:00 2026 +1100

    Fix: Non-blocking FFmpeg execution using spawn

    - Replaced execSync/execAsync with spawn-based execution
    - Allows server to respond to HTTP requests during mix generation
    - Fixes iOS app timeout issues (stuck at 20%)
    - Server no longer blocks when FFmpeg runs at 100% CPU

    Changes:
    - lib/mix-engine.ts: New execFFmpegAsync() function
    - Updated mixTwoTracks() and final encoding to use spawn
    - iOS app: Extended timeouts to 300 seconds
    - BUILD-16-STATUS.md: Documented fix

    Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

## Next Steps

1. ⏳ Current mix completing (track 12 of 19)
2. ⏳ Server will auto-restart with new code
3. 🧪 Run `bash test-mix-generation.sh` to verify
4. 📱 User tests from iOS app when returns
5. ✅ If successful, mark Build 16 as complete

---

**Status:** Waiting for server restart to test
**ETA:** ~5 minutes for current mix to finish
**Confidence:** High - spawn-based execution is the correct architecture for this use case
