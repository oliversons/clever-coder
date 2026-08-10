/**
 * S3 Service — Hermes AI Agent artifact & trajectory storage
 *
 * Reuses the existing CELLAR_* S3 credentials (MinIO / Clever Cloud Cellar).
 * All Hermes objects are stored under the `hermes/` prefix in the same bucket.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createGzip } from 'zlib';
import { Readable } from 'stream';
import { config } from '../config.js';

// ── S3 Client ──────────────────────────────────────────────────────────────────

function buildS3Client(): S3Client {
  const endpoint = `http${config.S3_FORCE_PATH_STYLE ? '' : 's'}://${config.CELLAR_ADDON_HOST}`;
  return new S3Client({
    region: config.CELLAR_REGION,
    endpoint,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: config.CELLAR_ADDON_KEY_ID,
      secretAccessKey: config.CELLAR_ADDON_KEY_SECRET,
    },
  });
}

let _client: S3Client | null = null;
function getClient(): S3Client {
  if (!_client) _client = buildS3Client();
  return _client;
}

const BUCKET = config.CELLAR_BUCKET;
const PREFIX = config.HERMES_S3_PREFIX;
const THRESHOLD = config.HERMES_S3_THRESHOLD_BYTES;

// ── Key Helpers ────────────────────────────────────────────────────────────────

export function artifactKey(userId: string, messageId: string, filename: string): string {
  return `${PREFIX}/artifacts/${userId}/${messageId}/${filename}`;
}

export function trajectoryKey(userId: string, sessionId: string): string {
  return `${PREFIX}/trajectories/${userId}/${sessionId}.json.gz`;
}

export function snapshotKey(userId: string, backupId: string): string {
  return `${PREFIX}/snapshots/${userId}/${backupId}.zip`;
}

// ── Upload Helpers ─────────────────────────────────────────────────────────────

/**
 * Upload raw bytes / text to S3. Returns the S3 object key.
 */
export async function uploadArtifact(
  key: string,
  data: Buffer | string,
  contentType = 'text/plain',
): Promise<string> {
  const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
    }),
  );
  return key;
}

/**
 * Gzip-compress a JS object and upload as a trajectory JSON.
 */
export async function uploadTrajectory(
  userId: string,
  sessionId: string,
  messages: unknown[],
): Promise<string> {
  const key = trajectoryKey(userId, sessionId);
  const json = JSON.stringify({ userId, sessionId, messages, exportedAt: new Date().toISOString() });

  const compressed = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gz = createGzip();
    gz.on('data', (chunk: Buffer) => chunks.push(chunk));
    gz.on('end', () => resolve(Buffer.concat(chunks)));
    gz.on('error', reject);
    gz.end(Buffer.from(json, 'utf-8'));
  });

  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: compressed,
      ContentType: 'application/gzip',
      ContentLength: compressed.byteLength,
    }),
  );
  return key;
}

/**
 * Generate a pre-signed read URL valid for 1 hour.
 */
export async function getPresignedReadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: 3600 });
}

/**
 * Auto-offload: if payload > threshold → upload and return S3 key; otherwise return null.
 */
export async function autoOffload(
  key: string,
  content: string,
  contentType = 'text/plain',
): Promise<string | null> {
  const bytes = Buffer.byteLength(content, 'utf-8');
  if (bytes <= THRESHOLD) return null;
  return uploadArtifact(key, content, contentType);
}

/**
 * Read an S3 object and return its content as a string.
 */
export async function readArtifact(key: string): Promise<string> {
  const response = await getClient().send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  );
  const body = response.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Check whether an S3 object exists.
 */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}
