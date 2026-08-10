import type { FastifyPluginAsync } from 'fastify';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Duplex } from 'node:stream';
import { Readable } from 'node:stream';
import net from 'node:net';
import fs from 'node:fs';
import httpProxy from 'http-proxy';
import { authMiddleware, verifyToken, type JwtPayload } from '../middleware/auth.middleware.js';
import { startHermesWebUI, restartHermesWebUI, getHermesWebUIPort, isHermesWebUIRunning, isPortOpen } from '../services/hermes-webui.service.js';
import { ensureWorkspaceFiles } from '../services/workspace.service.js';
import { startWatcher } from '../services/sync.service.js';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { join, resolve } from 'path';
import { config } from '../config.js';

type AuthRequest = { user: JwtPayload };

const webuiProxyMap = new Map<number, httpProxy>();

function getWebUIProxy(port: number): httpProxy {
  if (webuiProxyMap.has(port)) return webuiProxyMap.get(port)!;
  const proxy = httpProxy.createProxyServer({
    target: `http://127.0.0.1:${port}`,
    xfwd: true,
    changeOrigin: true,
    autoRewrite: true,
    proxyTimeout: 120000,
    timeout: 120000,
  });

  proxy.on('error', (err, _req, res) => {
    console.error(`[hermes-webui-proxy:${port}] error: ${err.message}`);
    if (res && typeof (res as ServerResponse).writeHead === 'function') {
      const r = res as ServerResponse;
      if (!r.headersSent) {
        r.writeHead(502, { 'Content-Type': 'application/json' });
        r.end(JSON.stringify({ error: 'Hermes WebUI proxy error', detail: err.message }));
      }
    }
  });

  webuiProxyMap.set(port, proxy);
  return proxy;
}

/**
 * Helper to sync user project workspaces from Cellar S3 to disk and pre-seed ~/.hermes/spaces.json
 */
async function syncUserSpacesAndWorkspaces(userId: string, activeProjectId?: string): Promise<{ activePath: string; activeName: string }> {
  const db = getDb();
  const userProjects = await db.query.projects.findMany({
    where: eq(schema.projects.userId, userId),
  });

  // 1. Pull/restore all user project workspaces from Cellar S3 to local container disk
  for (const proj of userProjects) {
    try {
      console.log(`📥 [Hermes WebUI] Restoring workspace ${proj.name} (${proj.id}) from Cellar S3...`);
      await ensureWorkspaceFiles(proj.id);
      startWatcher(proj.id);
    } catch (err) {
      console.warn(`[Hermes WebUI] Failed to restore workspace ${proj.id} from Cellar S3:`, err);
    }
  }

  // 2. Determine active project
  let targetProject = userProjects.find((p) => p.id === activeProjectId);
  if (!targetProject && userProjects.length > 0) {
    targetProject = userProjects[0];
  }

  const activePath = targetProject ? join(config.WORKSPACES_ROOT, targetProject.id) : config.WORKSPACES_ROOT;
  const activeName = targetProject?.name || 'Home';

  // Ensure root workspace directory exists
  if (!fs.existsSync(activePath)) {
    fs.mkdirSync(activePath, { recursive: true });
  }

  // 3. Pre-seed ~/.hermes/spaces.json & workspaces.json so Hermes WebUI displays all project workspaces
  const hermesHome = process.env.HERMES_HOME || resolve(process.env.HOME || '/root', '.hermes');
  if (!fs.existsSync(hermesHome)) {
    fs.mkdirSync(hermesHome, { recursive: true });
  }

  const spacesConfig = {
    active_space: activeName,
    spaces: [
      {
        name: activeName,
        path: activePath,
        status: 'ACTIVE',
      },
      ...userProjects
        .filter((p) => p.id !== targetProject?.id)
        .map((p) => ({
          name: p.name,
          path: join(config.WORKSPACES_ROOT, p.id),
          status: 'INACTIVE',
        })),
    ],
  };

  try {
    fs.writeFileSync(join(hermesHome, 'spaces.json'), JSON.stringify(spacesConfig, null, 2), 'utf8');
    fs.writeFileSync(join(hermesHome, 'workspaces.json'), JSON.stringify(spacesConfig, null, 2), 'utf8');
    console.log(`✅ [Hermes WebUI] Pre-seeded spaces.json with ${spacesConfig.spaces.length} workspace(s) for user ${userId}`);
  } catch (err) {
    console.error('[Hermes WebUI] Failed to write spaces.json:', err);
  }

  return { activePath, activeName };
}

export const hermesWebUIRoutes: FastifyPluginAsync = async (fastify) => {
  // Launch / Ensure WebUI status
  fastify.get('/launch', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest;
    const { projectId } = request.query as { projectId?: string };
    const db = getDb();

    // Load user settings to get configured webuiPort & password
    const settings = await db.query.hermesSettings.findFirst({
      where: eq(schema.hermesSettings.userId, user.sub),
    });

    const port = settings?.webuiPort ?? 8787;
    const password = settings?.webuiPassword ?? undefined;

    // Restore workspaces from Cellar S3 & pre-seed ~/.hermes/spaces.json
    const { activePath } = await syncUserSpacesAndWorkspaces(user.sub, projectId);

    const result = await startHermesWebUI({ port, password, workspacePath: activePath, userId: user.sub });
    // If process was already running, restart it to pick up fresh credentials & workspace path
    if (result.message === 'Hermes WebUI is actively listening') {
      await restartHermesWebUI({ port, password, workspacePath: activePath, userId: user.sub });
    }

    const targetUrl = `/hermes-ui/?workspace=${encodeURIComponent(activePath)}`;

    return reply.send({
      success: result.ok,
      port: result.port,
      url: targetUrl,
      message: result.message,
    });
  });

  // Status check
  fastify.get('/status', { preHandler: [authMiddleware] }, async () => {
    const port = getHermesWebUIPort();
    const listening = await isPortOpen(port);
    return {
      running: listening || isHermesWebUIRunning(),
      port,
    };
  });
};

/**
 * Proxy HTTP requests from /hermes-ui/* to local Hermes WebUI daemon
 */
export async function createHermesWebUIProxy(
  req: IncomingMessage,
  res: ServerResponse,
  body?: unknown,
): Promise<void> {
  const port = getHermesWebUIPort();

  if (!(await isPortOpen(port))) {
    // Extract userId from JWT cookie or Authorization header so we pick up the correct API key & workspaces
    let userId: string | undefined;
    try {
      const cookieHeader = req.headers.cookie ?? '';
      const cookieToken = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith('access_token='))?.split('=').slice(1).join('=');
      const bearerToken = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      const token = cookieToken || bearerToken;
      if (token) {
        const payload = verifyToken(token);
        userId = payload.sub;
      }
    } catch {
      // Proceed without userId — will use latest DB row or env
    }

    let workspacePath = config.WORKSPACES_ROOT;
    if (userId) {
      const synced = await syncUserSpacesAndWorkspaces(userId);
      workspacePath = synced.activePath;
    }

    console.log(`[Hermes WebUI Proxy] Port ${port} not open yet. Auto-starting WebUI daemon (userId=${userId ?? 'none'}, workspacePath=${workspacePath})...`);
    const startResult = await startHermesWebUI({ port, userId, workspacePath });
    if (!startResult.ok) {
      if (!res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Hermes WebUI service unavailable',
          detail: startResult.message,
        }));
      }
      return;
    }
  }

  const proxy = getWebUIProxy(port);
  const originalUrl = req.url ?? '/';
  req.url = originalUrl.replace(/^\/hermes-ui/, '') || '/';
  req.headers.host = `127.0.0.1:${port}`;
  req.headers.origin = `http://127.0.0.1:${port}`;

  if (body !== undefined && body !== null && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
    const bodyStr = typeof body === 'string' || Buffer.isBuffer(body)
      ? body
      : JSON.stringify(body);
    req.headers['content-length'] = String(Buffer.byteLength(bodyStr));
    const stream = Readable.from([bodyStr]);
    proxy.web(req, res, { buffer: stream });
    return;
  }

  proxy.web(req, res);
}

/**
 * Proxy WebSocket upgrades for /hermes-ui/* via raw TCP tunnel
 */
export function proxyHermesWebUIUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): void {
  const port = getHermesWebUIPort();
  const originalUrl = req.url ?? '/';
  const targetUrl = originalUrl.replace(/^\/hermes-ui/, '') || '/';

  const upstream = net.createConnection({ port, host: '127.0.0.1' });

  socket.on('error', (err: Error) => {
    console.error(`[hermes-webui-ws] browser socket error: ${err.message}`);
    upstream.destroy();
  });

  upstream.on('error', (err: Error) => {
    console.error(`[hermes-webui-ws] upstream error: ${err.message}`);
    socket.destroy();
  });

  upstream.once('connect', () => {
    const rewrittenHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        rewrittenHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }
    rewrittenHeaders['host'] = `127.0.0.1:${port}`;
    rewrittenHeaders['origin'] = `http://127.0.0.1:${port}`;

    let headerStr = `GET ${targetUrl} HTTP/1.1\r\n`;
    for (const [key, value] of Object.entries(rewrittenHeaders)) {
      headerStr += `${key}: ${value}\r\n`;
    }
    headerStr += '\r\n';

    upstream.write(headerStr);

    if (head && head.length > 0) {
      upstream.write(head);
    }

    socket.pipe(upstream);
    upstream.pipe(socket);
  });
}
