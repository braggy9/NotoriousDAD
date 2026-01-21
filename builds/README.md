# iOS Build Archives

This directory contains iOS app archives ready for TestFlight deployment.

## Current Build

**Build 12** (January 21, 2026)
- Archive: `NotoriousDAD-Build12.xcarchive`
- Version: 2.2.0 (Build 12)
- Status: Ready for TestFlight upload

### What's New in Build 12
- ✅ Mashup Finder fully integrated (Browse + Search modes)
- ✅ Enhanced database with 9,982 tracks (was 6,886 in previous TestFlight)
- ✅ Hetzner backend fixed and working (mashup API + mix generation)
- ✅ All features tested and ready

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
