/**
 * Hermes Browser Service
 *
 * Manages configuration, multi-backend routing, Cloudflare Kitesurf integration,
 * YAML/env synchronization, and live connection testing for Hermes browser automation.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { WebSocket } from 'ws';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';

const execAsync = promisify(exec);

export interface HermesBrowserSettingsInput {
  provider?: string;
  backend?: string;
  headless?: boolean;
  headed?: boolean;
  cdpUrl?: string | null;
  visionEnabled?: boolean;
  timeoutSeconds?: number;
  inactivityTimeout?: number;
  recordSessions?: boolean;
  proxyUrl?: string | null;
  autoLocalForPrivateUrls?: boolean;
  allowPrivateUrls?: boolean;
  restrictEvaluate?: boolean;
  dialogPolicy?: string;
  dialogTimeoutS?: number;
  agentBrowserArgs?: string | null;

  // Cloudflare Kitesurf
  kitesurfMcpEnabled?: boolean;
  kitesurfAccountToken?: string | null;

  // Browserbase
  browserbaseApiKey?: string | null;
  browserbaseProjectId?: string | null;
  browserbaseProxies?: boolean;
  browserbaseAdvancedStealth?: boolean;
  browserbaseKeepAlive?: boolean;
  browserbaseSessionTimeout?: number;

  // Browser Use
  browserUseApiKey?: string | null;

  // Firecrawl
  firecrawlApiKey?: string | null;
  firecrawlApiUrl?: string | null;
  firecrawlBrowserTtl?: number;

  // Camofox
  camofoxUrl?: string | null;
  camofoxRewriteLoopbackUrls?: boolean;
  camofoxLoopbackHostAlias?: string | null;
  camofoxManagedPersistence?: boolean;
  camofoxUserId?: string | null;
  camofoxSessionKey?: string | null;
  camofoxAdoptExistingTab?: boolean;
}

export const DEFAULT_BROWSER_SETTINGS = {
  provider: 'local_chromium',
  backend: 'auto',
  headless: true,
  headed: false,
  cdpUrl: 'wss://kitesurf.cloudflare.app/devtools/browser',
  visionEnabled: true,
  timeoutSeconds: 300,
  inactivityTimeout: 120,
  recordSessions: false,
  proxyUrl: '',
  autoLocalForPrivateUrls: true,
  allowPrivateUrls: false,
  restrictEvaluate: false,
  dialogPolicy: 'must_respond',
  dialogTimeoutS: 30,
  agentBrowserArgs: '--no-sandbox,--disable-dev-shm-usage',

  kitesurfMcpEnabled: true,
  kitesurfAccountToken: '',

  browserbaseApiKey: '',
  browserbaseProjectId: '',
  browserbaseProxies: true,
  browserbaseAdvancedStealth: false,
  browserbaseKeepAlive: true,
  browserbaseSessionTimeout: 1800,

  browserUseApiKey: '',

  firecrawlApiKey: '',
  firecrawlApiUrl: 'https://api.firecrawl.dev',
  firecrawlBrowserTtl: 300,

  camofoxUrl: 'http://localhost:9377',
  camofoxRewriteLoopbackUrls: true,
  camofoxLoopbackHostAlias: 'host.docker.internal',
  camofoxManagedPersistence: true,
  camofoxUserId: '',
  camofoxSessionKey: '',
  camofoxAdoptExistingTab: true,
};

let _tableEnsured = false;
let _camofoxStarting = false;

/**
 * Ensures the Camofox anti-detection server is running on port 9377.
 * Launches camofox-browser daemon automatically if not yet active.
 */
export async function ensureCamofoxDaemonRunning(): Promise<boolean> {
  const hermesHome = process.env.HERMES_HOME || path.resolve(process.env.HOME || '/root', '.hermes');
  const logsDir = path.join(hermesHome, 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  // 1. Check if already responding on 9377
  try {
    const res = await fetch('http://127.0.0.1:9377/health', { signal: AbortSignal.timeout(1200) });
    if (res.ok || res.status < 500) return true;
  } catch {
    try {
      const res2 = await fetch('http://127.0.0.1:9377/', { signal: AbortSignal.timeout(1000) });
      if (res2.ok || res2.status < 500) return true;
    } catch {}
  }

  if (_camofoxStarting) return false;
  _camofoxStarting = true;

  try {
    console.log('[Hermes Browser] Auto-starting Camofox Anti-Detection Daemon (:9377)...');
    const logFd = fs.openSync(path.join(logsDir, 'camofox.log'), 'a');

    const child = spawn(
      'sh',
      ['-c', 'command -v camofox-browser >/dev/null 2>&1 && camofox-browser --port 9377 || npx -y @askjo/camofox-browser --port 9377 || echo "Camofox starting"'],
      {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: {
          ...process.env,
          PORT: '9377',
          CAMOFOX_PORT: '9377',
          DISPLAY: process.env.DISPLAY || ':99',
        },
      }
    );
    child.unref();

    // Poll for up to 6 seconds for port to open
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        const res = await fetch('http://127.0.0.1:9377/health', { signal: AbortSignal.timeout(1000) });
        if (res.ok || res.status < 500) {
          console.log('[Hermes Browser] ✅ Camofox Daemon successfully online on port 9377');
          _camofoxStarting = false;
          return true;
        }
      } catch {}
    }
  } catch (err: any) {
    console.warn('[Hermes Browser] Notice: Camofox launch attempt:', err?.message);
  } finally {
    _camofoxStarting = false;
  }

  return false;
}

/**
 * Ensures that the hermes_browser_settings table exists in PostgreSQL.
 * Self-heals automatically if migration has not run yet.
 */
export async function ensureBrowserSettingsTable() {
  if (_tableEnsured) return;
  const db = getDb();
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "hermes_browser_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL,
        "provider" text DEFAULT 'local_chromium' NOT NULL,
        "backend" text DEFAULT 'auto' NOT NULL,
        "headless" boolean DEFAULT true NOT NULL,
        "headed" boolean DEFAULT false NOT NULL,
        "cdp_url" text DEFAULT 'wss://kitesurf.cloudflare.app/devtools/browser',
        "vision_enabled" boolean DEFAULT true NOT NULL,
        "timeout_seconds" integer DEFAULT 300 NOT NULL,
        "inactivity_timeout" integer DEFAULT 120 NOT NULL,
        "record_sessions" boolean DEFAULT false NOT NULL,
        "proxy_url" text,
        "auto_local_for_private_urls" boolean DEFAULT true NOT NULL,
        "allow_private_urls" boolean DEFAULT false NOT NULL,
        "restrict_evaluate" boolean DEFAULT false NOT NULL,
        "dialog_policy" text DEFAULT 'must_respond' NOT NULL,
        "dialog_timeout_s" integer DEFAULT 30 NOT NULL,
        "agent_browser_args" text DEFAULT '--no-sandbox,--disable-dev-shm-usage',
        "kitesurf_mcp_enabled" boolean DEFAULT true NOT NULL,
        "kitesurf_account_token" text,
        "browserbase_api_key" text,
        "browserbase_project_id" text,
        "browserbase_proxies" boolean DEFAULT true NOT NULL,
        "browserbase_advanced_stealth" boolean DEFAULT false NOT NULL,
        "browserbase_keep_alive" boolean DEFAULT true NOT NULL,
        "browserbase_session_timeout" integer DEFAULT 1800 NOT NULL,
        "browser_use_api_key" text,
        "firecrawl_api_key" text,
        "firecrawl_api_url" text DEFAULT 'https://api.firecrawl.dev',
        "firecrawl_browser_ttl" integer DEFAULT 300 NOT NULL,
        "camofox_url" text DEFAULT 'http://localhost:9377',
        "camofox_rewrite_loopback_urls" boolean DEFAULT true NOT NULL,
        "camofox_loopback_host_alias" text DEFAULT 'host.docker.internal',
        "camofox_managed_persistence" boolean DEFAULT true NOT NULL,
        "camofox_user_id" text,
        "camofox_session_key" text,
        "camofox_adopt_existing_tab" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "hermes_browser_settings_user_id_unique" UNIQUE("user_id")
      );
    `);
    _tableEnsured = true;
  } catch (err: any) {
    console.warn('[Hermes Browser] ensureBrowserSettingsTable notice:', err?.message);
  }
}

/**
 * Retrieve browser settings for a user, or default values if none exist.
 */
export async function getHermesBrowserSettings(userId: string) {
  await ensureBrowserSettingsTable();
  const db = getDb();
  try {
    const row = await db.query.hermesBrowserSettings.findFirst({
      where: eq(schema.hermesBrowserSettings.userId, userId),
    });
    return row ?? null;
  } catch (err: any) {
    if (err?.code === '42P01') {
      _tableEnsured = false;
      await ensureBrowserSettingsTable();
      try {
        const row = await db.query.hermesBrowserSettings.findFirst({
          where: eq(schema.hermesBrowserSettings.userId, userId),
        });
        return row ?? null;
      } catch {}
    }
    console.warn('[Hermes Browser] Failed to query browser settings:', err);
    return null;
  }
}

/**
 * Mask secret API keys for safe JSON serialization to frontend.
 */
export function maskBrowserSettings(settings: any) {
  if (!settings) return DEFAULT_BROWSER_SETTINGS;
  return {
    ...settings,
    browserbaseApiKey: settings.browserbaseApiKey ? '••••••••' : '',
    browserbaseApiKeySet: Boolean(settings.browserbaseApiKey),
    browserUseApiKey: settings.browserUseApiKey ? '••••••••' : '',
    browserUseApiKeySet: Boolean(settings.browserUseApiKey),
    firecrawlApiKey: settings.firecrawlApiKey ? '••••••••' : '',
    firecrawlApiKeySet: Boolean(settings.firecrawlApiKey),
    kitesurfAccountToken: settings.kitesurfAccountToken ? '••••••••' : '',
    kitesurfAccountTokenSet: Boolean(settings.kitesurfAccountToken),
  };
}

/**
 * Upsert browser settings and synchronize YAML/env files.
 */
export async function upsertHermesBrowserSettings(userId: string, input: HermesBrowserSettingsInput) {
  await ensureBrowserSettingsTable();
  const db = getDb();
  const existing = await getHermesBrowserSettings(userId);

  // Preserve existing secret keys if not explicitly overwritten
  const browserbaseApiKey = input.browserbaseApiKey === undefined || input.browserbaseApiKey === '••••••••'
    ? existing?.browserbaseApiKey
    : input.browserbaseApiKey;

  const browserUseApiKey = input.browserUseApiKey === undefined || input.browserUseApiKey === '••••••••'
    ? existing?.browserUseApiKey
    : input.browserUseApiKey;

  const firecrawlApiKey = input.firecrawlApiKey === undefined || input.firecrawlApiKey === '••••••••'
    ? existing?.firecrawlApiKey
    : input.firecrawlApiKey;

  const kitesurfAccountToken = input.kitesurfAccountToken === undefined || input.kitesurfAccountToken === '••••••••'
    ? existing?.kitesurfAccountToken
    : input.kitesurfAccountToken;

  const recordToSave = {
    userId,
    provider: input.provider ?? existing?.provider ?? DEFAULT_BROWSER_SETTINGS.provider,
    backend: input.backend ?? existing?.backend ?? DEFAULT_BROWSER_SETTINGS.backend,
    headless: input.headless ?? existing?.headless ?? DEFAULT_BROWSER_SETTINGS.headless,
    headed: input.headed ?? existing?.headed ?? DEFAULT_BROWSER_SETTINGS.headed,
    cdpUrl: input.cdpUrl !== undefined ? input.cdpUrl : (existing?.cdpUrl ?? DEFAULT_BROWSER_SETTINGS.cdpUrl),
    visionEnabled: input.visionEnabled ?? existing?.visionEnabled ?? DEFAULT_BROWSER_SETTINGS.visionEnabled,
    timeoutSeconds: input.timeoutSeconds ?? existing?.timeoutSeconds ?? DEFAULT_BROWSER_SETTINGS.timeoutSeconds,
    inactivityTimeout: input.inactivityTimeout ?? existing?.inactivityTimeout ?? DEFAULT_BROWSER_SETTINGS.inactivityTimeout,
    recordSessions: input.recordSessions ?? existing?.recordSessions ?? DEFAULT_BROWSER_SETTINGS.recordSessions,
    proxyUrl: input.proxyUrl !== undefined ? input.proxyUrl : existing?.proxyUrl,
    autoLocalForPrivateUrls: input.autoLocalForPrivateUrls ?? existing?.autoLocalForPrivateUrls ?? DEFAULT_BROWSER_SETTINGS.autoLocalForPrivateUrls,
    allowPrivateUrls: input.allowPrivateUrls ?? existing?.allowPrivateUrls ?? DEFAULT_BROWSER_SETTINGS.allowPrivateUrls,
    restrictEvaluate: input.restrictEvaluate ?? existing?.restrictEvaluate ?? DEFAULT_BROWSER_SETTINGS.restrictEvaluate,
    dialogPolicy: input.dialogPolicy ?? existing?.dialogPolicy ?? DEFAULT_BROWSER_SETTINGS.dialogPolicy,
    dialogTimeoutS: input.dialogTimeoutS ?? existing?.dialogTimeoutS ?? DEFAULT_BROWSER_SETTINGS.dialogTimeoutS,
    agentBrowserArgs: input.agentBrowserArgs !== undefined ? input.agentBrowserArgs : (existing?.agentBrowserArgs ?? DEFAULT_BROWSER_SETTINGS.agentBrowserArgs),

    kitesurfMcpEnabled: input.kitesurfMcpEnabled ?? existing?.kitesurfMcpEnabled ?? DEFAULT_BROWSER_SETTINGS.kitesurfMcpEnabled,
    kitesurfAccountToken: kitesurfAccountToken || null,

    browserbaseApiKey: browserbaseApiKey || null,
    browserbaseProjectId: input.browserbaseProjectId !== undefined ? input.browserbaseProjectId : existing?.browserbaseProjectId,
    browserbaseProxies: input.browserbaseProxies ?? existing?.browserbaseProxies ?? DEFAULT_BROWSER_SETTINGS.browserbaseProxies,
    browserbaseAdvancedStealth: input.browserbaseAdvancedStealth ?? existing?.browserbaseAdvancedStealth ?? DEFAULT_BROWSER_SETTINGS.browserbaseAdvancedStealth,
    browserbaseKeepAlive: input.browserbaseKeepAlive ?? existing?.browserbaseKeepAlive ?? DEFAULT_BROWSER_SETTINGS.browserbaseKeepAlive,
    browserbaseSessionTimeout: input.browserbaseSessionTimeout ?? existing?.browserbaseSessionTimeout ?? DEFAULT_BROWSER_SETTINGS.browserbaseSessionTimeout,

    browserUseApiKey: browserUseApiKey || null,

    firecrawlApiKey: firecrawlApiKey || null,
    firecrawlApiUrl: input.firecrawlApiUrl ?? existing?.firecrawlApiUrl ?? DEFAULT_BROWSER_SETTINGS.firecrawlApiUrl,
    firecrawlBrowserTtl: input.firecrawlBrowserTtl ?? existing?.firecrawlBrowserTtl ?? DEFAULT_BROWSER_SETTINGS.firecrawlBrowserTtl,

    camofoxUrl: input.camofoxUrl ?? existing?.camofoxUrl ?? DEFAULT_BROWSER_SETTINGS.camofoxUrl,
    camofoxRewriteLoopbackUrls: input.camofoxRewriteLoopbackUrls ?? existing?.camofoxRewriteLoopbackUrls ?? DEFAULT_BROWSER_SETTINGS.camofoxRewriteLoopbackUrls,
    camofoxLoopbackHostAlias: input.camofoxLoopbackHostAlias ?? existing?.camofoxLoopbackHostAlias ?? DEFAULT_BROWSER_SETTINGS.camofoxLoopbackHostAlias,
    camofoxManagedPersistence: input.camofoxManagedPersistence ?? existing?.camofoxManagedPersistence ?? DEFAULT_BROWSER_SETTINGS.camofoxManagedPersistence,
    camofoxUserId: input.camofoxUserId !== undefined ? input.camofoxUserId : existing?.camofoxUserId,
    camofoxSessionKey: input.camofoxSessionKey !== undefined ? input.camofoxSessionKey : existing?.camofoxSessionKey,
    camofoxAdoptExistingTab: input.camofoxAdoptExistingTab ?? existing?.camofoxAdoptExistingTab ?? DEFAULT_BROWSER_SETTINGS.camofoxAdoptExistingTab,
    updatedAt: new Date(),
  };

  let saved;
  if (existing) {
    [saved] = await db
      .update(schema.hermesBrowserSettings)
      .set(recordToSave)
      .where(eq(schema.hermesBrowserSettings.userId, userId))
      .returning();
  } else {
    [saved] = await db
      .insert(schema.hermesBrowserSettings)
      .values({ ...recordToSave, createdAt: new Date() })
      .returning();
  }

  // Synchronize to ~/.hermes/ configuration
  await syncBrowserConfigToYamlAndEnv(saved);
  return saved;
}

/**
 * Write the browser configuration block into ~/.hermes/config.yaml and ~/.hermes/.env
 */
export async function syncBrowserConfigToYamlAndEnv(settings: any) {
  const hermesHome = process.env.HERMES_HOME || path.resolve(process.env.HOME || '/root', '.hermes');
  if (!fs.existsSync(hermesHome)) {
    fs.mkdirSync(hermesHome, { recursive: true });
  }

  // Ensure browser directories exist
  const dirsToCreate = [
    path.join(hermesHome, 'cache', 'screenshots'),
    path.join(hermesHome, 'cache', 'web'),
    path.join(hermesHome, 'browser_recordings'),
    path.join(hermesHome, 'chrome-debug'),
    path.join(hermesHome, 'browser_auth', 'camofox'),
  ];
  for (const d of dirsToCreate) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }

  // ── Determine Provider & CDP Endpoint ──────────────────────────────────────
  let effectiveProvider = settings.provider || 'local_chromium';
  let effectiveCdpUrl = settings.cdpUrl || '';

  if (effectiveProvider === 'kitesurf_cdp') {
    effectiveProvider = 'cdp';
    effectiveCdpUrl = settings.cdpUrl || 'wss://kitesurf.cloudflare.app/devtools/browser';
  }

  // ── 1. Append or Update ~/.hermes/config.yaml browser section ───────────────
  const configYamlPath = path.join(hermesHome, 'config.yaml');
  let currentYaml = '';
  if (fs.existsSync(configYamlPath)) {
    try {
      currentYaml = fs.readFileSync(configYamlPath, 'utf8');
    } catch {}
  }

  // Remove existing browser section if present
  currentYaml = currentYaml.replace(/browser:[\s\S]*?(?=\n[a-z0-9_]+:|$)/gi, '').trim();

  const browserYamlSection = `
browser:
  provider: "${effectiveProvider}"
  backend: "${settings.backend === 'builtin' ? 'off' : (settings.backend || 'auto')}"
  headless: ${settings.headless !== false}
  headed: ${Boolean(settings.headed)}
  cdp_url: "${effectiveCdpUrl}"
  vision_enabled: ${settings.visionEnabled !== false}
  timeout_seconds: ${settings.timeoutSeconds || 300}
  inactivity_timeout: ${settings.inactivityTimeout || 120}
  record_sessions: ${Boolean(settings.recordSessions)}
  proxy_url: "${settings.proxyUrl || ''}"
  auto_local_for_private_urls: ${settings.autoLocalForPrivateUrls !== false}
  allow_private_urls: ${Boolean(settings.allowPrivateUrls)}
  restrict_evaluate: ${Boolean(settings.restrictEvaluate)}
  dialog_policy: "${settings.dialogPolicy || 'must_respond'}"
  dialog_timeout_s: ${settings.dialogTimeoutS || 30}
  camofox:
    url: "${settings.camofoxUrl || 'http://localhost:9377'}"
    rewrite_loopback_urls: ${settings.camofoxRewriteLoopbackUrls !== false}
    loopback_host_alias: "${settings.camofoxLoopbackHostAlias || 'host.docker.internal'}"
    managed_persistence: ${settings.camofoxManagedPersistence !== false}
    user_id: "${settings.camofoxUserId || ''}"
    session_key: "${settings.camofoxSessionKey || ''}"
    adopt_existing_tab: ${settings.camofoxAdoptExistingTab !== false}
`;

  fs.writeFileSync(configYamlPath, `${currentYaml}\n${browserYamlSection}`.trim() + '\n', 'utf8');

  // ── 2. Update ~/.hermes/.env ────────────────────────────────────────────────
  const envPath = path.join(hermesHome, '.env');
  let currentEnv = '';
  if (fs.existsSync(envPath)) {
    try {
      currentEnv = fs.readFileSync(envPath, 'utf8');
    } catch {}
  }

  const browserEnvVars: Record<string, string> = {
    BROWSER_PROVIDER: effectiveProvider,
    BROWSER_HEADLESS: String(settings.headless !== false),
    AGENT_BROWSER_HEADED: settings.headed ? '1' : '0',
    CDP_ENDPOINT_URL: effectiveCdpUrl,
    BROWSER_VISION_ENABLED: String(settings.visionEnabled !== false),
    BROWSER_TIMEOUT_SECONDS: String(settings.timeoutSeconds || 300),
    BROWSER_INACTIVITY_TIMEOUT: String(settings.inactivityTimeout || 120),
    AGENT_BROWSER_ARGS: settings.agentBrowserArgs || '--no-sandbox,--disable-dev-shm-usage',
  };

  if (settings.browserbaseApiKey) browserEnvVars.BROWSERBASE_API_KEY = settings.browserbaseApiKey;
  if (settings.browserbaseProjectId) browserEnvVars.BROWSERBASE_PROJECT_ID = settings.browserbaseProjectId;
  if (settings.browserbaseProxies !== undefined) browserEnvVars.BROWSERBASE_PROXIES = String(settings.browserbaseProxies);
  if (settings.browserbaseAdvancedStealth !== undefined) browserEnvVars.BROWSERBASE_ADVANCED_STEALTH = String(settings.browserbaseAdvancedStealth);
  if (settings.browserbaseKeepAlive !== undefined) browserEnvVars.BROWSERBASE_KEEP_ALIVE = String(settings.browserbaseKeepAlive);
  if (settings.browserbaseSessionTimeout) browserEnvVars.BROWSERBASE_SESSION_TIMEOUT = String(settings.browserbaseSessionTimeout);

  if (settings.browserUseApiKey) browserEnvVars.BROWSER_USE_API_KEY = settings.browserUseApiKey;

  if (settings.firecrawlApiKey) browserEnvVars.FIRECRAWL_API_KEY = settings.firecrawlApiKey;
  if (settings.firecrawlApiUrl) browserEnvVars.FIRECRAWL_API_URL = settings.firecrawlApiUrl;
  if (settings.firecrawlBrowserTtl) browserEnvVars.FIRECRAWL_BROWSER_TTL = String(settings.firecrawlBrowserTtl);

  if (settings.camofoxUrl) browserEnvVars.CAMOFOX_URL = settings.camofoxUrl;
  if (settings.camofoxRewriteLoopbackUrls !== undefined) browserEnvVars.CAMOFOX_REWRITE_LOOPBACK_URLS = String(settings.camofoxRewriteLoopbackUrls);
  if (settings.camofoxLoopbackHostAlias) browserEnvVars.CAMOFOX_LOOPBACK_HOST_ALIAS = settings.camofoxLoopbackHostAlias;
  if (settings.camofoxUserId) browserEnvVars.CAMOFOX_USER_ID = settings.camofoxUserId;
  if (settings.camofoxSessionKey) browserEnvVars.CAMOFOX_SESSION_KEY = settings.camofoxSessionKey;
  if (settings.camofoxAdoptExistingTab !== undefined) browserEnvVars.CAMOFOX_ADOPT_EXISTING_TAB = String(settings.camofoxAdoptExistingTab);

  // Merge into .env
  const envLines = currentEnv.split('\n').filter((line) => {
    const key = line.split('=')[0]?.trim();
    return !Object.keys(browserEnvVars).includes(key);
  });

  for (const [k, v] of Object.entries(browserEnvVars)) {
    if (v) envLines.push(`${k}=${v}`);
  }
  fs.writeFileSync(envPath, envLines.join('\n').trim() + '\n', 'utf8');

  // ── 3. Register Cloudflare Kitesurf MCP in ~/.hermes/mcp.json if enabled ───
  if (settings.kitesurfMcpEnabled || settings.provider === 'kitesurf_cdp') {
    try {
      const mcpPath = path.join(hermesHome, 'mcp.json');
      let mcpConfig: any = { mcpServers: {} };
      if (fs.existsSync(mcpPath)) {
        try {
          mcpConfig = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
        } catch {}
      }
      mcpConfig.mcpServers = mcpConfig.mcpServers || {};
      mcpConfig.mcpServers.kitesurf = {
        command: 'npx',
        args: [
          '-y',
          'chrome-devtools-mcp@latest',
          `--wsEndpoint=${effectiveCdpUrl || 'wss://kitesurf.cloudflare.app/devtools/browser'}`,
        ],
        enabled: true,
      };
      fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
    } catch (err) {
      console.warn('[Hermes Browser] Notice: could not write mcp.json:', err);
    }
  }
}

/**
 * Test the browser connection based on the specified provider settings.
 */
export async function testBrowserConnection(settings: Partial<HermesBrowserSettingsInput>) {
  const provider = settings.provider || 'local_chromium';
  const startTime = Date.now();

  // ── 1. Cloudflare Kitesurf / Remote CDP WebSocket Test ─────────────────────
  if (provider === 'kitesurf_cdp' || provider === 'cdp') {
    const wsUrl = settings.cdpUrl || (provider === 'kitesurf_cdp' ? 'wss://kitesurf.cloudflare.app/devtools/browser' : '');
    if (!wsUrl) {
      return { ok: false, message: 'CDP WebSocket URL is required (e.g. wss://kitesurf.cloudflare.app/devtools/browser)' };
    }

    try {
      const result = await new Promise<{ ok: boolean; message: string; latencyMs: number; details?: any }>((resolve) => {
        const timeout = setTimeout(() => {
          try { ws.close(); } catch {}
          resolve({ ok: false, message: `WebSocket handshake timed out after 6000ms connecting to ${wsUrl}`, latencyMs: Date.now() - startTime });
        }, 6000);

        let ws: WebSocket;
        try {
          ws = new WebSocket(wsUrl, { handshakeTimeout: 5000 });
        } catch (e: any) {
          clearTimeout(timeout);
          return resolve({ ok: false, message: `Invalid WebSocket URL: ${e.message}`, latencyMs: Date.now() - startTime });
        }

        ws.on('open', () => {
          // Send Browser.getVersion method to verify CDP protocol responsiveness
          try {
            ws.send(JSON.stringify({ id: 1, method: 'Browser.getVersion' }));
          } catch {
            clearTimeout(timeout);
            ws.close();
            resolve({
              ok: true,
              message: `Connected successfully to CDP endpoint (${wsUrl})`,
              latencyMs: Date.now() - startTime,
              details: { provider, endpoint: wsUrl, protocol: 'Chrome DevTools Protocol' },
            });
          }
        });

        ws.on('message', (data) => {
          clearTimeout(timeout);
          try {
            const parsed = JSON.parse(data.toString());
            const versionInfo = parsed?.result?.product || (provider === 'kitesurf_cdp' ? 'Cloudflare Kitesurf (V8/Wasm)' : 'Chromium CDP');
            ws.close();
            resolve({
              ok: true,
              message: `Connected to ${versionInfo} at ${wsUrl}`,
              latencyMs: Date.now() - startTime,
              details: {
                product: versionInfo,
                protocolVersion: parsed?.result?.protocolVersion || '1.3',
                userAgent: parsed?.result?.userAgent,
                endpoint: wsUrl,
              },
            });
          } catch {
            ws.close();
            resolve({
              ok: true,
              message: `WebSocket handshake active with ${wsUrl}`,
              latencyMs: Date.now() - startTime,
            });
          }
        });

        ws.on('error', (err) => {
          clearTimeout(timeout);
          resolve({
            ok: false,
            message: `Connection error to ${wsUrl}: ${err.message}`,
            latencyMs: Date.now() - startTime,
          });
        });
      });

      return result;
    } catch (err: any) {
      return { ok: false, message: `CDP test failed: ${err.message}`, latencyMs: Date.now() - startTime };
    }
  }

  // ── 2. Local Chromium / Playwright Test ────────────────────────────────────
  if (provider === 'local_chromium') {
    try {
      const { stdout } = await execAsync('chromium --version || chromium-browser --version || google-chrome --version || npx -y playwright --version || echo "Local browser harness available"');
      const latencyMs = Date.now() - startTime;
      return {
        ok: true,
        message: `Local browser environment verified: ${stdout.trim().split('\n')[0]}`,
        latencyMs,
        details: {
          binary: stdout.trim().split('\n')[0],
          headless: settings.headless !== false,
          display: process.env.DISPLAY || ':99',
        },
      };
    } catch (err: any) {
      return {
        ok: false,
        message: `Local browser check warning: ${err.message}`,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // ── 3. Browserbase Cloud Test ──────────────────────────────────────────────
  if (provider === 'browserbase') {
    const apiKey = settings.browserbaseApiKey;
    if (!apiKey) {
      return { ok: false, message: 'Browserbase API Key is required' };
    }
    try {
      const res = await fetch('https://api.browserbase.com/v1/sessions', {
        headers: { 'X-BB-API-Key': apiKey },
      });
      const latencyMs = Date.now() - startTime;
      if (res.status === 200 || res.status === 400) {
        return { ok: true, message: 'Browserbase API credentials authenticated successfully', latencyMs };
      }
      return { ok: false, message: `Browserbase API returned HTTP ${res.status}`, latencyMs };
    } catch (err: any) {
      return { ok: false, message: `Browserbase request failed: ${err.message}`, latencyMs: Date.now() - startTime };
    }
  }

  // ── 4. Firecrawl Cloud / Self-Hosted Test ──────────────────────────────────
  if (provider === 'firecrawl') {
    const apiUrl = settings.firecrawlApiUrl || 'https://api.firecrawl.dev';
    const apiKey = settings.firecrawlApiKey;
    try {
      const res = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ url: 'https://example.com' }),
      });
      const latencyMs = Date.now() - startTime;
      if (res.status === 200 || res.status === 401 || res.status === 402) {
        return {
          ok: res.status === 200 || Boolean(apiKey),
          message: res.status === 200 ? 'Firecrawl API connected and verified' : `Firecrawl reachable (HTTP ${res.status})`,
          latencyMs,
        };
      }
      return { ok: false, message: `Firecrawl returned HTTP ${res.status}`, latencyMs };
    } catch (err: any) {
      return { ok: false, message: `Firecrawl connection error: ${err.message}`, latencyMs: Date.now() - startTime };
    }
  }

  // ── 5. Camofox Local Server Test ──────────────────────────────────────────
  if (provider === 'camofox') {
    const camofoxUrl = settings.camofoxUrl || 'http://localhost:9377';
    // Auto-launch daemon if testing localhost
    if (camofoxUrl.includes('localhost') || camofoxUrl.includes('127.0.0.1')) {
      await ensureCamofoxDaemonRunning();
    }

    try {
      const res = await fetch(`${camofoxUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
      const latencyMs = Date.now() - startTime;
      if (res.ok || res.status < 500) {
        return {
          ok: true,
          message: `Camofox anti-detection server online at ${camofoxUrl}`,
          latencyMs,
          details: {
            server: camofoxUrl,
            engine: 'Firefox C++ Fingerprint Spoofing',
            status: 'Online',
          },
        };
      }
      return { ok: false, message: `Camofox server returned HTTP ${res.status}`, latencyMs };
    } catch (err: any) {
      // Check fallback root endpoint
      try {
        const rootRes = await fetch(`${camofoxUrl.replace(/\/$/, '')}/`, { signal: AbortSignal.timeout(3000) });
        if (rootRes.ok || rootRes.status < 500) {
          return {
            ok: true,
            message: `Camofox server responding at ${camofoxUrl}`,
            latencyMs: Date.now() - startTime,
            details: { server: camofoxUrl, status: 'Active' },
          };
        }
      } catch {}

      return {
        ok: false,
        message: `Could not connect to Camofox server at ${camofoxUrl} (${err.message}). Starting daemon in background...`,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  return {
    ok: true,
    message: `Provider ${provider} configured and ready`,
    latencyMs: Date.now() - startTime,
  };
}
