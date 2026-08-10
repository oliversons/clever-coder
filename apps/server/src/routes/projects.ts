import { FastifyPluginAsync } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware.js';
import type { JwtPayload } from '../middleware/auth.middleware.js';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  gitPull,
  getGitStatus,
  listUserGithubRepos,
} from '../services/github.service.js';
import { syncWorkspace } from '../utils/rclone.js';

type AuthRequest = { user: JwtPayload };

export const projectRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authMiddleware);

  // List projects
  fastify.get('/', async (request) => {
    const { user } = request as typeof request & AuthRequest;
    return listProjects(user.sub);
  });

  // List connected GitHub user repos (public + private)
  fastify.get('/github/repos', async (request, reply) => {
    const { user } = request as typeof request & AuthRequest;
    try {
      return await listUserGithubRepos(user.sub);
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : 'Failed to fetch GitHub repos',
      });
    }
  });

  // Get project
  fastify.get('/:id', async (request, reply) => {
    const { user } = request as typeof request & AuthRequest;
    const { id } = request.params as { id: string };
    try {
      return await getProject(id, user.sub);
    } catch {
      return reply.code(404).send({ error: 'Project not found' });
    }
  });

  // Create / Clone project
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'repoUrl'],
        properties: {
          name: { type: 'string' },
          repoUrl: { type: 'string' },
          description: { type: 'string' },
          githubToken: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest;
    const body = request.body as {
      name: string; repoUrl: string; description?: string; githubToken?: string;
    };

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    try {
      const project = await createProject(
        { userId: user.sub, ...body },
        (pct, stage) => {
          reply.raw.write(`data: ${JSON.stringify({ pct, stage })}\n\n`);
        },
      );
      reply.raw.write(`data: ${JSON.stringify({ done: true, project })}\n\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Clone failed';
      reply.raw.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    }
    reply.raw.end();
  });

  // Update project
  fastify.patch('/:id', async (request, reply) => {
    const { user } = request as typeof request & AuthRequest;
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; description?: string };
    try {
      return await updateProject(id, user.sub, body);
    } catch {
      return reply.code(404).send({ error: 'Project not found' });
    }
  });

  // Delete project
  fastify.delete('/:id', async (request, reply) => {
    const { user } = request as typeof request & AuthRequest;
    const { id } = request.params as { id: string };
    try {
      await deleteProject(id, user.sub);
      return { ok: true };
    } catch {
      return reply.code(404).send({ error: 'Project not found' });
    }
  });

  // Git pull
  fastify.post('/:id/pull', async (request, reply) => {
    const { user } = request as typeof request & AuthRequest;
    const { id } = request.params as { id: string };
    try {
      const result = await gitPull(id, user.sub);
      return { summary: result.summary };
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Pull failed' });
    }
  });

  // Manual sync
  fastify.post('/:id/sync', async (request, reply) => {
    const { user } = request as typeof request & AuthRequest;
    const { id } = request.params as { id: string };
    try {
      await getProject(id, user.sub);
      const result = await syncWorkspace(id);
      return result;
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Sync failed' });
    }
  });

  // Git status + sync state
  fastify.get('/:id/status', async (request, reply) => {
    const { user } = request as typeof request & AuthRequest;
    const { id } = request.params as { id: string };
    try {
      return await getGitStatus(id, user.sub);
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error' });
    }
  });
};
