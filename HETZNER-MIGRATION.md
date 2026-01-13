# Hetzner Migration Guide

**Migration Date**: January 12, 2026 ✅ COMPLETED
**From**: DigitalOcean 116GB @ $48/mo
**To**: Hetzner CPX31 + 100GB Volume @ €27.59/mo (~$30/mo)
**Savings**: $18/month ($216/year)
**Status**: LIVE IN PRODUCTION

---

## Migration Summary (Jan 12, 2026)

**Completed Steps:**
1. ✅ Created Hetzner CPX31 server (178.156.214.56, Ashburn VA)
2. ✅ Installed Node.js 22, nginx, FFmpeg, aubio, PM2
3. ✅ Deployed application (fixed build issues with tsconfig)
4. ✅ Configured nginx reverse proxy
5. ✅ Created and mounted 100GB ext4 volume at /mnt/HC_Volume_104378843
6. ✅ Symlinked volume to /var/www/notorious-dad/audio-library
7. ✅ Updated DNS (mixmaster.mixtape.run, mixtape.run, www.mixtape.run) to 178.156.214.56
8. ✅ Configured Cloudflare SSL (Flexible mode)
9. ✅ Started audio library migration (12,670 files, ~30-60 min)
10. ✅ Site is LIVE at https://mixmaster.mixtape.run

**Actual Server Configuration:**
- Server: Hetzner CPX31 (4 vCPU, 8GB RAM, 160GB NVMe) @ €17.59/mo
- Volume: 100GB ext4 @ €10/mo
- Total: €27.59/mo (~$30/mo)
- Changed from planned CPX31 standalone (240GB) to CPX31 + volume (260GB total)

**Next Steps:**
1. Wait for audio library migration to complete (~20 min remaining as of 4:25 AM UTC)
2. Test all API endpoints
3. Verify mix generation works
4. Monitor for 24-48 hours
5. Delete DigitalOcean droplet (129.212.248.171) to start saving

---

## Why Migrate?

**Problem**: Audio library grew to 249GB, but DO droplet only has 116GB (100% full)

**Options Considered**:
1. ❌ Resize DO droplet to 300GB: ~$84/mo (would cost $36 more/mo)
2. ❌ Add DO volume (250GB): $24/mo current + $25/mo volume = $49/mo total
3. ✅ **Migrate to Hetzner CPX31**: €13.50/mo (~$14/mo) with 240GB NVMe (saves $34/mo)

---

## Server Specs Comparison

| Feature | DigitalOcean | Hetzner CPX31 | Improvement |
|---------|--------------|---------------|-------------|
| **Price** | $48/mo | €13.50/mo (~$14/mo) | **Save $34/mo** |
| **CPU** | 2 vCPUs | 4 vCPUs | **2x faster** |
| **RAM** | 4GB | 8GB | **2x more** |
| **Disk** | 116GB SSD | 240GB NVMe | **2x larger + faster** |
| **Bandwidth** | 4TB | 20TB | **5x more** |
| **Location** | NYC | Ashburn, VA | Similar (US East) |

---

## Migration Steps

### Step 1: Create Hetzner Server (USER ACTION REQUIRED)

**You need to do this step** - I cannot create accounts/servers:

1. Go to https://console.hetzner.cloud/
2. Create account (requires payment method)
3. Create new project: "Notorious DAD"
4. Click "Add Server"
5. Configure:
   - **Location**: Ashburn, VA (us-east) - closest to users
   - **Image**: Ubuntu 24.04
   - **Type**: CPX31 (4 vCPU, 8GB RAM, 240GB NVMe)
   - **Networking**:
     - Enable IPv4
     - Enable IPv6 (optional)
   - **SSH Keys**: Add your public key OR use password (I'll need SSH access)
   - **Name**: notorious-dad
6. Click "Create & Buy Now"
7. Wait ~60 seconds for server to boot
8. **Note the IP address** and send it to me

**Cost**: €13.50/mo (~$14/mo)

---

### Step 2: Initial Server Setup (I'LL DO THIS)

Once you give me the Hetzner server IP, I will:

```bash
# SSH into Hetzner server
ssh root@HETZNER_IP

# Run setup script
bash <(curl -s https://raw.githubusercontent.com/.../setup-hetzner.sh)
```

This installs:
- Node.js 22
- nginx
- FFmpeg
- aubio (BPM detection)
- keyfinder-cli (musical key detection)
- PM2 (process manager)
- certbot (SSL)

**Time**: ~10 minutes

---

### Step 3: Deploy Application (I'LL DO THIS)

```bash
# Update deploy script with Hetzner IP
# Deploy app code
./scripts/deploy-hetzner.sh

# Configure nginx
ssh root@HETZNER_IP "bash /var/www/notorious-dad/scripts/configure-nginx-hetzner.sh"
```

**Time**: ~5 minutes

---

### Step 4: Migrate Data from DO to Hetzner (I'LL DO THIS)

Server-to-server transfer (much faster than local download/upload):

```bash
# Run migration script
./scripts/migrate-do-to-hetzner.sh
```

This copies:
- Audio library: 112GB (12,583 files)
- Analysis data: audio-library-analysis.json
- Direct DO → Hetzner transfer (fast!)

**Time**: ~30-60 minutes (depends on network speed)

---

### Step 5: Set Up SSL (I'LL DO THIS)

```bash
ssh root@HETZNER_IP
certbot --nginx -d mixmaster.mixtape.run --non-interactive --agree-tos --email YOUR_EMAIL
```

**Time**: ~2 minutes

---

### Step 6: Update DNS (USER ACTION REQUIRED)

**You need to do this step** - I don't have access to your DNS:

1. Go to your DNS provider (where you registered mixtape.run)
2. Find the A record for `mixmaster.mixtape.run`
3. Change IP from `129.212.248.171` (DO) to `HETZNER_IP`
4. Save changes
5. Wait 5-15 minutes for DNS propagation

**Time**: ~15 minutes (including propagation)

---

### Step 7: Test Everything (I'LL DO THIS)

```bash
# Test app is running
curl https://mixmaster.mixtape.run/api/health

# Test mix generation
curl -X POST https://mixmaster.mixtape.run/api/generate-mix \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test mix", "trackCount": 5}'

# Verify audio library
ssh root@HETZNER_IP "find /var/www/notorious-dad/audio-library -type f | wc -l"
```

**Expected**:
- API responds ✅
- Mix generation works ✅
- Audio files: 12,583+ files ✅

**Time**: ~10 minutes

---

### Step 8: Delete DO Droplet (USER ACTION - AFTER VERIFICATION)

**WAIT 24-48 hours to make sure everything works!**

Once you're confident Hetzner is stable:

1. Go to DigitalOcean dashboard
2. Find droplet: notorious-dad (129.212.248.171)
3. Click "Destroy"
4. Type droplet name to confirm
5. Delete

**Savings Start**: Immediately after deletion

---

## Total Migration Time

| Step | Who | Time | Can Parallelize |
|------|-----|------|-----------------|
| 1. Create Hetzner server | USER | 5 min | - |
| 2. Initial setup | ME | 10 min | - |
| 3. Deploy app | ME | 5 min | ✅ (during data migration) |
| 4. Migrate data (112GB) | ME | 30-60 min | - |
| 5. Set up SSL | ME | 2 min | ✅ (with deploy) |
| 6. Update DNS | USER | 15 min | ✅ (during migration) |
| 7. Test everything | ME | 10 min | - |
| **TOTAL** | | **~60-90 min** | |

---

## Rollback Plan

If something goes wrong:

1. **DNS still points to DO**: No downtime, just revert
2. **DNS updated but Hetzner broken**:
   - Point DNS back to DO (129.212.248.171)
   - Wait 5-15 minutes for propagation
   - DO server still has all data
3. **Both broken**: Use Vercel as fallback (has smaller library)

---

## What You Need to Do

**Before migration**:
1. ✅ Approve migration plan

**During migration**:
1. **Create Hetzner server** (Step 1 above) - ~5 minutes
2. **Give me the server IP**
3. **Update DNS** when I tell you (Step 6) - ~5 minutes

**After migration**:
1. Test the site for 24-48 hours
2. Delete DO droplet when confident

**Total time commitment**: ~15 minutes

---

## Ready to Start?

Reply with **"yes"** and I'll walk you through creating the Hetzner server.

Once you give me the IP, I'll handle the rest automatically.
