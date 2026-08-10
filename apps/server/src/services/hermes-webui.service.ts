/**
 * Hermes WebUI Service — Process Manager & Daemon Supervisor
 *
 * Manages the background process lifecycle of the `hermes-webui` daemon (`/opt/hermes-webui/main.py`),
 * injecting multi-core CPU flags, workspace paths, and persistent home configuration.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { getAvailableCpuCores, buildMultiCoreEnv } from './hermes.service.js';

let webuiProcess: ChildProcess | null = null;
let currentPort = 8787;

export interface WebUIServiceConfig {
  port?: number;
  password?: string;
  workspacePath?: string;
}

/**
 * Checks if a TCP port is open and accepting connections
 */
export function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/**
 * Polls a port until it opens or times out
 */
export async function waitForPort(port: number, timeoutMs = 15000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const open = await isPortOpen(port);
    if (open) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/**
 * Check if the Hermes WebUI process reference is active.
 */
export function isHermesWebUIRunning(): boolean {
  return webuiProcess !== null && !webuiProcess.killed && webuiProcess.exitCode === null;
}

/**
 * Get active WebUI port.
 */
export function getHermesWebUIPort(): number {
  return currentPort;
}

/**
 * Start or ensure the Hermes WebUI daemon is running and accepting connections.
 */
export async function startHermesWebUI(config: WebUIServiceConfig = {}): Promise<{ ok: boolean; port: number; message: string }> {
  const port = config.port && config.port > 0 ? config.port : 8787;
  currentPort = port;

  // 1. If port is already accepting TCP connections, return immediately
  if (await isPortOpen(port)) {
    return { ok: true, port, message: 'Hermes WebUI is actively listening' };
  }

  // 2. Kill stale process reference if dead
  if (webuiProcess && webuiProcess.killed) {
    webuiProcess = null;
  }

  // Find main.py location (/opt/hermes-webui or local fallback)
  const candidatePaths = [
    '/opt/hermes-webui/main.py',
    '/opt/hermes-webui/bootstrap.py',
    path.join(process.cwd(), 'hermes-webui', 'main.py'),
  ];
  const targetScript = candidatePaths.find(existsSync);

  const scriptPath = targetScript ?? '/opt/hermes-webui/main.py';
  const scriptDir = path.dirname(scriptPath);
  const totalCores = getAvailableCpuCores();

  const env: Record<string, string> = {
    ...process.env,
    ...buildMultiCoreEnv(totalCores),
    HERMES_WEBUI_PORT: String(port),
    HERMES_WEBUI_HOST: '127.0.0.1',
    HERMES_HOME: process.env.HERMES_HOME || path.resolve(process.env.HOME || '/root', '.hermes'),
    HERMES_WORKSPACE: config.workspacePath || process.env.WORKSPACES_ROOT || '/workspaces',
  };

  if (config.password) {
    env.HERMES_WEBUI_PASSWORD = config.password;
  }

  console.log(`[Hermes WebUI] Spawning python process: python3 ${scriptPath} on 127.0.0.1:${port}...`);

  try {
    webuiProcess = spawn('python3', [scriptPath, '--no-browser'], {
      env,
      cwd: existsSync(scriptDir) ? scriptDir : process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    webuiProcess.stdout?.on('data', (chunk: Buffer) => {
      console.log(`[Hermes WebUI Out]: ${chunk.toString().trim()}`);
    });

    webuiProcess.stderr?.on('data', (chunk: Buffer) => {
      console.error(`[Hermes WebUI Err]: ${chunk.toString().trim()}`);
    });

    webuiProcess.on('error', (err) => {
      console.error('[Hermes WebUI Spawn Error]:', err);
      webuiProcess = null;
    });

    webuiProcess.on('exit', (code) => {
      console.warn(`[Hermes WebUI Exited] Code: ${code}`);
      webuiProcess = null;
    });

    // 3. Poll TCP port 8787 until accepting connections
    const ready = await waitForPort(port, 15000);
    if (ready) {
      console.log(`✅ [Hermes WebUI] Ready and accepting connections on port ${port}`);
      return { ok: true, port, message: 'Hermes WebUI started and listening' };
    } else {
      console.error(`❌ [Hermes WebUI] Timed out waiting for port ${port}`);
      return { ok: false, port, message: `Timed out waiting for port ${port}` };
    }
  } catch (err) {
    console.error('Failed to start Hermes WebUI process:', err);
    return { ok: false, port, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Stop Hermes WebUI daemon.
 */
export function stopHermesWebUI(): void {
  if (webuiProcess) {
    webuiProcess.kill('SIGTERM');
    webuiProcess = null;
  }
}

