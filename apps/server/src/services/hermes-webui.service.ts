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
import { desc } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { getAvailableCpuCores, buildMultiCoreEnv, getHermesSettings, getDecryptedApiKey } from './hermes.service.js';

let webuiProcess: ChildProcess | null = null;
let currentPort = 8787;

export interface WebUIServiceConfig {
  port?: number;
  password?: string;
  workspacePath?: string;
  userId?: string;
}

interface ResolvedCredentials {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
}

/**
 * Resolves credentials from DB by userId, falling back to the most recently updated
 * settings row if no userId is provided, then to environment variables.
 */
async function resolveCredentials(userId?: string): Promise<ResolvedCredentials> {
  // Start with env fallbacks
  let apiKey = process.env.OPENAI_API_KEY || process.env.DEFAULT_API_KEY || '';
  let baseUrl = process.env.OPENAI_BASE_URL || process.env.DEFAULT_BASE_URL || '';
  let model = process.env.HERMES_MODEL || 'nousresearch/hermes-3-llama-3.1-405b';
  let provider = process.env.HERMES_PROVIDER || 'custom';

  try {
    let settings: Awaited<ReturnType<typeof getHermesSettings>> | undefined;

    if (userId) {
      settings = await getHermesSettings(userId);
    }

    // Fallback: load the most recently updated settings row from DB
    if (!settings) {
      const db = getDb();
      const rows = await db
        .select()
        .from(schema.hermesSettings)
        .orderBy(desc(schema.hermesSettings.updatedAt))
        .limit(1);
      settings = rows[0];
    }

    if (settings) {
      const decryptedKey = getDecryptedApiKey(settings);
      if (decryptedKey?.trim()) apiKey = decryptedKey.trim();
      if (settings.baseUrl?.trim()) baseUrl = settings.baseUrl.trim();
      if (settings.model?.trim()) model = settings.model.trim();
      if (settings.provider?.trim()) {
        const p = settings.provider.trim();
        provider = p === 'custom_openai' ? 'custom' : p;
      }
    }
  } catch (err) {
    console.warn('[Hermes WebUI] Could not load credentials from DB, using env fallbacks:', err);
  }

  // ── LiteLLM routing fix ──────────────────────────────────────────────────
  // When using a custom OpenAI-compatible endpoint (e.g. agentrouter), litellm
  // interprets provider-prefixed model IDs (e.g. "agentrouter/claude-opus-5")
  // as a route to that external provider's servers, ignoring the custom base URL.
  // Prefixing with "openai/" forces litellm to treat it as an OpenAI-compatible
  // request and route to OPENAI_BASE_URL instead.
  const isCustomProvider = provider === 'custom' || provider === 'custom_openai';
  if (isCustomProvider && model && !model.startsWith('openai/')) {
    model = `openai/${model}`;
  }

  return { apiKey, baseUrl, model, provider };
}

/**
 * Auto-sync Hermes credentials & configuration to ~/.hermes/ (config.json, webui.json, config.yaml, .env).
 * Writes setup_completed: true so the WebUI bypasses the onboarding wizard and goes straight to chat.
 */
export async function syncHermesConfigFiles(userId?: string): Promise<ResolvedCredentials> {
  const hermesHome = process.env.HERMES_HOME || path.resolve(process.env.HOME || '/root', '.hermes');
  if (!fs.existsSync(hermesHome)) {
    fs.mkdirSync(hermesHome, { recursive: true });
  }

  const creds = await resolveCredentials(userId);
  const { apiKey, baseUrl, model, provider } = creds;

  try {
    // 1. ~/.hermes/config.json
    const configJson = {
      provider,
      model: {
        provider,
        default: model,
        base_url: baseUrl,
        custom_base_url: baseUrl,
      },
      model_name: model,
      custom_base_url: baseUrl,
      base_url: baseUrl,
      api_key: apiKey,
      default_api_key: apiKey,
      custom_api_key: apiKey,
      openai_api_key: apiKey,
      // Mark setup as completed so the wizard is NOT shown
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
    const yamlContent = `model:
  provider: "${provider}"
  default: "${model}"
  base_url: "${baseUrl}"
  custom_base_url: "${baseUrl}"

provider: "${provider}"
api_key: "${apiKey}"
default_api_key: "${apiKey}"
custom_api_key: "${apiKey}"
openai_api_key: "${apiKey}"
base_url: "${baseUrl}"
custom_base_url: "${baseUrl}"
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
      `OPENAI_API_BASE=${baseUrl}`,
      `HERMES_BASE_URL=${baseUrl}`,
      `HERMES_CUSTOM_BASE_URL=${baseUrl}`,
      `CUSTOM_BASE_URL=${baseUrl}`,
      `DEFAULT_BASE_URL=${baseUrl}`,
      `SETUP_COMPLETED=true`,
      `HERMES_ONBOARDING_COMPLETED=true`,
    ];
    fs.writeFileSync(path.join(hermesHome, '.env'), envLines.join('\n'), 'utf8');

    console.log(`✅ [Hermes WebUI] Config synced to ${hermesHome} (provider=${provider}, model=${model}, apiKey=${apiKey ? '***' : 'MISSING'})`);
  } catch (err) {
    console.error('[Hermes WebUI] Failed to write Hermes config files:', err);
  }

  return creds;
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
 * Stop Hermes WebUI daemon.
 */
export function stopHermesWebUI(): void {
  if (webuiProcess) {
    try {
      webuiProcess.kill('SIGTERM');
    } catch {
      // ignore
    }
    webuiProcess = null;
  }
}

/**
 * Start or ensure the Hermes WebUI daemon is running and accepting connections.
 * Always syncs the latest decrypted API key from DB before spawning.
 */
export async function startHermesWebUI(config: WebUIServiceConfig = {}): Promise<{ ok: boolean; port: number; message: string }> {
  const port = config.port && config.port > 0 ? config.port : 8787;
  currentPort = port;

  // Always sync the latest credentials from DB → disk config files
  const creds = await syncHermesConfigFiles(config.userId);

  // If already running on port, return immediately (no restart needed)
  if (await isPortOpen(port)) {
    return { ok: true, port, message: 'Hermes WebUI is actively listening' };
  }

  // Kill stale process reference if dead
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

  const { apiKey, baseUrl, model, provider } = creds;

  const env: Record<string, string> = {
    ...process.env,
    ...buildMultiCoreEnv(totalCores),
    HERMES_WEBUI_PORT: String(port),
    HERMES_WEBUI_HOST: '127.0.0.1',
    HERMES_HOME: process.env.HERMES_HOME || path.resolve(process.env.HOME || '/root', '.hermes'),
    HERMES_WORKSPACE: config.workspacePath || process.env.WORKSPACES_ROOT || '/workspaces',
    // Inject decrypted credentials directly into the Python process environment
    DEFAULT_API_KEY: apiKey,
    CUSTOM_API_KEY: apiKey,
    OPENAI_API_KEY: apiKey,
    OPENAI_BASE_URL: baseUrl,
    // litellm also checks OPENAI_API_BASE as an alternative env key
    OPENAI_API_BASE: baseUrl,
    HERMES_BASE_URL: baseUrl,
    HERMES_CUSTOM_BASE_URL: baseUrl,
    CUSTOM_BASE_URL: baseUrl,
    DEFAULT_BASE_URL: baseUrl,
    HERMES_MODEL: model,
    HERMES_PROVIDER: provider,
    // Mark setup as completed — wizard should not appear
    SETUP_COMPLETED: 'true',
    HERMES_ONBOARDING_COMPLETED: 'true',
  };

  if (config.password) {
    env.HERMES_WEBUI_PASSWORD = config.password;
  }

  console.log(`[Hermes WebUI] Spawning python process: python3 ${scriptPath} on 127.0.0.1:${port} (provider=${provider}, model=${model}, apiKey=${apiKey ? '***' : 'MISSING'})...`);

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

    // Poll TCP port until accepting connections
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
 * Restart Hermes WebUI daemon with fresh credentials from DB.
 * Used when user saves updated settings in the CleverCoder settings page.
 */
export async function restartHermesWebUI(config: WebUIServiceConfig = {}): Promise<{ ok: boolean; port: number; message: string }> {
  console.log('[Hermes WebUI] Restarting daemon with refreshed credentials...');
  stopHermesWebUI();
  // Brief delay so the port is released
  await new Promise((r) => setTimeout(r, 500));
  return startHermesWebUI(config);
}
