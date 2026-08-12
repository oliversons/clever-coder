/**
 * Hermes AI Agent — Zustand Store
 *
 * Manages: drawer state, sessions, messages, pending tool approvals,
 * workspace context binding, and SSE streaming.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface HermesWorkspaceContext {
  projectId: string;
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
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'error';
  output?: string;
}

export interface HermesMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  s3ArtifactKey?: string;
  tokenUsage?: { prompt: number; completion: number };
  createdAt: string;
  streaming?: boolean; // true while SSE is still streaming this message
}

export interface HermesSession {
  id: string;
  userId?: string;
  projectId?: string | null;
  title: string;
  status: 'active' | 'archived';
  contextSnapshot?: Partial<HermesWorkspaceContext> | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiffProposal {
  filePath: string;
  originalContent: string;
  proposedContent: string;
  messageId: string;
  toolCallId: string;
}

// ── Store Interface ────────────────────────────────────────────────────────────

interface HermesState {
  // Drawer
  isDrawerOpen: boolean;
  toggleDrawer: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;

  // Mode
  mode: 'global' | 'workspace';
  workspaceContext: HermesWorkspaceContext | null;
  setWorkspaceContext: (ctx: HermesWorkspaceContext | null) => void;
  attachWorkspace: (ctx: HermesWorkspaceContext) => void;
  detachWorkspace: () => void;

  // Sessions
  sessions: HermesSession[];
  activeSessionId: string | null;
  setActiveSession: (id: string | null) => void;
  loadSessions: (projectId?: string) => Promise<void>;
  createSession: (opts?: { title?: string; projectId?: string }) => Promise<HermesSession>;
  deleteSession: (id: string, permanent?: boolean) => Promise<void>;

  // Messages
  messages: HermesMessage[];
  loadMessages: (sessionId: string) => Promise<void>;
  appendMessage: (msg: Partial<HermesMessage> & { role: HermesMessage['role']; content: string }) => string;
  updateMessage: (id: string, patch: Partial<HermesMessage>) => void;

  // Streaming
  streamingMessageId: string | null;
  isStreaming: boolean;
  sendMessage: (content: string) => Promise<void>;
  abortController: AbortController | null;
  cancelStream: () => void;

  // Tool approvals
  pendingApprovals: Array<{ toolCallId: string; command: string; messageId: string }>;
  approveToolCall: (toolCallId: string, approved: boolean) => Promise<void>;

  // Diff review
  diffProposal: DiffProposal | null;
  setDiffProposal: (proposal: DiffProposal | null) => void;

  // Settings
  hermesSettings: Record<string, unknown> | null;
  loadSettings: () => Promise<void>;
  saveSettings: (data: Record<string, unknown>) => Promise<void>;
  testConnection: (data: Record<string, unknown>) => Promise<{ ok: boolean; message: string; latencyMs?: number }>;
  testLlmPrompt: (data: Record<string, unknown>) => Promise<{
    ok: boolean;
    output?: string;
    latencyMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    tokensPerSec?: number;
    model?: string;
    message?: string;
  }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const BASE = '/api/v1/hermes';

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  if (opts.body && typeof opts.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE}${path}`, { credentials: 'include', ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

let _idCounter = 0;
function tempId() { return `tmp-${++_idCounter}-${Date.now()}`; }

// ── Store ──────────────────────────────────────────────────────────────────────

export const useHermesStore = create<HermesState>()(
  persist(
    (set, get) => ({
      // Drawer
      isDrawerOpen: false,
      toggleDrawer: () => set((s) => ({ isDrawerOpen: !s.isDrawerOpen })),
      openDrawer: () => set({ isDrawerOpen: true }),
      closeDrawer: () => set({ isDrawerOpen: false }),

      // Mode
      mode: 'global',
      workspaceContext: null,
      setWorkspaceContext: (ctx) => set({ workspaceContext: ctx, mode: ctx ? 'workspace' : 'global' }),
      attachWorkspace: (ctx) => set({ workspaceContext: ctx, mode: 'workspace' }),
      detachWorkspace: () => set({ workspaceContext: null, mode: 'global' }),

      // Sessions
      sessions: [],
      activeSessionId: null,
      setActiveSession: (id) => {
        set({ activeSessionId: id, messages: [] });
        if (id) get().loadMessages(id);
      },

      loadSessions: async (projectId) => {
        try {
          const url = projectId ? `/sessions?projectId=${projectId}` : '/sessions';
          const sessions = await apiFetch<HermesSession[]>(url);
          set({ sessions });
        } catch (err) {
          console.warn('[Hermes] Failed to load sessions:', err);
        }
      },

      createSession: async (opts = {}) => {
        const ctx = get().workspaceContext;
        const session = await apiFetch<HermesSession>('/sessions', {
          method: 'POST',
          body: JSON.stringify({
            title: opts.title ?? 'New Conversation',
            projectId: opts.projectId ?? ctx?.projectId ?? null,
            contextSnapshot: ctx ?? null,
          }),
        });
        set((s) => ({ sessions: [session, ...s.sessions], activeSessionId: session.id, messages: [] }));
        return session;
      },

      deleteSession: async (id, permanent = true) => {
        await apiFetch(`/sessions/${id}${permanent ? '?permanent=true' : ''}`, {
          method: 'DELETE',
        });
        const activeId = get().activeSessionId;
        set((s) => ({
          sessions: s.sessions.filter((session) => session.id !== id),
          activeSessionId: activeId === id ? null : activeId,
          messages: activeId === id ? [] : s.messages,
        }));
      },

      // Messages
      messages: [],
      loadMessages: async (sessionId) => {
        try {
          const messages = await apiFetch<HermesMessage[]>(`/sessions/${sessionId}/messages`);
          set({ messages });
        } catch (err) {
          console.warn('[Hermes] Failed to load messages:', err);
        }
      },

      appendMessage: (msg) => {
        const id = msg.id ?? tempId();
        const full: HermesMessage = {
          id,
          sessionId: get().activeSessionId ?? '',
          role: msg.role,
          content: msg.content,
          toolCalls: msg.toolCalls,
          createdAt: msg.createdAt ?? new Date().toISOString(),
          streaming: msg.streaming,
        };
        set((s) => ({ messages: [...s.messages, full] }));
        return id;
      },

      updateMessage: (id, patch) => {
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        }));
      },

      // Streaming
      streamingMessageId: null,
      isStreaming: false,
      abortController: null,

      cancelStream: () => {
        get().abortController?.abort();
        set((s) => ({
          isStreaming: false,
          streamingMessageId: null,
          messages: s.messages.map((m) =>
            m.streaming ? { ...m, streaming: false } : m,
          ),
        }));
      },

      sendMessage: async (content) => {
        const { activeSessionId, workspaceContext, createSession } = get();

        // Auto-create session if none active
        let sessionId = activeSessionId;
        if (!sessionId) {
          const session = await createSession();
          sessionId = session.id;
        }

        // Add user message optimistically
        get().appendMessage({ role: 'user', content, createdAt: new Date().toISOString() });

        // Add streaming assistant placeholder
        const assistantTmpId = get().appendMessage({
          role: 'assistant',
          content: '',
          streaming: true,
          createdAt: new Date().toISOString(),
        });

        const abortController = new AbortController();
        set({ isStreaming: true, streamingMessageId: assistantTmpId, abortController });

        try {
          const response = await fetch(`${BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              sessionId,
              message: content,
              context: workspaceContext ?? undefined,
            }),
            signal: abortController.signal,
          });

          if (!response.ok || !response.body) {
            const err = await response.json().catch(() => ({ error: 'Stream failed' }));
            get().updateMessage(assistantTmpId, {
              content: (err as { error?: string }).error ?? 'Failed to get response',
              streaming: false,
            });
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let accContent = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('event: ')) continue; // skip event name lines
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6);

              // Determine event type from previous line (simple parse)
              try {
                const data = JSON.parse(raw);

                if (data.content !== undefined) {
                  // delta
                  accContent += data.content;
                  get().updateMessage(assistantTmpId, { content: accContent });
                } else if (data.toolCallId !== undefined) {
                  // tool_result
                  get().updateMessage(assistantTmpId, {
                    toolCalls: (get().messages.find((m) => m.id === assistantTmpId)?.toolCalls ?? []).map(
                      (tc) => tc.id === data.toolCallId ? { ...tc, status: data.status, output: data.output } : tc,
                    ),
                  });
                  // Remove from pending approvals
                  set((s) => ({
                    pendingApprovals: s.pendingApprovals.filter((p) => p.toolCallId !== data.toolCallId),
                  }));
                } else if (data.name !== undefined && data.status === 'pending') {
                  // tool_call needing approval
                  get().updateMessage(assistantTmpId, {
                    toolCalls: [
                      ...(get().messages.find((m) => m.id === assistantTmpId)?.toolCalls ?? []),
                      data,
                    ],
                  });
                  if (data.status === 'pending') {
                    set((s) => ({
                      pendingApprovals: [
                        ...s.pendingApprovals,
                        { toolCallId: data.id, command: (data.args as { command?: string })?.command ?? '', messageId: assistantTmpId },
                      ],
                    }));
                  }
                } else if (data.sessionId !== undefined) {
                  // end event
                  get().updateMessage(assistantTmpId, { streaming: false });
                } else if (data.message !== undefined) {
                  // error event
                  get().updateMessage(assistantTmpId, { content: `Error: ${data.message}`, streaming: false });
                }
              } catch {
                // malformed SSE line
              }
            }
          }
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            get().updateMessage(assistantTmpId, {
              content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
              streaming: false,
            });
          }
        } finally {
          get().updateMessage(assistantTmpId, { streaming: false });
          set({ isStreaming: false, streamingMessageId: null, abortController: null });
        }
      },

      // Tool approvals
      pendingApprovals: [],
      approveToolCall: async (toolCallId, approved) => {
        await apiFetch('/tool/approve', {
          method: 'POST',
          body: JSON.stringify({ toolCallId, approved }),
        });
        set((s) => ({
          pendingApprovals: s.pendingApprovals.filter((p) => p.toolCallId !== toolCallId),
        }));
      },

      // Diff
      diffProposal: null,
      setDiffProposal: (proposal) => set({ diffProposal: proposal }),

      // Settings
      hermesSettings: null,
      loadSettings: async () => {
        try {
          const settings = await apiFetch<Record<string, unknown>>('/settings');
          set({ hermesSettings: settings });
        } catch (err) {
          console.warn('[Hermes] Failed to load settings:', err);
        }
      },
      saveSettings: async (data) => {
        const settings = await apiFetch<Record<string, unknown>>('/settings', {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        set({ hermesSettings: settings });
      },
      testConnection: async (data) => {
        return apiFetch<{ ok: boolean; message: string; latencyMs?: number }>('/settings/test', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      },
      testLlmPrompt: async (data) => {
        return apiFetch<{
          ok: boolean;
          output?: string;
          latencyMs?: number;
          promptTokens?: number;
          completionTokens?: number;
          tokensPerSec?: number;
          model?: string;
          message?: string;
        }>('/settings/test-prompt', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      },
    }),
    {
      name: 'hermes-store',
      partialize: (s) => ({
        isDrawerOpen: s.isDrawerOpen,
        activeSessionId: s.activeSessionId,
        mode: s.mode,
      }),
    },
  ),
);
