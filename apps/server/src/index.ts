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
import { stopAllWorkspaces, getWorkspacePort } from './services/workspace.service.js';

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

    // Hijack response from Fastify so http-proxy-middleware streams directly to reply.raw
    reply.hijack();
    await createWorkspaceProxy(request.raw, reply.raw, id);
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
  await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
  fastify.log.info(`🚀  Server running at http://0.0.0.0:${config.PORT}`);

  // ── WebSocket Upgrade Handler for Code-Server Workbench ───────────────────
  const rawServer = fastify.server;
  rawServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    const match = req.url?.match(/^\/workspace\/([^/]+)/);
    if (!match) return;
    const projectId = match[1];

    const port = getWorkspacePort(projectId);
    if (!port) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    // Directly proxy active workspace's internal VSCode WebSockets (extension host, terminal, file watcher)
    proxyWorkspaceUpgrade(req, socket, head, projectId);
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
