# ══════════════════════════════════════════════════════════════
#  Stage 1 — Build (frontend + server TypeScript)
# ══════════════════════════════════════════════════════════════
FROM node:22-slim AS build

# node-pty requires python3, make, g++ to compile its native .node addon
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ git \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Install deps first (layer-cache friendly — only changes when package files change)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json    ./apps/web/

RUN pnpm install --frozen-lockfile

# Build both packages
COPY . .
RUN pnpm --filter web    build
RUN pnpm --filter server build

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

# Copy compiled node_modules from build stage (native .node files are already compiled)
COPY package.json pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY --from=build /app/node_modules               ./node_modules
COPY --from=build /app/apps/server/node_modules   ./apps/server/node_modules

# Compiled TypeScript output + Vite bundle
COPY --from=build /app/apps/server/dist ./server
COPY --from=build /app/apps/web/dist    ./web

# Lifecycle scripts
COPY scripts/ ./scripts/
RUN chmod +x scripts/*.sh

# Workspace root + rclone cache dir
RUN mkdir -p /workspaces /app/rclone-cache

ENV NODE_ENV=production
ENV PORT=8080
ENV WORKSPACES_ROOT=/workspaces

EXPOSE 8080

# dumb-init as PID 1 — ensures SIGTERM is forwarded to Node for graceful shutdown + bisync flush
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/index.js"]
