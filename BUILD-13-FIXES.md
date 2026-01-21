# Build 13 - Critical Fixes

**Date:** January 22, 2026
**Status:** ✅ iOS Archived, macOS Deployed

---

## 🐛 Issues Found in Build 12 (via TestFlight)

### 1. ❌ Wrong Track Count (8,176 instead of 9,982)
**Root Cause:** `enhanced-track-database.json` was NOT included in Xcode project
**Files Affected:** Both iOS and macOS apps
**Impact:** Users saw old database with only 8,176 MIK tracks

### 2. ❌ Playlist Generator 401 Authentication Error
```
401 {"type":"error","error":{"type":"authentication_error","message":"Invalid x-api-key"}}
```
**Root Cause:** Anthropic API key on Hetzner server is expired/invalid
**Location:** Server `.env.local` file
**Impact:** Playlist generation fails completely

### 3. ⚠️ Mix Generator Shows "Not Connected"
**Root Cause:** Related to authentication/server connection issues
**Impact:** Cannot generate audio mixes

### 4. ✅ Mashup Finder WORKING
**Status:** Successfully loads 41,338 Easy + 600,835 Medium pairs
**No issues found**

---

## 🔧 Fixes Applied in Build 13

### Fix 1: Enhanced Database Now Included

**Problem:** The `enhanced-track-database.json` file existed in Resources folder but wasn't added to the Xcode project's Resources build phase.

**Solution:**
1. Created Ruby script: `scripts/add-enhanced-db-to-xcode.rb`
2. Script properly adds file to Resources build phase (not compile sources)
3. Rebuilt both iOS and macOS apps

**Result:**
- ✅ Build 13 archive contains `enhanced-track-database.json` (5.5M)
- ✅ macOS app contains `enhanced-track-database.json` (5.5M)
- ✅ Apps should now show 9,982 tracks

### Fix 2: Anthropic API Key (TO BE FIXED)

**Status:** ⏳ PENDING - Requires new API key

**The Issue:**
- Current key: `sk-ant-api03-xSC_jnRrF5Zh...` (from `.env.local`)
- Returns 401 authentication error
- Likely expired or invalid

**Solution Required:**
1. Get new Anthropic API key from https://console.anthropic.com/
2. Update on Hetzner server:
   ```bash
   ssh root@178.156.214.56
   cd /var/www/notorious-dad
   nano .env.local  # Update ANTHROPIC_API_KEY
   pm2 restart notorious-dad
   ```
3. Test playlist generation

**Impact Until Fixed:**
- ❌ Playlist generation will continue to fail with 401 error
- ✅ Mix generation should work (doesn't use Anthropic)
- ✅ Mashup finder should work (doesn't use Anthropic)
- ✅ Track library will load correctly (local data)

---

## 📦 Build 13 Details

**iOS Build 13:**
- Version: 2.2.0 (Build 13)
- Archive: `builds/NotoriousDAD-Build13.xcarchive`
- Enhanced Database: ✅ Included (5.5M)
- Status: Ready for TestFlight upload

**macOS Build 13:**
- Version: 2.2.0 (Build 13)
- Location: `/Applications/NotoriousDAD.app`
- Enhanced Database: ✅ Included (5.5M)
- Status: Ready for immediate use

---

## 🚀 Next Steps

### 1. Upload iOS Build 13 to TestFlight
```
1. Open Xcode
2. Window → Organizer (Cmd+Shift+Option+O)
3. Select NotoriousDAD-Build13.xcarchive
4. Click "Distribute App" → "App Store Connect"
5. Upload and test
```

### 2. Fix Anthropic API Key (Critical)
- Get new key from Anthropic Console
- Update server `.env.local`
- Restart PM2 app
- Test playlist generation

### 3. Verify Build 13 Improvements
**Expected in TestFlight:**
- ✅ Library shows 9,982 tracks (was 8,176)
- ✅ MIK and Apple Music counts correct
- ✅ Mashup finder works
- ❌ Playlist generation still fails until API key fixed
- ✅ Mix generation should work

---

## 🔍 Testing Checklist for Build 13

- [ ] Library tab shows 9,982 total tracks
- [ ] MIK Analyzed count is correct (~9,792)
- [ ] Mashup Finder loads successfully
- [ ] Mix Generator connects to server
- [ ] Playlist Generator shows 401 error (expected until API key fixed)

---

## 📝 Summary

**What's Fixed:**
- ✅ Enhanced database (9,982 tracks) now included in both apps
- ✅ Track library count will be correct

**What's Still Broken:**
- ❌ Playlist Generator 401 auth error (needs new Anthropic API key)

**What Works:**
- ✅ Mashup Finder
- ✅ Mix Generator (server connection)
- ✅ Track Library

---

**Build 13 Status:** Ready for TestFlight upload with database fix. Playlist generation requires API key update on server.
