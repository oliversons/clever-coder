import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { config } from '../config.js';
import { join } from 'path';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import pRetry from 'p-retry';

const execAsync = promisify(exec);

const RCLONE_CONF_PATH = '/app/rclone.conf';
const RCLONE_CACHE_DIR = '/app/rclone-cache';

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
  writeFileSync(RCLONE_CONF_PATH, conf, { mode: 0o600 });
  console.log('[rclone] Config written to', RCLONE_CONF_PATH);
}

function getRcloneRemote(projectId: string): string {
  return `cellar:${config.CELLAR_BUCKET}/ws/${projectId}`;
}

function getLocalPath(projectId: string): string {
  return join(config.WORKSPACES_ROOT, projectId);
}

function getBisyncDir(projectId: string): string {
  return join(RCLONE_CACHE_DIR, 'bisync', projectId);
}

export interface SyncResult {
  success: boolean;
  error?: string;
  duration: number;
}

export async function restoreWorkspace(
  projectId: string,
  isFirstSync: boolean,
): Promise<SyncResult> {
  const localPath = getLocalPath(projectId);
  const remote = getRcloneRemote(projectId);
  const bisyncDir = getBisyncDir(projectId);

  mkdirSync(localPath, { recursive: true });
  mkdirSync(bisyncDir, { recursive: true });

  const args = [
    'bisync',
    remote,
    localPath,
    '--config', RCLONE_CONF_PATH,
    '--cache-dir', RCLONE_CACHE_DIR,
    '--conflict-resolve', 'newer',
    '--max-delete', '50',
    '--transfers', '16',
    '--checkers', '16',
    '--no-traverse',
    '-v',
  ];

  if (isFirstSync) {
    args.push('--resync');
  }

  return rcloneRun(args, `restore:${projectId}`);
}

export async function syncWorkspace(projectId: string): Promise<SyncResult> {
  const localPath = getLocalPath(projectId);
  const remote = getRcloneRemote(projectId);

  // Check workspace exists
  if (!existsSync(localPath)) return { success: true, duration: 0 };

  const args = [
    'bisync',
    localPath,
    remote,
    '--config', RCLONE_CONF_PATH,
    '--cache-dir', RCLONE_CACHE_DIR,
    '--conflict-resolve', 'newer',
    '--max-delete', '50',
    '--transfers', '16',
    '--checkers', '16',
    '--no-traverse',
    '-v',
  ];

  return pRetry(
    () => rcloneRun(args, `sync:${projectId}`),
    { retries: 3, minTimeout: 1000, factor: 2 },
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
