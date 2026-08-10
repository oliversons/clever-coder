import { FastifyPluginAsync } from 'fastify';
import { getDb } from '../db/index.js';
import { config } from '../config.js';
import { S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { sql } from 'drizzle-orm';

let s3Client: S3Client | null = null;
function getS3(): S3Client {
  if (!s3Client) {
    const host = config.CELLAR_ADDON_HOST.replace(/^https?:\/\//, '');
    s3Client = new S3Client({
      region: config.CELLAR_REGION,
      endpoint: `https://${host}`,
      credentials: {
        accessKeyId: config.CELLAR_ADDON_KEY_ID,
        secretAccessKey: config.CELLAR_ADDON_KEY_SECRET,
      },
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
    });
  }
  return s3Client;
}

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_request, reply) => {
    const checks: Record<string, boolean | string> = {};

    // Database check
    try {
      const db = getDb();
      await db.execute(sql`SELECT 1`);
      checks.database = true;
    } catch (err) {
      checks.database = err instanceof Error ? err.message : 'error';
    }

    // Cellar / S3 check with auto-creation fallback
    try {
      const s3 = getS3();
      try {
        await s3.send(new HeadBucketCommand({ Bucket: config.CELLAR_BUCKET }));
        checks.cellar = true;
      } catch {
        // Auto-create bucket if missing
        await s3.send(new CreateBucketCommand({ Bucket: config.CELLAR_BUCKET }));
        checks.cellar = true;
      }
    } catch (err) {
      checks.cellar = err instanceof Error ? err.message : 'error';
    }

    // Health is OK as long as DB is operational (Cellar is non-blocking degraded mode)
    const dbOk = checks.database === true;
    reply.code(dbOk ? 200 : 503);
    return { status: dbOk ? 'ok' : 'error', checks, timestamp: new Date().toISOString() };
  });
};
