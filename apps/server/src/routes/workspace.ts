import { FastifyPluginAsync } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware.js';
import type { JwtPayload } from '../middleware/auth.middleware.js';
import { getProject } from '../services/github.service.js';
import {
  startWorkspace,
  stopWorkspace,
  touchWorkspace,
  getWorkspacePort,
} from '../services/workspace.service.js';
import httpProxy from 'http-proxy';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Duplex } from 'stream';

type AuthRequest = { user: JwtPayload };

// One proxy server per workspace port
const proxyMap = new Map<number, httpProxy>();

function getOrCreateProxy(port: number): httpProxy {
  if (proxyMap.has(port)) return proxyMap.get(port)!;
  const proxy = httpProxy.createProxyServer({
    target: `http://127.0.0.1:${port}`,
    ws: true,
    xfwd: true,
    changeOrigin: true,
    autoRewrite: true,
  });

  proxy.on('error', (err, req, res) => {
    console.error(`[proxy:${port}] error: ${err.message}`);
    if (res && typeof (res as ServerResponse).writeHead === 'function') {
      const r = res as ServerResponse;
      if (!r.headersSent) {
        r.writeHead(502, { 'Content-Type': 'application/json' });
        r.end(JSON.stringify({ error: 'Workspace proxy error', detail: err.message }));
      }
    }
  });

  proxyMap.set(port, proxy);
  return proxy;
}

// Strip /workspace/:id prefix and rewrite Host/Origin to match code-server
function rewriteRequest(req: IncomingMessage, projectId: string, port: number): void {
  const originalUrl = req.url ?? '/';
  req.url = originalUrl.replace(new RegExp(`^/workspace/${projectId}`), '') || '/';
  // Always force Host and Origin to match code-server's local binding.
  // code-server validates Origin against Host to prevent CSRF on WebSocket upgrades.
  req.headers.host = `127.0.0.1:${port}`;
  req.headers.origin = `http://127.0.0.1:${port}`;
}

export const workspaceRoutes: FastifyPluginAsync = async (fastify) => {
  // Open workspace — ensures code-server is running, returns port info
  fastify.get('/:id/open', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest;
    const { id } = request.params as { id: string };

    try {
      await getProject(id, user.sub);
      const port = await startWorkspace(id);
      return { projectId: id, port, url: `/workspace/${id}/` };
    } catch (err) {
      return reply.code(500).send({
        error: err instanceof Error ? err.message : 'Failed to start workspace',
      });
    }
  });

  // Stop workspace
  fastify.post('/:id/stop', { preHandler: [authMiddleware] }, async (request) => {
    const { id } = request.params as { id: string };
    await stopWorkspace(id);
    return { ok: true };
  });
};

// HTTP proxy handler (used with reply.hijack() from Fastify route)
export async function createWorkspaceProxy(
  req: IncomingMessage,
  res: ServerResponse,
  projectId: string,
): Promise<void> {
  let port = getWorkspacePort(projectId);
  if (!port) {
    try {
      port = await startWorkspace(projectId);
    } catch (err) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Workspace unavailable',
        detail: err instanceof Error ? err.message : String(err),
      }));
      return;
    }
  }
  touchWorkspace(projectId);

  const proxy = getOrCreateProxy(port);
  rewriteRequest(req, projectId, port);
  proxy.web(req, res);
}

// WebSocket upgrade proxy handler (used from server.on('upgrade'))
export function proxyWorkspaceUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  projectId: string,
): void {
  const port = getWorkspacePort(projectId);
  if (!port) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  touchWorkspace(projectId);

  const proxy = getOrCreateProxy(port);
  rewriteRequest(req, projectId, port);

  proxy.ws(req, socket, head, {
    target: `http://127.0.0.1:${port}`,
  });
}
