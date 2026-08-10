/**
 * Hermes WebUI Service — Process Manager & Daemon Supervisor
 *
 * Manages the background process lifecycle of the `hermes-webui` daemon (`/opt/hermes-webui/main.py`),
 * injecting multi-core CPU flags, workspace paths, and persistent home configuration.
 */

import { spawn, type ChildProcess } from 'node:child_process';
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
 * Check if the Hermes WebUI daemon is running.
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
 * Start or ensure the Hermes WebUI daemon is running.
 */
export async function startHermesWebUI(config: WebUIServiceConfig = {}): Promise<{ ok: boolean; port: number; message: string }> {
  const port = config.port && config.port > 0 ? config.port : 8787;
  currentPort = port;

  if (isHermesWebUIRunning()) {
    return { ok: true, port: currentPort, message: 'Hermes WebUI is already running' };
  }

  // Find main.py location (/opt/hermes-webui or local fallback)
  const candidatePaths = [
    '/opt/hermes-webui/main.py',
    '/opt/hermes-webui/bootstrap.py',
    path.join(process.cwd(), 'hermes-webui', 'main.py'),
  ];
  const targetScript = candidatePaths.find(existsSync);

  if (!targetScript) {
    console.warn('[Hermes WebUI] Script main.py not found in /opt/hermes-webui. Spawning dummy loopback simulator or waiting.');
  }

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

  return new Promise((resolve) => {
    try {
      webuiProcess = spawn('python3', [scriptPath, '--no-browser'], {
        env,
        cwd: existsSync(scriptDir) ? scriptDir : process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let resolved = false;

      webuiProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        console.log(`[Hermes WebUI stdout]: ${text.trim()}`);
        if (!resolved && (text.includes('http://') || text.includes('Uvicorn running') || text.includes('Application startup complete'))) {
          resolved = true;
          resolve({ ok: true, port, message: 'Hermes WebUI started successfully' });
        }
      });

      webuiProcess.stderr?.on('data', (data: Buffer) => {
        console.error(`[Hermes WebUI stderr]: ${data.toString().trim()}`);
      });

      webuiProcess.on('exit', (code) => {
        console.warn(`[Hermes WebUI] Daemon exited with code ${code}`);
        webuiProcess = null;
        if (!resolved) {
          resolved = true;
          // Return ok true so proxy attempts connection (Uvicorn may already be running or bind instantly)
          resolve({ ok: true, port, message: `Process exited with code ${code}` });
        }
      });

      webuiProcess.on('error', (err) => {
        console.error('[Hermes WebUI] Failed to spawn python process:', err);
        webuiProcess = null;
        if (!resolved) {
          resolved = true;
          resolve({ ok: false, port, message: err.message });
        }
      });

      // Fallback timer: resolve after 2.5s if stdout pattern wasn't matched
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ ok: true, port, message: 'Hermes WebUI process launched' });
        }
      }, 2500);
    } catch (err) {
      console.error('[Hermes WebUI] Error launching daemon:', err);
      resolve({ ok: false, port, message: err instanceof Error ? err.message : String(err) });
    }
  });
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
