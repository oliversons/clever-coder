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

providers:
  custom:
    api_key: "${apiKey}"
    base_url: "${baseUrl}"
  default:
    api_key: "${apiKey}"
    base_url: "${baseUrl}"
  openai:
    api_key: "${apiKey}"
    base_url: "${baseUrl}"
  custom_openai:
    api_key: "${apiKey}"
    base_url: "${baseUrl}"

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
      `LITELLM_LOG=DEBUG`,
    ];
    fs.writeFileSync(path.join(hermesHome, '.env'), envLines.join('\n'), 'utf8');

    // 5. Write ~/.hermes/sitecustomize.py to monkeypatch openai and litellm completion calls in Python
    const sitecustomizeContent = `import os
import sys

def _patch_all():
    base_url = os.environ.get('OPENAI_BASE_URL') or os.environ.get('OPENAI_API_BASE') or os.environ.get('CUSTOM_BASE_URL')
    api_key = os.environ.get('OPENAI_API_KEY') or os.environ.get('CUSTOM_API_KEY') or os.environ.get('DEFAULT_API_KEY')

    # Patch OpenAI Python SDK if imported
    try:
        import openai
        orig_openai_init = openai.OpenAI.__init__
        def patched_openai_init(self, *args, **kwargs):
            if base_url:
                kwargs['base_url'] = base_url
            if api_key:
                kwargs['api_key'] = api_key
            orig_openai_init(self, *args, **kwargs)
        openai.OpenAI.__init__ = patched_openai_init

        orig_async_init = openai.AsyncOpenAI.__init__
        def patched_async_init(self, *args, **kwargs):
            if base_url:
                kwargs['base_url'] = base_url
            if api_key:
                kwargs['api_key'] = api_key
            orig_async_init(self, *args, **kwargs)
        openai.AsyncOpenAI.__init__ = patched_async_init
    except Exception as e:
        pass

    # Patch LiteLLM if imported
    try:
        import litellm
        if os.environ.get('LITELLM_LOG') == 'DEBUG':
            litellm.set_verbose = True

        orig_completion = getattr(litellm, 'completion', None)
        if orig_completion and not getattr(orig_completion, '_is_patched', False):
            def patched_completion(*args, **kwargs):
                model = kwargs.get('model')
                if model and isinstance(model, str) and base_url:
                    if not model.startswith('openai/'):
                        kwargs['model'] = f"openai/{model}"
                if base_url:
                    kwargs['api_base'] = base_url
                    kwargs['base_url'] = base_url
                    kwargs['custom_llm_provider'] = 'openai'
                if api_key:
                    kwargs['api_key'] = api_key
                return orig_completion(*args, **kwargs)
            patched_completion._is_patched = True
            litellm.completion = patched_completion

        orig_acompletion = getattr(litellm, 'acompletion', None)
        if orig_acompletion and not getattr(orig_acompletion, '_is_patched', False):
            async def patched_acompletion(*args, **kwargs):
                model = kwargs.get('model')
                if model and isinstance(model, str) and base_url:
                    if not model.startswith('openai/'):
                        kwargs['model'] = f"openai/{model}"
                if base_url:
                    kwargs['api_base'] = base_url
                    kwargs['base_url'] = base_url
                    kwargs['custom_llm_provider'] = 'openai'
                if api_key:
                    kwargs['api_key'] = api_key
                return await orig_acompletion(*args, **kwargs)
            patched_acompletion._is_patched = True
            litellm.acompletion = patched_acompletion

        print(f"[sitecustomize] Successfully patched openai & litellm with base_url={base_url}", file=sys.stderr)
    except Exception as e:
        print(f"[sitecustomize] Note: {e}", file=sys.stderr)

_patch_all()
`;
    fs.writeFileSync(path.join(hermesHome, 'sitecustomize.py'), sitecustomizeContent, 'utf8');

    console.log(`✅ [Hermes WebUI] Config & sitecustomize.py synced to ${hermesHome} (provider=${provider}, model=${model}, apiKey=${apiKey ? '***' : 'MISSING'})`);
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

  const hermesHome = process.env.HERMES_HOME || path.resolve(process.env.HOME || '/root', '.hermes');

  // Copy sitecustomize.py to scriptDir if scriptDir exists and is writable
  try {
    if (existsSync(scriptDir)) {
      const sitecustomizePath = path.join(hermesHome, 'sitecustomize.py');
      if (existsSync(sitecustomizePath)) {
        fs.copyFileSync(sitecustomizePath, path.join(scriptDir, 'sitecustomize.py'));
      }
    }
  } catch {
    // ignore
  }

  const existingPythonPath = process.env.PYTHONPATH || '';
  const pythonPath = [hermesHome, scriptDir, existingPythonPath].filter(Boolean).join(':');

  const env: Record<string, string> = {
    ...process.env,
    ...buildMultiCoreEnv(totalCores),
    PYTHONPATH: pythonPath,
    LITELLM_LOG: 'DEBUG',
    HERMES_WEBUI_PORT: String(port),
    HERMES_WEBUI_HOST: '127.0.0.1',
    HERMES_HOME: hermesHome,
    HERMES_WORKSPACE: config.workspacePath || process.env.WORKSPACES_ROOT || '/workspaces',
    // Inject decrypted credentials directly into the Python process environment
    DEFAULT_API_KEY: apiKey,
    CUSTOM_API_KEY: apiKey,
    OPENAI_API_KEY: apiKey,
    OPENAI_BASE_URL: baseUrl,
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

  console.log(`[Hermes WebUI] Spawning python process: python3 ${scriptPath} on 127.0.0.1:${port} (provider=${provider}, model=${model}, baseUrl=${baseUrl}, apiKey=${apiKey ? '***' : 'MISSING'})...`);

  try {
    webuiProcess = spawn('python3', [scriptPath, '--no-browser'], {
      env,
      cwd: existsSync(scriptDir) ? scriptDir : process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    webuiProcess.stdout?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        const trimmed = line.trim();
        if (trimmed) console.log(`[Hermes WebUI Out] ${trimmed}`);
      }
    });

    webuiProcess.stderr?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        const trimmed = line.trim();
        if (trimmed) console.error(`[Hermes WebUI Err] ${trimmed}`);
      }
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
