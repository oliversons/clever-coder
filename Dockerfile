# ══════════════════════════════════════════════════════════════
#  Stage 1 — Build (frontend + server TypeScript)
# ══════════════════════════════════════════════════════════════
FROM node:22-slim AS build

# node-pty requires python3/make/g++ to compile its native addon via node-gyp
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ git \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Install all deps (layer-cache friendly — changes only when lockfile changes)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json    ./apps/web/
RUN pnpm install --frozen-lockfile

# Build both packages
COPY . .
RUN pnpm --filter web    build
RUN pnpm --filter server build

# Produce a self-contained production deployment for the server package.
# `pnpm deploy` copies only runtime deps + resolves all symlinks into real files —
# no more broken pnpm symlinks in the runtime image.
# --legacy is required by pnpm v10+ for workspace deploys.
RUN pnpm deploy --filter server --prod --legacy /deploy/server

# ══════════════════════════════════════════════════════════════
#  Stage 2 — Runtime
# ══════════════════════════════════════════════════════════════
FROM node:22-slim AS runtime

# ── System tools ───────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl wget ca-certificates \
      unzip zip jq procps dumb-init \
      python3 make g++ \
      openssh-client \
    && rm -rf /var/lib/apt/lists/*

# ── code-server ────────────────────────────────────────────────
RUN curl -fsSL https://code-server.dev/install.sh | sh -s -- --version 4.96.4

# ── rclone (static binary — no FUSE needed for bisync) ─────────
RUN curl -fsSL https://rclone.org/install.sh | bash \
    && rclone version

# ── App ────────────────────────────────────────────────────────
WORKDIR /app

# Self-contained server: package.json + node_modules (real files, no symlinks) + dist
COPY --from=build /deploy/server ./

# Vite frontend bundle
COPY --from=build /app/apps/web/dist ./web

# Lifecycle scripts
COPY scripts/ ./scripts/
RUN chmod +x scripts/*.sh

# Workspace root + rclone cache dir
RUN mkdir -p /workspaces /app/rclone-cache

ENV NODE_ENV=production
ENV PORT=8080
ENV WORKSPACES_ROOT=/workspaces
# Tell the server exactly where the web dist is
ENV WEB_DIST_PATH=/app/web

EXPOSE 8080

# dumb-init as PID 1: forwards SIGTERM → Node graceful shutdown → bisync flush
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
