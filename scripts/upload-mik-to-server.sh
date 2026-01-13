#!/bin/bash
# Upload MIK-analyzed audio files to DigitalOcean server
# Only uploads files under 20MB (server limit)

set -e

SERVER="root@129.212.248.171"
SERVER_DIR="/var/www/notorious-dad/audio-library"
MIK_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed"
PASSWORD_FILE="$HOME/dj-mix-generator/.do-server-password"

echo "🎵 Uploading MIK Audio Library to DigitalOcean"
echo "=================================================="

# Check password
if [ -f "$PASSWORD_FILE" ]; then
  PASSWORD=$(cat "$PASSWORD_FILE")
else
  echo "⚠️  Server password file not found: $PASSWORD_FILE"
  read -sp "Enter server password: " PASSWORD
  echo ""
fi

echo ""
echo "📦 Uploading audio files (max 20MB each)..."
echo "   This will take 1-2 hours depending on file count"
echo ""

# Upload files under 20MB
# --max-size=20M filters files over 20MB
# --progress shows progress
# --stats shows summary at end
sshpass -p "$PASSWORD" rsync -avz --progress --stats \
  --max-size=20M \
  --include="*/" \
  --include="*.m4a" \
  --include="*.mp3" \
  --include="*.flac" \
  --include="*.wav" \
  --include="*.aac" \
  --exclude="*" \
  -e "ssh -o StrictHostKeyChecking=no" \
  "$MIK_DIR/" \
  $SERVER:$SERVER_DIR/

echo ""
echo "=================================================="
echo "✅ Upload complete!"
echo ""
echo "Next step: Generate MIK data export with:"
echo "  npx tsx scripts/export-mik-data-for-server.ts"
echo ""
