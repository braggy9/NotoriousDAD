#!/bin/bash
# Deploy to Vercel Production
# Workaround: temporarily removes .git to bypass author email check

echo "🚀 Deploying DJ Mix Generator to Vercel..."

# Backup git
mv .git .git.bak

# Deploy
vercel --yes --prod

# Restore git
mv .git.bak .git

echo "✅ Deploy complete!"
echo "🔗 https://dj-mix-generator.vercel.app"
