#!/bin/bash
set -e

echo "Starting StockIQ..."

lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 1

cd "$(dirname "$0")/backend"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 > /tmp/stockiq-backend.log 2>&1 &
echo "Backend:  http://localhost:8000"

export PATH="$HOME/node20/bin:$PATH"
cd "$(dirname "$0")/frontend"
npm run dev > /tmp/stockiq-frontend.log 2>&1 &
echo "Frontend: http://localhost:5173"

sleep 3
echo ""
echo "StockIQ is ready! Open http://localhost:5173"
echo ""
echo "Note: Data is sourced from Yahoo Finance."
echo "If you see 'Rate limited' errors, wait 30-60 min — this only happens"
echo "when many requests are made in quick succession."
echo "Normal single-user usage is not rate limited."
echo ""
echo "For AI analysis, set: export ANTHROPIC_API_KEY=your-key  then re-run."
echo "Logs: /tmp/stockiq-backend.log  /tmp/stockiq-frontend.log"
echo "Stop: lsof -ti:8000,5173 | xargs kill -9"
