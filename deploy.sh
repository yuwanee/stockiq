#!/bin/bash
# StockIQ — push latest changes to GitHub (Render auto-deploys from there)
set -e

echo "► Building React frontend..."
export PATH="$HOME/node20/bin:$PATH"
cd "$(dirname "$0")/frontend"
npm run build > /dev/null 2>&1
echo "  ✓ Built"

cp -r dist ../backend/static
echo "  ✓ Copied to backend/static"

cd "$(dirname "$0")"
git add -A
git commit -m "Deploy update $(date '+%Y-%m-%d %H:%M')" 2>/dev/null || echo "  (nothing new to commit)"

# Push — will prompt for GitHub password: use your Personal Access Token
git push origin main
echo ""
echo "✓ Pushed to https://github.com/yuwanee/stockiq"
echo "  Render will auto-deploy in ~3 minutes."
echo "  Watch progress at: https://dashboard.render.com"
