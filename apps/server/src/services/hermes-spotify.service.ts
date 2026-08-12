/**
 * Hermes Spotify Integration Service
 *
 * Manages CRUD for Spotify settings, OAuth token exchanges, and configuration sync to:
 *   ~/.hermes/.env
 *   ~/.hermes/auth.json
 *   ~/.hermes/config.yaml
 */

import fs from 'node:fs';
import path from 'node:path';
import { eq, desc } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import type { HermesSpotifySettings, NewHermesSpotifySettings } from '../db/schema.js';

let _spotifyTableEnsured = false;

function getHermesHome(): string {
  return process.env.HERMES_HOME || path.resolve(process.env.HOME || '/root', '.hermes');
}

function getHermesStateDirs(): string[] {
  const base = getHermesHome();
  return [
    base,
    path.join(base, 'webui_state'),
    path.join(base, 'webui'),
    path.join(base, 'profiles', 'default'),
  ];
}

/**
 * Self-heals automatically if migration has not run yet.
 */
export async function ensureSpotifySettingsTable(): Promise<void> {
  if (_spotifyTableEnsured) return;
  const db = getDb();
  try {
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "hermes_spotify_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL,
        "enabled" boolean DEFAULT false NOT NULL,
        "client_id" text,
        "client_secret" text,
        "redirect_uri" text,
        "refresh_token" text,
        "access_token" text,
        "token_expires_at" timestamp,
        "scope" text,
        "default_device_id" text,
        "default_volume" integer DEFAULT 70 NOT NULL,
        "auto_transfer" boolean DEFAULT true NOT NULL,
        "market" text DEFAULT 'US' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "hermes_spotify_settings_user_id_unique" UNIQUE("user_id")
      );
    `);
    _spotifyTableEnsured = true;
  } catch (err: any) {
    console.warn('[Hermes Spotify] ensureSpotifySettingsTable notice:', err?.message);
  }
}

export async function getSpotifySettings(userId?: string): Promise<HermesSpotifySettings | null> {
  await ensureSpotifySettingsTable();
  const db = getDb();
  try {
    if (userId) {
      const rows = await db
        .select()
        .from(schema.hermesSpotifySettings)
        .where(eq(schema.hermesSpotifySettings.userId, userId))
        .limit(1);
      if (rows[0]) return rows[0];
    }
    const rows = await db
      .select()
      .from(schema.hermesSpotifySettings)
      .orderBy(desc(schema.hermesSpotifySettings.updatedAt))
      .limit(1);
    return rows[0] ?? null;
  } catch (err: any) {
    if (err?.code === '42P01') {
      _spotifyTableEnsured = false;
      await ensureSpotifySettingsTable();
      try {
        const rows = await db
          .select()
          .from(schema.hermesSpotifySettings)
          .orderBy(desc(schema.hermesSpotifySettings.updatedAt))
          .limit(1);
        return rows[0] ?? null;
      } catch {}
    }
    console.warn('[Hermes Spotify] Failed to query spotify settings:', err?.message);
    return null;
  }
}

export async function upsertSpotifySettings(
  userId: string,
  data: Partial<Omit<NewHermesSpotifySettings, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>,
): Promise<HermesSpotifySettings> {
  await ensureSpotifySettingsTable();
  const db = getDb();

  const existing = await getSpotifySettings(userId);

  if (existing) {
    const updated = await db
      .update(schema.hermesSpotifySettings)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(schema.hermesSpotifySettings.userId, existing.userId))
      .returning();
    await syncSpotifyConfigToFiles(updated[0]);
    return updated[0];
  } else {
    const created = await db
      .insert(schema.hermesSpotifySettings)
      .values({
        userId,
        ...data,
      })
      .returning();
    await syncSpotifyConfigToFiles(created[0]);
    return created[0];
  }
}

/**
 * Read .env file into key-value map
 */
function readEnvFile(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) return {};
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    const result: Record<string, string> = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      result[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
    return result;
  } catch {
    return {};
  }
}

function serializeEnvFile(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

/**
 * Sync Spotify settings to ~/.hermes/.env, auth.json, and config.yaml.
 */
export async function syncSpotifyConfigToFiles(settings: HermesSpotifySettings): Promise<void> {
  const dirs = getHermesStateDirs();

  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 1. .env updates
      const envPath = path.join(dir, '.env');
      const env = readEnvFile(envPath);

      const SPOTIFY_ENV_KEYS = [
        'SPOTIFY_CLIENT_ID', 'SPOTIPY_CLIENT_ID', 'HERMES_SPOTIFY_CLIENT_ID',
        'SPOTIFY_CLIENT_SECRET', 'SPOTIPY_CLIENT_SECRET', 'HERMES_SPOTIFY_CLIENT_SECRET',
        'SPOTIFY_REDIRECT_URI', 'SPOTIPY_REDIRECT_URI', 'HERMES_SPOTIFY_REDIRECT_URI',
        'SPOTIFY_REFRESH_TOKEN', 'SPOTIFY_ACCESS_TOKEN',
        'SPOTIFY_DEFAULT_DEVICE_ID', 'SPOTIFY_MARKET',
      ];
      for (const key of SPOTIFY_ENV_KEYS) {
        delete env[key];
      }

      if (settings.clientId) {
        env.SPOTIFY_CLIENT_ID = settings.clientId;
        env.SPOTIPY_CLIENT_ID = settings.clientId;
        env.HERMES_SPOTIFY_CLIENT_ID = settings.clientId;
      }
      if (settings.clientSecret) {
        env.SPOTIFY_CLIENT_SECRET = settings.clientSecret;
        env.SPOTIPY_CLIENT_SECRET = settings.clientSecret;
        env.HERMES_SPOTIFY_CLIENT_SECRET = settings.clientSecret;
      }
      if (settings.redirectUri) {
        env.SPOTIFY_REDIRECT_URI = settings.redirectUri;
        env.SPOTIPY_REDIRECT_URI = settings.redirectUri;
        env.HERMES_SPOTIFY_REDIRECT_URI = settings.redirectUri;
      }
      if (settings.refreshToken) {
        env.SPOTIFY_REFRESH_TOKEN = settings.refreshToken;
      }
      if (settings.accessToken) {
        env.SPOTIFY_ACCESS_TOKEN = settings.accessToken;
      }
      if (settings.defaultDeviceId) {
        env.SPOTIFY_DEFAULT_DEVICE_ID = settings.defaultDeviceId;
      }
      if (settings.market) {
        env.SPOTIFY_MARKET = settings.market;
      }

      fs.writeFileSync(envPath, serializeEnvFile(env), 'utf8');

      // 2. auth.json updates
      const authPath = path.join(dir, 'auth.json');
      let authObj: any = { providers: {} };
      if (fs.existsSync(authPath)) {
        try {
          authObj = JSON.parse(fs.readFileSync(authPath, 'utf8'));
        } catch {}
      }
      if (!authObj.providers) authObj.providers = {};

      if (settings.refreshToken || settings.accessToken) {
        authObj.providers.spotify = {
          client_id: settings.clientId || '',
          client_secret: settings.clientSecret || '',
          access_token: settings.accessToken || '',
          refresh_token: settings.refreshToken || '',
          token_type: 'Bearer',
          expires_at: settings.tokenExpiresAt ? Math.floor(new Date(settings.tokenExpiresAt).getTime() / 1000) : 0,
          scope: settings.scope || 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-modify-public playlist-modify-private user-library-read user-library-modify',
        };
      } else {
        delete authObj.providers.spotify;
      }

      fs.writeFileSync(authPath, JSON.stringify(authObj, null, 2), 'utf8');

      // 3. config.yaml updates
      const configYamlPath = path.join(dir, 'config.yaml');
      let configRaw = '';
      if (fs.existsSync(configYamlPath)) {
        try {
          configRaw = fs.readFileSync(configYamlPath, 'utf8');
        } catch {}
      }

      // Ensure tools block has spotify entry
      if (!configRaw.includes('tools:')) {
        configRaw += '\n\ntools:\n  spotify:\n    enabled: true\n';
      } else if (!configRaw.includes('spotify:')) {
        configRaw = configRaw.replace(/^tools:/m, `tools:\n  spotify:\n    enabled: ${settings.enabled ? 'true' : 'false'}\n    default_volume: ${settings.defaultVolume || 70}\n    auto_transfer: ${settings.autoTransfer ? 'true' : 'false'}`);
      }

      fs.writeFileSync(configYamlPath, configRaw, 'utf8');

    } catch (err) {
      console.warn(`[Hermes Spotify] Config sync warning for ${dir}:`, err);
    }
  }

  console.log('✅ [Hermes Spotify] Credentials and config synced to ~/.hermes state files');
}

/**
 * Exchange refresh token for a fresh Spotify Access Token
 */
export async function refreshSpotifyAccessToken(settings: HermesSpotifySettings): Promise<string | null> {
  if (!settings.refreshToken || !settings.clientId) return null;

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: settings.refreshToken,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (settings.clientSecret) {
      const authHeader = Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString('base64');
      headers['Authorization'] = `Basic ${authHeader}`;
    } else {
      body.append('client_id', settings.clientId);
    }

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers,
      body: body.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn('[Hermes Spotify] Token refresh failed:', res.status, errText);
      return null;
    }

    const data: any = await res.json();
    const newAccessToken = data.access_token;
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

    // Save back to DB
    await upsertSpotifySettings(settings.userId, {
      accessToken: newAccessToken,
      tokenExpiresAt: expiresAt,
      refreshToken: data.refresh_token || settings.refreshToken,
    });

    return newAccessToken;
  } catch (err: any) {
    console.error('[Hermes Spotify] Token refresh exception:', err?.message);
    return null;
  }
}
