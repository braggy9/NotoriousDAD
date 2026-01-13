#!/bin/bash
# Set up 100GB volume for audio library on Hetzner
# Run this ON the Hetzner server after initial setup

set -e

echo "💾 Setting up 100GB volume for audio library"
echo "=============================================="

# This script assumes the volume has already been created and attached via Hetzner UI
# If not, you need to:
# 1. Go to Hetzner Cloud Console
# 2. Click "Volumes" → "Add Volume"
# 3. Size: 100GB
# 4. Attach to: notorious-dad server
# 5. Location: Ashburn (same as server)

echo ""
echo "Step 1: Find the volume device..."
VOLUME_DEVICE=$(lsblk -o NAME,SIZE | grep "100G" | awk '{print $1}' | head -1)

if [ -z "$VOLUME_DEVICE" ]; then
  echo "❌ Error: No 100GB volume found!"
  echo ""
  echo "Please create and attach volume via Hetzner UI first:"
  echo "1. Hetzner Console → Volumes → Add Volume"
  echo "2. Size: 100GB"
  echo "3. Attach to: notorious-dad server"
  echo "4. Then run this script again"
  exit 1
fi

echo "✓ Found volume: /dev/$VOLUME_DEVICE"

# Step 2: Format the volume (ext4)
echo ""
echo "Step 2: Formatting volume as ext4..."
mkfs.ext4 /dev/$VOLUME_DEVICE

# Step 3: Create mount point
echo ""
echo "Step 3: Creating mount point..."
mkdir -p /mnt/audio-library

# Step 4: Mount the volume
echo ""
echo "Step 4: Mounting volume..."
mount /dev/$VOLUME_DEVICE /mnt/audio-library

# Step 5: Add to fstab for auto-mount on boot
echo ""
echo "Step 5: Configuring auto-mount..."
VOLUME_UUID=$(blkid -s UUID -o value /dev/$VOLUME_DEVICE)
echo "UUID=$VOLUME_UUID /mnt/audio-library ext4 defaults 0 2" >> /etc/fstab

# Step 6: Create symlink from app directory
echo ""
echo "Step 6: Creating symlink..."
rm -rf /var/www/notorious-dad/audio-library
ln -s /mnt/audio-library /var/www/notorious-dad/audio-library

# Step 7: Set permissions
echo ""
echo "Step 7: Setting permissions..."
chown -R root:root /mnt/audio-library
chmod -R 755 /mnt/audio-library

echo ""
echo "============================================"
echo "✅ Volume setup complete!"
echo ""
echo "Volume Info:"
echo "  Device: /dev/$VOLUME_DEVICE"
echo "  UUID: $VOLUME_UUID"
echo "  Mount Point: /mnt/audio-library"
echo "  Symlink: /var/www/notorious-dad/audio-library → /mnt/audio-library"
echo "  Available Space:"
df -h /mnt/audio-library | tail -1
echo ""
