/**
 * Hermes Service — Core AI orchestration layer
 *
 * Handles:
 *  - LLM streaming bridge (OpenRouter / OpenAI / Ollama)
 *  - Tool call interception & approval gating
 *  - S3 auto-offload for large message payloads
 *  - Workspace context injection
 */

import { getDb } from '../db/index.js';
import { schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { encrypt, decrypt } from '../utils/crypto.js';
import { autoOffload, artifactKey, uploadTrajectory } from './s3.service.js';
import { randomUUID } from 'crypto';
import os from 'node:os';
import { getHermesVisionImageSettings } from './hermes-vision-image.service.js';

/** Detect available logical CPU cores on host/container */
export function getAvailableCpuCores(): number {
  const count = os.cpus()?.length ?? 0;
  return count > 0 ? count : 2;
}

/** Build environment variables for multi-core parallelism */
export function buildMultiCoreEnv(configuredCores?: number): Record<string, string> {
  const targetCores = configuredCores && configuredCores > 0 ? configuredCores : getAvailableCpuCores();
  return {
    UV_THREADPOOL_SIZE: String(Math.max(4, targetCores * 2)),
    OMP_NUM_THREADS: String(targetCores),
    MKL_NUM_THREADS: String(targetCores),
    OPENBLAS_NUM_THREADS: String(targetCores),
    MAKEFLAGS: `-j${targetCores}`,
    CMAKE_BUILD_PARALLEL_LEVEL: String(targetCores),
    HERMES_MAX_WORKERS: String(targetCores),
  };
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface HermesWorkspaceContext {
  projectId?: string;
  projectName?: string;
  workspaceRoot?: string;
  activeFilePath?: string;
  selectedText?: string;
  gitBranch?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'error';
  output?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
}

// ── Settings Helpers ───────────────────────────────────────────────────────────

export async function getHermesSettings(userId: string) {
  const db = getDb();
  return db.query.hermesSettings.findFirst({
    where: eq(schema.hermesSettings.userId, userId),
  });
}

export async function upsertHermesSettings(
  userId: string,
  data: Partial<typeof schema.hermesSettings.$inferInsert> & { apiKey?: string },
) {
  const db = getDb();

  // Encrypt API key if provided
  const update: Partial<typeof schema.hermesSettings.$inferInsert> = { ...data };
  if (data.apiKey !== undefined) {
    update.apiKeyEncrypted = data.apiKey ? encrypt(data.apiKey) : null;
    delete (update as Record<string, unknown>).apiKey;
  }
  delete (update as Record<string, unknown>).apiKey;

  const existing = await getHermesSettings(userId);
  if (existing) {
    const [row] = await db
      .update(schema.hermesSettings)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(schema.hermesSettings.userId, userId))
      .returning();
    return row;
  } else {
    const [row] = await db
      .insert(schema.hermesSettings)
      .values({ userId, ...update })
      .returning();
    return row;
  }
}

/** Return settings with API key masked for safe client delivery. */
export function maskSettings(settings: typeof schema.hermesSettings.$inferSelect) {
  return {
    ...settings,
    apiKeyEncrypted: settings.apiKeyEncrypted ? '••••••••••••••••' : null,
    apiKeySet: !!settings.apiKeyEncrypted,
  };
}

/** Decrypt and return the real API key for internal use. */
export function getDecryptedApiKey(settings: typeof schema.hermesSettings.$inferSelect): string | null {
  if (!settings.apiKeyEncrypted) return null;
  try {
    return decrypt(settings.apiKeyEncrypted);
  } catch {
    return null;
  }
}

// ── Provider URL Resolver ──────────────────────────────────────────────────────

interface ProviderConfig {
  baseUrl: string;
  authHeader: (key: string) => Record<string, string>;
}

function resolveProvider(provider: string, baseUrl?: string | null): ProviderConfig {
  if (provider === 'custom_openai' && baseUrl) {
    const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
    return {
      baseUrl: cleanUrl,
      authHeader: (key: string): Record<string, string> => (key ? { Authorization: `Bearer ${key}` } : {}),
    };
  }
  switch (provider) {
    case 'openai':
      return {
        baseUrl: 'https://api.openai.com/v1',
        authHeader: (key: string): Record<string, string> => ({ Authorization: `Bearer ${key}` }),
      };
    case 'nous_portal':
      return {
        baseUrl: 'https://api.nousresearch.com/v1',
        authHeader: (key: string): Record<string, string> => ({ Authorization: `Bearer ${key}` }),
      };
    case 'ollama':
      return {
        baseUrl: 'http://localhost:11434/v1',
        authHeader: (key: string): Record<string, string> => (key ? { Authorization: `Bearer ${key}` } : {}),
      };
    case 'openrouter':
    default:
      return {
        baseUrl: 'https://openrouter.ai/api/v1',
        authHeader: (key: string): Record<string, string> => ({
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'https://clever-coder.app',
          'X-Title': 'CleverCoder Hermes',
        }),
      };
  }
}

// ── LLM Streaming Bridge ───────────────────────────────────────────────────────

export interface StreamChunk {
  type: 'delta' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: ToolCall;
  error?: string;
  usage?: { prompt: number; completion: number };
}

/**
 * Stream a chat completion from the configured LLM provider.
 * Yields StreamChunk objects via an AsyncGenerator.
 */
export async function* streamCompletion(
  settings: typeof schema.hermesSettings.$inferSelect,
  messages: ChatMessage[],
  context?: HermesWorkspaceContext,
): AsyncGenerator<StreamChunk> {
  const apiKey = getDecryptedApiKey(settings);
  const provider = resolveProvider(settings.provider, settings.baseUrl);

  // Build system message with workspace context
  const systemMessages: ChatMessage[] = [];
  const systemParts: string[] = [
    settings.systemPrompt || 'You are Hermes, an expert AI co-developer embedded in CleverCoder IDE. You are precise, helpful, and execution-focused.',
  ];

  // Fetch vision & image generation settings
  let visionImageSettings: Awaited<ReturnType<typeof getHermesVisionImageSettings>> | null = null;
  try {
    visionImageSettings = await getHermesVisionImageSettings(settings.userId);
  } catch {}

  if (visionImageSettings?.defaultImageGenModel) {
    systemParts.push(
      `\n## Active Image Generation Capabilities`,
      `- Image Generation: ENABLED`,
      `- Active Image Model: ${visionImageSettings.defaultImageGenModel}`,
      `- Provider: ${visionImageSettings.imageGenProvider}`,
      `- You HAVE the 'generate_image' tool available! When the user requests an image, photo, art, or wallpaper, ALWAYS call the 'generate_image' tool with a rich, detailed prompt to synthesize and save the image.`
    );
  }

  systemMessages.push({ role: 'system', content: systemParts.join('\n') });

  const allMessages = [...systemMessages, ...messages].map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Tools definition for structured tool call support
  const tools = buildToolDefinitions(settings.enabledTools ?? [], visionImageSettings);

  const body: Record<string, unknown> = {
    model: settings.model,
    messages: allMessages,
    stream: true,
    temperature: (settings.temperature ?? 70) / 100,
    max_tokens: Math.min(settings.contextWindow ?? 128000, 4096),
  };

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? provider.authHeader(apiKey) : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => `HTTP ${response.status}`);
      yield { type: 'error', error: `Provider error: ${errText}` };
      return;
    }

    if (!response.body) {
      yield { type: 'error', error: 'No response body from provider' };
      return;
    }

    // Parse SSE stream from provider
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedContent = '';
    const accumulatedToolCalls: Record<number, { id: string; name: string; argsStr: string }> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          yield {
            type: 'done',
            usage: { prompt: 0, completion: 0 }, // usage comes from final chunk
          };
          return;
        }

        try {
          const chunk = JSON.parse(data);
          const choice = chunk.choices?.[0];
          if (!choice) continue;

          // Content delta
          const delta = choice.delta;
          if (delta?.content) {
            accumulatedContent += delta.content;
            yield { type: 'delta', content: delta.content };
          }

          // Tool call deltas
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!accumulatedToolCalls[idx]) {
                accumulatedToolCalls[idx] = { id: tc.id ?? randomUUID(), name: '', argsStr: '' };
              }
              if (tc.function?.name) accumulatedToolCalls[idx].name += tc.function.name;
              if (tc.function?.arguments) accumulatedToolCalls[idx].argsStr += tc.function.arguments;
            }
          }

          // Finish reason
          if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
            // Emit completed tool calls
            for (const [, tc] of Object.entries(accumulatedToolCalls)) {
              let args: Record<string, unknown> = {};
              try { args = JSON.parse(tc.argsStr); } catch { args = { raw: tc.argsStr }; }
              yield {
                type: 'tool_call',
                toolCall: { id: tc.id, name: tc.name, args, status: 'pending' },
              };
            }

            // Usage from final chunk
            const usage = chunk.usage;
            yield {
              type: 'done',
              usage: usage ? { prompt: usage.prompt_tokens, completion: usage.completion_tokens } : undefined,
            };
            return;
          }
        } catch {
          // Malformed SSE line — skip
        }
      }
    }
  } catch (err) {
    yield { type: 'error', error: err instanceof Error ? err.message : 'Unknown streaming error' };
  }
}

// ── Tool Definitions ───────────────────────────────────────────────────────────

function buildToolDefinitions(enabledTools: string[], visionImageSettings?: any) {
  const tools = [];

  if (enabledTools.includes('shell')) {
    tools.push({
      type: 'function',
      function: {
        name: 'shell_exec',
        description: 'Execute a shell command in the project workspace. Requires user approval.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The shell command to execute' },
            workingDir: { type: 'string', description: 'Working directory (relative to workspace root)' },
          },
          required: ['command'],
        },
      },
    });
  }

  if (enabledTools.includes('code_runner')) {
    tools.push({
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read the contents of a file in the workspace',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file (relative to workspace root)' },
          },
          required: ['path'],
        },
      },
    });

    tools.push({
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write or overwrite a file in the workspace. Shows diff for approval.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file (relative to workspace root)' },
            content: { type: 'string', description: 'Full file content to write' },
            originalContent: { type: 'string', description: 'Current file content (for diff display)' },
          },
          required: ['path', 'content'],
        },
      },
    });
  }

  if (enabledTools.includes('web_search')) {
    tools.push({
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web for information',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
      },
    });
  }

  // Always enable generate_image tool if vision & image settings exist
  tools.push({
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate or synthesize a high-resolution AI image, artwork, wallpaper, or photo based on a detailed text prompt.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed creative prompt describing the visual scene to generate' },
          outputPath: { type: 'string', description: 'Optional workspace filename to save the image (e.g. dubai_wallpaper.png)' },
        },
        required: ['prompt'],
      },
    },
  });

  tools.push({
    type: 'function',
    function: {
      name: 'analyze_image',
      description: 'Analyze an image URL or image file in workspace using the active multimodal vision AI model.',
      parameters: {
        type: 'object',
        properties: {
          imageUrl: { type: 'string', description: 'Image URL or base64 data string' },
          prompt: { type: 'string', description: 'Optional question or focus area for the visual analysis' },
        },
        required: ['imageUrl'],
      },
    },
  });

  return tools;
}

// ── Connection Test ────────────────────────────────────────────────────────────

export async function testProviderConnection(
  provider: string,
  apiKey: string,
  model: string,
  baseUrl?: string | null,
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const providerConfig = resolveProvider(provider, baseUrl);
  const start = Date.now();

  try {
    let response: Response | null = null;
    try {
      response = await fetch(`${providerConfig.baseUrl}/models`, {
        method: 'GET',
        headers: {
          ...providerConfig.authHeader(apiKey),
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      response = null;
    }

    if (!response || !response.ok) {
      response = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...providerConfig.authHeader(apiKey),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(10000),
      });
    }

    const latencyMs = Date.now() - start;

    if (response.ok) {
      return { ok: true, message: `Connected to ${provider === 'custom_openai' ? 'Custom Endpoint' : provider} in ${latencyMs}ms`, latencyMs };
    } else {
      const err = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
      const msg = (err as { error?: { message?: string } })?.error?.message ?? `HTTP ${response.status}`;
      return { ok: false, message: `Authentication/Endpoint error: ${msg}` };
    }
  } catch (err) {
    return {
      ok: false,
      message: `Connection error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Execute a live test prompt against the configured model & provider
 * and return benchmark latency, tokens, throughput (tokens/sec), and generated response.
 */
export async function testLlmPrompt(
  provider: string,
  apiKey: string,
  model: string,
  prompt: string,
  baseUrl?: string | null,
  temperature?: number,
): Promise<{
  ok: boolean;
  output?: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  tokensPerSec?: number;
  model?: string;
  message?: string;
}> {
  const providerConfig = resolveProvider(provider, baseUrl);
  const start = Date.now();

  try {
    const response = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        ...providerConfig.authHeader(apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt || 'Describe your capabilities and reasoning architecture.' }],
        max_tokens: 1024,
        temperature: typeof temperature === 'number' ? temperature / 100 : 0.7,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const errText = await response.text().catch(() => `HTTP ${response.status}`);
      return {
        ok: false,
        message: `HTTP ${response.status}: ${errText.slice(0, 350)}`,
        latencyMs,
      };
    }

    const data: any = await response.json();
    const output = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';
    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? (output ? Math.round(output.length / 4) : 0);
    const sec = Math.max(0.1, latencyMs / 1000);
    const tokensPerSec = Number((completionTokens / sec).toFixed(1));

    return {
      ok: true,
      output: output.trim(),
      latencyMs,
      promptTokens,
      completionTokens,
      tokensPerSec,
      model: model || 'default',
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || 'Failed to execute prompt benchmark',
      latencyMs: Date.now() - start,
    };
  }
}

// ── Message Persistence with S3 Auto-Offload ──────────────────────────────────


export async function persistMessage(
  sessionId: string,
  userId: string,
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string,
  toolCalls?: ToolCall[],
  tokenUsage?: { prompt: number; completion: number },
): Promise<typeof schema.hermesMessages.$inferSelect> {
  const db = getDb();
  const messageId = randomUUID();

  // Auto-offload large content to S3
  const s3Key = await autoOffload(
    artifactKey(userId, messageId, 'content.txt'),
    content,
  ).catch(() => null); // graceful fallback

  const [message] = await db
    .insert(schema.hermesMessages)
    .values({
      id: messageId,
      sessionId,
      role,
      content: s3Key ? `[S3:${s3Key}]` : content,
      toolCalls: toolCalls ?? null,
      s3ArtifactKey: s3Key,
      tokenUsage: tokenUsage ?? null,
    })
    .returning();

  return message;
}

/** Update a tool call status on an existing message. */
export async function updateToolCallStatus(
  messageId: string,
  toolCallId: string,
  status: ToolCall['status'],
  output?: string,
) {
  const db = getDb();
  const message = await db.query.hermesMessages.findFirst({
    where: eq(schema.hermesMessages.id, messageId),
  });
  if (!message) throw new Error('Message not found');

  const toolCalls = (message.toolCalls ?? []).map((tc) =>
    tc.id === toolCallId ? { ...tc, status, output: output ?? tc.output } : tc,
  );

  await db
    .update(schema.hermesMessages)
    .set({ toolCalls })
    .where(eq(schema.hermesMessages.id, messageId));
}

// ── Available Models Fetcher & Caching ────────────────────────────────────────

export interface AvailableModelItem {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  provider?: string;
  category?: 'reasoning' | 'vision' | 'code' | 'general';
  isReasoning?: boolean;
  isVision?: boolean;
  isCode?: boolean;
  pricing?: { prompt?: string; completion?: string };
  raw?: any;
}

const _modelCache = new Map<string, { timestamp: number; models: AvailableModelItem[] }>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

export async function fetchAvailableModels(
  provider: string,
  baseUrl?: string | null,
  apiKey?: string | null,
  search?: string
): Promise<{ success: boolean; count: number; models: AvailableModelItem[]; error?: string }> {
  const cacheKey = `${provider}::${baseUrl || ''}::${apiKey ? 'keyed' : 'anon'}`;
  const now = Date.now();
  const cached = _modelCache.get(cacheKey);

  let rawModels: AvailableModelItem[] = [];

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    rawModels = cached.models;
  } else {
    try {
      if (provider === 'custom_openai' && baseUrl) {
        const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
        const res = await fetch(`${cleanUrl}/models`, {
          headers: {
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
          throw new Error(`Endpoint HTTP ${res.status}: ${res.statusText}`);
        }

        const data: any = await res.json();
        const list: any[] = Array.isArray(data) ? data : data.data || [];

        rawModels = list.map((m: any) => {
          const id = typeof m === 'string' ? m : m.id || m.name || 'unknown';
          const idLower = id.toLowerCase();

          const isReasoning =
            idLower.includes('reasoner') ||
            idLower.includes('r1') ||
            idLower.includes('o1') ||
            idLower.includes('o3') ||
            idLower.includes('thinking') ||
            idLower.includes('inkling');

          const isVision =
            idLower.includes('vision') ||
            idLower.includes('vl') ||
            idLower.includes('4o') ||
            idLower.includes('multimodal');

          const isCode =
            idLower.includes('coder') ||
            idLower.includes('code') ||
            idLower.includes('starcoder') ||
            idLower.includes('dev');

          let category: 'reasoning' | 'vision' | 'code' | 'general' = 'general';
          if (isReasoning) category = 'reasoning';
          else if (isVision) category = 'vision';
          else if (isCode) category = 'code';

          return {
            id,
            name: m.name || id,
            description: m.description || `${m.owned_by || 'Custom'} LLM Model`,
            contextLength: m.context_length || m.max_tokens || 128000,
            provider: m.owned_by || 'custom',
            category,
            isReasoning,
            isVision,
            isCode,
            raw: m,
          };
        });
      } else if (provider === 'openrouter') {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
          headers: {
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
          const data: any = await res.json();
          const list: any[] = data.data || [];
          rawModels = list.map((m: any) => {
            const id = m.id;
            const idLower = id.toLowerCase();
            const isReasoning = idLower.includes('r1') || idLower.includes('o1') || idLower.includes('o3') || idLower.includes('thinking');
            const isVision = idLower.includes('vision') || idLower.includes('vl') || idLower.includes('4o') || m.architecture?.modality?.includes('image');
            const isCode = idLower.includes('coder') || idLower.includes('code');

            let category: 'reasoning' | 'vision' | 'code' | 'general' = 'general';
            if (isReasoning) category = 'reasoning';
            else if (isVision) category = 'vision';
            else if (isCode) category = 'code';

            return {
              id,
              name: m.name || id,
              description: m.description || '',
              contextLength: m.context_length || 128000,
              provider: id.split('/')[0] || 'openrouter',
              category,
              isReasoning,
              isVision,
              isCode,
              pricing: m.pricing ? {
                prompt: `$${(Number(m.pricing.prompt) * 1000000).toFixed(2)}/M`,
                completion: `$${(Number(m.pricing.completion) * 1000000).toFixed(2)}/M`,
              } : undefined,
            };
          });
        }
      } else if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: {
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const data: any = await res.json();
          const list: any[] = data.data || [];
          rawModels = list
            .filter((m: any) => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3') || m.id.includes('chat'))
            .map((m: any) => ({
              id: m.id,
              name: m.id,
              provider: 'openai',
              category: m.id.includes('o1') || m.id.includes('o3') ? 'reasoning' : m.id.includes('4o') ? 'vision' : 'general',
              isReasoning: m.id.includes('o1') || m.id.includes('o3'),
              isVision: m.id.includes('4o'),
              contextLength: m.id.includes('o1') || m.id.includes('4o') ? 128000 : 16384,
            }));
        }
      } else if (provider === 'ollama') {
        const url = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
        const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data: any = await res.json();
          const list: any[] = data.models || [];
          rawModels = list.map((m: any) => ({
            id: m.name || m.model,
            name: m.name || m.model,
            provider: 'ollama',
            contextLength: 32768,
            category: (m.name || '').includes('coder') ? 'code' : 'general',
          }));
        }
      }

      if (rawModels.length > 0) {
        _modelCache.set(cacheKey, { timestamp: now, models: rawModels });
      }
    } catch (err: any) {
      if (cached) {
        rawModels = cached.models;
      } else {
        return {
          success: false,
          count: 0,
          models: [],
          error: err?.message || 'Failed to fetch models from provider',
        };
      }
    }
  }

  let filtered = rawModels;
  if (search && search.trim()) {
    const q = search.toLowerCase().trim();
    filtered = rawModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.name && m.name.toLowerCase().includes(q)) ||
        (m.provider && m.provider.toLowerCase().includes(q)) ||
        (m.category && m.category.toLowerCase().includes(q))
    );
  }

  return {
    success: true,
    count: filtered.length,
    models: filtered,
  };
}
