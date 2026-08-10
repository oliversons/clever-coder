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
import net from 'net';

type AuthRequest = { user: JwtPayload };

// One http-proxy server per workspace port — used ONLY for HTTP requests, not WebSockets
const proxyMap = new Map<number, httpProxy>();

function getOrCreateProxy(port: number): httpProxy {
  if (proxyMap.has(port)) return proxyMap.get(port)!;
  const proxy = httpProxy.createProxyServer({
    target: `http://127.0.0.1:${port}`,
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
  const originalUrl = req.url ?? '/';
  req.url = originalUrl.replace(new RegExp(`^/workspace/${projectId}`), '') || '/';
  req.headers.host = `127.0.0.1:${port}`;
  req.headers.origin = `http://127.0.0.1:${port}`;
  proxy.web(req, res);
}

/**
 * WebSocket upgrade proxy — raw TCP tunnel to code-server.
 *
 * We do NOT use http-proxy.ws() here because it applies WebSocket frame
 * processing at the proxy layer. code-server also frames its own WebSocket
 * messages, resulting in double-framing → "Invalid frame header" in VSCode
 * workbench. Instead, we open a raw TCP socket to code-server and replay
 * the HTTP upgrade request manually, then pipe bytes bidirectionally with
 * zero frame parsing. This produces a transparent byte-level tunnel.
 */
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

  // Strip /workspace/:id prefix from URL
  const originalUrl = req.url ?? '/';
  const targetUrl = originalUrl.replace(new RegExp(`^/workspace/${projectId}`), '') || '/';

  // Connect raw TCP to code-server — no WebSocket framing at this layer
  const upstream = net.createConnection({ port, host: '127.0.0.1' });

  socket.on('error', (err: Error) => {
    console.error(`[ws-tunnel:${projectId}] browser socket error: ${err.message}`);
    upstream.destroy();
  });

  upstream.on('error', (err: Error) => {
    console.error(`[ws-tunnel:${projectId}] upstream error: ${err.message}`);
    socket.destroy();
  });

  upstream.once('connect', () => {
    // Rebuild the HTTP upgrade request with rewritten Host and Origin headers
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

    // Forward any data already buffered after the HTTP headers
    if (head && head.length > 0) {
      upstream.write(head);
    }

    // Pure byte-level pipe — transparent tunnel, no frame parsing
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
}
