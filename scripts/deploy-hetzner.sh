#!/bin/bash
# Deploy to Hetzner Cloud Server
# Server: mixmaster.mixtape.run

set -e

# These will be updated after server creation
SERVER="root@178.156.214.56"
SERVER_DIR="/var/www/notorious-dad"
LOCAL_DIR="/Users/tombragg/Developer/dj-mix-generator"

echo "🚀 Deploying Notorious DAD to Hetzner Cloud"
echo "============================================"

# Check if server IP is set
if [[ "$SERVER" == *"HETZNER_IP_HERE"* ]]; then
  echo "❌ Error: Please update SERVER variable with actual Hetzner IP"
  echo "   Edit this file and replace HETZNER_IP_HERE with the server IP"
  exit 1
fi

# Files to sync (excluding large/local-only files)
echo "📦 Syncing project files..."
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  --exclude '.vercel' \
  --exclude 'output' \
  --exclude '*.xml' \
  --exclude '*.csv' \
  --exclude 'data/apple-music*' \
  --exclude 'data/audio-library-index.json' \
  --exclude 'data/audio-library-analysis*.json' \
  --exclude 'audio-library' \
  --exclude 'NotoriousDAD-iOS' \
  --exclude 'NotoriousDAD-macOS' \
  --exclude 'NotoriousDAD.xcworkspace' \
  --exclude 'NotoriousDADKit' \
  --exclude 'build' \
  --exclude 'logs' \
  --exclude '.spotify-token.json' \
  --exclude '.env.local' \
  --exclude '.env.production*' \
  --exclude 'CLAUDE.local.md' \
  --exclude '*.local.md' \
  --exclude 'SPOTIFY-DOWNLOADER.md' \
  --exclude 'SPOTIFY-AUTOMATION.md' \
  --exclude 'tsconfig.tsbuildinfo' \
  $LOCAL_DIR/ $SERVER:$SERVER_DIR/

# NOTE: .env.local is NOT synced — Hetzner has its own config
# (different SPOTIFY_REDIRECT_URI, etc). Edit directly via SSH if needed.

# Build and restart on server
echo "⚙️  Building and restarting..."
ssh $SERVER << 'ENDSSH'
cd /var/www/notorious-dad

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install --production=false

# Hide audio-library symlink from Turbopack (can't handle symlinks in project root)
# IMPORTANT: Don't mv — a running mix would lose access to audio files mid-build.
# Instead, temporarily rename so Turbopack ignores it, keeping the original target accessible.
echo "📦 Hiding audio-library symlink from Turbopack..."
AUDIO_LINK_TARGET=""
if [ -L audio-library ]; then
  AUDIO_LINK_TARGET=$(readlink audio-library)
  rm audio-library
fi

# Build the Next.js app
echo "🔨 Building Next.js app..."
npm run build

# Restore audio-library symlink
echo "📦 Restoring audio-library symlink..."
if [ -n "$AUDIO_LINK_TARGET" ]; then
  ln -sf "$AUDIO_LINK_TARGET" audio-library
fi

# Start or restart PM2
if pm2 list | grep -q "notorious-dad"; then
  echo "🔄 Restarting app..."
  pm2 restart notorious-dad
else
  echo "🚀 Starting app for first time..."
  pm2 start npm --name "notorious-dad" -- start
  pm2 save
  pm2 startup systemd
fi

echo "✅ Build complete!"
ENDSSH

echo ""
echo "============================================"
echo "✅ Deployment complete!"
echo ""
echo "🌐 Live at: https://mixmaster.mixtape.run"
echo ""
