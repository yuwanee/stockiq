#!/bin/bash
# StockIQ — one-command deploy to GitHub + Render
set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   StockIQ — Deploy to the Internet   ║"
echo "╚══════════════════════════════════════╝"
echo ""

# 1. Rebuild frontend
echo "► Building React frontend..."
export PATH="$HOME/node20/bin:$PATH"
cd "$(dirname "$0")/frontend"
npm run build > /dev/null 2>&1
echo "  ✓ Built"

# 2. Copy build into backend/static
cp -r dist ../backend/static
echo "  ✓ Copied to backend/static"

# 3. Commit everything
cd "$(dirname "$0")"
git add -A
git commit -m "Deploy update $(date '+%Y-%m-%d %H:%M')" 2>/dev/null || echo "  (nothing new to commit)"

# 4. Push to GitHub
if git remote get-url origin &>/dev/null; then
  git push origin main
  echo ""
  echo "✓ Pushed to GitHub — Render will auto-deploy in ~2 min"
  echo "  Your permanent URL is shown in your Render dashboard."
else
  echo ""
  echo "GitHub remote not set yet. Do this once:"
  echo ""
  echo "  1. Go to https://github.com/new and create a repo named 'stockiq'"
  echo "  2. Run these commands:"
  echo "     git remote add origin https://github.com/YOUR_USERNAME/stockiq.git"
  echo "     git push -u origin main"
  echo ""
  echo "  3. Go to https://render.com → New → Web Service → Connect GitHub repo"
  echo "     Runtime: Docker  |  Plan: Free  |  Add env var ANTHROPIC_API_KEY"
  echo ""
  echo "  After that, run: bash deploy.sh   (to push future updates)"
fi
