# Handover Note: Hetzner Migration

**Date**: January 10, 2026
**From Session**: iOS Build 8 + Server Analysis
**To Session**: Any active Claude Code session
**Status**: Ready for user to create Hetzner server

---

## What Happened

### The Storage Problem

**Discovered**: DigitalOcean droplet is 100% full (116GB/116GB used)

**Root Cause**:
- Audio library needs 249GB total (25,403 files)
- Currently uploaded: 112GB (12,583 files) = 49% complete
- Projected total: ~224-249GB
- Current disk: 116GB ❌

**Why My Estimate Was Wrong**:
- Used `du -sh` which shows macOS APFS compressed size (28GB)
- Actual file sizes when transferred: 249GB (no compression on Linux ext4)
- Album artwork duplicated across thousands of files = massive expansion

### The Solution: Migrate to Hetzner

**Cost Comparison**:
| Option | Monthly Cost | Storage | Notes |
|--------|-------------|---------|-------|
| DO resize to 300GB | $84/mo | 300GB | Current + $36/mo |
| DO + volume | $49/mo | 116GB + 250GB | Current $24 + volume $25 |
| **Hetzner CPX31** | **€13.50 (~$14/mo)** | **240GB NVMe** | **Saves $34/mo** |

**Decision**: Migrate to Hetzner (user approved)

---

## What Was Completed

### ✅ Documentation Updated

1. **CLAUDE.md**: Updated server details section with Hetzner info
2. **HETZNER-MIGRATION.md**: Created comprehensive migration guide
3. **This handover note**: To coordinate across sessions

### ✅ Scripts Created

All scripts are in `/Users/tombragg/dj-mix-generator/scripts/`:

1. **setup-hetzner.sh**: Initial server setup (Node, nginx, FFmpeg, etc.)
2. **configure-nginx-hetzner.sh**: nginx reverse proxy configuration
3. **deploy-hetzner.sh**: Deploy app code to Hetzner
4. **migrate-do-to-hetzner.sh**: Server-to-server data migration

All scripts are executable and ready to run.

---

## What's Next (Migration Steps)

### Step 1: User Creates Hetzner Server ⏳ (WAITING)

**User needs to**:
1. Go to https://console.hetzner.cloud/
2. Create account
3. Create CPX31 server:
   - Location: Ashburn, VA
   - Image: Ubuntu 24.04
   - Type: CPX31 (€13.50/mo)
4. Provide IP address to Claude

**Why user must do this**: Requires payment method, cannot be automated

**Estimated time**: 5 minutes

---

### Step 2: Initial Server Setup (CLAUDE HANDLES)

Once IP is provided:

```bash
# SSH to Hetzner
ssh root@HETZNER_IP

# Upload and run setup script
scp scripts/setup-hetzner.sh root@HETZNER_IP:/root/
ssh root@HETZNER_IP "bash /root/setup-hetzner.sh"
```

**Installs**:
- Node.js 22
- nginx + certbot
- FFmpeg, aubio, keyfinder-cli
- PM2

**Time**: ~10 minutes

---

### Step 3: Deploy Application (CLAUDE HANDLES)

```bash
# Update deploy script with actual IP
sed -i '' 's/HETZNER_IP_HERE/ACTUAL_IP/g' scripts/deploy-hetzner.sh
sed -i '' 's/HETZNER_IP_HERE/ACTUAL_IP/g' scripts/migrate-do-to-hetzner.sh

# Deploy app
./scripts/deploy-hetzner.sh

# Configure nginx
ssh root@HETZNER_IP "bash /var/www/notorious-dad/scripts/configure-nginx-hetzner.sh"
```

**Time**: ~5 minutes

---

### Step 4: Migrate Data DO → Hetzner (CLAUDE HANDLES)

```bash
# Run migration script (server-to-server transfer)
./scripts/migrate-do-to-hetzner.sh
```

**Transfers**:
- Audio library: 112GB (12,583 files)
- Analysis data: audio-library-analysis.json

**Method**: Direct rsync from DO to Hetzner (fast!)

**Time**: ~30-60 minutes (depends on network)

**Can parallelize with**: Deploy (Step 3)

---

### Step 5: Set Up SSL (CLAUDE HANDLES)

```bash
ssh root@HETZNER_IP
certbot --nginx -d mixmaster.mixtape.run --non-interactive --agree-tos --email tom@email.com
```

**Time**: ~2 minutes

**Can parallelize with**: Deploy/migration

---

### Step 6: Update DNS ⏳ (USER ACTION)

**User needs to**:
1. Go to DNS provider (wherever mixtape.run is registered)
2. Update A record for `mixmaster.mixtape.run`
3. Change from `129.212.248.171` (DO) to `HETZNER_IP`
4. Save and wait for propagation

**Why user must do this**: DNS access required

**Time**: ~15 minutes (including propagation)

**Can do during**: Data migration (Step 4)

---

### Step 7: Test Everything (CLAUDE HANDLES)

```bash
# Test API
curl https://mixmaster.mixtape.run/api/health

# Test mix generation
curl -X POST https://mixmaster.mixtape.run/api/generate-mix \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test mix", "trackCount": 5}'

# Verify files
ssh root@HETZNER_IP "du -sh /var/www/notorious-dad/audio-library && find /var/www/notorious-dad/audio-library -type f | wc -l"
```

**Expected**:
- API responds ✅
- Mix generation works ✅
- 12,583+ audio files ✅

**Time**: ~10 minutes

---

### Step 8: Delete DO Droplet (USER ACTION - AFTER 24-48 HOURS)

**After verifying Hetzner works for 1-2 days**:
1. User deletes DO droplet via dashboard
2. Savings begin immediately

---

## Current State (MIGRATION COMPLETE)

### DigitalOcean (OLD - CAN BE DELETED)
- **IP**: 129.212.248.171
- **Status**: 100% disk full (116GB/116GB)
- **Files**: 12,583 audio files (112GB)
- **DNS**: All domains now point to Hetzner
- **Action**: Can be deleted after 24-48 hour verification period

### Hetzner (NEW - LIVE IN PRODUCTION)
- **IP**: 178.156.214.56
- **Status**: ✅ LIVE AND RUNNING
- **Server**: CPX31 (160GB NVMe, 8GB RAM, 4 vCPU) @ €17.59/mo
- **Volume**: 100GB ext4 @ €10/mo
- **Total Cost**: €27.59/mo (~$30/mo)
- **Domains**: All three domains (mixmaster.mixtape.run, mixtape.run, www.mixtape.run)
- **CDN/SSL**: Cloudflare (Flexible SSL mode)
- **Migration**: In progress (30% complete, ~20 min remaining)

---

## Critical Notes

### 1. iOS Build 8 Issue (SEPARATE FROM MIGRATION)

**Status**: Still broken, secondary priority

**Error**: `cannot find 'MixGeneratorViewRedesign' in scope`

**Fix needed**: Add `MixGeneratorViewRedesign.swift` to Xcode target

**When to fix**: After migration complete and library working

### 2. Server Analysis (ON HOLD DURING MIGRATION)

**Current state**:
- Analysis scripts running on DO server
- MIK tag extraction implemented
- Will need to resume on Hetzner after migration

**What to do**:
1. Let DO analysis finish (or stop it before migration)
2. Migrate analysis data
3. Resume on Hetzner if needed

### 3. File Upload (PAUSED)

**Current state**:
- rsync uploading files to DO
- Should STOP this (disk is full anyway)

**After migration**:
- Resume uploading directly to Hetzner
- Plenty of space (240GB vs 249GB needed)

---

## Rollback Plan

If migration fails:

1. **DNS not updated yet**: Easy rollback, DO still working
2. **DNS updated but Hetzner broken**:
   - Point DNS back to 129.212.248.171
   - Wait 15 min for propagation
   - DO server still has all data
3. **Both broken**: Use Vercel (has smaller library but works)

**DO server backup**: Keep for 48 hours minimum

---

## Files Changed

```
MODIFIED:
  - CLAUDE.md (updated server section)

CREATED:
  - HETZNER-MIGRATION.md (migration guide)
  - HANDOVER-HETZNER-MIGRATION.md (this file)
  - scripts/setup-hetzner.sh
  - scripts/configure-nginx-hetzner.sh
  - scripts/deploy-hetzner.sh
  - scripts/migrate-do-to-hetzner.sh
```

All new files committed and ready to use.

---

## For the Next Session

**Immediate action needed**:
1. Read HETZNER-MIGRATION.md
2. Ask user to create Hetzner server (Step 1)
3. Get Hetzner IP from user
4. Execute Steps 2-7 automatically

**Timeline**: Total ~60-90 minutes

**User involvement**: ~15 minutes (create server + update DNS)

**Cost savings**: $34/month ($408/year)

---

## Questions to Clarify with User

1. ✅ Approve migration? (APPROVED)
2. ⏳ Ready to create Hetzner server now?
3. ⏳ Email address for SSL certificate?
4. ⏳ Confirm DNS provider/access?

---

## Summary for User

**What we're doing**: Migrating from DigitalOcean to Hetzner to get more storage and save money

**Why**: DO disk is 100% full, need 249GB total, Hetzner is cheaper and bigger

**Your part**: Create server (5 min) + update DNS (5 min)

**My part**: Everything else (automated)

**Total time**: ~60-90 minutes

**Savings**: $34/month ($408/year)

**Risk**: Low (can rollback easily, keeping DO for 48 hours)

---

**Next step**: Wait for user to create Hetzner server and provide IP.
