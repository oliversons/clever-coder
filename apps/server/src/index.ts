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
import { stopAllWorkspaces } from './services/workspace.service.js';

import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { workspaceRoutes, createWorkspaceProxy } from './routes/workspace.js';
import { terminalRoutes } from './routes/terminal.js';
import { extensionRoutes } from './routes/extensions.js';
import { archiveRoutes } from './routes/archive.js';
import { healthRoutes } from './routes/health.js';
import { verifyToken } from './middleware/auth.middleware.js';

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

async function bootstrap() {
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

  // ── Static frontend ────────────────────────────────────────────────────────
  const webDistPath = join(__dirname, '..', 'web');
  if (existsSync(webDistPath)) {
    await fastify.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      decorateReply: true,
    });

    // SPA fallback — catch non-API, non-workspace routes
    fastify.setNotFoundHandler((req, reply) => {
      if (!req.url.startsWith('/api') && !req.url.startsWith('/workspace')) {
        reply.sendFile('index.html');
      } else {
        reply.code(404).send({ error: 'Not found' });
      }
    });
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
  const server = await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
  fastify.log.info(`🚀  Server running at http://0.0.0.0:${config.PORT}`);

  // ── Workspace proxy ────────────────────────────────────────────────────────
  // Must be attached to the raw Node HTTP server AFTER Fastify starts,
  // to intercept /workspace/:id/* before Fastify handles them.
  // We use server.on('request') at the raw level.
  const rawServer = fastify.server;

  rawServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
    const match = req.url?.match(/^\/workspace\/([^/]+)\//);
    if (!match) return; // not a workspace request — already handled by Fastify

    const projectId = match[1];

    // Validate JWT from cookie or Authorization header
    const cookieHeader = req.headers.cookie ?? '';
    const cookieToken = cookieHeader.split(';')
      .map(c => c.trim().split('='))
      .find(([k]) => k === 'access_token')?.[1];

    const bearerToken = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;

    const token = cookieToken ?? bearerToken;
    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    try {
      verifyToken(token);
    } catch {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    createWorkspaceProxy(req, res, projectId);
  });
}

// ── Graceful shutdown ──────────────────────────────────────────────────────
async function shutdown(signal: string) {
  fastify.log.info(`[${signal}] Initiating graceful shutdown...`);

  // 1. Stop accepting new connections
  await fastify.close();

  // 2. Flush all workspace syncs to Cellar
  await flushAllSyncs();

  // 3. Stop all code-server processes
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
