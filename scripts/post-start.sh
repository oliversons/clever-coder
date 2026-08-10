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

echo "[post-start] Done — server handles workspace restoration on startup"
