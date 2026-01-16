#!/bin/bash

# Mashup System Deployment Script
# Deploys the mashup integration to production

set -e

echo "🎭 Mashup System Deployment"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check we're in the right directory
if [ ! -f "lib/mashup-generator.ts" ]; then
  echo -e "${RED}❌ Error: Must run from dj-mix-generator directory${NC}"
  exit 1
fi

echo "📋 Deployment Options:"
echo "  1) Deploy to Vercel"
echo "  2) Deploy to Hetzner"
echo "  3) Deploy to both"
echo "  4) Just commit changes (no deploy)"
echo ""
read -p "Choose option (1-4): " OPTION

case $OPTION in
  1|3)
    echo ""
    echo -e "${YELLOW}📦 Deploying to Vercel...${NC}"

    # Check if vercel CLI is available
    if ! command -v vercel &> /dev/null; then
      echo -e "${RED}❌ Vercel CLI not found. Install with: npm i -g vercel${NC}"
      exit 1
    fi

    vercel --prod

    echo ""
    echo -e "${GREEN}✅ Vercel deployment complete${NC}"
    echo ""
    echo "Test with:"
    echo "curl -X POST https://dj-mix-generator.vercel.app/api/find-mashups \\"
    echo "  -H 'Content-Type: application/json' \\"
    echo "  -d '{\"mode\":\"pairs\",\"tracks\":\"use-library\",\"minCompatibilityScore\":85}'"
    echo ""

    [ "$OPTION" != "3" ] && exit 0
    ;;
esac

case $OPTION in
  2|3)
    echo ""
    echo -e "${YELLOW}🚀 Deploying to Hetzner...${NC}"

    # Check SSH access
    if ! ssh -o ConnectTimeout=5 root@178.156.214.56 "echo 'SSH OK'" 2>/dev/null; then
      echo -e "${RED}❌ Cannot connect to Hetzner server${NC}"
      exit 1
    fi

    echo "  → Syncing files..."
    rsync -avz --progress --exclude 'node_modules' --exclude '.next' \
      ./ root@178.156.214.56:/var/www/notorious-dad/

    echo "  → Installing dependencies..."
    ssh root@178.156.214.56 "cd /var/www/notorious-dad && npm install"

    echo "  → Restarting server..."
    ssh root@178.156.214.56 "pm2 restart notorious-dad"

    sleep 3

    echo ""
    echo -e "${GREEN}✅ Hetzner deployment complete${NC}"
    echo ""
    echo "Test with:"
    echo "curl -X POST https://mixmaster.mixtape.run/api/find-mashups \\"
    echo "  -H 'Content-Type: application/json' \\"
    echo "  -d '{\"mode\":\"pairs\",\"tracks\":\"use-library\",\"minCompatibilityScore\":85}'"
    echo ""

    echo "View logs:"
    echo "ssh root@178.156.214.56 'pm2 logs notorious-dad --lines 50'"
    echo ""
    ;;
esac

case $OPTION in
  4)
    echo ""
    echo -e "${YELLOW}📝 Committing changes...${NC}"

    git add lib/mashup-generator.ts
    git add app/api/find-mashups/route.ts
    git add app/api/generate-playlist/route.ts
    git add scripts/show-top-mashups.ts
    git add scripts/test-mashup-generator.ts
    git add scripts/deploy-mashup-system.sh
    git add MASHUP-*.md

    git commit -m "Add mashup detection system

- Algorithmic mashup compatibility scoring (harmonic + BPM + energy)
- Automatic mashup suggestions in playlists
- Standalone /api/find-mashups endpoint
- 303,775 compatible pairs found in library (41,338 perfect matches)
- Comprehensive documentation and test scripts"

    echo ""
    echo -e "${GREEN}✅ Changes committed${NC}"
    echo ""
    echo "Push to GitHub with:"
    echo "git push origin main"
    echo ""
    echo "Or deploy directly with:"
    echo "./scripts/deploy-mashup-system.sh"
    ;;
esac

echo -e "${GREEN}✅ Deployment complete!${NC}"
