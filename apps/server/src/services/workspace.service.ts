import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { config } from '../config.js';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { createServer } from 'net';

interface WorkspaceEntry {
  projectId: string;
  port: number;
  process: ChildProcess;
  status: 'starting' | 'ready' | 'stopping';
  lastActivity: Date;
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
  throw new Error('No free ports available');
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(port, '127.0.0.1', () => { srv.close(() => resolve(true)); });
    srv.on('error', () => resolve(false));
  });
}

export async function startWorkspace(projectId: string): Promise<number> {
  const existing = registry.get(projectId);
  if (existing && existing.status === 'ready') {
    existing.lastActivity = new Date();
    resetIdleTimer(projectId);
    return existing.port;
  }
  if (existing && existing.status === 'starting') {
    // Wait for it to be ready
    return waitForReady(projectId);
  }

  const port = await getFreePort();
  const workspacePath = join(config.WORKSPACES_ROOT, projectId);
  const userDataDir = join(workspacePath, '.code-server');
  const extensionsDir = join(workspacePath, '.extensions');

  const proc = spawn('code-server', [
    '--bind-addr', `127.0.0.1:${port}`,
    '--auth', 'none',
    '--disable-telemetry',
    '--disable-update-check',
    '--user-data-dir', userDataDir,
    '--extensions-dir', extensionsDir,
    workspacePath,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOME: workspacePath },
  });

  const entry: WorkspaceEntry = {
    projectId, port, process: proc, status: 'starting', lastActivity: new Date(),
  };
  registry.set(projectId, entry);

  proc.stdout?.on('data', (d: Buffer) => process.stdout.write(`[cs:${projectId}] ${d}`));
  proc.stderr?.on('data', (d: Buffer) => process.stderr.write(`[cs:${projectId}] ${d}`));

  proc.on('exit', (code) => {
    console.log(`[workspace] code-server for ${projectId} exited with ${code}`);
    registry.delete(projectId);
    usedPorts.delete(port);
    // Update DB
    getDb().update(schema.projects).set({ codeServerPort: null }).where(
      eq(schema.projects.id, projectId),
    ).catch(() => {});
  });

  // Wait for port to open
  await waitForPort(port, STARTUP_TIMEOUT);
  entry.status = 'ready';

  // Update DB with port
  await getDb().update(schema.projects).set({ codeServerPort: port }).where(
    eq(schema.projects.id, projectId),
  );

  resetIdleTimer(projectId);
  return port;
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

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const free = await isPortFree(port);
    if (!free) return; // port is now occupied (listening)
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`code-server did not start on port ${port} within ${timeoutMs}ms`);
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
