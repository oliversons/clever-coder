import 'node:process';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fastifyRateLimit from '@fastify/rate-limit';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';

import { getConfig, config } from './config.js';
import { getDb, schema } from './db/index.js';
import { eq } from 'drizzle-orm';
import { setupRcloneConfig } from './utils/rclone.js';
import { flushAllSyncs, initWorkspaceFromCellar, startWatcher } from './services/sync.service.js';
import { stopAllWorkspaces, getWorkspacePort, startWorkspace } from './services/workspace.service.js';

import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { workspaceRoutes, createWorkspaceProxy, proxyWorkspaceUpgrade } from './routes/workspace.js';
import { terminalRoutes } from './routes/terminal.js';
import { extensionRoutes } from './routes/extensions.js';
import { archiveRoutes } from './routes/archive.js';
import { healthRoutes } from './routes/health.js';
import { verifyToken } from './middleware/auth.middleware.js';
import { runMigrations } from './db/migrate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Validate config on startup
getConfig();

const fastify = Fastify({
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: config.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

function findWebDist(): string | null {
  if (process.env.WEB_DIST_PATH && existsSync(process.env.WEB_DIST_PATH)) {
    return process.env.WEB_DIST_PATH;
  }
  const candidates = [
    join(__dirname, '..', '..', '..', 'web'),
    join(__dirname, '..', '..', 'web'),
    join(__dirname, '..', 'web'),
  ];
  return candidates.find(existsSync) ?? null;
}

async function bootstrap() {
  // ── Run DB migrations first ──────────────────────────────────────────────
  try {
    await runMigrations();
  } catch (err) {
    console.error('FATAL: DB migration failed, refusing to start:', err);
    process.exit(1);
  }

  // ── Plugins ────────────────────────────────────────────────────────────────
  await fastify.register(fastifyCors, {
    origin: config.PUBLIC_URL,
    credentials: true,
  });

  await fastify.register(fastifyCookie, {
    secret: config.JWT_SECRET,
  });

  await fastify.register(fastifyWebsocket);

  await fastify.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // ── API Routes ─────────────────────────────────────────────────────────────
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
  await fastify.register(projectRoutes, { prefix: '/api/v1/projects' });
  await fastify.register(workspaceRoutes, { prefix: '/api/v1/projects' });
  await fastify.register(terminalRoutes, { prefix: '/api/v1/projects' });
  await fastify.register(extensionRoutes, { prefix: '/api/v1/projects' });
  await fastify.register(archiveRoutes, { prefix: '/api/v1/projects' });

  // ── Workspace Proxy Routes (HTTP iframe embedding) ──────────────────────────
  fastify.all('/workspace/:id/*', async (request, reply) => {
    const { id } = request.params as { id: string };

    const cookieToken = (request.cookies as Record<string, string | undefined>)?.[
      'access_token'
    ];
    const authHeader = request.headers.authorization;
    const queryToken = (request.query as Record<string, string | undefined>)?.[
      'token'
    ];
    const token =
      cookieToken ||
      (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined) ||
      queryToken;

    if (!token) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    try {
      verifyToken(token);
    } catch {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    // Hijack response from Fastify so http-proxy streams directly to reply.raw
    reply.hijack();
    await createWorkspaceProxy(request.raw, reply.raw as ServerResponse, id);
  });

  fastify.all('/workspace/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.redirect(`/workspace/${id}/`);
  });

  // ── Static frontend ────────────────────────────────────────────────────────
  const webDistPath = findWebDist();
  if (webDistPath) {
    fastify.log.info(`Serving frontend from: ${webDistPath}`);
    await fastify.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      decorateReply: true,
    });

    // SPA fallback (ignore /api and /workspace paths)
    fastify.setNotFoundHandler((req, reply) => {
      if (!req.url.startsWith('/api') && !req.url.startsWith('/workspace')) {
        reply.sendFile('index.html');
      } else {
        reply.code(404).send({ error: 'Not found' });
      }
    });
  } else {
    fastify.log.warn('Web dist not found — API-only mode');
  }

  // ── Infrastructure setup ───────────────────────────────────────────────────
  setupRcloneConfig();

  // Restore all "ready" workspaces from Cellar
  const db = getDb();
  const readyProjects = await db.query.projects.findMany({
    where: eq(schema.projects.status, 'ready'),
  });

  for (const project of readyProjects) {
    initWorkspaceFromCellar(project.id)
      .then(() => startWatcher(project.id))
      .catch((err: Error) => {
        fastify.log.error(`Failed to restore workspace ${project.id}: ${err.message}`);
      });
  }

  // ── Start server ───────────────────────────────────────────────────────────
  // fastify.listen() initializes all plugins including @fastify/websocket,
  // which registers its own server.on('upgrade') that calls socket.destroy()
  // for any URL not matching a registered WS route. We start the server first,
  // then intercept and replace the upgrade event listeners.
  await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
  fastify.log.info(`🚀  Server running at http://0.0.0.0:${config.PORT}`);

  // ── WebSocket Upgrade Router ───────────────────────────────────────────────
  // After listen(), @fastify/websocket has already registered its own upgrade
  // handler. We capture all existing handlers, remove them, then add ONE combined
  // handler that:
  //   - Routes /workspace/:id/* upgrades → raw TCP tunnel to code-server
  //   - Routes everything else           → original handlers (@fastify/websocket)
  //
  // This prevents @fastify/websocket from calling socket.destroy() on workspace
  // WebSocket connections that don't match any registered Fastify WS route.
  const rawServer = fastify.server;
  const existingUpgradeListeners = rawServer.rawListeners('upgrade').slice();
  rawServer.removeAllListeners('upgrade');

  rawServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    const workspaceMatch = req.url?.match(/^\/workspace\/([^/]+)/);

    if (workspaceMatch) {
      // ── Workspace WebSocket → raw TCP tunnel ──────────────────────────────
      const projectId = workspaceMatch[1];

      // Auth check: cookie, Authorization header, or ?token= query param
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${config.PORT}`);
      const cookieHeader = req.headers.cookie ?? '';
      const cookieToken = cookieHeader.split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('access_token='))
        ?.split('=')[1];
      const authHeader = req.headers.authorization as string | undefined;
      const queryToken = url.searchParams.get('token') ?? undefined;
      const token = cookieToken
        || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined)
        || queryToken;

      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      try {
        verifyToken(token);
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      const port = getWorkspacePort(projectId);
      if (!port) {
        // Workspace not running yet — start it, then proxy
        startWorkspace(projectId)
          .then(() => proxyWorkspaceUpgrade(req, socket, head, projectId))
          .catch((err: Error) => {
            fastify.log.error(`[upgrade] Failed to start workspace ${projectId}: ${err.message}`);
            socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
            socket.destroy();
          });
        return;
      }

      proxyWorkspaceUpgrade(req, socket, head, projectId);

    } else {
      // ── All other WebSockets (terminal etc.) → @fastify/websocket ─────────
      for (const listener of existingUpgradeListeners) {
        (listener as (...args: unknown[]) => void).call(rawServer, req, socket, head);
      }
    }
  });
}

// ── Graceful shutdown ──────────────────────────────────────────────────────
async function shutdown(signal: string) {
  fastify.log.info(`[${signal}] Initiating graceful shutdown...`);
  await fastify.close();
  await flushAllSyncs();
  await stopAllWorkspaces();
  fastify.log.info('Shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
