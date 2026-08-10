import { FastifyPluginAsync } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware.js';
import type { JwtPayload } from '../middleware/auth.middleware.js';
import { getProject } from '../services/github.service.js';
import { spawn } from 'child_process';
import { join } from 'path';
import { config } from '../config.js';
import { readdirSync, existsSync } from 'fs';

type AuthRequest = { user: JwtPayload };

async function codeServerExtCmd(
  projectId: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const workspacePath = join(config.WORKSPACES_ROOT, projectId);
  const extensionsDir = join(workspacePath, '.extensions');
  const userDataDir = join(workspacePath, '.code-server');

  return new Promise((resolve) => {
    const proc = spawn('code-server', [
      ...args,
      '--extensions-dir', extensionsDir,
      '--user-data-dir', userDataDir,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '', stderr = '';
    proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    proc.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? -1 }));
  });
}

export const extensionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authMiddleware);

  // List installed extensions
  fastify.get('/:id/extensions', async (request, reply) => {
    const { user } = request as typeof request & AuthRequest;
    const { id } = request.params as { id: string };

    try {
      const project = await getProject(id, user.sub);
      const extDir = join(project.workspacePath, '.extensions');

      if (!existsSync(extDir)) return [];

      const extensions = readdirSync(extDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => ({ id: e.name, path: join(extDir, e.name) }));

      return extensions;
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error' });
    }
  });

  // Install extension by marketplace ID
  fastify.post('/:id/extensions', {
    schema: {
      body: {
        type: 'object',
        required: ['extensionId'],
        properties: {
          extensionId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest;
    const { id } = request.params as { id: string };
    const { extensionId } = request.body as { extensionId: string };

    try {
      await getProject(id, user.sub);
      const result = await codeServerExtCmd(id, ['--install-extension', extensionId]);
      if (result.exitCode !== 0) {
        return reply.code(500).send({ error: result.stderr || 'Install failed' });
      }
      return { ok: true, stdout: result.stdout };
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error' });
    }
  });

  // Uninstall extension
  fastify.delete('/:id/extensions/:extId', async (request, reply) => {
    const { user } = request as typeof request & AuthRequest;
    const { id, extId } = request.params as { id: string; extId: string };

    try {
      await getProject(id, user.sub);
      const result = await codeServerExtCmd(id, ['--uninstall-extension', extId]);
      if (result.exitCode !== 0) {
        return reply.code(500).send({ error: result.stderr || 'Uninstall failed' });
      }
      return { ok: true };
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error' });
    }
  });
};
