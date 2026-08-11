#!/usr/bin/env bash
# scripts/post-start.sh
# CC_RUN_SUCCEEDED_HOOK — runs inside container after app is healthy

set -euo pipefail

echo "[post-start] Setting up rclone config..."
/app/scripts/setup-rclone.sh

echo "[post-start] Creating workspaces root..."
mkdir -p /workspaces

echo "[post-start] Running DB migrations..."
node /app/server/db/migrate.js || echo "[post-start] Migrations may already be up to date"

echo "[post-start] Ensuring Hermes directories exist..."
mkdir -p /root/.hermes/logs /root/.hermes/cron /root/.hermes/webui /root/.hermes/webui_state

echo "[post-start] Launching Hermes Gateway daemon for automated cron ticks..."
if ! pgrep -f "hermes.*gateway" > /dev/null 2>&1; then
  nohup hermes gateway start > /root/.hermes/logs/gateway.log 2>&1 &
  echo "[post-start] Hermes Gateway daemon launched in background"
else
  echo "[post-start] Hermes Gateway daemon is already running"
fi

echo "[post-start] Done — server handles workspace restoration and background services"
