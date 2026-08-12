#!/usr/bin/env bash
# scripts/post-start.sh
# CC_RUN_SUCCEEDED_HOOK — runs inside container after app is healthy

set -euo pipefail

echo "[post-start] ══════════════════════════════════════════"
echo "[post-start]  CleverCoder Performance & Browser Bootstrap"
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

# ── Hermes core directories & Web Search / Vision env ─────────────────────────
echo "[post-start] Ensuring Hermes directories & env files exist..."
mkdir -p /root/.hermes/logs /root/.hermes/cron \
         /root/.hermes/webui /root/.hermes/webui_state \
         /root/.hermes/profiles/default/cron \
         /root/.hermes/images \
         /root/.hermes/cache/screenshots \
         /root/.hermes/cache/web \
         /root/.hermes/browser_recordings \
         /root/.hermes/chrome-debug \
         /root/.hermes/browser_auth/camofox

touch /root/.hermes/config.yaml /root/.hermes/.env

# Pre-install Python & system audio dependencies (Pillow, ddgs, duckduckgo_search, trafilatura, bs4, spotipy, edge-tts, openai)
mkdir -p /root/.hermes/audio_cache
if command -v pip3 &> /dev/null; then
  pip3 install --no-cache-dir --quiet Pillow ddgs duckduckgo_search trafilatura beautifulsoup4 spotipy edge-tts openai --break-system-packages 2>/dev/null || true
elif command -v pip &> /dev/null; then
  pip install --no-cache-dir --quiet Pillow ddgs duckduckgo_search trafilatura beautifulsoup4 spotipy edge-tts openai --break-system-packages 2>/dev/null || true
fi

# ── Browser Automation Dependencies & Virtual Display (Xvfb) ──────────────────
echo "[post-start] Initializing Browser Automation Environment..."

# 1. Virtual Framebuffer Display for headless/headful rendering & screenshot capture
if command -v Xvfb &> /dev/null && ! pgrep -f Xvfb > /dev/null; then
  echo "[post-start] Launching virtual display server (Xvfb :99)..."
  Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp > /root/.hermes/logs/xvfb.log 2>&1 &
  export DISPLAY=:99
fi

# 2. Pre-cache Cloudflare Kitesurf MCP & agent-browser tooling
if command -v npx &> /dev/null; then
  echo "[post-start] Pre-caching chrome-devtools-mcp and agent-browser..."
  npx -y chrome-devtools-mcp@latest --help > /dev/null 2>&1 || true
fi

# 3. Camofox Anti-Detection Browser Daemon (:9377)
echo "[post-start] Starting Camofox Anti-Detection daemon (:9377)..."
if ! pgrep -f "camofox" > /dev/null 2>&1; then
  if command -v camofox-browser &> /dev/null; then
    nohup camofox-browser --port 9377 > /root/.hermes/logs/camofox.log 2>&1 &
    echo "[post-start] Camofox server launched on port 9377 (PID $!)"
  elif command -v npx &> /dev/null; then
    nohup npx -y @askjo/camofox-browser --port 9377 > /root/.hermes/logs/camofox.log 2>&1 &
    echo "[post-start] Camofox server launched via npx on port 9377 (PID $!)"
  fi
else
  echo "[post-start] Camofox daemon is already running"
fi

# ── Hermes Gateway daemon ─────────────────────────────────────────────────────
echo "[post-start] Launching Hermes Gateway daemon..."
if ! pgrep -f "hermes.*gateway" > /dev/null 2>&1; then
  nohup hermes gateway start > /root/.hermes/logs/gateway.log 2>&1 &
  echo "[post-start] Hermes Gateway daemon launched in background (PID $!)"
else
  echo "[post-start] Hermes Gateway daemon is already running"
fi

echo "[post-start] Done ✓ — server (${NCPUS} cores) ready with Browser Automation"
