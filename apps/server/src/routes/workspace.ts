import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware.js';
import type { JwtPayload } from '../middleware/auth.middleware.js';
import { getProject } from '../services/github.service.js';
import {
  startWorkspace,
  stopWorkspace,
  touchWorkspace,
  getWorkspacePort,
} from '../services/workspace.service.js';
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';
import type { IncomingMessage, ServerResponse } from 'http';

type AuthRequest = { user: JwtPayload };

// Map of port → proxy middleware instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proxyMap = new Map<number, any>();

function getOrCreateProxy(port: number) {
  if (proxyMap.has(port)) return proxyMap.get(port)!;
  const proxy = createProxyMiddleware({
    target: `http://127.0.0.1:${port}`,
    changeOrigin: true,
    ws: true,
    on: {
      error: (err, _req, res) => {
        const r = res as ServerResponse;
        if (!r.headersSent) {
          r.writeHead(502, { 'Content-Type': 'application/json' });
          r.end(JSON.stringify({ error: 'Workspace proxy error', detail: (err as Error).message }));
        }
      },
    },
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

  // Proxy all /workspace/:id/* to code-server
  // Note: This must be registered at the server level, not via Fastify's normal routing,
  // because it needs to forward both HTTP and WebSocket traffic.
  // This is handled in index.ts by registering a catch-all middleware.
};

// Export proxy factory for use in index.ts
export async function createWorkspaceProxy(
  req: IncomingMessage,
  res: ServerResponse,
  projectId: string,
): Promise<void> {
  let port = getWorkspacePort(projectId);
  if (!port) {
    try {
      port = await startWorkspace(projectId);
    } catch {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Workspace unavailable' }));
      return;
    }
  }
  touchWorkspace(projectId);

  const proxy = getOrCreateProxy(port);
  // Rewrite path: strip /workspace/:id prefix
  const originalUrl = req.url ?? '/';
  req.url = originalUrl.replace(new RegExp(`^/workspace/${projectId}`), '') || '/';

  (proxy as unknown as (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void)(req, res, (err?: unknown) => {
    if (err) {
      res.writeHead(502);
      res.end('Proxy error');
    }
  });
}
