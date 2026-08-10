import { FastifyPluginAsync } from 'fastify';
import { getDb } from '../db/index.js';
import { config } from '../config.js';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
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

    // Cellar / S3 check
    try {
      const s3 = getS3();
      await s3.send(new HeadBucketCommand({ Bucket: config.CELLAR_BUCKET }));
      checks.cellar = true;
    } catch (err) {
      checks.cellar = err instanceof Error ? err.message : 'error';
    }

    const allOk = Object.values(checks).every(v => v === true);
    reply.code(allOk ? 200 : 503);
    return { status: allOk ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() };
  });
};
