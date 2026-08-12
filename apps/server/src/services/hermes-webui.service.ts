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
import { getHermesBrowserSettings, syncBrowserConfigToYamlAndEnv, DEFAULT_BROWSER_SETTINGS } from './hermes-browser.service.js';
import { getHermesVisionImageSettings, syncVisionImageConfigToYamlAndEnv } from './hermes-vision-image.service.js';
import { getMessagingSettings, syncMessagingConfigToFiles } from './hermes-messaging.service.js';

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

    // Fallback to Vision/ImageGen settings if primary apiKey or baseUrl is empty
    if (!apiKey || !baseUrl) {
      try {
        const visionSettings = await getHermesVisionImageSettings(userId);
        if (!apiKey) {
          apiKey = visionSettings.satApiKey || visionSettings.visionApiKey || visionSettings.imageGenApiKey || apiKey;
        }
        if (!baseUrl) {
          baseUrl = visionSettings.visionBaseUrl || visionSettings.imageGenBaseUrl || baseUrl;
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[Hermes WebUI] Could not load credentials from DB, using env fallbacks:', err);
  }

  // Final fallback for gateway
  if (!baseUrl && apiKey) {
    baseUrl = 'https://app-fcbf4053-74e6-4498-ac0e-eb160010a3c5.cleverapps.io/v1';
  }
  return { apiKey, baseUrl, model, provider };
}

/**
 * Auto-sync Hermes credentials & configuration to ~/.hermes/ (config.json, webui.json, config.yaml, .env).
 * Writes setup_completed: true so the WebUI bypasses the onboarding wizard and goes straight to chat.
 */
export async function syncHermesConfigFiles(userId?: string, activeWorkspacePath?: string): Promise<ResolvedCredentials> {
  const hermesHome = process.env.HERMES_HOME || path.resolve(process.env.HOME || '/root', '.hermes');
  if (!fs.existsSync(hermesHome)) {
    fs.mkdirSync(hermesHome, { recursive: true });
  }

  const creds = await resolveCredentials(userId);
  const { apiKey, baseUrl, model, provider } = creds;
  const targetWorkspace = activeWorkspacePath || '/workspaces';

  try {
    // Collect all project directories under /workspaces
    const allowedWorkspaces = ['/workspaces', targetWorkspace];
    try {
      if (fs.existsSync('/workspaces')) {
        const entries = fs.readdirSync('/workspaces');
        for (const e of entries) {
          allowedWorkspaces.push(path.join('/workspaces', e));
        }
      }
    } catch {
      // ignore
    }

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
      active_workspace: targetWorkspace,
      workspace: targetWorkspace,
      workspace_path: targetWorkspace,
      allowed_workspaces: allowedWorkspaces,
      workspaces: allowedWorkspaces,
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
      default_workspace: '/workspaces',
      active_workspace: targetWorkspace,
      workspace: targetWorkspace,
      workspace_path: targetWorkspace,
      allowed_workspaces: allowedWorkspaces,
      workspaces: allowedWorkspaces,
    };

    // 3. YAML and ENV contents
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

platform_toolsets:
  cli:
    - browser
    - web
    - terminal
    - file
    - code_execution
    - clarify
    - cronjob
    - delegation
    - image_gen
    - memory
    - session_search
    - skills
    - todo
    - webhook
    - mcp
    - send_message
  webui:
    - browser
    - web
    - terminal
    - file
    - code_execution
    - clarify
    - cronjob
    - delegation
    - image_gen
    - memory
    - session_search
    - skills
    - todo
    - webhook
    - mcp
    - send_message

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
      `DISABLE_NOUS_AUTH=true`,
      `NOUS_API_KEY=`,
    ];

    const targetDirs = [
      hermesHome,
      path.join(hermesHome, 'webui_state'),
      path.join(hermesHome, 'webui'),
      path.join(hermesHome, 'profiles', 'default'),
    ];

    for (const dir of targetDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path.join(dir, 'last_workspace.txt'), targetWorkspace, 'utf8');
      fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(configJson, null, 2), 'utf8');
      fs.writeFileSync(path.join(dir, 'webui.json'), JSON.stringify(webuiJson, null, 2), 'utf8');
      fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(configJson, null, 2), 'utf8');
      fs.writeFileSync(path.join(dir, 'config.yaml'), yamlContent, 'utf8');
      fs.writeFileSync(path.join(dir, '.env'), envLines.join('\n'), 'utf8');
    }

    // 5. Write ~/.hermes/sitecustomize.py to monkeypatch openai, httpx, requests, and litellm calls in Python
    const sitecustomizeContent = `import os
import sys

# Auto-load ~/.hermes/.env into os.environ if present
def _load_hermes_env():
    env_path = os.path.expanduser('~/.hermes/.env')
    if os.path.exists(env_path):
        try:
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    k, v = line.split('=', 1)
                    k, v = k.strip(), v.strip()
                    if k and k not in os.environ:
                        os.environ[k] = v
        except Exception:
            pass
_load_hermes_env()

# Ensure pip does not fail with externally-managed-environment in Debian/Ubuntu
os.environ.setdefault('PIP_BREAK_SYSTEM_PACKAGES', '1')
os.environ.setdefault('PIP_ROOT_USER_ACTION', 'ignore')
os.environ.setdefault('WEB_SEARCH_PROVIDER', 'duckduckgo')
os.environ.setdefault('SEARCH_PROVIDER', 'duckduckgo')
os.environ.setdefault('WEB_EXTRACT_PROVIDER', 'browser')
os.environ.setdefault('SEARCH_FALLBACK', 'browser')
os.environ.setdefault('IMAGE_GEN_ENABLED', 'true')
os.environ.setdefault('IMAGE_GENERATION_ENABLED', 'true')

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

def _patch_all():
    base_url = os.environ.get('OPENAI_BASE_URL') or os.environ.get('OPENAI_API_BASE') or os.environ.get('CUSTOM_BASE_URL') or os.environ.get('SAT_BASE_URL') or 'https://app-fcbf4053-74e6-4498-ac0e-eb160010a3c5.cleverapps.io/v1'
    api_key = os.environ.get('OPENAI_API_KEY') or os.environ.get('CUSTOM_API_KEY') or os.environ.get('DEFAULT_API_KEY') or os.environ.get('SAT_API_KEY') or os.environ.get('IMAGE_GEN_API_KEY')

    # Patch httpx to override default User-Agent for all HTTP clients (used by openai Python SDK)
    try:
        import httpx
        orig_client_init = httpx.Client.__init__
        def patched_client_init(self, *args, **kwargs):
            headers = kwargs.get('headers') or {}
            if isinstance(headers, dict):
                headers = dict(headers)
            headers['User-Agent'] = USER_AGENT
            kwargs['headers'] = headers
            orig_client_init(self, *args, **kwargs)
        httpx.Client.__init__ = patched_client_init

        orig_async_client_init = httpx.AsyncClient.__init__
        def patched_async_client_init(self, *args, **kwargs):
            headers = kwargs.get('headers') or {}
            if isinstance(headers, dict):
                headers = dict(headers)
            headers['User-Agent'] = USER_AGENT
            kwargs['headers'] = headers
            orig_async_client_init(self, *args, **kwargs)
        httpx.AsyncClient.__init__ = patched_async_client_init
    except Exception:
        pass

    # Patch requests if imported
    try:
        import requests
        requests.utils.default_user_agent = lambda: USER_AGENT
    except Exception:
        pass

    # Clean unsupported parameters and map vision models
    def _clean_llm_kwargs(kwargs):
        kwargs.pop('reasoning', None)
        extra_body = kwargs.get('extra_body')
        if isinstance(extra_body, dict):
            extra_body.pop('reasoning', None)
        model = kwargs.get('model')
        if model in ('gemini/gemini-3.5-flash-lite', 'gemini-3.5-flash-lite', 'sat-vision-v1', 'infron:google/gemini-3.1-flash-lite-preview', 'google/gemini-2.0-flash', None, ''):
            kwargs['model'] = os.environ.get('VISION_MODEL') or '@cf/meta/llama-3.2-11b-vision-instruct'
        return kwargs

    # Patch OpenAI Python SDK if imported
    try:
        import openai
        orig_openai_init = openai.OpenAI.__init__
        def patched_openai_init(self, *args, **kwargs):
            if base_url and (not kwargs.get('base_url') or kwargs.get('base_url') == ''):
                kwargs['base_url'] = base_url
            if api_key and (not kwargs.get('api_key') or kwargs.get('api_key') == ''):
                kwargs['api_key'] = api_key
            dh = kwargs.get('default_headers') or {}
            dh = dict(dh)
            dh['User-Agent'] = USER_AGENT
            kwargs['default_headers'] = dh
            orig_openai_init(self, *args, **kwargs)
        openai.OpenAI.__init__ = patched_openai_init

        orig_async_init = openai.AsyncOpenAI.__init__
        def patched_async_init(self, *args, **kwargs):
            if base_url and (not kwargs.get('base_url') or kwargs.get('base_url') == ''):
                kwargs['base_url'] = base_url
            if api_key and (not kwargs.get('api_key') or kwargs.get('api_key') == ''):
                kwargs['api_key'] = api_key
            dh = kwargs.get('default_headers') or {}
            dh = dict(dh)
            dh['User-Agent'] = USER_AGENT
            kwargs['default_headers'] = dh
            orig_async_init(self, *args, **kwargs)
        openai.AsyncOpenAI.__init__ = patched_async_init
    except Exception:
        pass

    # Patch LiteLLM if imported
    try:
        import litellm
        if os.environ.get('LITELLM_LOG') == 'DEBUG':
            litellm.set_verbose = False

        orig_completion = getattr(litellm, 'completion', None)
        if orig_completion and not getattr(orig_completion, '_is_patched', False):
            def patched_completion(*args, **kwargs):
                kwargs = _clean_llm_kwargs(kwargs)
                if base_url and (not kwargs.get('api_base') or kwargs.get('api_base') == ''):
                    kwargs['api_base'] = base_url
                    kwargs['base_url'] = base_url
                    kwargs['custom_llm_provider'] = 'openai'
                if api_key and (not kwargs.get('api_key') or kwargs.get('api_key') == ''):
                    kwargs['api_key'] = api_key
                headers = kwargs.get('headers') or {}
                headers = dict(headers)
                headers['User-Agent'] = USER_AGENT
                kwargs['headers'] = headers
                return orig_completion(*args, **kwargs)
            patched_completion._is_patched = True
            litellm.completion = patched_completion

        orig_acompletion = getattr(litellm, 'acompletion', None)
        if orig_acompletion and not getattr(orig_acompletion, '_is_patched', False):
            async def patched_acompletion(*args, **kwargs):
                kwargs = _clean_llm_kwargs(kwargs)
                if base_url and (not kwargs.get('api_base') or kwargs.get('api_base') == ''):
                    kwargs['api_base'] = base_url
                    kwargs['base_url'] = base_url
                    kwargs['custom_llm_provider'] = 'openai'
                if api_key and (not kwargs.get('api_key') or kwargs.get('api_key') == ''):
                    kwargs['api_key'] = api_key
                headers = kwargs.get('headers') or {}
                headers = dict(headers)
                headers['User-Agent'] = USER_AGENT
                kwargs['headers'] = headers
                return await orig_acompletion(*args, **kwargs)
            patched_acompletion._is_patched = True
            litellm.acompletion = patched_acompletion
    except Exception:
        pass

_patch_all()
`;
    fs.writeFileSync(path.join(hermesHome, 'sitecustomize.py'), sitecustomizeContent, 'utf8');

    // Sync Hermes Browser automation settings
    try {
      const browserSettings = (userId ? await getHermesBrowserSettings(userId) : null) || DEFAULT_BROWSER_SETTINGS;
      await syncBrowserConfigToYamlAndEnv(browserSettings);
    } catch (browserErr) {
      console.warn('[Hermes WebUI] Notice: Browser config sync non-critical warning:', browserErr);
    }

    // Sync Hermes Vision & Image Generation settings
    try {
      const visionImageSettings = await getHermesVisionImageSettings(userId);
      await syncVisionImageConfigToYamlAndEnv(visionImageSettings);
    } catch (visionImageErr) {
      console.warn('[Hermes WebUI] Notice: Vision & Image config sync warning:', visionImageErr);
    }

    // Sync Hermes Messaging settings
    try {
      const messagingSettings = await getMessagingSettings(userId);
      if (messagingSettings) {
        await syncMessagingConfigToFiles(messagingSettings);
      }
    } catch (messagingErr) {
      console.warn('[Hermes WebUI] Notice: Messaging config sync warning:', messagingErr);
    }

    console.log(`✅ [Hermes WebUI] Config, browser, vision, image & messaging settings synced to ${hermesHome} (provider=${provider}, model=${model})`);

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

  // Always sync the latest credentials & target workspace from DB → disk config files
  const creds = await syncHermesConfigFiles(config.userId, config.workspacePath);

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

  // Build the allowed origins list for Hermes WebUI CSRF guard.
  // Build the allowed origins list for Hermes WebUI CSRF guard.
  // Note: CSRF bypass is now handled at the proxy layer (stripping browser security headers),
  // but we still set these as a belt-and-suspenders fallback.
  const publicUrl = (process.env.PUBLIC_URL || '').trim().replace(/\/$/, '');
  const allowedOrigins = [
    'http://127.0.0.1:8787',
    `http://127.0.0.1:${port}`,
    'http://localhost:8080',
    ...(publicUrl ? [publicUrl] : []),
  ].join(',');

  const env: Record<string, string> = {
    ...process.env,
    ...buildMultiCoreEnv(totalCores),
    PYTHONPATH: pythonPath,
    LITELLM_LOG: 'DEBUG',
    HERMES_WEBUI_PORT: String(port),
    HERMES_WEBUI_HOST: '127.0.0.1',
    HERMES_HOME: hermesHome,
    HERMES_WORKSPACE: process.env.WORKSPACES_ROOT || '/workspaces',
    // ── CSRF fix (belt-and-suspenders) ───────────────────────────────────
    HERMES_WEBUI_ALLOWED_ORIGINS: allowedOrigins,
    HERMES_WEBUI_TRUST_FORWARDED_HOST: 'true',
    // ── Nous Auth fix ────────────────────────────────────────────────
    // hermes-agent can override our custom API key with a Nous Portal JWT.
    // DISABLE_NOUS_AUTH prevents this; NOUS_API_KEY= clears any cached token.
    DISABLE_NOUS_AUTH: 'true',
    NOUS_API_KEY: '',
    // ── Browser User-Agent ────────────────────────────────────────────
    // Cloudflare / Clever Cloud WAF blocks default python-httpx/requests agents.
    // Spoofing a Chrome user-agent prevents bot detection on outgoing AI calls.
    USER_AGENT: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    HTTP_USER_AGENT: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    // ── Search, Extract & Browser Fallbacks ────────────────────────────
    PIP_BREAK_SYSTEM_PACKAGES: '1',
    PIP_ROOT_USER_ACTION: 'ignore',
    WEB_SEARCH_PROVIDER: 'duckduckgo',
    SEARCH_PROVIDER: 'duckduckgo',
    WEB_EXTRACT_PROVIDER: 'browser',
    SEARCH_FALLBACK: 'browser',
    BROWSER_TOOL_ENABLED: 'true',
    HERMES_BROWSER_ENABLED: 'true',
    PLAYWRIGHT_BROWSERS_PATH: '0',
    CHROME_PATH: '/usr/bin/chromium',
    CHROMIUM_PATH: '/usr/bin/chromium',
    PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium',
    // ── Credentials ─────────────────────────────────────────────────────
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

  // Inject messaging credentials if configured
  try {
    const messaging = await getMessagingSettings(config.userId);
    if (messaging) {
      if (messaging.telegramEnabled && messaging.telegramBotToken) {
        env.TELEGRAM_BOT_TOKEN = messaging.telegramBotToken;
        if (messaging.telegramAllowedUsers) env.TELEGRAM_ALLOWED_USERS = messaging.telegramAllowedUsers;
        if (messaging.telegramAllowedChats) env.TELEGRAM_ALLOWED_CHATS = messaging.telegramAllowedChats;
        if (messaging.telegramGroupAllowedChats) env.TELEGRAM_GROUP_ALLOWED_CHATS = messaging.telegramGroupAllowedChats;
        if (messaging.telegramObserveUnmentioned) env.TELEGRAM_OBSERVE_UNMENTIONED_GROUP_MESSAGES = 'true';
      }
      if (messaging.whatsappEnabled && messaging.whatsappAccessToken) {
        env.WHATSAPP_CLOUD_ACCESS_TOKEN = messaging.whatsappAccessToken;
        if (messaging.whatsappPhoneNumberId) env.WHATSAPP_CLOUD_PHONE_NUMBER_ID = messaging.whatsappPhoneNumberId;
      }
      if (messaging.emailEnabled && messaging.emailAddress) {
        env.EMAIL_ADDRESS = messaging.emailAddress;
        if (messaging.emailPassword) env.EMAIL_PASSWORD = messaging.emailPassword;
      }
    }
  } catch {}

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
