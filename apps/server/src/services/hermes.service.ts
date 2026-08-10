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

function resolveProvider(provider: string): ProviderConfig {
  switch (provider) {
    case 'openai':
      return {
        baseUrl: 'https://api.openai.com/v1',
        authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
      };
    case 'nous_portal':
      return {
        baseUrl: 'https://api.nousresearch.com/v1',
        authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
      };
    case 'ollama':
      return {
        baseUrl: 'http://localhost:11434/v1',
        authHeader: () => ({}),
      };
    case 'openrouter':
    default:
      return {
        baseUrl: 'https://openrouter.ai/api/v1',
        authHeader: (key) => ({
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
  const provider = resolveProvider(settings.provider);

  // Build system message with workspace context
  const systemMessages: ChatMessage[] = [];
  const systemParts: string[] = [
    settings.systemPrompt || 'You are Hermes, an expert AI co-developer embedded in CleverCoder IDE. You are precise, helpful, and execution-focused.',
  ];

  if (context?.projectId) {
    systemParts.push(
      `\n## Active Workspace Context`,
      `- Project ID: ${context.projectId}`,
      ...(context.projectName ? [`- Project: ${context.projectName}`] : []),
      ...(context.workspaceRoot ? [`- Workspace Root: ${context.workspaceRoot}`] : []),
      ...(context.activeFilePath ? [`- Active File: ${context.activeFilePath}`] : []),
      ...(context.gitBranch ? [`- Git Branch: ${context.gitBranch}`] : []),
      ...(context.selectedText ? [`\n## Selected Text\n\`\`\`\n${context.selectedText}\n\`\`\``] : []),
    );
  }

  systemMessages.push({ role: 'system', content: systemParts.join('\n') });

  const allMessages = [...systemMessages, ...messages].map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Tools definition for structured tool call support
  const tools = buildToolDefinitions(settings.enabledTools ?? []);

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

function buildToolDefinitions(enabledTools: string[]) {
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

  return tools;
}

// ── Connection Test ────────────────────────────────────────────────────────────

export async function testProviderConnection(
  provider: string,
  apiKey: string,
  model: string,
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const providerConfig = resolveProvider(provider);
  const start = Date.now();

  try {
    const response = await fetch(`${providerConfig.baseUrl}/models`, {
      method: 'GET',
      headers: {
        ...providerConfig.authHeader(apiKey),
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - start;

    if (response.ok) {
      return { ok: true, message: `Connected to ${provider} in ${latencyMs}ms`, latencyMs };
    } else {
      const err = await response.json().catch(() => ({ error: { message: `HTTP ${response.status}` } }));
      const msg = (err as { error?: { message?: string } })?.error?.message ?? `HTTP ${response.status}`;
      return { ok: false, message: `Authentication failed: ${msg}` };
    }
  } catch (err) {
    return {
      ok: false,
      message: `Connection error: ${err instanceof Error ? err.message : 'Unknown error'}`,
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
