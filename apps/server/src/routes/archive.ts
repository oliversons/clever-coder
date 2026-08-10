import { FastifyPluginAsync } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware.js';
import type { JwtPayload } from '../middleware/auth.middleware.js';
import { getProject } from '../services/github.service.js';
import archiver from 'archiver';
import { createReadStream } from 'fs';
import { join, basename } from 'path';

type AuthRequest = { user: JwtPayload };

export const archiveRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authMiddleware);

  // Stream a zip of the project (excludes .git, .code-server by default)
  fastify.get('/:id/archive', async (request, reply) => {
    const { user } = request as typeof request & AuthRequest;
    const { id } = request.params as { id: string };
    const { include_ide } = request.query as { include_ide?: string };

    try {
      const project = await getProject(id, user.sub);
      const workspacePath = project.workspacePath;
      const filename = `${project.name}-${Date.now()}.zip`;

      reply.raw.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Transfer-Encoding': 'chunked',
      });

      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.pipe(reply.raw);

      const glob = include_ide === 'true' ? '**/*' : '**/*';
      const ignored: string[] = ['.git/**'];
      if (include_ide !== 'true') {
        ignored.push('.code-server/**', '.extensions/**');
      }

      archive.glob(glob, {
        cwd: workspacePath,
        ignore: ignored,
        dot: true,
      });

      await archive.finalize();
    } catch (err) {
      if (!reply.raw.headersSent) {
        reply.code(500).send({ error: err instanceof Error ? err.message : 'Archive failed' });
      }
    }
  });
};
