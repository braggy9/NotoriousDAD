#!/bin/bash
# Deploy to DigitalOcean Droplet
# Server: mixmaster.mixtape.run (129.212.248.171)

set -e

SERVER="root@129.212.248.171"
SERVER_DIR="/var/www/notorious-dad"
LOCAL_DIR="/Users/tombragg/dj-mix-generator"

# Password file (gitignored) - update this after DigitalOcean password reset
PASSWORD_FILE="$LOCAL_DIR/.do-server-password"

if [ -f "$PASSWORD_FILE" ]; then
  PASSWORD=$(cat "$PASSWORD_FILE")
else
  echo "⚠️  Server password file not found: $PASSWORD_FILE"
  echo "   After resizing the server, the password was reset."
  echo "   Check your DigitalOcean email for the new root password,"
  echo "   then save it to: $PASSWORD_FILE"
  echo ""
  read -sp "Enter server password (or paste from email): " PASSWORD
  echo ""

  # Optionally save for future use
  read -p "Save password to file for future deploys? (y/n): " SAVE
  if [ "$SAVE" = "y" ]; then
    echo "$PASSWORD" > "$PASSWORD_FILE"
    chmod 600 "$PASSWORD_FILE"
    echo "✓ Password saved to $PASSWORD_FILE"
  fi
fi

echo "🚀 Deploying Notorious DAD to mixmaster.mixtape.run"
echo "===================================================="

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
  --exclude 'tsconfig.tsbuildinfo' \
  -e "sshpass -p '$PASSWORD' ssh -o StrictHostKeyChecking=no" \
  $LOCAL_DIR/ $SERVER:$SERVER_DIR/

# Build and restart on server
echo "⚙️  Building and restarting..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER << 'ENDSSH'
cd /var/www/notorious-dad

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install --production=false

# Build the Next.js app
echo "🔨 Building Next.js app..."
npm run build

# Restart PM2
echo "🔄 Restarting app..."
pm2 restart notorious-dad

echo "✅ Build complete!"
ENDSSH

echo ""
echo "===================================================="
echo "✅ Deployment complete!"
echo ""
echo "🌐 Live at: https://mixmaster.mixtape.run"
echo ""
