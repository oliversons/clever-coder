/**
 * Hermes Messaging Gateway Service
 *
 * Manages CRUD for messaging gateway settings (Telegram, WhatsApp Cloud API,
 * Email IMAP/SMTP, Webhooks). On save, syncs credentials to:
 *   ~/.hermes/.env          ← environment variables read by `hermes gateway`
 *   ~/.hermes/config.yaml   ← platform behavior configuration
 *
 * Pattern mirrors hermes-browser.service.ts and hermes-search.service.ts.
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import type { HermesMessagingSettings, NewHermesMessagingSettings } from '../db/schema.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getHermesHome(): string {
  return process.env.HERMES_HOME || path.resolve(process.env.HOME || '/root', '.hermes');
}

function getHermesStateDirs(): string[] {
  const root = getHermesHome();
  return Array.from(new Set([
    root,
    path.join(root, 'webui'),
    path.join(root, 'webui_state'),
    path.join(root, 'profiles', 'default'),
  ]));
}

/** Parse a simple KEY=VALUE .env file into a record */
function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}

/** Serialize a record back to KEY=VALUE .env format (preserves non-messaging keys) */
function serializeEnvFile(env: Record<string, string>): string {
  return Object.entries(env)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n';
}

/** Minimal YAML merge: set a dot-path key in a JS plain-object structure */
function setYamlPath(obj: Record<string, any>, keyPath: string[], value: any): void {
  let cursor = obj;
  for (let i = 0; i < keyPath.length - 1; i++) {
    if (!cursor[keyPath[i]] || typeof cursor[keyPath[i]] !== 'object') {
      cursor[keyPath[i]] = {};
    }
    cursor = cursor[keyPath[i]];
  }
  cursor[keyPath[keyPath.length - 1]] = value;
}

/** Very simple YAML serializer (handles the nested structure we write) */
function serializeSimpleYaml(obj: Record<string, any>, indent = 0): string {
  const pad = '  '.repeat(indent);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${pad}${key}:`);
      lines.push(serializeSimpleYaml(value as Record<string, any>, indent + 1));
    } else if (Array.isArray(value)) {
      lines.push(`${pad}${key}:`);
      for (const item of value) {
        if (typeof item === 'object') {
          lines.push(`${pad}  -`);
          lines.push(serializeSimpleYaml(item as Record<string, any>, indent + 2));
        } else {
          lines.push(`${pad}  - ${item}`);
        }
      }
    } else if (typeof value === 'boolean') {
      lines.push(`${pad}${key}: ${value}`);
    } else if (typeof value === 'number') {
      lines.push(`${pad}${key}: ${value}`);
    } else {
      // Escape strings
      const escaped = String(value).replace(/"/g, '\\"');
      lines.push(`${pad}${key}: "${escaped}"`);
    }
  }
  return lines.join('\n');
}

/** Parse minimal subset of the existing config.yaml */
function parseExistingYaml(content: string): Record<string, any> {
  // We use a very simple line-by-line parser sufficient to preserve non-messaging blocks
  // For the messaging-specific blocks we fully regenerate them.
  // Return the raw string — we'll do surgical replacement of our platform blocks.
  return { __raw: content };
}

/** Read or initialize ~/.hermes/.env and config.yaml in a given dir */
function readHermesFiles(dir: string): { env: Record<string, string>; configRaw: string } {
  fs.mkdirSync(dir, { recursive: true });

  let env: Record<string, string> = {};
  const envPath = path.join(dir, '.env');
  if (fs.existsSync(envPath)) {
    try { env = parseEnvFile(fs.readFileSync(envPath, 'utf8')); } catch { /* ignore */ }
  }

  let configRaw = '';
  const configPath = path.join(dir, 'config.yaml');
  if (fs.existsSync(configPath)) {
    try { configRaw = fs.readFileSync(configPath, 'utf8'); } catch { /* ignore */ }
  }

  return { env, configRaw };
}

// ── DB Access ─────────────────────────────────────────────────────────────────

let _messagingTableEnsured = false;

/**
 * Ensures that the hermes_messaging_settings table exists in PostgreSQL.
 * Self-heals automatically if migration has not run yet.
 */
export async function ensureMessagingSettingsTable(): Promise<void> {
  if (_messagingTableEnsured) return;
  const db = getDb();
  try {
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "hermes_messaging_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL,
        "telegram_enabled" boolean DEFAULT false NOT NULL,
        "telegram_bot_token" text,
        "telegram_allowed_users" text,
        "telegram_allowed_chats" text,
        "telegram_group_allowed_chats" text,
        "telegram_require_mention" boolean DEFAULT true NOT NULL,
        "telegram_status_indicator" boolean DEFAULT true NOT NULL,
        "telegram_status_online" text DEFAULT '🟢 Online',
        "telegram_status_offline" text DEFAULT '🔴 Offline',
        "telegram_command_menu_max" integer DEFAULT 60,
        "telegram_command_menu_priority_mode" text DEFAULT 'prepend',
        "telegram_observe_unmentioned" boolean DEFAULT false NOT NULL,
        "telegram_webhook_url" text,
        "telegram_webhook_secret" text,
        "telegram_webhook_port" integer DEFAULT 8443,
        "whatsapp_enabled" boolean DEFAULT false NOT NULL,
        "whatsapp_access_token" text,
        "whatsapp_phone_number_id" text,
        "whatsapp_waba_id" text,
        "whatsapp_verify_token" text,
        "whatsapp_allowed_users" text,
        "whatsapp_text_batch_delay" integer DEFAULT 2,
        "email_enabled" boolean DEFAULT false NOT NULL,
        "email_address" text,
        "email_password" text,
        "email_imap_host" text DEFAULT 'imap.gmail.com',
        "email_smtp_host" text DEFAULT 'smtp.gmail.com',
        "email_imap_port" integer DEFAULT 993,
        "email_smtp_port" integer DEFAULT 587,
        "email_poll_interval" integer DEFAULT 15,
        "email_allowed_users" text,
        "webhook_enabled" boolean DEFAULT false NOT NULL,
        "webhook_port" integer DEFAULT 8644,
        "webhook_secret" text,
        "webhook_routes" jsonb DEFAULT '[]'::jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "hermes_messaging_settings_user_id_unique" UNIQUE("user_id")
      );
    `);
    _messagingTableEnsured = true;
  } catch (err: any) {
    console.warn('[Hermes Messaging] ensureMessagingSettingsTable notice:', err?.message);
  }
}

export async function getMessagingSettings(userId?: string): Promise<HermesMessagingSettings | null> {
  if (!userId) return null;
  await ensureMessagingSettingsTable();
  const db = getDb();
  try {
    const rows = await db
      .select()
      .from(schema.hermesMessagingSettings)
      .where(eq(schema.hermesMessagingSettings.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  } catch (err: any) {
    if (err?.code === '42P01') {
      _messagingTableEnsured = false;
      await ensureMessagingSettingsTable();
      try {
        const rows = await db
          .select()
          .from(schema.hermesMessagingSettings)
          .where(eq(schema.hermesMessagingSettings.userId, userId))
          .limit(1);
        return rows[0] ?? null;
      } catch {}
    }
    console.warn('[Hermes Messaging] Failed to query messaging settings:', err?.message);
    return null;
  }
}

export async function upsertMessagingSettings(
  userId: string,
  data: Partial<Omit<NewHermesMessagingSettings, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>,
): Promise<HermesMessagingSettings> {
  await ensureMessagingSettingsTable();
  const db = getDb();
  const existing = await getMessagingSettings(userId);

  try {
    if (existing) {
      const [updated] = await db
        .update(schema.hermesMessagingSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.hermesMessagingSettings.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(schema.hermesMessagingSettings)
        .values({ userId, ...data })
        .returning();
      return created;
    }
  } catch (err: any) {
    if (err?.code === '42P01') {
      _messagingTableEnsured = false;
      await ensureMessagingSettingsTable();
      const [created] = await db
        .insert(schema.hermesMessagingSettings)
        .values({ userId, ...data })
        .returning();
      return created;
    }
    throw err;
  }
}

/** Mask sensitive fields before sending to client */
export function maskMessagingSettings(s: HermesMessagingSettings): Record<string, any> {
  return {
    ...s,
    telegramBotToken: s.telegramBotToken ? '••••••••' : '',
    whatsappAccessToken: s.whatsappAccessToken ? '••••••••' : '',
    emailPassword: s.emailPassword ? '••••••••' : '',
    webhookSecret: s.webhookSecret ? '••••••••' : '',
    telegramWebhookSecret: s.telegramWebhookSecret ? '••••••••' : '',
    // expose booleans to indicate if a secret is set
    telegramBotTokenSet: !!s.telegramBotToken,
    whatsappAccessTokenSet: !!s.whatsappAccessToken,
    emailPasswordSet: !!s.emailPassword,
    webhookSecretSet: !!s.webhookSecret,
  };
}

// ── Config File Sync ──────────────────────────────────────────────────────────

/**
 * Sync messaging settings to ~/.hermes/.env and ~/.hermes/config.yaml.
 * Preserves all existing non-messaging keys. Called after every save.
 */
export async function syncMessagingConfigToFiles(settings: HermesMessagingSettings): Promise<void> {
  const dirs = getHermesStateDirs();

  for (const dir of dirs) {
    try {
      const { env, configRaw } = readHermesFiles(dir);

      // ── .env updates ───────────────────────────────────────────────────────

      // Clear old messaging keys first
      const MESSAGING_ENV_KEYS = [
        'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_USERS', 'TELEGRAM_ALLOWED_CHATS',
        'TELEGRAM_GROUP_ALLOWED_CHATS', 'TELEGRAM_OBSERVE_UNMENTIONED_GROUP_MESSAGES',
        'TELEGRAM_WEBHOOK_URL', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_WEBHOOK_PORT',
        'WHATSAPP_CLOUD_ACCESS_TOKEN', 'WHATSAPP_CLOUD_PHONE_NUMBER_ID',
        'WHATSAPP_CLOUD_WABA_ID', 'WHATSAPP_CLOUD_VERIFY_TOKEN', 'WHATSAPP_CLOUD_ALLOWED_USERS',
        'WHATSAPP_ALLOWED_USERS',
        'EMAIL_ADDRESS', 'EMAIL_PASSWORD', 'EMAIL_IMAP_HOST', 'EMAIL_SMTP_HOST',
        'EMAIL_IMAP_PORT', 'EMAIL_SMTP_PORT', 'EMAIL_POLL_INTERVAL', 'EMAIL_ALLOWED_USERS',
        'WEBHOOK_ENABLED', 'WEBHOOK_PORT', 'WEBHOOK_SECRET',
      ];
      for (const key of MESSAGING_ENV_KEYS) {
        delete env[key];
      }

      // Telegram
      if (settings.telegramEnabled && settings.telegramBotToken) {
        env.TELEGRAM_BOT_TOKEN = settings.telegramBotToken;
        if (settings.telegramAllowedUsers) env.TELEGRAM_ALLOWED_USERS = settings.telegramAllowedUsers;
        if (settings.telegramAllowedChats) env.TELEGRAM_ALLOWED_CHATS = settings.telegramAllowedChats;
        if (settings.telegramGroupAllowedChats) env.TELEGRAM_GROUP_ALLOWED_CHATS = settings.telegramGroupAllowedChats;
        if (settings.telegramObserveUnmentioned) env.TELEGRAM_OBSERVE_UNMENTIONED_GROUP_MESSAGES = 'true';
        if (settings.telegramWebhookUrl) {
          env.TELEGRAM_WEBHOOK_URL = settings.telegramWebhookUrl;
          if (settings.telegramWebhookSecret) env.TELEGRAM_WEBHOOK_SECRET = settings.telegramWebhookSecret;
          if (settings.telegramWebhookPort) env.TELEGRAM_WEBHOOK_PORT = String(settings.telegramWebhookPort);
        }
      }

      // WhatsApp Cloud
      if (settings.whatsappEnabled && settings.whatsappAccessToken) {
        env.WHATSAPP_CLOUD_ACCESS_TOKEN = settings.whatsappAccessToken;
        if (settings.whatsappPhoneNumberId) env.WHATSAPP_CLOUD_PHONE_NUMBER_ID = settings.whatsappPhoneNumberId;
        if (settings.whatsappWabaId) env.WHATSAPP_CLOUD_WABA_ID = settings.whatsappWabaId;
        if (settings.whatsappVerifyToken) env.WHATSAPP_CLOUD_VERIFY_TOKEN = settings.whatsappVerifyToken;
        if (settings.whatsappAllowedUsers) {
          env.WHATSAPP_CLOUD_ALLOWED_USERS = settings.whatsappAllowedUsers;
          env.WHATSAPP_ALLOWED_USERS = settings.whatsappAllowedUsers;
        }
      }

      // Email
      if (settings.emailEnabled && settings.emailAddress) {
        env.EMAIL_ADDRESS = settings.emailAddress;
        if (settings.emailPassword) env.EMAIL_PASSWORD = settings.emailPassword;
        if (settings.emailImapHost) env.EMAIL_IMAP_HOST = settings.emailImapHost;
        if (settings.emailSmtpHost) env.EMAIL_SMTP_HOST = settings.emailSmtpHost;
        if (settings.emailImapPort) env.EMAIL_IMAP_PORT = String(settings.emailImapPort);
        if (settings.emailSmtpPort) env.EMAIL_SMTP_PORT = String(settings.emailSmtpPort);
        if (settings.emailPollInterval) env.EMAIL_POLL_INTERVAL = String(settings.emailPollInterval);
        if (settings.emailAllowedUsers) env.EMAIL_ALLOWED_USERS = settings.emailAllowedUsers;
      }

      // Webhooks
      env.WEBHOOK_ENABLED = settings.webhookEnabled ? 'true' : 'false';
      if (settings.webhookEnabled) {
        if (settings.webhookPort) env.WEBHOOK_PORT = String(settings.webhookPort);
        if (settings.webhookSecret) env.WEBHOOK_SECRET = settings.webhookSecret;
      }

      fs.writeFileSync(path.join(dir, '.env'), serializeEnvFile(env), 'utf8');

      // ── config.yaml updates ────────────────────────────────────────────────
      // We generate the platforms.telegram / platforms.webhook / platforms.whatsapp_cloud
      // sections and splice them in (or append if missing).

      // Build platform sections
      const platformSections: string[] = [];

      if (settings.telegramEnabled && settings.telegramBotToken) {
        const extra: Record<string, any> = {
          require_mention: settings.telegramRequireMention,
          status_indicator: settings.telegramStatusIndicator,
        };
        if (settings.telegramStatusOnline) extra.status_online = settings.telegramStatusOnline;
        if (settings.telegramStatusOffline) extra.status_offline = settings.telegramStatusOffline;
        if (settings.telegramObserveUnmentioned) extra.observe_unmentioned_group_messages = true;
        if (settings.telegramCommandMenuMax && settings.telegramCommandMenuMax !== 60) {
          extra.command_menu = {
            max_commands: settings.telegramCommandMenuMax,
            priority_mode: settings.telegramCommandMenuPriorityMode || 'prepend',
          };
        }
        platformSections.push(
          `  telegram:\n    extra:\n${Object.entries(extra)
            .map(([k, v]) => {
              if (typeof v === 'object') {
                return `      ${k}:\n${Object.entries(v).map(([kk, vv]) => `        ${kk}: ${vv}`).join('\n')}`;
              }
              return `      ${k}: ${typeof v === 'string' ? `"${v}"` : v}`;
            })
            .join('\n')}`
        );
      }

      if (settings.whatsappEnabled && settings.whatsappAccessToken) {
        const waExtra: Record<string, any> = {};
        if (settings.whatsappAllowedUsers) {
          waExtra.allowed_users = settings.whatsappAllowedUsers.split(',').map((s) => s.trim()).filter(Boolean);
        }
        if (settings.whatsappTextBatchDelay && settings.whatsappTextBatchDelay !== 2) {
          waExtra.text_batch_delay_seconds = settings.whatsappTextBatchDelay;
        }
        if (Object.keys(waExtra).length > 0) {
          platformSections.push(
            `  whatsapp_cloud:\n    extra:\n${Object.entries(waExtra)
              .map(([k, v]) => {
                if (Array.isArray(v)) {
                  return `      ${k}:\n${v.map((item) => `        - "${item}"`).join('\n')}`;
                }
                return `      ${k}: ${v}`;
              })
              .join('\n')}`
          );
        }
      }

      if (settings.webhookEnabled) {
        const routes = settings.webhookRoutes || [];
        if (routes.length > 0) {
          const routeLines = routes.map((r) => {
            const lines = [`      - name: "${r.name}"`];
            if (r.events?.length) lines.push(`        events: [${r.events.map((e) => `"${e}"`).join(', ')}]`);
            if (r.secret) lines.push(`        secret: "${r.secret}"`);
            if (r.profile) lines.push(`        profile: "${r.profile}"`);
            return lines.join('\n');
          });
          platformSections.push(`  webhook:\n    extra:\n      routes:\n${routeLines.join('\n')}`);
        } else {
          platformSections.push(`  webhook:\n    extra:\n      routes: []`);
        }
      }

      // Strip existing platforms block and rebuild it
      let newConfigRaw = configRaw;

      // Remove existing `platforms:` block (everything until next top-level key or EOF)
      newConfigRaw = newConfigRaw.replace(/^platforms:[\s\S]*?(?=^[a-zA-Z]|\Z)/m, '');
      newConfigRaw = newConfigRaw.trimEnd();

      if (platformSections.length > 0) {
        newConfigRaw += `\n\nplatforms:\n${platformSections.join('\n')}\n`;
      }

      fs.writeFileSync(path.join(dir, 'config.yaml'), newConfigRaw, 'utf8');
    } catch (err) {
      console.warn(`[Hermes Messaging] Config sync warning for ${dir}:`, err);
    }
  }

  console.log('✅ [Hermes Messaging] Gateway credentials synced to ~/.hermes/.env and config.yaml');
}

// ── Platform Connection Tests ─────────────────────────────────────────────────

/** Validate a Telegram bot token by calling Telegram's getMe API */
export async function testTelegramToken(token: string): Promise<{
  ok: boolean;
  botUsername?: string;
  botId?: number;
  botName?: string;
  message: string;
  latencyMs?: number;
}> {
  if (!token || token.includes('••••')) {
    return { ok: false, message: 'Enter a valid bot token first' };
  }
  const start = Date.now();
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - start;
    const data = await res.json() as any;
    if (data.ok && data.result) {
      return {
        ok: true,
        botUsername: data.result.username,
        botId: data.result.id,
        botName: data.result.first_name,
        message: `✅ Bot verified: @${data.result.username} (${data.result.first_name})`,
        latencyMs,
      };
    }
    return { ok: false, message: data.description || 'Invalid bot token', latencyMs };
  } catch (err: any) {
    return { ok: false, message: err.message || 'Failed to reach Telegram API', latencyMs: Date.now() - start };
  }
}

/** Validate WhatsApp Cloud API credentials via Meta Graph API */
export async function testWhatsAppCredentials(
  accessToken: string,
  phoneNumberId: string,
): Promise<{ ok: boolean; message: string; latencyMs?: number; displayPhoneNumber?: string }> {
  if (!accessToken || accessToken.includes('••••') || !phoneNumberId) {
    return { ok: false, message: 'Enter Access Token and Phone Number ID first' };
  }
  const start = Date.now();
  try {
    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}?fields=display_phone_number,verified_name&access_token=${accessToken}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const latencyMs = Date.now() - start;
    const data = await res.json() as any;
    if (res.ok && data.display_phone_number) {
      return {
        ok: true,
        message: `✅ WhatsApp Business verified: ${data.verified_name || ''} (${data.display_phone_number})`,
        displayPhoneNumber: data.display_phone_number,
        latencyMs,
      };
    }
    const errMsg = data?.error?.message || data?.message || 'Invalid credentials';
    return { ok: false, message: `❌ ${errMsg}`, latencyMs };
  } catch (err: any) {
    return { ok: false, message: err.message || 'Failed to reach Meta Graph API', latencyMs: Date.now() - start };
  }
}

/** Test TCP socket connectivity to IMAP host:port */
export async function testEmailConnection(
  imapHost: string,
  imapPort: number,
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  if (!imapHost || !imapPort) {
    return { ok: false, message: 'IMAP host and port required' };
  }
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 7000;
    socket.setTimeout(timeout);

    socket.connect(imapPort, imapHost, () => {
      const latencyMs = Date.now() - start;
      socket.destroy();
      resolve({
        ok: true,
        message: `✅ IMAP server ${imapHost}:${imapPort} is reachable (${latencyMs}ms)`,
        latencyMs,
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        ok: false,
        message: `❌ Connection to ${imapHost}:${imapPort} timed out after ${timeout}ms`,
        latencyMs: Date.now() - start,
      });
    });

    socket.on('error', (err) => {
      resolve({
        ok: false,
        message: `❌ ${err.message}`,
        latencyMs: Date.now() - start,
      });
    });
  });
}

/** Return quick status of which gateways have credentials set in the DB */
export function getConfiguredGateways(settings: HermesMessagingSettings | null): {
  telegram: boolean;
  whatsapp: boolean;
  email: boolean;
  webhooks: boolean;
} {
  if (!settings) return { telegram: false, whatsapp: false, email: false, webhooks: false };
  return {
    telegram: settings.telegramEnabled && !!settings.telegramBotToken,
    whatsapp: settings.whatsappEnabled && !!settings.whatsappAccessToken,
    email: settings.emailEnabled && !!settings.emailAddress,
    webhooks: settings.webhookEnabled,
  };
}
