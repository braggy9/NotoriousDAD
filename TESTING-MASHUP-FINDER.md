# Testing Mashup Finder - Build 11

**Goal:** Verify mashup finder works on iOS and macOS before proceeding with Phase 2B (Energy Curves)

---

## Pre-Flight Checklist

### 1. Add MashupManager.swift to Xcode (Required)

**Option A: Automated Script**
```bash
cd /Users/tombragg/dj-mix-generator
./scripts/add-mashup-to-xcode.sh
```

**Option B: Manual Addition**

**iOS:**
1. Open: `NotoriousDAD-iOS/NotoriousDAD.xcodeproj`
2. In Xcode Project Navigator, find "Services" folder
3. Right-click Services → "Add Files to NotoriousDAD..."
4. Navigate to: `NotoriousDAD-iOS/NotoriousDAD/Services/MashupManager.swift`
5. **IMPORTANT:** Uncheck "Copy items if needed" (file already exists)
6. Check "NotoriousDAD" target
7. Click "Finish"

**macOS:**
1. Open: `NotoriousDAD-macOS/NotoriousDAD.xcodeproj`
2. Same steps as iOS
3. Add: `NotoriousDAD-macOS/NotoriousDAD/Services/MashupManager.swift`

### 2. Build & Run

**iOS Simulator:**
```bash
# From terminal
cd NotoriousDAD-iOS
xcodebuild -project NotoriousDAD.xcodeproj \
  -scheme NotoriousDAD-iOS \
  -sdk iphonesimulator \
  -configuration Debug \
  build

# Or in Xcode
Product → Run (Cmd+R)
```

**macOS:**
```bash
# From terminal
cd NotoriousDAD-macOS
xcodebuild -project NotoriousDAD.xcodeproj \
  -scheme NotoriousDAD-macOS \
  -configuration Debug \
  build

# Or in Xcode
Product → Run (Cmd+R)
```

---

## iOS Testing Checklist

### Tab Bar Navigation
- [ ] App launches without crashes
- [ ] 5 tabs visible: Playlist, Mix, **Mashups**, Tracks, Settings
- [ ] Mashups tab has waveform.path.badge.plus icon
- [ ] Mashups tab is gold when selected

### Mashup Finder - Browse Mode
- [ ] "Mashup Finder" header displays with gold gradient
- [ ] Description text is visible
- [ ] Mode segmented picker shows "Browse Top Pairs" (selected) and "Find Partner"
- [ ] Compatibility slider shows (default 75%)
- [ ] "Find Mashups" button is visible and tappable

### Finding Mashups
- [ ] Tap "Find Mashups" button
- [ ] Button shows "Analyzing..." with spinner
- [ ] After ~10 seconds, summary stats appear (Easy/Medium/Hard counts)
- [ ] List of mashup pairs displays (up to 20)
- [ ] Each card shows:
  - [ ] Compatibility percentage (e.g., "85%")
  - [ ] Difficulty badge (EASY/MEDIUM/HARD) with color
  - [ ] Camelot key badge (e.g., "8A")
  - [ ] Track 1: icon, name, artist, BPM
  - [ ] Waveform icon in center
  - [ ] Track 2: icon, name, artist, BPM
  - [ ] "Mixing Notes" disclosure group (expandable)

### Mixing Notes Expansion
- [ ] Tap "Mixing Notes" on any mashup card
- [ ] Notes expand to show bullet points
- [ ] Notes include tempo adjustments, harmonic info, EQ tips
- [ ] Tap again to collapse

### Search Mode
- [ ] Switch to "Find Partner" mode
- [ ] Search field appears: "Track name or artist"
- [ ] Type "Fred again" (or any artist in your library)
- [ ] Filtered track list appears (max 10 results)
- [ ] Each result shows: track name, artist, Camelot key
- [ ] Tap a track
- [ ] "Best Mashup Partner" section appears
- [ ] Shows single mashup card with full details

### Error Handling
- [ ] Switch to Browse mode, set compatibility to 95%
- [ ] Tap "Find Mashups"
- [ ] If few/no results, appropriate message displays
- [ ] No crashes on empty results

---

## macOS Testing Checklist

### Sidebar Navigation
- [ ] App launches without crashes
- [ ] Sidebar shows 5 items: Generate, Audio Mix, **Mashups**, Library, Playlists
- [ ] Mashups has waveform.path.badge.plus icon
- [ ] Click Mashups to select

### Mashup Finder View
- [ ] Main content area displays Mashup Finder
- [ ] Gold gradient header
- [ ] Segmented picker for Browse/Search modes
- [ ] Controls section with slider and button (horizontal layout)

### Browse Mode (macOS)
- [ ] Slider adjusts 70-95% smoothly
- [ ] "Find Mashups" button prominent (gold accent)
- [ ] Button disables during loading
- [ ] Summary stats display in horizontal row
- [ ] Mashup cards display in scrollable list
- [ ] Cards match iOS design (adapted for macOS)

### Search Mode (macOS)
- [ ] Switch to "Find Partner"
- [ ] Search field uses macOS native styling
- [ ] Type to search, results filter instantly
- [ ] Click track to find partner
- [ ] Best partner displays below

### Window Interaction
- [ ] Sidebar resizable
- [ ] Content scrolls smoothly
- [ ] Disclosure groups work with mouse
- [ ] All text readable at default size

---

## Common Issues & Solutions

### Issue: "Cannot find 'MashupManager' in scope"
**Solution:** MashupManager.swift not added to Xcode target
- Open Xcode, check Services folder
- File should have target membership checkbox selected
- Re-add file if needed

### Issue: Build fails with "No such module 'NotoriousDADKit'"
**Solution:** Package dependencies not resolved
- Xcode → File → Packages → Resolve Package Versions
- Wait for resolution to complete
- Clean build folder (Cmd+Shift+K)
- Rebuild

### Issue: App crashes on Mashups tab
**Solution:** Check Console for error
- Xcode → Debug → Activate Console (Cmd+Shift+C)
- Look for error messages
- Common causes: API endpoint unreachable, missing data

### Issue: "Find Mashups" returns error
**Solution:** Check backend connectivity
- Verify: `https://mixmaster.mixtape.run/api/find-mashups`
- Test in browser or curl:
```bash
curl -X POST https://mixmaster.mixtape.run/api/find-mashups \
  -H "Content-Type: application/json" \
  -d '{"mode":"pairs","tracks":"use-library","minCompatibilityScore":80}'
```

### Issue: No tracks in Search mode
**Solution:** Library not loaded
- Check "Tracks" tab has tracks
- Wait for library to load (check status in Settings)
- LibraryManager should have loaded 9,982 tracks

---

## Expected Results

### Performance
- **Initial Load:** <1 second (app launch)
- **Library Load:** 2-5 seconds (9,982 tracks)
- **Find Mashups:** 8-12 seconds (full analysis)
- **Search Filter:** <100ms (instant)
- **Find Partner:** 2-4 seconds (single track lookup)

### Data Quality
- **Total Mashup Pairs:** ~303,775 compatible pairs (≥70% compatibility)
- **Perfect Pairs (≥85%):** ~41,338 pairs
- **Top 20 Display:** Only highest-scoring pairs shown
- **Compatibility Range:** 70-100%
- **Mixing Notes:** 2-5 bullet points per pair

### Example Good Result
```
Track 1: Fred again - "Geronimo"
Track 2: Empire Of The Sun - various
Compatibility: 85% (EASY)
Key: 7A (perfect match)
BPM: 128 (both tracks)
Mixing Notes:
  • Perfect harmonic match (7A)
  • Matched energy levels - blend at equal volumes
  • Layer vocals over instrumental
```

---

## Success Criteria

### iOS ✅
- [ ] All 15 checkboxes pass
- [ ] No crashes during testing
- [ ] UI matches Electric Gold theme
- [ ] Mashups display correctly
- [ ] Search works instantly

### macOS ✅
- [ ] All 11 checkboxes pass
- [ ] Sidebar navigation smooth
- [ ] Native macOS controls work
- [ ] Window resizing handled
- [ ] Content scrolls properly

### API Integration ✅
- [ ] Browse mode returns results
- [ ] Search mode finds partners
- [ ] Error messages clear
- [ ] Loading states display
- [ ] No network timeouts

---

## Post-Testing Actions

### If All Tests Pass ✅
1. Take screenshots for documentation
2. Note any UI polish ideas for future
3. Proceed to **Phase 2B: Energy Curve Shaping**

### If Issues Found ❌
1. Document specific failures
2. Check console logs for errors
3. Verify backend is running
4. Fix issues before Phase 2B

---

## Quick Test Script

**Fastest way to verify it works:**

1. Open iOS app
2. Tap Mashups tab
3. Tap "Find Mashups"
4. Wait 10 seconds
5. See list of mashup pairs → **SUCCESS!**

If you get that far, the integration is working! 🎉

---

**Testing Time Estimate:** 15-20 minutes (both platforms)
**Next Step After Success:** Phase 2B - Energy Curve Shaping
