/**
 * HermesDrawer — Universal floating AI assistant panel
 *
 * Features:
 *  - 420px sliding panel (right side), 60FPS CSS transform animation
 *  - Global Mode (🌐) / Workspace Mode (📂) context badge
 *  - Session management sidebar
 *  - Streaming chat with markdown-like rendering
 *  - ToolExecutionCard integration for agent actions
 *  - Attach / Detach workspace context toggle
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Plus, Globe, FolderOpen, Cpu, Send, StopCircle, Trash2,
  MessageSquare, ChevronLeft, Bot, Paperclip, PaperclipIcon,
} from 'lucide-react';
import { useHermesStore } from '../../store/hermesStore';
import { api, type Project } from '../../api/client';
import ToolExecutionCard from './ToolExecutionCard';
import HermesDiffViewer from './HermesDiffViewer';

// ── Simple markdown renderer ───────────────────────────────────────────────────
function renderMarkdown(text: string): string {
  return text
    // Code blocks
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="hermes-code-block"><code class="lang-${lang}">${escapeHtml(code.trim())}</code></pre>`,
    )
    // Inline code
    .replace(/`([^`]+)`/g, (_, code) => `<code class="hermes-inline-code">${escapeHtml(code)}</code>`)
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="hermes-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="hermes-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="hermes-h1">$1</h1>')
    // Lists
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>(\n|$))+/g, (m) => `<ul class="hermes-list">${m}</ul>`)
    // Line breaks
    .replace(/\n\n/g, '</p><p class="hermes-para">')
    .replace(/\n/g, '<br/>');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Drawer Component ───────────────────────────────────────────────────────────

export default function HermesDrawer() {
  const {
    isDrawerOpen, closeDrawer,
    mode, workspaceContext, attachWorkspace, detachWorkspace,
    sessions, activeSessionId, setActiveSession, loadSessions, createSession, deleteSession,
    messages, sendMessage, isStreaming, cancelStream,
    diffProposal, setDiffProposal,
  } = useHermesStore();

  const [input, setInput] = useState('');
  const [showSessions, setShowSessions] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessionToDelete, setSessionToDelete] = useState<(typeof sessions)[number] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load sessions and projects list when drawer opens
  useEffect(() => {
    if (isDrawerOpen) {
      loadSessions(workspaceContext?.projectId);
      api.projects.list()
        .then((list) => setProjects(list || []))
        .catch((err) => console.warn('[Hermes] Failed to load projects:', err));
    }
  }, [isDrawerOpen, workspaceContext?.projectId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [input]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    // Ensure a session exists
    if (!activeSessionId) {
      await createSession();
    }

    setInput('');
    await sendMessage(text);
  }, [input, isStreaming, activeSessionId, createSession, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const contextBadge = mode === 'workspace' && workspaceContext
    ? `📂 ${workspaceContext.projectName ?? workspaceContext.projectId}${workspaceContext.gitBranch ? ` · ${workspaceContext.gitBranch}` : ''}`
    : '🌐 Global Assistant';

  const DRAWER_WIDTH = 420;

  if (!isDrawerOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={closeDrawer}
        style={{
          position: 'fixed', inset: 0, zIndex: 800,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(2px)',
          animation: 'hermes-fade-in 0.2s ease',
        }}
      />

      {/* Drawer Panel */}
      <div
        id="hermes-drawer"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: DRAWER_WIDTH,
          zIndex: 850,
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
          animation: 'hermes-slide-in 0.25s cubic-bezier(0.16,1,0.3,1)',
          willChange: 'transform',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px',
          background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(6,182,212,0.08))',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={17} style={{ color: '#fff' }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Hermes AI</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {contextBadge}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {/* Sessions toggle */}
            <button
              type="button"
              title={showSessions ? 'Back to chat' : 'Sessions'}
              onClick={() => setShowSessions((v) => !v)}
              style={iconBtn(showSessions)}
            >
              {showSessions ? <ChevronLeft size={15} /> : <MessageSquare size={15} />}
            </button>

            {/* New session */}
            <button
              type="button"
              title="New conversation"
              onClick={() => createSession()}
              style={iconBtn(false)}
            >
              <Plus size={15} />
            </button>

            {/* Close */}
            <button type="button" title="Close" onClick={closeDrawer} style={iconBtn(false)}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Context Bar / Target Workspace Selector ─────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px',
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>
            📂 Target Workspace:
          </span>
          <select
            id="hermes-workspace-select"
            value={workspaceContext?.projectId || ''}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) {
                detachWorkspace();
              } else {
                const selected = projects.find((p) => p.id === val);
                if (selected) {
                  attachWorkspace({
                    projectId: selected.id,
                    projectName: selected.name,
                    workspaceRoot: `/workspaces/${selected.id}`,
                    gitBranch: selected.defaultBranch || 'main',
                  });
                }
              }
            }}
            style={{
              flex: 1, minWidth: 0,
              fontSize: 11,
              padding: '4px 8px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">🌐 None (Global Assistant)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                📁 {p.name}
              </option>
            ))}
          </select>
          {workspaceContext?.projectId && (
            <button
              type="button"
              onClick={detachWorkspace}
              style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 4, color: 'var(--danger)', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Detach
            </button>
          )}
        </div>

        {/* ── Sessions Panel ───────────────────────────────────────────────── */}
        {showSessions && (
          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>
              Conversations
            </div>
            {sessions.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>
                No sessions yet
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { setActiveSession(s.id); setShowSessions(false); }}
                  style={{
                    padding: '10px 12px', borderRadius: 'var(--radius-md)',
                    background: s.id === activeSessionId ? 'rgba(124,58,237,0.1)' : 'transparent',
                    border: `1px solid ${s.id === activeSessionId ? 'rgba(124,58,237,0.3)' : 'transparent'}`,
                    cursor: 'pointer', marginBottom: 4,
                    display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: s.projectId ? 'var(--success)' : 'var(--text-muted)',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.title}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {s.projectId ? '📂 Workspace' : '🌐 Global'}
                    </div>
                  </div>
                  <button
                    type="button"
                    title="Delete session permanently"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSessionToDelete(s);
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', padding: '4px 6px', borderRadius: 4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'color 0.15s, background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--danger)';
                      e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-muted)';
                      e.currentTarget.style.background = 'none';
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Messages ─────────────────────────────────────────────────────── */}
        {!showSessions && (
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.length === 0 && !activeSessionId && (
              <WelcomeScreen onNewSession={() => createSession()} mode={mode} />
            )}

            {messages.map((msg) => (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* User message */}
                {msg.role === 'user' && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{
                      maxWidth: '85%', padding: '8px 12px',
                      background: 'var(--accent-1)',
                      borderRadius: '12px 12px 4px 12px',
                      fontSize: 13, lineHeight: 1.5, color: '#fff',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {msg.content}
                    </div>
                  </div>
                )}

                {/* Assistant message */}
                {msg.role === 'assistant' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 6, flexShrink: 0, marginTop: 2,
                      background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Bot size={13} style={{ color: '#fff' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Tool calls */}
                      {(msg.toolCalls ?? []).map((tc) => (
                        <ToolExecutionCard key={tc.id} toolCall={tc} messageId={msg.id} />
                      ))}

                      {/* Text content */}
                      {msg.content && (
                        <div
                          className="hermes-message-content"
                          style={{
                            fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)',
                            wordBreak: 'break-word',
                          }}
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                        />
                      )}

                      {/* Streaming cursor */}
                      {msg.streaming && (
                        <span style={{
                          display: 'inline-block', width: 8, height: 14,
                          background: 'var(--accent-1)',
                          animation: 'hermes-cursor 1s step-end infinite',
                          marginLeft: 2, verticalAlign: 'text-bottom',
                        }} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>
        )}

        {/* ── Input ────────────────────────────────────────────────────────── */}
        {!showSessions && (
          <div style={{
            padding: '12px 14px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            flexShrink: 0,
          }}>
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-end',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '8px 12px',
              transition: 'border-color 0.2s',
            }}>
              <textarea
                ref={textareaRef}
                id="hermes-chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={mode === 'workspace' ? 'Ask Hermes about your workspace...' : 'Ask Hermes anything...'}
                rows={1}
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  resize: 'none', fontSize: 13, color: 'var(--text-primary)',
                  lineHeight: 1.5, minHeight: 22, maxHeight: 120,
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {isStreaming ? (
                  <button
                    type="button"
                    title="Stop generating"
                    onClick={cancelStream}
                    style={{
                      padding: '6px', background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      borderRadius: 'var(--radius-sm)', color: 'var(--danger)', cursor: 'pointer',
                    }}
                  >
                    <StopCircle size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    id="hermes-send-btn"
                    title="Send (Enter)"
                    onClick={handleSend}
                    disabled={!input.trim()}
                    style={{
                      padding: '6px', background: input.trim() ? 'var(--accent-1)' : 'var(--bg-overlay)',
                      border: 'none', borderRadius: 'var(--radius-sm)',
                      color: input.trim() ? '#fff' : 'var(--text-muted)',
                      cursor: input.trim() ? 'pointer' : 'default',
                      transition: 'background 0.15s',
                    }}
                  >
                    <Send size={15} />
                  </button>
                )}
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
              Enter to send · Shift+Enter for newline · Ctrl+Shift+H to toggle
            </div>
          </div>
        )}
      </div>

      {/* Permanent Delete Confirmation Modal */}
      {sessionToDelete && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 990,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
            animation: 'hermes-fade-in 0.15s ease',
          }}
          onClick={() => !isDeleting && setSessionToDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 360,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 20,
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--danger)', flexShrink: 0,
              }}>
                <Trash2 size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Delete Conversation
                </h3>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                  Permanent removal
                </p>
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete <strong style={{ color: 'var(--text-primary)' }}>"{sessionToDelete.title}"</strong>?
              All messages, tool logs, and offloaded S3 artifacts will be permanently deleted. This action cannot be undone.
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setSessionToDelete(null)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await deleteSession(sessionToDelete.id, true);
                    setSessionToDelete(null);
                  } catch (err) {
                    console.error('[Hermes] Failed to delete session:', err);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="btn btn-danger btn-sm"
              >
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diff Viewer overlay */}
      {diffProposal && <HermesDiffViewer proposal={diffProposal} />}
    </>,
    document.body,
  );
}

// ── Welcome Screen ────────────────────────────────────────────────────────────

function WelcomeScreen({ onNewSession, mode }: { onNewSession: () => void; mode: string }) {
  const suggestions = mode === 'workspace'
    ? [
        'Refactor the active file for better performance',
        'Write unit tests for the current module',
        'Explain what this file does',
        'Find and fix bugs in this workspace',
      ]
    : [
        'Draft a technical design document',
        'Explain OAuth 2.0 PKCE flow',
        'Write a regex for email validation',
        'Compare REST vs. GraphQL APIs',
      ];

  const { sendMessage, createSession } = useHermesStore();

  const handleSuggestion = async (text: string) => {
    await createSession();
    sendMessage(text);
  };

  return (
    <div style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, margin: '0 auto 12px',
          background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.2))',
          border: '1px solid rgba(124,58,237,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Cpu size={26} style={{ color: 'var(--text-accent)' }} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Hermes AI Agent
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {mode === 'workspace'
            ? 'Workspace context attached. I can read files, run commands, and propose edits.'
            : 'Global mode. Open a workspace to enable file and terminal capabilities.'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 2 }}>
          Try asking...
        </div>
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => handleSuggestion(s)}
            style={{
              textAlign: 'left', padding: '9px 12px', fontSize: 12,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all 0.15s',
              lineHeight: 1.4,
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Icon Button Style ─────────────────────────────────────────────────────────
function iconBtn(active: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 6,
    background: active ? 'rgba(124,58,237,0.15)' : 'transparent',
    border: `1px solid ${active ? 'rgba(124,58,237,0.3)' : 'transparent'}`,
    color: active ? 'var(--text-accent)' : 'var(--text-muted)',
    cursor: 'pointer', transition: 'all 0.15s',
  };
}
