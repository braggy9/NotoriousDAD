#!/bin/bash
# Initial Hetzner Server Setup
# Run this script ON the Hetzner server after creation

set -e

echo "🚀 Setting up Notorious DAD on Hetzner Cloud"
echo "=============================================="

# Update system
echo "📦 Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Node.js 22
echo "📦 Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Install build tools and FFmpeg
echo "📦 Installing build tools and FFmpeg..."
apt-get install -y \
  build-essential \
  git \
  ffmpeg \
  aubio-tools \
  nginx \
  certbot \
  python3-certbot-nginx

# Install keyfinder-cli for musical key detection
echo "📦 Installing keyfinder-cli..."
apt-get install -y libfftw3-dev libavcodec-dev libavformat-dev libavutil-dev
cd /tmp
git clone https://github.com/EvanPurkhiser/keyfinder-cli.git
cd keyfinder-cli
make
make install
cd /

# Install PM2 globally
echo "📦 Installing PM2..."
npm install -g pm2

# Create app directory
echo "📁 Creating application directory..."
mkdir -p /var/www/notorious-dad
mkdir -p /var/www/notorious-dad/audio-library
mkdir -p /var/www/notorious-dad/data
mkdir -p /var/www/notorious-dad/output

# Set up firewall
echo "🔒 Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "1. Deploy app code: ./scripts/deploy-hetzner.sh"
echo "2. Configure nginx: see scripts/configure-nginx-hetzner.sh"
echo "3. Set up SSL: certbot --nginx -d mixmaster.mixtape.run"
echo "4. Migrate audio files from DO server"
echo ""
