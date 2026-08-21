#!/bin/bash
# max-mcp-server production deploy script
# Run on VPS after: git pull
# Usage: bash scripts/deploy.sh

set -e

APP_DIR="/opt/max/max-mcp-server"
cd "$APP_DIR"

echo "==> Installing dependencies..."
pnpm install

echo "==> Building (standalone)..."
pnpm build

echo "==> Copying static files into standalone output..."
cp -r public .next/standalone/public 2>/dev/null || true
cp -r .next/static .next/standalone/.next/static

echo "==> Restarting via PM2..."
if pm2 describe max-mcp-server > /dev/null 2>&1; then
  pm2 restart max-mcp-server
else
  pm2 start ecosystem.config.js
fi

pm2 save

echo "==> Done. max-mcp-server is live on :3001"
pm2 show max-mcp-server
