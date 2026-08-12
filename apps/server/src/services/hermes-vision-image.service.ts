/**
 * Hermes Vision & Image Generation Service
 *
 * Manages multimodal vision analysis (`auxiliary.vision`), text-to-image/image-to-image
 * generation (`image_gen`), SAT AI API discovery & OpenAI compatibility, FAL.ai backends,
 * configuration synchronization, and interactive test executions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { isHermesWebUIRunning, restartHermesWebUI } from './hermes-webui.service.js';

export interface HermesVisionImageSettingsInput {
  satApiKey?: string | null;
  satBaseUrl?: string | null;

  visionProvider?: string;
  defaultVisionModel?: string;
  visionBaseUrl?: string | null;
  visionApiKey?: string | null;

  imageGenProvider?: string;
  defaultImageGenModel?: string;
  imageGenBaseUrl?: string | null;
  imageGenApiKey?: string | null;
  falApiKey?: string | null;
  openaiImageApiKey?: string | null;
  maxParallelRequests?: number;
  autoUpscale?: boolean;
  useGateway?: boolean;
}

export const DEFAULT_VISION_IMAGE_SETTINGS: HermesVisionImageSettingsInput = {
  satApiKey: '',
  satBaseUrl: 'https://api.sat.ai/v1',

  visionProvider: 'sat',
  defaultVisionModel: 'sat-vision-v1',
  visionBaseUrl: '',
  visionApiKey: '',

  imageGenProvider: 'sat',
  defaultImageGenModel: 'sat-flux-1-schnell',
  imageGenBaseUrl: '',
  imageGenApiKey: '',
  falApiKey: '',
  openaiImageApiKey: '',
  maxParallelRequests: 4,
  autoUpscale: true,
  useGateway: false,
};

let _tableEnsured = false;

/**
 * Ensures that the hermes_vision_image_settings table exists in PostgreSQL.
 * Self-heals automatically if migration has not run yet.
 */
export async function ensureVisionImageSettingsTable() {
  if (_tableEnsured) return;
  const db = getDb();
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "hermes_vision_image_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL UNIQUE,
        "sat_api_key" text,
        "sat_base_url" text DEFAULT 'https://api.sat.ai/v1' NOT NULL,
        "vision_provider" text DEFAULT 'sat' NOT NULL,
        "default_vision_model" text DEFAULT 'sat-vision-v1' NOT NULL,
        "vision_base_url" text,
        "vision_api_key" text,
        "image_gen_provider" text DEFAULT 'sat' NOT NULL,
        "default_image_gen_model" text DEFAULT 'sat-flux-1-schnell' NOT NULL,
        "image_gen_base_url" text,
        "image_gen_api_key" text,
        "fal_api_key" text,
        "openai_image_api_key" text,
        "max_parallel_requests" integer DEFAULT 4 NOT NULL,
        "auto_upscale" boolean DEFAULT true NOT NULL,
        "use_gateway" boolean DEFAULT false NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    _tableEnsured = true;
  } catch (err) {
    console.warn('[Hermes Vision/Image] Notice: Table ensure check:', err);
  }
}

/**
 * Get active Vision & Image Generation settings for a user.
 */
export async function getHermesVisionImageSettings(userId?: string) {
  await ensureVisionImageSettingsTable();
  const db = getDb();

  let settingsRow: any = null;

  if (userId) {
    const rows = await db
      .select()
      .from(schema.hermesVisionImageSettings)
      .where(eq(schema.hermesVisionImageSettings.userId, userId))
      .limit(1);
    settingsRow = rows[0] || null;
  } else {
    const rows = await db
      .select()
      .from(schema.hermesVisionImageSettings)
      .limit(1);
    settingsRow = rows[0] || null;
  }

  // If found in DB, return
  if (settingsRow) {
    return {
      ...DEFAULT_VISION_IMAGE_SETTINGS,
      ...settingsRow,
    };
  }

  // Fallback: Read from ~/.hermes/config.yaml and ~/.hermes/.env
  const hermesHome = process.env.HERMES_HOME || path.resolve(process.env.HOME || '/root', '.hermes');
  const envPath = path.join(hermesHome, '.env');
  const envMap: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    try {
      const raw = fs.readFileSync(envPath, 'utf8');
      raw.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [k, ...v] = trimmed.split('=');
          if (k) envMap[k.trim()] = v.join('=').trim();
        }
      });
    } catch {}
  }

  return {
    ...DEFAULT_VISION_IMAGE_SETTINGS,
    satApiKey: envMap.SAT_API_KEY || process.env.SAT_API_KEY || '',
    satBaseUrl: envMap.SAT_BASE_URL || process.env.SAT_BASE_URL || 'https://api.sat.ai/v1',
    falApiKey: envMap.FAL_KEY || process.env.FAL_KEY || '',
    openaiImageApiKey: envMap.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
    defaultVisionModel: envMap.VISION_MODEL || 'sat-vision-v1',
    defaultImageGenModel: envMap.IMAGE_GEN_MODEL || 'sat-flux-1-schnell',
  };
}

/**
 * Save Hermes Vision & Image Generation settings to DB, ~/.hermes/config.yaml, and ~/.hermes/.env.
 */
export async function saveHermesVisionImageSettings(
  userId: string | undefined,
  input: HermesVisionImageSettingsInput
) {
  await ensureVisionImageSettingsTable();
  const db = getDb();

  let saved: any = null;

  if (userId) {
    const existing = await db
      .select()
      .from(schema.hermesVisionImageSettings)
      .where(eq(schema.hermesVisionImageSettings.userId, userId))
      .limit(1);

    const payload = {
      satApiKey: input.satApiKey ?? null,
      satBaseUrl: input.satBaseUrl || 'https://api.sat.ai/v1',
      visionProvider: input.visionProvider || 'sat',
      defaultVisionModel: input.defaultVisionModel || 'sat-vision-v1',
      visionBaseUrl: input.visionBaseUrl ?? null,
      visionApiKey: input.visionApiKey ?? null,
      imageGenProvider: input.imageGenProvider || 'sat',
      defaultImageGenModel: input.defaultImageGenModel || 'sat-flux-1-schnell',
      imageGenBaseUrl: input.imageGenBaseUrl ?? null,
      imageGenApiKey: input.imageGenApiKey ?? null,
      falApiKey: input.falApiKey ?? null,
      openaiImageApiKey: input.openaiImageApiKey ?? null,
      maxParallelRequests: input.maxParallelRequests ?? 4,
      autoUpscale: input.autoUpscale ?? true,
      useGateway: input.useGateway ?? false,
    };

    if (existing[0]) {
      const [updated] = await db
        .update(schema.hermesVisionImageSettings)
        .set({
          ...payload,
          updatedAt: new Date(),
        })
        .where(eq(schema.hermesVisionImageSettings.userId, userId))
        .returning();
      saved = updated;
    } else {
      const [inserted] = await db
        .insert(schema.hermesVisionImageSettings)
        .values({
          userId,
          ...payload,
        })
        .returning();
      saved = inserted;
    }
  }

  // Atomically sync config files & environment
  await syncVisionImageConfigToYamlAndEnv(input);

  // If Hermes WebUI process is active, restart it with updated environment
  if (isHermesWebUIRunning()) {
    restartHermesWebUI({ userId }).catch((err) => {
      console.warn('[Hermes Vision/Image] Non-critical warning: WebUI restart after save failed:', err);
    });
  }

  return saved || { ...DEFAULT_VISION_IMAGE_SETTINGS, ...input };
}

/**
 * Write auxiliary.vision and image_gen configuration into ~/.hermes/config.yaml,
 * ~/.hermes/.env, and mirror across all profile and WebUI state paths.
 */
export async function syncVisionImageConfigToYamlAndEnv(settings: HermesVisionImageSettingsInput) {
  const hermesHome = process.env.HERMES_HOME || path.resolve(process.env.HOME || '/root', '.hermes');
  const defaultProfileHome = path.join(hermesHome, 'profiles', 'default');
  const webuiDir = path.join(hermesHome, 'webui');
  const webuiStateDir = path.join(hermesHome, 'webui_state');
  const imagesDir = path.join(hermesHome, 'images');

  const allTargetDirs = [hermesHome, defaultProfileHome, webuiDir, webuiStateDir, imagesDir];
  for (const dir of allTargetDirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const satBaseUrl = (settings.satBaseUrl || 'https://api.sat.ai/v1').replace(/\/$/, '');
  const satApiKey = settings.satApiKey || '';
  const visionProvider = settings.visionProvider || 'sat';
  const defaultVisionModel = settings.defaultVisionModel || 'sat-vision-v1';

  const imageGenProvider = settings.imageGenProvider || 'sat';
  const defaultImageGenModel = settings.defaultImageGenModel || 'sat-flux-1-schnell';
  const maxParallelRequests = Math.max(1, Math.min(10, settings.maxParallelRequests || 4));
  const autoUpscale = settings.autoUpscale ?? true;
  const useGateway = settings.useGateway ?? false;

  // ── 1. Update ~/.hermes/config.yaml ─────────────────────────────────────────
  const configYamlPath = path.join(hermesHome, 'config.yaml');
  let currentYaml = '';
  if (fs.existsSync(configYamlPath)) {
    try {
      currentYaml = fs.readFileSync(configYamlPath, 'utf8');
    } catch {}
  }

  // Strip existing auxiliary.vision, image_gen, and vision sections
  currentYaml = currentYaml
    .replace(/auxiliary:\s*\n\s*vision:[\s\S]*?(?=\n\s*[a-z0-9_]+:|\n[a-z0-9_]+:|$)/gi, '')
    .replace(/image_gen:[\s\S]*?(?=\n[a-z0-9_]+:|$)/gi, '')
    .replace(/vision:[\s\S]*?(?=\n[a-z0-9_]+:|$)/gi, '')
    .trim();

  // Construct auxiliary.vision block
  let resolvedVisionBaseUrl = satBaseUrl;
  let resolvedVisionApiKey = satApiKey || '${SAT_API_KEY}';
  if (visionProvider === 'openai') {
    resolvedVisionBaseUrl = 'https://api.openai.com/v1';
    resolvedVisionApiKey = settings.openaiImageApiKey || '${OPENAI_API_KEY}';
  } else if (visionProvider === 'openrouter') {
    resolvedVisionBaseUrl = 'https://openrouter.ai/api/v1';
    resolvedVisionApiKey = settings.visionApiKey || satApiKey || '${OPENROUTER_API_KEY}';
  } else if (visionProvider === 'custom' && settings.visionBaseUrl) {
    resolvedVisionBaseUrl = settings.visionBaseUrl;
    resolvedVisionApiKey = settings.visionApiKey || satApiKey || '${SAT_API_KEY}';
  }

  // Construct image_gen block
  let resolvedImageBaseUrl = satBaseUrl;
  let resolvedImageApiKey = satApiKey || '${SAT_API_KEY}';
  if (imageGenProvider === 'fal') {
    resolvedImageBaseUrl = 'https://fal.run';
    resolvedImageApiKey = settings.falApiKey || '${FAL_KEY}';
  } else if (imageGenProvider === 'openai') {
    resolvedImageBaseUrl = 'https://api.openai.com/v1';
    resolvedImageApiKey = settings.openaiImageApiKey || '${OPENAI_API_KEY}';
  } else if (imageGenProvider === 'custom' && settings.imageGenBaseUrl) {
    resolvedImageBaseUrl = settings.imageGenBaseUrl;
    resolvedImageApiKey = settings.imageGenApiKey || satApiKey || '${SAT_API_KEY}';
  }

  // Map custom / sat providers to openai for Python Hermes plugin compatibility
  const pythonImageGenProvider = (imageGenProvider === 'custom' || imageGenProvider === 'sat') ? 'openai' : imageGenProvider;
  const pythonVisionProvider = (visionProvider === 'custom' || visionProvider === 'sat') ? 'openai' : visionProvider;

  const visionImageYamlSection = `
auxiliary:
  vision:
    provider: "${pythonVisionProvider}"
    model: "${defaultVisionModel}"
    base_url: "${resolvedVisionBaseUrl}"
    api_key: "${resolvedVisionApiKey}"

image_gen:
  enabled: true
  provider: "${pythonImageGenProvider}"
  model: "${defaultImageGenModel}"
  base_url: "${resolvedImageBaseUrl}"
  api_key: "${resolvedImageApiKey}"
  max_parallel_requests: ${maxParallelRequests}
  upscale: ${autoUpscale}
  use_gateway: ${useGateway}

vision:
  enabled: true
  provider: "${pythonVisionProvider}"
  model: "${defaultVisionModel}"
  base_url: "${resolvedVisionBaseUrl}"
  api_key: "${resolvedVisionApiKey}"

tools:
  browser:
    enabled: true
  web:
    enabled: true
  terminal:
    enabled: true
  file:
    enabled: true
  code_execution:
    enabled: true
  image_gen:
    enabled: true
    provider: "${pythonImageGenProvider}"
    model: "${defaultImageGenModel}"
    base_url: "${resolvedImageBaseUrl}"
    api_key: "${resolvedImageApiKey}"
  image_generation:
    enabled: true
    provider: "${pythonImageGenProvider}"
    model: "${defaultImageGenModel}"
    base_url: "${resolvedImageBaseUrl}"
    api_key: "${resolvedImageApiKey}"
  vision:
    enabled: true
    provider: "${pythonVisionProvider}"
    model: "${defaultVisionModel}"
    base_url: "${resolvedVisionBaseUrl}"
    api_key: "${resolvedVisionApiKey}"
`;

  const finalYaml = `${currentYaml}\n${visionImageYamlSection}`.trim() + '\n';
  fs.writeFileSync(configYamlPath, finalYaml, 'utf8');

  // Mirror config.yaml across paths
  fs.writeFileSync(path.join(defaultProfileHome, 'config.yaml'), finalYaml, 'utf8');
  fs.writeFileSync(path.join(webuiDir, 'config.yaml'), finalYaml, 'utf8');
  fs.writeFileSync(path.join(webuiStateDir, 'config.yaml'), finalYaml, 'utf8');

  // ── 2. Update ~/.hermes/.env ────────────────────────────────────────────────
  const envPath = path.join(hermesHome, '.env');
  let currentEnv = '';
  if (fs.existsSync(envPath)) {
    try {
      currentEnv = fs.readFileSync(envPath, 'utf8');
    } catch {}
  }

  const envVarsToSync: Record<string, string> = {
    SAT_BASE_URL: satBaseUrl,
    SAT_API_KEY: satApiKey,
    VISION_ENABLED: 'true',
    VISION_PROVIDER: pythonVisionProvider,
    VISION_MODEL: defaultVisionModel,
    DEFAULT_VISION_MODEL: defaultVisionModel,
    HERMES_VISION_MODEL: defaultVisionModel,
    VISION_BASE_URL: resolvedVisionBaseUrl,
    VISION_API_KEY: resolvedVisionApiKey,
    IMAGE_GEN_ENABLED: 'true',
    IMAGE_GENERATION_ENABLED: 'true',
    IMAGE_GEN_PROVIDER: pythonImageGenProvider,
    IMAGE_GEN_MODEL: defaultImageGenModel,
    DEFAULT_IMAGE_GEN_MODEL: defaultImageGenModel,
    HERMES_IMAGE_GEN_MODEL: defaultImageGenModel,
    IMAGE_GEN_BASE_URL: resolvedImageBaseUrl,
    IMAGE_GEN_API_KEY: resolvedImageApiKey,
    FAL_KEY: settings.falApiKey || resolvedImageApiKey || satApiKey,
    FAL_API_KEY: settings.falApiKey || resolvedImageApiKey || satApiKey,
    OPENAI_IMAGE_API_KEY: settings.openaiImageApiKey || resolvedImageApiKey || satApiKey,
  };

  const envLines = currentEnv.split('\n').filter((line) => {
    const key = line.split('=')[0]?.trim();
    return !Object.keys(envVarsToSync).includes(key);
  });

  for (const [k, v] of Object.entries(envVarsToSync)) {
    if (v) {
      envLines.push(`${k}=${v}`);
      process.env[k] = v; // In-memory update
    }
  }

  const finalEnv = envLines.join('\n').trim() + '\n';
  fs.writeFileSync(envPath, finalEnv, 'utf8');
  fs.writeFileSync(path.join(defaultProfileHome, '.env'), finalEnv, 'utf8');

  // ── 3. Update json state files to include image_gen & vision in toolsets ─────
  const toolsetList = [
    'browser', 'web', 'terminal', 'file', 'code_execution',
    'clarify', 'cronjob', 'delegation', 'image_gen', 'vision',
    'memory', 'session_search', 'skills', 'todo', 'webhook', 'mcp'
  ];

  for (const targetFile of ['config.json', 'webui.json', 'settings.json']) {
    for (const d of [hermesHome, webuiDir, webuiStateDir]) {
      const p = path.join(d, targetFile);
      if (fs.existsSync(p)) {
        try {
          const content = JSON.parse(fs.readFileSync(p, 'utf8'));
          content.image_gen_enabled = true;
          content.vision_enabled = true;
          content.image_gen_model = defaultImageGenModel;
          content.image_gen_provider = imageGenProvider;
          content.image_gen_base_url = resolvedImageBaseUrl;
          content.image_gen_api_key = resolvedImageApiKey;
          content.toolsets = toolsetList;
          content.enabled_toolsets = toolsetList;
          fs.writeFileSync(p, JSON.stringify(content, null, 2), 'utf8');
        } catch {}
      }
    }
  }

  console.log(`✅ [Hermes Vision/Image] Synced to config.yaml, .env, json (visionModel=${defaultVisionModel}, imageModel=${defaultImageGenModel}, imageGenUrl=${resolvedImageBaseUrl})`);
}

/**
 * Discover and categorize models dynamically from any OpenAI-compatible / SAT AI endpoint.
 */
export async function discoverSatModels(baseUrl?: string, apiKey?: string) {
  const targetUrl = (baseUrl || process.env.SAT_BASE_URL || 'https://api.sat.ai/v1').replace(/\/$/, '');
  const targetKey = apiKey || process.env.SAT_API_KEY || '';

  try {
    const res = await fetch(`${targetUrl}/models`, {
      headers: {
        ...(targetKey ? { Authorization: `Bearer ${targetKey}` } : {}),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data: any = await res.json();
    const rawList: any[] = Array.isArray(data) ? data : data.data || [];

    const models = rawList.map((m: any) => {
      const id: string = typeof m === 'string' ? m : m.id || m.name || 'unknown';
      const idLower = id.toLowerCase();

      // Check capabilities
      const isVision =
        idLower.includes('vision') ||
        idLower.includes('vl') ||
        idLower.includes('4o') ||
        idLower.includes('gemini') ||
        idLower.includes('claude') ||
        idLower.includes('qwen-vl') ||
        idLower.includes('multimodal') ||
        idLower.includes('llava') ||
        idLower.includes('sat-vision');

      const isImageGen =
        idLower.includes('flux') ||
        idLower.includes('sd') ||
        idLower.includes('stable-diffusion') ||
        idLower.includes('dall-e') ||
        idLower.includes('image') ||
        idLower.includes('schnell') ||
        idLower.includes('ideogram') ||
        idLower.includes('recraft') ||
        idLower.includes('krea') ||
        idLower.includes('banana') ||
        idLower.includes('sat-flux');

      return {
        id,
        name: m.name || id,
        description: m.description || (isVision ? 'Vision multimodal reasoning' : isImageGen ? 'Text-to-image generator' : 'Language / Reasoning Model'),
        contextLength: m.context_length || m.max_tokens || undefined,
        isVision,
        isImageGen,
        raw: m,
      };
    });

    return {
      success: true,
      count: models.length,
      baseUrl: targetUrl,
      models,
      visionModels: models.filter((m) => m.isVision),
      imageGenModels: models.filter((m) => m.isImageGen),
    };
  } catch (err: any) {
    return {
      success: false,
      baseUrl: targetUrl,
      error: err?.message || 'Failed to connect to model endpoint',
      models: [],
      visionModels: [],
      imageGenModels: [],
    };
  }
}

/**
 * Execute live Vision Analysis test against configured endpoint.
 */
export async function testVisionAnalysis(
  prompt: string,
  imageBase64OrUrl: string,
  customSettings?: HermesVisionImageSettingsInput
) {
  const startTime = Date.now();
  const settings = customSettings || await getHermesVisionImageSettings();

  const provider = settings.visionProvider || 'sat';
  let baseUrl = (settings.visionBaseUrl || settings.satBaseUrl || 'https://api.sat.ai/v1').replace(/\/$/, '');
  let apiKey = settings.visionApiKey || settings.satApiKey || process.env.SAT_API_KEY || '';
  const model = settings.defaultVisionModel || 'sat-vision-v1';

  if (provider === 'openai') {
    baseUrl = 'https://api.openai.com/v1';
    apiKey = settings.openaiImageApiKey || process.env.OPENAI_API_KEY || '';
  } else if (provider === 'openrouter') {
    baseUrl = 'https://openrouter.ai/api/v1';
    apiKey = settings.visionApiKey || settings.satApiKey || process.env.OPENROUTER_API_KEY || '';
  } else if (provider === 'custom' && settings.visionBaseUrl) {
    baseUrl = settings.visionBaseUrl.replace(/\/$/, '');
    apiKey = settings.visionApiKey || settings.satApiKey || process.env.SAT_API_KEY || '';
  }

  try {
    let finalImageUrl = imageBase64OrUrl;
    if (imageBase64OrUrl.startsWith('http://') || imageBase64OrUrl.startsWith('https://')) {
      try {
        const imgRes = await fetch(imageBase64OrUrl, { signal: AbortSignal.timeout(12000) });
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          finalImageUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
        }
      } catch (fetchErr) {
        console.warn('[Hermes Vision] Could not inline remote image, sending URL directly:', fetchErr);
      }
    } else if (!imageBase64OrUrl.startsWith('data:')) {
      finalImageUrl = `data:image/png;base64,${imageBase64OrUrl}`;
    }

    const payload = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt || 'Describe what you see in this image in detail and list all key visual elements.' },
            {
              type: 'image_url',
              image_url: {
                url: finalImageUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
    };

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Vision API HTTP ${res.status}: ${errText}`);
    }

    const data: any = await res.json();
    const replyText =
      data.choices?.[0]?.message?.content ||
      (typeof data.choices?.[0]?.text === 'string' ? data.choices[0].text : 'No text response');

    return {
      success: true,
      model,
      latencyMs: Date.now() - startTime,
      analysis: replyText,
    };
  } catch (err: any) {
    return {
      success: false,
      model,
      latencyMs: Date.now() - startTime,
      error: err?.message || 'Vision analysis request failed',
    };
  }
}

/**
 * Execute live Image Generation test against Custom API / SAT AI / OpenAI / FAL endpoint.
 */
export async function testImageGeneration(
  prompt: string,
  customSettings?: HermesVisionImageSettingsInput
) {
  const startTime = Date.now();
  const settings = customSettings || await getHermesVisionImageSettings();

  const provider = settings.imageGenProvider || 'sat';
  let baseUrl = (settings.imageGenBaseUrl || settings.satBaseUrl || 'https://api.sat.ai/v1').replace(/\/$/, '');
  let apiKey = settings.imageGenApiKey || settings.satApiKey || process.env.SAT_API_KEY || '';
  const model = settings.defaultImageGenModel || 'sat-flux-1-schnell';

  if (provider === 'openai') {
    baseUrl = 'https://api.openai.com/v1';
    apiKey = settings.openaiImageApiKey || process.env.OPENAI_API_KEY || '';
  } else if (provider === 'custom' && settings.imageGenBaseUrl) {
    baseUrl = settings.imageGenBaseUrl.replace(/\/$/, '');
    apiKey = settings.imageGenApiKey || settings.satApiKey || process.env.SAT_API_KEY || '';
  }

  try {
    const payload = {
      model,
      prompt: prompt || 'A futuristic AI developer workstation with neon lights, holographic code displays, dark aesthetic, 8k resolution',
      n: 1,
      size: '1024x1024',
      response_format: 'url',
    };

    const res = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(35000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Image Gen API HTTP ${res.status}: ${errText}`);
    }

    const data: any = await res.json();
    const imageUrl = data.data?.[0]?.url || data.images?.[0]?.url || (data.data?.[0]?.b64_json ? `data:image/png;base64,${data.data[0].b64_json}` : null);

    if (!imageUrl) {
      throw new Error('No image URL or base64 returned in API response');
    }

    return {
      success: true,
      model,
      latencyMs: Date.now() - startTime,
      imageUrl,
      prompt,
    };
  } catch (err: any) {
    return {
      success: false,
      model,
      latencyMs: Date.now() - startTime,
      error: err?.message || 'Image generation request failed',
    };
  }
}
