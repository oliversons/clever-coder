/**
 * Hermes WebUI Service — Process Manager & Daemon Supervisor
 *
 * Manages the background process lifecycle of the `hermes-webui` daemon (`/opt/hermes-webui/main.py`),
 * injecting multi-core CPU flags, workspace paths, and persistent home configuration.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import fs, { existsSync } from 'node:fs';
import { getAvailableCpuCores, buildMultiCoreEnv, getHermesSettings, getDecryptedApiKey } from './hermes.service.js';

let webuiProcess: ChildProcess | null = null;
let currentPort = 8787;

export interface WebUIServiceConfig {
  port?: number;
  password?: string;
  workspacePath?: string;
  userId?: string;
}

/**
 * Auto-sync Hermes credentials & configuration to ~/.hermes/ (config.json, webui.json, config.yaml, .env)
 * to mark setup and onboarding as completed, bypassing the First-Run wizard.
 */
export async function syncHermesConfigFiles(userId?: string) {
  const hermesHome = process.env.HERMES_HOME || path.resolve(process.env.HOME || '/root', '.hermes');
  if (!fs.existsSync(hermesHome)) {
    fs.mkdirSync(hermesHome, { recursive: true });
  }

  let apiKey = 'cag_cb210c79b7c941f1bffc176520104ab893aaae2aec9edd5e';
  let baseUrl = 'https://app-fcbf4053-74e6-4498-ac0e-eb160010a3c5.cleverapps.io/v1';
  let model = 'agentrouter/claude-opus-5';
  let provider = 'custom';

  if (userId) {
    try {
      const settings = await getHermesSettings(userId);
      if (settings) {
        apiKey = getDecryptedApiKey(settings) || apiKey;
        if (settings.baseUrl) baseUrl = settings.baseUrl;
        if (settings.model) model = settings.model;
        provider = settings.provider === 'custom_openai' ? 'custom' : settings.provider;
      }
    } catch (err) {
      console.warn('[Hermes WebUI] Could not fetch DB settings for sync, using defaults:', err);
    }
  }

  try {
    // 1. ~/.hermes/config.json
    const configJson = {
      provider,
      model,
      custom_base_url: baseUrl,
      base_url: baseUrl,
      api_key: apiKey,
      default_api_key: apiKey,
      custom_api_key: apiKey,
      openai_api_key: apiKey,
      setup_completed: true,
      onboarding_completed: true,
      default_workspace: '/workspaces',
      custom: { api_key: apiKey, base_url: baseUrl },
      default: { api_key: apiKey, base_url: baseUrl },
      openai: { api_key: apiKey, base_url: baseUrl },
    };
    fs.writeFileSync(path.join(hermesHome, 'config.json'), JSON.stringify(configJson, null, 2), 'utf8');

    // 2. ~/.hermes/webui.json
    const webuiJson = {
      setup_completed: true,
      onboarding_completed: true,
      active_model: model,
      active_provider: provider,
      custom_base_url: baseUrl,
      base_url: baseUrl,
      api_key: apiKey,
      default_api_key: apiKey,
      custom_api_key: apiKey,
      openai_api_key: apiKey,
    };
    fs.writeFileSync(path.join(hermesHome, 'webui.json'), JSON.stringify(webuiJson, null, 2), 'utf8');

    // 3. ~/.hermes/config.yaml
    const yamlContent = `model: "${model}"
provider: "${provider}"
custom_base_url: "${baseUrl}"
base_url: "${baseUrl}"
api_key: "${apiKey}"
default_api_key: "${apiKey}"
custom_api_key: "${apiKey}"
openai_api_key: "${apiKey}"
setup_completed: true
onboarding_completed: true

custom:
  api_key: "${apiKey}"
  base_url: "${baseUrl}"

default:
  api_key: "${apiKey}"
  base_url: "${baseUrl}"

openai:
  api_key: "${apiKey}"
  base_url: "${baseUrl}"
`;
    fs.writeFileSync(path.join(hermesHome, 'config.yaml'), yamlContent, 'utf8');

    // 4. ~/.hermes/.env
    const envLines = [
      `HERMES_MODEL=${model}`,
      `HERMES_PROVIDER=${provider}`,
      `DEFAULT_API_KEY=${apiKey}`,
      `CUSTOM_API_KEY=${apiKey}`,
      `OPENAI_API_KEY=${apiKey}`,
      `OPENAI_BASE_URL=${baseUrl}`,
      `CUSTOM_BASE_URL=${baseUrl}`,
      `DEFAULT_BASE_URL=${baseUrl}`,
      `SETUP_COMPLETED=true`,
      `HERMES_ONBOARDING_COMPLETED=true`,
    ];
    fs.writeFileSync(path.join(hermesHome, '.env'), envLines.join('\n'), 'utf8');

    console.log(`[Hermes WebUI] Fully seeded Hermes configuration in ${hermesHome}`);
  } catch (err) {
    console.error('[Hermes WebUI] Failed to write Hermes config files:', err);
  }
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

  // Sync DB credentials & settings to ~/.hermes/ config files
  await syncHermesConfigFiles(config.userId);

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

  let apiKey = 'cag_cb210c79b7c941f1bffc176520104ab893aaae2aec9edd5e';
  let baseUrl = 'https://app-fcbf4053-74e6-4498-ac0e-eb160010a3c5.cleverapps.io/v1';
  let model = 'agentrouter/claude-opus-5';
  let provider = 'custom';

  if (config.userId) {
    try {
      const settings = await getHermesSettings(config.userId);
      if (settings) {
        apiKey = getDecryptedApiKey(settings) || apiKey;
        if (settings.baseUrl) baseUrl = settings.baseUrl;
        if (settings.model) model = settings.model;
        provider = settings.provider === 'custom_openai' ? 'custom' : (settings.provider || 'custom');
      }
    } catch {
      // fallback
    }
  }

  const env: Record<string, string> = {
    ...process.env,
    ...buildMultiCoreEnv(totalCores),
    HERMES_WEBUI_PORT: String(port),
    HERMES_WEBUI_HOST: '127.0.0.1',
    HERMES_HOME: process.env.HERMES_HOME || path.resolve(process.env.HOME || '/root', '.hermes'),
    HERMES_WORKSPACE: config.workspacePath || process.env.WORKSPACES_ROOT || '/workspaces',
    DEFAULT_API_KEY: apiKey,
    CUSTOM_API_KEY: apiKey,
    OPENAI_API_KEY: apiKey,
    OPENAI_BASE_URL: baseUrl,
    CUSTOM_BASE_URL: baseUrl,
    DEFAULT_BASE_URL: baseUrl,
    HERMES_MODEL: model,
    HERMES_PROVIDER: provider,
    SETUP_COMPLETED: 'true',
    HERMES_ONBOARDING_COMPLETED: 'true',
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

