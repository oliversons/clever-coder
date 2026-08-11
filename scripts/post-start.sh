#!/usr/bin/env bash
# scripts/post-start.sh
# CC_RUN_SUCCEEDED_HOOK — runs inside container after app is healthy

set -euo pipefail

echo "[post-start] ══════════════════════════════════════════"
echo "[post-start]  CleverCoder Performance Bootstrap"
echo "[post-start]  CPUs: $(nproc) | RAM: $(free -m | awk '/Mem:/{print $2}') MB"
echo "[post-start] ══════════════════════════════════════════"

# ── Multi-core & memory tuning ────────────────────────────────────────────────
NCPUS=$(nproc)
TOTAL_RAM_MB=$(free -m | awk '/Mem:/{print $2}')
HEAP_MB=$(( TOTAL_RAM_MB * 60 / 100 ))

export UV_THREADPOOL_SIZE="${UV_THREADPOOL_SIZE:-$(( NCPUS * 2 ))}"
export GOMAXPROCS="${GOMAXPROCS:-${NCPUS}}"
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=${HEAP_MB}"

echo "[post-start] UV_THREADPOOL_SIZE=${UV_THREADPOOL_SIZE} | GOMAXPROCS=${GOMAXPROCS} | NODE heap=${HEAP_MB}MB"

# ── rclone config ────────────────────────────────────────────────────────────
echo "[post-start] Setting up rclone config..."
/app/scripts/setup-rclone.sh

# ── Workspace root ────────────────────────────────────────────────────────────
echo "[post-start] Creating workspaces root..."
mkdir -p /workspaces

# ── DB migrations (server handles at startup; this is a safety fallback) ──────
echo "[post-start] Running DB migrations..."
node /app/server/db/migrate.js || echo "[post-start] Migrations may already be up to date"

# ── Hermes directories ────────────────────────────────────────────────────────
echo "[post-start] Ensuring Hermes directories exist..."
mkdir -p /root/.hermes/logs /root/.hermes/cron \
         /root/.hermes/webui /root/.hermes/webui_state \
         /root/.hermes/profiles/default/cron

# ── Hermes Gateway daemon ─────────────────────────────────────────────────────
# The Node.js cluster primary process also manages the gateway via
# hermes-gateway.service.ts. This shell-level launch is a belt-and-suspenders
# fallback for cases where the Node daemon hasn't loaded yet.
echo "[post-start] Launching Hermes Gateway daemon..."
if ! pgrep -f "hermes.*gateway" > /dev/null 2>&1; then
  nohup hermes gateway start > /root/.hermes/logs/gateway.log 2>&1 &
  echo "[post-start] Hermes Gateway daemon launched in background (PID $!)"
else
  echo "[post-start] Hermes Gateway daemon is already running"
fi

echo "[post-start] Done ✓ — server (${NCPUS} cores) starting via cluster.js"
