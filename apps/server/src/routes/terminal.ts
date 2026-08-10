import { FastifyPluginAsync } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware.js';
import type { JwtPayload } from '../middleware/auth.middleware.js';
import { getProject } from '../services/github.service.js';
import { createTerminalSession, runCommand } from '../services/terminal.service.js';

type AuthRequest = { user: JwtPayload };

export const terminalRoutes: FastifyPluginAsync = async (fastify) => {
  // WebSocket terminal
  fastify.get('/:id/terminal', {
    websocket: true,
    preHandler: [authMiddleware],
  }, async (socket, request) => {
    const { user } = request as typeof request & AuthRequest;
    const { id } = request.params as { id: string };

    try {
      await getProject(id, user.sub);
      await createTerminalSession(id, socket);
    } catch (err) {
      socket.send(JSON.stringify({
        type: 'error',
        data: err instanceof Error ? err.message : 'Terminal error',
      }));
      socket.close();
    }
  });

  // One-shot command runner
  fastify.post('/:id/command', {
    preHandler: [authMiddleware],
    schema: {
      body: {
        type: 'object',
        required: ['command'],
        properties: {
          command: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest;
    const { id } = request.params as { id: string };
    const { command } = request.body as { command: string };

    try {
      await getProject(id, user.sub);
      const result = await runCommand(id, command);
      return result;
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error' });
    }
  });
};
