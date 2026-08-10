/**
 * Hermes Chat & Session Routes — /api/v1/hermes/
 *
 * Endpoints:
 *  GET    /sessions                    — list sessions
 *  POST   /sessions                    — create session
 *  DELETE /sessions/:id                — archive session
 *  GET    /sessions/:id/messages       — get messages
 *  POST   /chat                        — SSE streaming chat
 *  POST   /tool/approve                — approve/reject tool call
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { schema } from '../db/index.js';
import { verifyToken } from '../middleware/auth.middleware.js';
import {
  getHermesSettings,
  streamCompletion,
  persistMessage,
  updateToolCallStatus,
  type HermesWorkspaceContext,
  type ChatMessage,
  type ToolCall,
} from '../services/hermes.service.js';
import { readArtifact, getPresignedReadUrl } from '../services/s3.service.js';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { config } from '../config.js';
import { randomUUID } from 'crypto';

// ── Auth Helper ────────────────────────────────────────────────────────────────

function getUserId(request: FastifyRequest): string {
  const token =
    (request.cookies as Record<string, string | undefined>)?.access_token ??
    request.headers.authorization?.slice(7) ?? '';
  return verifyToken(token).sub;
}

// ── Pending Tool Approvals (in-memory map — SSE connection held open) ──────────

const pendingApprovals = new Map<string, {
  resolve: (approved: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();

export async function hermesRoutes(fastify: FastifyInstance) {
  // ── GET /sessions ─────────────────────────────────────────────────────────────
  fastify.get('/sessions', async (request, reply) => {
    const userId = getUserId(request as FastifyRequest);
    const db = getDb();
    const { projectId } = request.query as { projectId?: string };

    const sessions = await db.query.hermesSessions.findMany({
      where: and(
        eq(schema.hermesSessions.userId, userId),
        eq(schema.hermesSessions.status, 'active'),
      ),
      orderBy: [desc(schema.hermesSessions.updatedAt)],
      limit: 50,
    });

    // Filter by projectId if provided (null = global)
    const filtered = projectId !== undefined
      ? sessions.filter((s) => s.projectId === projectId)
      : sessions;

    return reply.send(filtered);
  });

  // ── POST /sessions ────────────────────────────────────────────────────────────
  fastify.post('/sessions', async (request, reply) => {
    const userId = getUserId(request as FastifyRequest);
    const db = getDb();
    const body = request.body as {
      title?: string;
      projectId?: string;
      contextSnapshot?: HermesWorkspaceContext;
    };

    const [session] = await db
      .insert(schema.hermesSessions)
      .values({
        userId,
        projectId: body.projectId ?? null,
        title: body.title ?? 'New Conversation',
        contextSnapshot: body.contextSnapshot ?? null,
      })
      .returning();

    return reply.code(201).send(session);
  });

  // ── DELETE /sessions/:id ──────────────────────────────────────────────────────
  fastify.delete('/sessions/:id', async (request, reply) => {
    const userId = getUserId(request as FastifyRequest);
    const { id } = request.params as { id: string };
    const db = getDb();

    await db
      .update(schema.hermesSessions)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(and(eq(schema.hermesSessions.id, id), eq(schema.hermesSessions.userId, userId)));

    return reply.send({ ok: true });
  });

  // ── GET /sessions/:id/messages ────────────────────────────────────────────────
  fastify.get('/sessions/:id/messages', async (request, reply) => {
    const userId = getUserId(request as FastifyRequest);
    const { id } = request.params as { id: string };
    const db = getDb();

    // Verify session belongs to user
    const session = await db.query.hermesSessions.findFirst({
      where: and(eq(schema.hermesSessions.id, id), eq(schema.hermesSessions.userId, userId)),
    });
    if (!session) return reply.code(404).send({ error: 'Session not found' });

    const messages = await db.query.hermesMessages.findMany({
      where: eq(schema.hermesMessages.sessionId, id),
      orderBy: [schema.hermesMessages.createdAt],
    });

    // Hydrate S3 content
    const hydrated = await Promise.all(
      messages.map(async (m) => {
        if (m.s3ArtifactKey) {
          try {
            const content = await readArtifact(m.s3ArtifactKey);
            return { ...m, content };
          } catch {
            const url = await getPresignedReadUrl(m.s3ArtifactKey).catch(() => null);
            return { ...m, s3DownloadUrl: url };
          }
        }
        return m;
      }),
    );

    return reply.send(hydrated);
  });

  // ── POST /chat — SSE Streaming ────────────────────────────────────────────────
  fastify.post('/chat', async (request, reply) => {
    const userId = getUserId(request as FastifyRequest);
    const body = request.body as {
      sessionId: string;
      message: string;
      context?: HermesWorkspaceContext;
    };

    if (!body.sessionId || !body.message) {
      return reply.code(400).send({ error: 'sessionId and message required' });
    }

    const db = getDb();

    // Verify session ownership
    const session = await db.query.hermesSessions.findFirst({
      where: and(
        eq(schema.hermesSessions.id, body.sessionId),
        eq(schema.hermesSessions.userId, userId),
      ),
    });
    if (!session) return reply.code(404).send({ error: 'Session not found' });

    const settings = await getHermesSettings(userId);
    if (!settings) return reply.code(400).send({ error: 'Hermes not configured. Please set up your provider in Settings.' });

    // Persist user message
    await persistMessage(body.sessionId, userId, 'user', body.message);

    // Load recent message history (last 20 messages for context)
    const history = await db.query.hermesMessages.findMany({
      where: eq(schema.hermesMessages.sessionId, body.sessionId),
      orderBy: [desc(schema.hermesMessages.createdAt)],
      limit: 20,
    });

    const chatHistory: ChatMessage[] = history.reverse().map((m) => ({
      role: m.role as ChatMessage['role'],
      content: m.content.startsWith('[S3:') ? '(large content stored in S3)' : m.content,
    }));

    // Set up SSE
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Create placeholder assistant message ID for tool calls
    const assistantMessageId = randomUUID();
    let fullContent = '';
    const emittedToolCalls: ToolCall[] = [];
    let tokenUsage: { prompt: number; completion: number } | undefined;

    try {
      for await (const chunk of streamCompletion(settings, chatHistory, body.context)) {
        if (chunk.type === 'delta' && chunk.content) {
          fullContent += chunk.content;
          send('delta', { content: chunk.content });
        }

        if (chunk.type === 'tool_call' && chunk.toolCall) {
          const tc = { ...chunk.toolCall, id: chunk.toolCall.id || randomUUID() };
          emittedToolCalls.push(tc);

          // Auto-approve read_file; gate shell_exec on approval mode
          const needsApproval =
            tc.name === 'shell_exec' &&
            settings.commandApprovalMode !== 'auto_approve';

          if (needsApproval) {
            tc.status = 'pending';
            send('tool_call', { ...tc, messageId: assistantMessageId });

            // Wait for approval (30 second timeout)
            const approved = await new Promise<boolean>((resolve) => {
              const timeout = setTimeout(() => {
                pendingApprovals.delete(tc.id);
                resolve(false);
              }, 30000);
              pendingApprovals.set(tc.id, { resolve, timeout });
            });

            if (!approved) {
              tc.status = 'rejected';
              send('tool_result', { toolCallId: tc.id, status: 'rejected', output: 'User rejected command' });
              continue;
            }
            tc.status = 'approved';
          }

          // Execute the tool
          const result = await executeTool(tc, body.context);
          tc.status = result.error ? 'error' : 'completed';
          tc.output = result.output;
          send('tool_result', { toolCallId: tc.id, status: tc.status, output: result.output });
        }

        if (chunk.type === 'done') {
          tokenUsage = chunk.usage;
        }

        if (chunk.type === 'error') {
          send('error', { message: chunk.error });
          break;
        }
      }
    } finally {
      // Persist the assistant message
      if (fullContent || emittedToolCalls.length > 0) {
        await persistMessage(
          body.sessionId,
          userId,
          'assistant',
          fullContent || '(tool execution)',
          emittedToolCalls.length > 0 ? emittedToolCalls : undefined,
          tokenUsage,
        );
      }

      // Update session timestamp
      await db
        .update(schema.hermesSessions)
        .set({ updatedAt: new Date() })
        .where(eq(schema.hermesSessions.id, body.sessionId));

      send('end', { sessionId: body.sessionId });
      reply.raw.end();
    }
  });

  // ── POST /tool/approve ────────────────────────────────────────────────────────
  fastify.post('/tool/approve', async (request, reply) => {
    getUserId(request as FastifyRequest); // auth check
    const body = request.body as { toolCallId: string; approved: boolean };

    const pending = pendingApprovals.get(body.toolCallId);
    if (!pending) {
      return reply.code(404).send({ error: 'No pending approval for this tool call ID' });
    }

    clearTimeout(pending.timeout);
    pendingApprovals.delete(body.toolCallId);
    pending.resolve(body.approved);

    return reply.send({ ok: true, approved: body.approved });
  });
}

// ── Tool Executor ─────────────────────────────────────────────────────────────

async function executeTool(
  toolCall: ToolCall,
  context?: HermesWorkspaceContext,
): Promise<{ output: string; error?: string }> {
  try {
    switch (toolCall.name) {
      case 'shell_exec': {
        const { command, workingDir } = toolCall.args as { command: string; workingDir?: string };
        const projectId = context?.projectId;
        if (!projectId) return { output: 'No project context attached', error: 'no_context' };

        const workspacePath = join(config.WORKSPACES_ROOT, projectId, workingDir ?? '');
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const { stdout, stderr } = await execAsync(command, {
          cwd: workspacePath,
          timeout: 30000,
          env: { ...process.env, HOME: workspacePath },
        });
        return { output: [stdout, stderr].filter(Boolean).join('\n') };
      }

      case 'read_file': {
        const { path: filePath } = toolCall.args as { path: string };
        const projectId = context?.projectId;
        if (!projectId) return { output: 'No project context', error: 'no_context' };

        const fullPath = join(config.WORKSPACES_ROOT, projectId, filePath);
        const content = await readFile(fullPath, 'utf-8');
        return { output: content };
      }

      case 'write_file': {
        const { path: filePath, content } = toolCall.args as { path: string; content: string };
        const projectId = context?.projectId;
        if (!projectId) return { output: 'No project context', error: 'no_context' };

        const fullPath = join(config.WORKSPACES_ROOT, projectId, filePath);
        await writeFile(fullPath, content, 'utf-8');
        return { output: `File written: ${filePath}` };
      }

      case 'web_search': {
        // Basic DuckDuckGo Instant Answer API
        const { query } = toolCall.args as { query: string };
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json() as { AbstractText?: string; RelatedTopics?: Array<{ Text?: string }> };
        const summary = data.AbstractText || data.RelatedTopics?.slice(0, 3).map((t) => t.Text).join('\n') || 'No results';
        return { output: summary };
      }

      default:
        return { output: `Unknown tool: ${toolCall.name}`, error: 'unknown_tool' };
    }
  } catch (err) {
    return { output: err instanceof Error ? err.message : 'Tool execution failed', error: 'exec_error' };
  }
}

// Re-export runCommand for use in tool executor
async function runCommand(projectId: string, command: string, workingDir?: string) {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const workspacePath = join(config.WORKSPACES_ROOT, projectId, workingDir ?? '');
  return execAsync(command, { cwd: workspacePath, timeout: 30000 });
}
