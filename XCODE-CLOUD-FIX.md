# Fixing Xcode Cloud Configuration

**Date:** January 23, 2026
**Issue:** Xcode Cloud Build 10 failures due to incorrect scheme names

---

## 🐛 Problems Identified

### 1. Wrong Scheme Names
**Error:** "scheme NotoriousDAD does not exist; update Xco..."

**Root Cause:** Xcode Cloud is looking for scheme "NotoriousDAD" but the actual schemes are:
- iOS: `NotoriousDAD-iOS`
- macOS: `NotoriousDAD-macOS`

### 2. Outdated Build Number
**Issue:** Xcode Cloud is building "Build 10" but current version is **Build 16**

### 3. SpotifyExampleContent Failure
**Cause:** SpotifyAPI dependency module being built separately by Xcode Cloud (should be handled automatically as dependency)

---

## ✅ Solution: Update Xcode Cloud Workflows

### Step 1: Open Xcode
```bash
cd /Users/tombragg/dj-mix-generator
open NotoriousDAD.xcworkspace
```

### Step 2: Access Xcode Cloud Settings
1. In Xcode, click **Product** → **Xcode Cloud** → **Manage Workflows...**
2. Or go to **Report Navigator** (⌘9) → **Cloud** tab

### Step 3: Update iOS Workflow
1. Select the **iOS workflow** (if it exists)
2. Click **Edit Workflow**
3. Under **Build Configuration:**
   - **Scheme:** Change from "NotoriousDAD" to **"NotoriousDAD-iOS"**
   - **Platform:** iOS
   - **Xcode Version:** Latest (15.x or 16.x)
4. Under **Environment:**
   - Verify **Build Configuration:** Release
   - Verify **Build Number:** Should auto-increment from current (16)
5. **Save Changes**

### Step 4: Update macOS Workflow
1. Select the **macOS workflow** (or create new if doesn't exist)
2. Click **Edit Workflow** (or **Create Workflow**)
3. Under **Build Configuration:**
   - **Scheme:** Change from "NotoriousDAD" to **"NotoriousDAD-macOS"**
   - **Platform:** macOS
   - **Xcode Version:** Latest (15.x or 16.x)
4. Under **Environment:**
   - Verify **Build Configuration:** Release
   - Verify **Build Number:** Should auto-increment from current (16)
5. **Save Changes**

### Step 5: Disable SpotifyExampleContent Build (if separate workflow exists)
1. Check if there's a workflow for "SpotifyExampleContent"
2. If yes, **Delete** it (SpotifyExampleContent is a dependency, shouldn't be built separately)
3. If no separate workflow exists, ignore (the error will resolve once main workflows are fixed)

### Step 6: Test Configuration
1. Trigger a manual build:
   - **Product** → **Xcode Cloud** → **Start Build**
2. Select:
   - **Workflow:** NotoriousDAD-iOS or NotoriousDAD-macOS
   - **Branch:** main
3. Click **Start Build**
4. Monitor build in Xcode or at: https://appstoreconnect.apple.com/

---

## 🎯 Alternative: Disable Xcode Cloud (If Not Using)

If you're not actively using Xcode Cloud for continuous integration:

### Option A: Disable Per-Workflow
1. Open **Product** → **Xcode Cloud** → **Manage Workflows...**
2. For each workflow, click **Edit**
3. Scroll to bottom → **Delete Workflow**

### Option B: Disable Entirely
1. Go to **App Store Connect**: https://appstoreconnect.apple.com/
2. Select **NotoriousDAD** app
3. Go to **Xcode Cloud** tab
4. Click **Settings** → **Disable Xcode Cloud**

---

## 📊 Current State

| Component | Current | Should Be |
|-----------|---------|-----------|
| **iOS Scheme** | NotoriousDAD ❌ | NotoriousDAD-iOS ✅ |
| **macOS Scheme** | NotoriousDAD ❌ | NotoriousDAD-macOS ✅ |
| **Build Number** | 10 ❌ | 16+ ✅ |
| **SpotifyExampleContent** | Separate build ❌ | Dependency (auto) ✅ |

---

## 🔍 Verification

After updating configuration, next Git push should trigger successful builds:

**Expected Success Emails:**
```
✅ NotoriousDAD -- Build 17 succeeded (main)
   iOS build succeeded

✅ NotoriousDAD -- Build 17 succeeded (main)
   macOS build succeeded
```

---

## 💡 Pro Tips

1. **Build Numbers:** Xcode Cloud auto-increments build numbers. Since local is at Build 16, Cloud will start at Build 17.

2. **Workflow Triggers:** By default, Xcode Cloud builds on every commit to `main`. To change:
   - Edit Workflow → **Start Conditions**
   - Options: All commits, Pull requests only, Manual only, etc.

3. **Notifications:** To stop email notifications:
   - **App Store Connect** → **Users and Access** → Your profile
   - Edit **Notification Preferences**
   - Disable "Xcode Cloud Build Notifications"

4. **Dependencies:** SpotifyAPI, NotoriousDADKit, and other Swift packages are automatically resolved. No separate workflows needed.

---

## 📝 Notes

- Xcode Cloud configuration is NOT stored in the Git repository
- Changes are saved to Apple's cloud infrastructure
- Each team member can have different notification preferences
- Workflows can be shared across team members in App Store Connect

---

## 🚀 Quick Commands

```bash
# Open project in Xcode
cd /Users/tombragg/dj-mix-generator
open NotoriousDAD.xcworkspace

# Or open specific projects
open NotoriousDAD-iOS/NotoriousDAD.xcodeproj
open NotoriousDAD-macOS/NotoriousDAD.xcodeproj
```

---

**Next Steps:**
1. ⏸️ Open Xcode
2. ⏸️ Update workflows as described above
3. ⏸️ Test with manual build
4. ⏸️ Verify success on next Git push
