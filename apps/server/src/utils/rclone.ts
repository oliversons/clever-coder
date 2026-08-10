import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { config } from '../config.js';
import { join } from 'path';
import { existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import pRetry from 'p-retry';

const execAsync = promisify(exec);

const RCLONE_CONF_PATH = '/app/rclone.conf';
const RCLONE_CACHE_DIR = '/app/rclone-cache';
const RCLONE_WORKDIR = '/app/rclone-cache/bisync';

export function setupRcloneConfig(): void {
  const host = config.CELLAR_ADDON_HOST.replace(/^https?:\/\//, '');
  const conf = `[cellar]
type = s3
provider = Other
env_auth = false
access_key_id = ${config.CELLAR_ADDON_KEY_ID}
secret_access_key = ${config.CELLAR_ADDON_KEY_SECRET}
endpoint = https://${host}
region = ${config.CELLAR_REGION}
acl = private
force_path_style = ${config.S3_FORCE_PATH_STYLE}
no_check_bucket = false
`;

  mkdirSync(RCLONE_CACHE_DIR, { recursive: true });
  mkdirSync(RCLONE_WORKDIR, { recursive: true });
  writeFileSync(RCLONE_CONF_PATH, conf, { mode: 0o600 });
  console.log('[rclone] Config written to', RCLONE_CONF_PATH);
}

function getRcloneRemote(projectId: string): string {
  return `cellar:${config.CELLAR_BUCKET}/ws/${projectId}`;
}

function getLocalPath(projectId: string): string {
  return join(config.WORKSPACES_ROOT, projectId);
}

function hasPriorListing(projectId: string): boolean {
  if (!existsSync(RCLONE_WORKDIR)) return false;
  try {
    const files = readdirSync(RCLONE_WORKDIR);
    return files.some((f) => f.includes(projectId) && f.endsWith('.lst'));
  } catch {
    return false;
  }
}

function getBaseBisyncArgs(projectId: string): string[] {
  const localPath = getLocalPath(projectId);
  const remote = getRcloneRemote(projectId);
  return [
    'bisync',
    localPath,
    remote,
    '--config', RCLONE_CONF_PATH,
    '--cache-dir', RCLONE_CACHE_DIR,
    '--workdir', RCLONE_WORKDIR,
    '--filter', '- *.log',
    '--filter', '- *.sock',
    '--filter', '- node_modules/**',
    '--conflict-resolve', 'newer',
    '--max-delete', '50',
    '--transfers', '16',
    '--checkers', '16',
    '-v',
  ];
}

export interface SyncResult {
  success: boolean;
  error?: string;
  duration: number;
}

export async function downloadWorkspaceFromCellar(projectId: string): Promise<SyncResult> {
  const localPath = getLocalPath(projectId);
  const remote = getRcloneRemote(projectId);
  mkdirSync(localPath, { recursive: true });

  const args = [
    'copy',
    remote,
    localPath,
    '--config', RCLONE_CONF_PATH,
    '--cache-dir', RCLONE_CACHE_DIR,
    '--filter', '- *.log',
    '--filter', '- *.sock',
    '--transfers', '16',
    '-v',
  ];

  return rcloneRun(args, `download:${projectId}`);
}

export async function uploadWorkspaceToCellar(projectId: string): Promise<SyncResult> {
  const localPath = getLocalPath(projectId);
  const remote = getRcloneRemote(projectId);
  if (!existsSync(localPath)) return { success: true, duration: 0 };

  const args = [
    'copy',
    localPath,
    remote,
    '--config', RCLONE_CONF_PATH,
    '--cache-dir', RCLONE_CACHE_DIR,
    '--filter', '- *.log',
    '--filter', '- *.sock',
    '--filter', '- node_modules/**',
    '--transfers', '16',
    '-v',
  ];

  return rcloneRun(args, `upload:${projectId}`);
}

export async function restoreWorkspace(
  projectId: string,
  isFirstSync: boolean,
): Promise<SyncResult> {
  const localPath = getLocalPath(projectId);
  mkdirSync(localPath, { recursive: true });
  mkdirSync(RCLONE_WORKDIR, { recursive: true });

  // If restoring for the first time or on a fresh boot, first download any existing files from Cellar
  if (isFirstSync) {
    await downloadWorkspaceFromCellar(projectId);
  }

  const args = getBaseBisyncArgs(projectId);

  // If first sync or if this container has no prior listing in workdir, pass --resync
  if (isFirstSync || !hasPriorListing(projectId)) {
    args.push('--resync');
  }

  const result = await rcloneRun(args, `restore:${projectId}`);

  // Auto-recover if bisync requires --resync due to missing listings
  if (!result.success && shouldResync(result.error)) {
    console.warn(`[rclone:restore:${projectId}] Bisync requires --resync. Retrying with --resync...`);
    return rcloneRun([...getBaseBisyncArgs(projectId), '--resync'], `restore:${projectId}:resync`);
  }

  return result;
}

export async function syncWorkspace(projectId: string): Promise<SyncResult> {
  const localPath = getLocalPath(projectId);
  if (!existsSync(localPath)) return { success: true, duration: 0 };
  mkdirSync(RCLONE_WORKDIR, { recursive: true });

  const args = getBaseBisyncArgs(projectId);

  // If no prior listing exists in this container, pass --resync directly
  if (!hasPriorListing(projectId)) {
    args.push('--resync');
  }

  const runWithResyncFallback = async () => {
    const res = await rcloneRun(args, `sync:${projectId}`);
    if (!res.success && shouldResync(res.error)) {
      console.warn(`[rclone:sync:${projectId}] Bisync requires --resync. Retrying with --resync...`);
      return rcloneRun([...getBaseBisyncArgs(projectId), '--resync'], `sync:${projectId}:resync`);
    }
    if (!res.success) {
      throw new Error(res.error || 'Sync failed');
    }
    return res;
  };

  try {
    return await pRetry(runWithResyncFallback, { retries: 2, minTimeout: 1000, factor: 2 });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Sync failed', duration: 0 };
  }
}

function shouldResync(error?: string): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return (
    lower.includes('bisync aborted') ||
    lower.includes('cannot find prior') ||
    lower.includes('must run --resync') ||
    lower.includes('critical error')
  );
}

async function rcloneRun(args: string[], label: string): Promise<SyncResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const proc = spawn('rclone', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    proc.on('close', (code) => {
      const duration = Date.now() - start;
      if (code === 0) {
        resolve({ success: true, duration });
      } else {
        console.error(`[rclone:${label}] exit ${code}: ${stderr}`);
        resolve({ success: false, error: stderr.slice(-500), duration });
      }
    });
    proc.on('error', (err) => {
      resolve({ success: false, error: err.message, duration: Date.now() - start });
    });
  });
}
