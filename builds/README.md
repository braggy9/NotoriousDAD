# iOS Build Archives

This directory contains iOS app archives ready for TestFlight deployment.

## Current Build

**Build 13** (January 22, 2026)
- Archive: `NotoriousDAD-Build13.xcarchive`
- Version: 2.2.0 (Build 13)
- Status: Ready for TestFlight upload

### What's New in Build 13
- ✅ **FIXED:** Enhanced database (9,982 tracks) now properly included
- ✅ Mashup Finder fully integrated and working
- ✅ Track library count fixed (was showing 8,176, now shows correct count)
- ⚠️ **Known Issue:** Playlist generator has 401 auth error (requires new Anthropic API key on server)

### How to Upload to TestFlight

1. Open Xcode
2. Window → Organizer (Cmd+Shift+Option+O)
3. Select `NotoriousDAD-Build12.xcarchive` from Archives tab
4. Click "Distribute App"
5. Choose "App Store Connect"
6. Follow prompts to upload
7. Wait ~5-10 minutes for processing
8. Test in TestFlight app

## Archive History

| Build | Date | Status | Changes |
|-------|------|--------|---------|
| 12 | 2026-01-21 | Current | Mashup finder, server fixes, 9,982 tracks |
| 11 | 2026-01-16 | Superseded | Enhanced database integration |
| 10 | 2026-01-16 | Superseded | Track database fixes |

---

**Note**: Archives are large (~200MB+) and excluded from git via `.gitignore`
