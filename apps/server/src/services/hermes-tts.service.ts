import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { eq, desc } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import type { HermesTtsSettings, NewHermesTtsSettings } from '../db/schema.js';

export const DEFAULT_TTS_SETTINGS: Partial<HermesTtsSettings> = {
  enabled: true,
  provider: 'custom_openai',
  baseUrl: 'https://api.sat.ai/v1',
  apiKey: '',
  model: 'sat-tts-hd',
  voice: 'alloy',
  speed: 1.0,
  format: 'mp3',
  autoPlayInWebui: true,
};

let tableChecked = false;

/**
 * Self-healing helper: ensure hermes_tts_settings table exists in database
 */
export async function ensureTtsSettingsTable(): Promise<void> {
  if (tableChecked) return;
  try {
    const db = getDb();
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS hermes_tts_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT true,
        provider TEXT NOT NULL DEFAULT 'custom_openai',
        base_url TEXT NOT NULL DEFAULT 'https://api.sat.ai/v1',
        api_key TEXT,
        model TEXT NOT NULL DEFAULT 'sat-tts-hd',
        voice TEXT NOT NULL DEFAULT 'alloy',
        speed REAL NOT NULL DEFAULT 1.0,
        format TEXT NOT NULL DEFAULT 'mp3',
        auto_play_in_webui BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    tableChecked = true;
  } catch (err: any) {
    console.warn('[Hermes TTS] Notice: Could not ensure hermes_tts_settings table:', err?.message);
  }
}

/**
 * Gets TTS settings for a specific user (or default fallback)
 */
export async function getTtsSettings(userId?: string): Promise<HermesTtsSettings | null> {
  await ensureTtsSettingsTable();
  const db = getDb();
  try {
    if (userId) {
      const [existing] = await db
        .select()
        .from(schema.hermesTtsSettings)
        .where(eq(schema.hermesTtsSettings.userId, userId))
        .limit(1);
      if (existing) return existing;
    }

    const [latest] = await db
      .select()
      .from(schema.hermesTtsSettings)
      .orderBy(desc(schema.hermesTtsSettings.updatedAt))
      .limit(1);

    if (latest) return latest;
  } catch (err: any) {
    console.warn('[Hermes TTS] DB fetch warning:', err?.message);
  }

  return null;
}

/**
 * Creates or updates TTS settings for a user
 */
export async function upsertTtsSettings(
  userId: string,
  data: Partial<HermesTtsSettings>,
): Promise<HermesTtsSettings> {
  await ensureTtsSettingsTable();
  const db = getDb();

  const existing = await getTtsSettings(userId);
  const now = new Date();

  let result: HermesTtsSettings;

  if (existing) {
    const updatePayload: Partial<HermesTtsSettings> = {
      ...data,
      updatedAt: now,
    };
    if (data.apiKey === undefined || data.apiKey === '') {
      delete updatePayload.apiKey; // preserve existing key if omitted
    }

    const [updated] = await db
      .update(schema.hermesTtsSettings)
      .set(updatePayload)
      .where(eq(schema.hermesTtsSettings.id, existing.id))
      .returning();
    result = updated;
  } else {
    const insertPayload: NewHermesTtsSettings = {
      userId,
      enabled: data.enabled ?? true,
      provider: data.provider ?? 'custom_openai',
      baseUrl: data.baseUrl ?? 'https://api.sat.ai/v1',
      apiKey: data.apiKey ?? '',
      model: data.model ?? 'sat-tts-hd',
      voice: data.voice ?? 'alloy',
      speed: data.speed ?? 1.0,
      format: data.format ?? 'mp3',
      autoPlayInWebui: data.autoPlayInWebui ?? true,
      createdAt: now,
      updatedAt: now,
    };

    const [inserted] = await db
      .insert(schema.hermesTtsSettings)
      .values(insertPayload)
      .returning();
    result = inserted;
  }

  // Synchronize configuration to disk files
  await syncTtsConfigToFiles(result);
  return result;
}

/**
 * Synchronizes Voice & TTS configuration to ~/.hermes state directories
 */
export async function syncTtsConfigToFiles(settings: Partial<HermesTtsSettings>): Promise<void> {
  const userHome = os.homedir();
  const stateDirs = [
    path.join(userHome, '.hermes'),
    path.join(userHome, '.hermes', 'webui_state'),
    path.join(userHome, '.hermes', 'webui'),
    path.join(userHome, '.hermes', 'profiles', 'default'),
  ];

  for (const dir of stateDirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // ── 1. Update .env file ────────────────────────────────────────────────
      const envPath = path.join(dir, '.env');
      let envLines: string[] = [];
      if (fs.existsSync(envPath)) {
        envLines = fs.readFileSync(envPath, 'utf8').split('\n');
      }

      const envMap: Record<string, string> = {};
      for (const line of envLines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            envMap[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
          }
        }
      }

      if (settings.baseUrl) {
        envMap.TTS_BASE_URL = settings.baseUrl;
        envMap.SAT_BASE_URL = settings.baseUrl;
      }
      if (settings.apiKey) {
        envMap.TTS_API_KEY = settings.apiKey;
        envMap.VOICE_TOOLS_OPENAI_KEY = settings.apiKey;
        envMap.SAT_API_KEY = settings.apiKey;
      }
      if (settings.provider) {
        envMap.TTS_PROVIDER = settings.provider;
      }
      if (settings.model) {
        envMap.TTS_MODEL = settings.model;
      }
      if (settings.voice) {
        envMap.TTS_VOICE = settings.voice;
      }
      if (settings.speed !== undefined) {
        envMap.TTS_SPEED = String(settings.speed);
      }
      if (settings.format) {
        envMap.TTS_FORMAT = settings.format;
      }

      const newEnvContent = Object.entries(envMap)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      fs.writeFileSync(envPath, newEnvContent, 'utf8');

      // ── 2. Update config.yaml file ──────────────────────────────────────────
      const configPath = path.join(dir, 'config.yaml');
      let configRaw = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';

      const ttsBlock = `\ntts:\n  enabled: ${settings.enabled ?? true}\n  provider: "${settings.provider || 'custom_openai'}"\n  base_url: "${settings.baseUrl || 'https://api.sat.ai/v1'}"\n  model: "${settings.model || 'sat-tts-hd'}"\n  voice: "${settings.voice || 'alloy'}"\n  speed: ${settings.speed ?? 1.0}\n  format: "${settings.format || 'mp3'}"\n  auto_play: ${settings.autoPlayInWebui ?? true}\n`;

      if (!configRaw.includes('tts:')) {
        configRaw += ttsBlock;
      } else {
        // Replace existing tts block
        configRaw = configRaw.replace(/\ntts:[\s\S]*?(?=\n\w+:|$)/, ttsBlock);
      }

      fs.writeFileSync(configPath, configRaw, 'utf8');
    } catch (err) {
      console.warn(`[Hermes TTS] Warning syncing config files to ${dir}:`, err);
    }
  }

  console.log(`✅ [Hermes TTS] Credentials and config synced to ~/.hermes state files`);
}

/**
 * Discover available TTS AI models from an OpenAI-compatible endpoint
 */
export async function discoverTtsModels(
  baseUrl: string,
  apiKey?: string,
): Promise<Array<{ id: string; name?: string; description?: string }>> {
  const cleanUrl = baseUrl.replace(/\/$/, '');
  const targetUrl = `${cleanUrl}/models`;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(targetUrl, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to discover models: HTTP ${res.status}`);
  }

  const data: any = await res.json();
  const rawModels: any[] = data?.data || data || [];
  const modelList: Array<{ id: string; name?: string; description?: string }> = [];

  for (const m of rawModels) {
    const id = typeof m === 'string' ? m : m.id;
    if (!id) continue;

    const lowerId = id.toLowerCase();
    const isTtsRelated =
      lowerId.includes('tts') ||
      lowerId.includes('speech') ||
      lowerId.includes('audio') ||
      lowerId.includes('voice') ||
      lowerId.includes('sat') ||
      lowerId.includes('eleven') ||
      lowerId.includes('bark') ||
      lowerId.includes('coqui') ||
      lowerId.includes('vits');

    modelList.push({
      id,
      name: m.name || id,
      description: isTtsRelated ? 'Speech Synthesis Model' : 'General Model',
    });
  }

  const filtered = modelList.filter((m) =>
    m.id.toLowerCase().includes('tts') ||
    m.id.toLowerCase().includes('speech') ||
    m.id.toLowerCase().includes('audio') ||
    m.id.toLowerCase().includes('voice') ||
    m.id.toLowerCase().includes('sat')
  );

  return filtered.length > 0 ? filtered : modelList;
}

/**
 * Generates speech audio preview from custom OpenAI endpoint /v1/audio/speech
 */
export async function generateTtsAudioPreview(params: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  voice: string;
  speed?: number;
  text?: string;
  format?: string;
}): Promise<{ audioDataUrl: string; contentType: string }> {
  const cleanUrl = params.baseUrl.replace(/\/$/, '');
  const targetUrl = cleanUrl.endsWith('/audio/speech') ? cleanUrl : `${cleanUrl}/audio/speech`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (params.apiKey) {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }

  const sampleText =
    params.text || 'Hello! Voice and Text-to-Speech synthesis is successfully configured on Hermes Agent.';
  const speed = params.speed !== undefined ? Number(params.speed) : 1.0;
  const format = params.format || 'mp3';

  const res = await fetch(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: params.model || 'sat-tts-hd',
      input: sampleText,
      voice: params.voice || 'alloy',
      speed,
      response_format: format,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Speech preview synthesis failed (HTTP ${res.status}): ${errText || res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const base64Audio = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = format === 'opus' || format === 'ogg' ? 'audio/ogg' : `audio/${format}`;

  return {
    audioDataUrl: `data:${mimeType};base64,${base64Audio}`,
    contentType: mimeType,
  };
}
