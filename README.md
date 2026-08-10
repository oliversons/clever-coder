# ⚡ CleverCoder — Vibe Coding / AI Project Manager

A browser-based cloud coding workspace built on [code-server](https://github.com/coder/code-server), deployed on Clever Cloud with **permanent file storage** via Cellar (S3).

## Features

- 🔐 **Auth** — Email/password + GitHub OAuth
- 📦 **GitHub Projects** — Clone any public or private repo
- 💻 **Web IDE** — Full VS Code in the browser (code-server), per project
- 🖥️ **Terminal** — Interactive PTY terminal in the panel
- 🔌 **Extensions** — Install any Open VSX / VS Code extension
- ☁️ **Persistent storage** — Files survive container restarts via Cellar S3
- 📦 **Download** — Zip & download your project anytime

## Persistence Strategy

Clever Cloud Docker apps use **ephemeral VMs** — files are lost on restart.

**Solution:** local disk (fast) + `rclone bisync` → Cellar S3 (durable)

- On boot: restores workspace from Cellar
- While running: syncs every 15s + on file changes (debounced 3s)
- On SIGTERM: final sync flush before exit
- No FUSE needed — `rclone bisync` uses the S3 API directly

## Architecture

```
Browser → Fastify panel (auth + projects + proxy)
                    ↓
          code-server per project (127.0.0.1:<port>, --auth none)
                    ↓
          /workspaces/<projectId>/ (local fast disk)
                    ↓
          rclone bisync → Clever Cloud Cellar (S3)
```

## Local Development

### Prerequisites
- Node.js 22+, pnpm 11+
- Docker (for Postgres + MinIO)
- `rclone` installed (`curl -fsSL https://rclone.org/install.sh | bash`)
- `code-server` installed

### Setup

```bash
# 1. Clone
git clone https://github.com/oliversons/clever-coder
cd clever-coder

# 2. Install dependencies
pnpm install

# 3. Start local services (Postgres + MinIO)
docker compose -f docker-compose.dev.yml up -d

# 4. Configure environment
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET and ENCRYPTION_KEY

# 5. Run database migrations
pnpm db:migrate

# 6. Start dev servers
pnpm dev
```

Frontend: http://localhost:5173  
Backend: http://localhost:8080

### MinIO Console (local S3)
http://localhost:9001 — user: `minioadmin` / pass: `minioadmin`

## Deployment (Clever Cloud)

### 1. Create add-ons

```bash
# Create and link add-ons
clever addon create cellar-addon --plan default --link clever-coder
clever addon create postgresql-addon --plan xs --link clever-coder

# Create Cellar bucket (one-time)
AWS_ACCESS_KEY_ID=$CELLAR_ADDON_KEY_ID \
AWS_SECRET_ACCESS_KEY=$CELLAR_ADDON_KEY_SECRET \
aws s3api create-bucket --bucket clever-coder \
  --endpoint-url https://$CELLAR_ADDON_HOST
```

### 2. Set environment variables

```bash
clever env set JWT_SECRET $(openssl rand -hex 32)
clever env set ENCRYPTION_KEY $(openssl rand -hex 32)
clever env set CELLAR_BUCKET clever-coder
clever env set CELLAR_REGION default
clever env set S3_FORCE_PATH_STYLE true
clever env set PUBLIC_URL https://your-app.cleverapps.io
clever env set CC_DOCKER_EXPOSED_HTTP_PORT 8080
clever env set CC_HEALTH_CHECK_PATH /health
clever env set CC_RUN_SUCCEEDED_HOOK ./scripts/post-start.sh
clever env set WORKSPACES_ROOT /workspaces
clever env set SYNC_INTERVAL_MS 15000
clever env set SYNC_DEBOUNCE_MS 3000
clever env set IDLE_IDE_TIMEOUT_MIN 20
```

### 3. Scale and deploy

```bash
clever scale --flavor L   # 4 vCPU / 8 GB — supports ~8 concurrent IDEs
clever deploy
```

## Project Structure

```
clever-coder/
├── apps/
│   ├── server/     — Fastify API + WS + code-server proxy
│   └── web/        — React + Vite panel
├── scripts/        — Post-start hooks, rclone setup
├── Dockerfile      — Multi-stage build
└── docker-compose.dev.yml
```

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + TypeScript + Fastify |
| Frontend | React + Vite |
| Database | PostgreSQL + Drizzle ORM |
| Web IDE | code-server |
| Persistence | rclone bisync → Clever Cloud Cellar |
| Terminal | node-pty + xterm.js |
| Auth | argon2 + JWT + GitHub OAuth |
