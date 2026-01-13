#!/bin/bash
# Migrate data from DigitalOcean to Hetzner
# This script runs server-to-server rsync for fast transfer

set -e

DO_SERVER="root@129.212.248.171"
HETZNER_SERVER="root@178.156.214.56"

echo "🚚 Migrating data from DigitalOcean to Hetzner"
echo "=============================================="

# Check if Hetzner IP is set
if [[ "$HETZNER_SERVER" == *"HETZNER_IP_HERE"* ]]; then
  echo "❌ Error: Please update HETZNER_SERVER with actual Hetzner IP"
  exit 1
fi

echo "📋 Migration plan:"
echo "  Source: DigitalOcean (129.212.248.171)"
echo "  Target: Hetzner ($HETZNER_SERVER)"
echo "  Data: Audio library (~112GB) + analysis data"
echo ""
read -p "Continue with migration? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
  echo "Cancelled."
  exit 0
fi

# Step 1: Copy SSH key from DO to Hetzner for passwordless transfer
echo ""
echo "🔑 Step 1: Setting up SSH keys for server-to-server transfer..."
ssh $DO_SERVER "mkdir -p ~/.ssh && chmod 700 ~/.ssh"
ssh $DO_SERVER "ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N '' || true"
DO_PUBLIC_KEY=$(ssh $DO_SERVER "cat ~/.ssh/id_rsa.pub")
ssh $HETZNER_SERVER "mkdir -p ~/.ssh && echo '$DO_PUBLIC_KEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

echo "✅ SSH keys configured"

# Step 2: Get Hetzner IP from variable
HETZNER_IP=$(echo $HETZNER_SERVER | cut -d'@' -f2)

# Step 3: Run rsync from DO to Hetzner (server-to-server)
echo ""
echo "📦 Step 2: Transferring audio library (this may take 30-60 minutes)..."
ssh $DO_SERVER << ENDSSH
# Add Hetzner to known hosts
ssh-keyscan -H $HETZNER_IP >> ~/.ssh/known_hosts 2>/dev/null

# Transfer audio library
echo "Transferring audio files..."
rsync -avz --progress \
  /var/www/notorious-dad/audio-library/ \
  root@$HETZNER_IP:/var/www/notorious-dad/audio-library/

echo "Transferring analysis data..."
rsync -avz --progress \
  /var/www/notorious-dad/data/audio-library-analysis.json \
  root@$HETZNER_IP:/var/www/notorious-dad/data/

echo "✅ Data transfer complete!"
ENDSSH

# Step 4: Verify on Hetzner
echo ""
echo "🔍 Step 3: Verifying transfer..."
echo ""
echo "Files on Hetzner:"
ssh $HETZNER_SERVER << 'ENDSSH'
echo "Audio library:"
du -sh /var/www/notorious-dad/audio-library
find /var/www/notorious-dad/audio-library -type f | wc -l
echo "files"

echo ""
echo "Analysis data:"
ls -lh /var/www/notorious-dad/data/audio-library-analysis.json
ENDSSH

echo ""
echo "============================================"
echo "✅ Migration complete!"
echo ""
echo "Next steps:"
echo "1. Test the app at https://mixmaster.mixtape.run"
echo "2. Update DNS if needed (already pointed to domain)"
echo "3. Once verified, you can delete the DO droplet"
echo ""
