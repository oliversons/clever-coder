import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { config } from '../config.js';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { createServer } from 'net';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { simpleGit } from 'simple-git';
import { downloadWorkspaceFromCellar, uploadWorkspaceToCellar, restoreWorkspace } from '../utils/rclone.js';
import { getUserGithubToken } from './auth.service.js';
import { normaliseRepoUrl } from './github.service.js';

interface WorkspaceEntry {
  projectId: string;
  port: number;
  process: ChildProcess;
  status: 'starting' | 'ready' | 'stopping';
  lastActivity: Date;
  stderr: string[];
  idleTimer?: ReturnType<typeof setTimeout>;
}

const registry = new Map<string, WorkspaceEntry>();
const STARTUP_TIMEOUT = 30_000; // 30s

// Port pool 3100–3999
const usedPorts = new Set<number>();
async function getFreePort(): Promise<number> {
  for (let p = 3100; p <= 3999; p++) {
    if (usedPorts.has(p)) continue;
    const free = await isPortFree(p);
    if (free) {
      usedPorts.add(p);
      return p;
    }
  }
  throw new Error('No free ports available in range 3100-3999');
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(port, '127.0.0.1', () => { srv.close(() => resolve(true)); });
    srv.on('error', () => resolve(false));
  });
}

function getCodeServerBinary(): string {
  if (existsSync('/usr/bin/code-server')) return '/usr/bin/code-server';
  if (existsSync('/usr/local/bin/code-server')) return '/usr/local/bin/code-server';
  return 'code-server';
}

export function hasProjectFiles(workspacePath: string): boolean {
  if (!existsSync(workspacePath)) return false;
  try {
    const items = readdirSync(workspacePath);
    const validItems = items.filter(
      (i) => i !== '.code-server' && i !== '.extensions' && i !== '.git',
    );
    return validItems.length > 0;
  } catch {
    return false;
  }
}

export async function ensureWorkspaceFiles(projectId: string): Promise<void> {
  const workspacePath = join(config.WORKSPACES_ROOT, projectId);
  mkdirSync(workspacePath, { recursive: true });

  if (hasProjectFiles(workspacePath)) {
    console.log(`[workspace] Project ${projectId} already has local files.`);
    return;
  }

  console.log(`[workspace] Project ${projectId} local workspace is empty. Restoring from Cellar or Git...`);

  // 1. Try restoring from Cellar object storage
  try {
    const restoreRes = await downloadWorkspaceFromCellar(projectId);
    if (restoreRes.success && hasProjectFiles(workspacePath)) {
      console.log(`[workspace] Successfully restored ${projectId} from Cellar S3.`);
      await restoreWorkspace(projectId, true).catch(() => {});
      return;
    }
  } catch (err) {
    console.warn(`[workspace] Cellar restore for ${projectId} failed or empty:`, err);
  }

  // 2. If still empty, fetch project details from DB and re-clone from git
  try {
    const db = getDb();
    const project = await db.query.projects.findFirst({
      where: eq(schema.projects.id, projectId),
    });

    if (project && project.repoUrl) {
      console.log(`[workspace] Re-cloning repository ${project.repoUrl} into ${workspacePath}...`);
      const token = (await getUserGithubToken(project.userId)) ?? undefined;
      const repoUrl = normaliseRepoUrl(project.repoUrl, token);

      const git = simpleGit();
      await git.clone(repoUrl, workspacePath);

      // Upload freshly cloned files to Cellar & initialize bisync
      await uploadWorkspaceToCellar(projectId).catch(() => {});
      await restoreWorkspace(projectId, true).catch(() => {});
      console.log(`[workspace] Successfully re-cloned and initialized workspace ${projectId}.`);
    }
  } catch (err) {
    console.error(`[workspace] Failed to re-clone workspace ${projectId}:`, err);
  }
}

export async function startWorkspace(projectId: string): Promise<number> {
  const existing = registry.get(projectId);
  if (existing && existing.status === 'ready') {
    existing.lastActivity = new Date();
    resetIdleTimer(projectId);
    return existing.port;
  }
  if (existing && existing.status === 'starting') {
    return waitForReady(projectId);
  }

  // Ensure workspace files are present before starting code-server
  await ensureWorkspaceFiles(projectId);

  const port = await getFreePort();
  const workspacePath = join(config.WORKSPACES_ROOT, projectId);
  const userDataDir = join(workspacePath, '.code-server');
  const extensionsDir = join(workspacePath, '.extensions');

  // Pre-create all workspace and code-server configuration directories
  mkdirSync(workspacePath, { recursive: true });
  mkdirSync(userDataDir, { recursive: true });
  mkdirSync(extensionsDir, { recursive: true });

  const bin = getCodeServerBinary();
  console.log(`[workspace] Spawning code-server (${bin}) on port ${port} for ${projectId}...`);

  const env = { ...process.env, HOME: workspacePath, PORT: String(port) };

  const proc = spawn(bin, [
    `--bind-addr=127.0.0.1:${port}`,
    '--auth', 'none',
    '--disable-telemetry',
    '--disable-update-check',
    '--disable-workspace-trust',
    '--user-data-dir', userDataDir,
    '--extensions-dir', extensionsDir,
    workspacePath,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });

  const entry: WorkspaceEntry = {
    projectId,
    port,
    process: proc,
    status: 'starting',
    lastActivity: new Date(),
    stderr: [],
  };
  registry.set(projectId, entry);

  proc.stdout?.on('data', (d: Buffer) => {
    const msg = d.toString();
    process.stdout.write(`[cs:${projectId}] ${msg}`);
  });

  proc.stderr?.on('data', (d: Buffer) => {
    const msg = d.toString();
    process.stderr.write(`[cs:${projectId}:err] ${msg}`);
    entry.stderr.push(msg);
    if (entry.stderr.length > 30) entry.stderr.shift();
  });

  proc.on('exit', (code, signal) => {
    console.log(`[workspace] code-server for ${projectId} exited (code: ${code}, signal: ${signal})`);
    registry.delete(projectId);
    usedPorts.delete(port);
    getDb().update(schema.projects).set({ codeServerPort: null }).where(
      eq(schema.projects.id, projectId),
    ).catch(() => {});
  });

  try {
    // Wait for code-server port to listen and respond
    await waitForPort(port, STARTUP_TIMEOUT, proc, entry);
    entry.status = 'ready';

    // Update DB with active port
    await getDb().update(schema.projects).set({ codeServerPort: port }).where(
      eq(schema.projects.id, projectId),
    );

    resetIdleTimer(projectId);
    console.log(`[workspace] code-server for ${projectId} is READY on port ${port}`);
    return port;
  } catch (err) {
    // Cleanup on failure
    proc.kill('SIGKILL');
    registry.delete(projectId);
    usedPorts.delete(port);
    const lastErr = entry.stderr.join('\n').slice(-400);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${msg}${lastErr ? ` (code-server output: ${lastErr})` : ''}`);
  }
}

export async function stopWorkspace(projectId: string): Promise<void> {
  const entry = registry.get(projectId);
  if (!entry) return;
  entry.status = 'stopping';
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  entry.process.kill('SIGTERM');
  registry.delete(projectId);
  usedPorts.delete(entry.port);
}

export function touchWorkspace(projectId: string): void {
  const entry = registry.get(projectId);
  if (entry) {
    entry.lastActivity = new Date();
    resetIdleTimer(projectId);
  }
}

export function getWorkspacePort(projectId: string): number | null {
  return registry.get(projectId)?.port ?? null;
}

export async function stopAllWorkspaces(): Promise<void> {
  const stops = Array.from(registry.keys()).map(stopWorkspace);
  await Promise.allSettled(stops);
}

function resetIdleTimer(projectId: string): void {
  const entry = registry.get(projectId);
  if (!entry) return;
  if (entry.idleTimer) clearTimeout(entry.idleTimer);
  const idleMs = config.IDLE_IDE_TIMEOUT_MIN * 60 * 1000;
  entry.idleTimer = setTimeout(() => {
    console.log(`[workspace] Idle timeout for ${projectId}`);
    stopWorkspace(projectId);
  }, idleMs);
}

async function waitForPort(
  port: number,
  timeoutMs: number,
  proc: ChildProcess,
  entry: WorkspaceEntry,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (proc.exitCode !== null || proc.killed) {
      const logs = entry.stderr.join('').trim();
      throw new Error(`code-server process exited prematurely with code ${proc.exitCode}: ${logs || 'No log output'}`);
    }

    const free = await isPortFree(port);
    if (!free) {
      const ready = await checkHttpReady(port);
      if (ready) return;
    }

    await new Promise(r => setTimeout(r, 250));
  }
  const logs = entry.stderr.join('').trim();
  throw new Error(`code-server did not start on port ${port} within ${timeoutMs}ms${logs ? ` Details: ${logs}` : ''}`);
}

async function checkHttpReady(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1000) });
    return res.status === 200 || res.status === 302;
  } catch {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
      return res.status < 500;
    } catch {
      return false;
    }
  }
}

async function waitForReady(projectId: string): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < STARTUP_TIMEOUT) {
    const entry = registry.get(projectId);
    if (!entry) throw new Error('Workspace failed to start');
    if (entry.status === 'ready') return entry.port;
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Timeout waiting for workspace');
}
