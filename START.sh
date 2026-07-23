#!/bin/bash
# BlinkGo v67 — Self-healing Start
set -e
cd "$(dirname "$0")"

# Load env
set -a
source .env
set +a

# Kill old processes
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "cloudflared" 2>/dev/null || true
sleep 3

# Start server
echo "🚀 Starting BlinkGo server..."
nohup npx next start -p 3000 > /workspace/srv.log 2>&1 &
SERVER_PID=$!
disown
sleep 12

# Verify server
if curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/ | grep -q 200; then
  echo "✅ Server up: http://localhost:3000"
else
  echo "❌ Server failed to start, trying dev mode..."
  pkill -9 -f "next" 2>/dev/null
  sleep 3
  nohup npx next dev -p 3000 > /workspace/srv.log 2>&1 &
  disown
  sleep 20
fi

# Start tunnel
echo "🌐 Starting Cloudflare tunnel..."
if [ ! -f /tmp/cloudflared ]; then
  curl -sL -o /tmp/cloudflared "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
  chmod +x /tmp/cloudflared
fi
nohup /tmp/cloudflared tunnel --url http://localhost:3000 --no-autoupdate > /workspace/cf-tunnel.log 2>&1 &
disown
sleep 25

# Get URL
URL=$(grep -oE "https://[a-zA-Z0-9-]+\.trycloudflare\.com" /workspace/cf-tunnel.log | head -1)
if [ -n "$URL" ]; then
  echo "$URL" > /workspace/CURRENT_TUNNEL.txt
  echo ""
  echo "═══════════════════════════════════════════"
  echo "✅ BlinkGo v67 IS LIVE AT:"
  echo "   $URL"
  echo "═══════════════════════════════════════════"
fi
