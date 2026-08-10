import { spawn } from 'child_process';
import { config } from '../config.js';
import { join } from 'path';
import { existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import pRetry from 'p-retry';

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

/** Common filter args to exclude noisy / transient files from sync */
function getCommonFilters(): string[] {
  return [
    '--filter', '- *.log',
    '--filter', '- *.sock',
    '--filter', '- *.pid',
    '--filter', '- node_modules/**',
    '--filter', '+ **',
  ];
}

export interface SyncResult {
  success: boolean;
  error?: string;
  duration: number;
}

/**
 * RESTORE: Download all workspace files from Cellar S3 → local directory.
 * Uses `rclone copy` (remote → local). Does NOT delete local files not in remote.
 * Safe to run on fresh or existing workspace.
 */
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
    ...getCommonFilters(),
    '--transfers', '16',
    '--checkers', '16',
    '-v',
  ];

  console.log(`[rclone] Downloading workspace ${projectId} from Cellar S3...`);
  return rcloneRun(args, `download:${projectId}`);
}

/**
 * BACKUP: Upload local workspace files → Cellar S3.
 * Uses `rclone sync` (local → remote). Deletes remote files not in local.
 * Used for full-backup after clone, and periodic saves.
 */
export async function uploadWorkspaceToCellar(projectId: string): Promise<SyncResult> {
  const localPath = getLocalPath(projectId);
  const remote = getRcloneRemote(projectId);
  if (!existsSync(localPath)) return { success: true, duration: 0 };

  const args = [
    'sync',
    localPath,
    remote,
    '--config', RCLONE_CONF_PATH,
    '--cache-dir', RCLONE_CACHE_DIR,
    ...getCommonFilters(),
    '--transfers', '16',
    '--checkers', '16',
    '-v',
  ];

  console.log(`[rclone] Uploading workspace ${projectId} to Cellar S3...`);
  return rcloneRun(args, `upload:${projectId}`);
}

/**
 * RESTORE WORKSPACE: Called on container boot or when workspace is accessed.
 * Downloads files from Cellar S3 → local. No bisync, no --resync, no data loss.
 */
export async function restoreWorkspace(
  projectId: string,
  _isFirstSync: boolean,
): Promise<SyncResult> {
  const localPath = getLocalPath(projectId);
  mkdirSync(localPath, { recursive: true });
  return downloadWorkspaceFromCellar(projectId);
}

/**
 * SYNC WORKSPACE: Called periodically and on file changes.
 * Uploads local files → Cellar S3 to persist all changes.
 */
export async function syncWorkspace(projectId: string): Promise<SyncResult> {
  const localPath = getLocalPath(projectId);
  if (!existsSync(localPath)) return { success: true, duration: 0 };

  const run = async () => {
    const res = await uploadWorkspaceToCellar(projectId);
    if (!res.success) {
      throw new Error(res.error || 'Sync upload failed');
    }
    return res;
  };

  try {
    return await pRetry(run, { retries: 3, minTimeout: 2000, factor: 2 });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Sync failed', duration: 0 };
  }
}

async function rcloneRun(args: string[], label: string): Promise<SyncResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const proc = spawn('rclone', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    proc.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    proc.on('close', (code) => {
      const duration = Date.now() - start;
      if (code === 0) {
        resolve({ success: true, duration });
      } else {
        console.error(`[rclone:${label}] exit ${code}: ${stderr.slice(-600)}`);
        resolve({ success: false, error: stderr.slice(-500), duration });
      }
    });
    proc.on('error', (err) => {
      resolve({ success: false, error: err.message, duration: Date.now() - start });
    });
  });
}
