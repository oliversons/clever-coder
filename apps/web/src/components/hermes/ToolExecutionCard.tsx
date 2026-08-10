/**
 * ToolExecutionCard — renders different card variants for Hermes tool calls
 *
 * Variants:
 *  - read_file  → blue info card with file path
 *  - write_file → purple diff proposal card
 *  - shell_exec (pending)   → yellow approval card with approve/reject
 *  - shell_exec (completed) → green output card with collapsible terminal
 *  - web_search → teal search result card
 */

import { useState } from 'react';
import { File, Terminal, Check, X, ChevronDown, ChevronRight, Globe, FileEdit } from 'lucide-react';
import { useHermesStore, type ToolCall } from '../../store/hermesStore';

interface Props {
  toolCall: ToolCall;
  messageId: string;
}

export default function ToolExecutionCard({ toolCall, messageId }: Props) {
  const { approveToolCall } = useHermesStore();
  const [outputExpanded, setOutputExpanded] = useState(false);
  const [approving, setApproving] = useState(false);

  const handleApprove = async (approved: boolean) => {
    setApproving(true);
    try {
      await approveToolCall(toolCall.id, approved);
    } finally {
      setApproving(false);
    }
  };

  // ── read_file ────────────────────────────────────────────────────────────────
  if (toolCall.name === 'read_file') {
    const filePath = (toolCall.args as { path?: string }).path ?? '';
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px',
        background: 'rgba(59,130,246,0.08)',
        border: '1px solid rgba(59,130,246,0.25)',
        borderRadius: 'var(--radius-md)',
        margin: '4px 0',
      }}>
        <File size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600, letterSpacing: '0.05em' }}>READING FILE</div>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filePath}</div>
        </div>
        <StatusBadge status={toolCall.status} />
      </div>
    );
  }

  // ── write_file ───────────────────────────────────────────────────────────────
  if (toolCall.name === 'write_file') {
    const { path: filePath, content, originalContent } = toolCall.args as { path?: string; content?: string; originalContent?: string };
    const { setDiffProposal } = useHermesStore.getState();
    return (
      <div style={{
        padding: '8px 12px',
        background: 'rgba(139,92,246,0.08)',
        border: '1px solid rgba(139,92,246,0.25)',
        borderRadius: 'var(--radius-md)',
        margin: '4px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <FileEdit size={14} style={{ color: '#8b5cf6' }} />
          <div>
            <div style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600, letterSpacing: '0.05em' }}>PROPOSING FILE EDIT</div>
            <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{filePath}</div>
          </div>
          <StatusBadge status={toolCall.status} />
        </div>
        {toolCall.status === 'pending' && (
          <button
            type="button"
            onClick={() => setDiffProposal({
              filePath: filePath ?? '',
              originalContent: originalContent ?? '',
              proposedContent: content ?? '',
              messageId,
              toolCallId: toolCall.id,
            })}
            style={{
              fontSize: 12, padding: '4px 10px',
              background: 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.4)',
              borderRadius: 'var(--radius-sm)',
              color: '#8b5cf6', cursor: 'pointer',
            }}
          >
            Review Diff →
          </button>
        )}
        {toolCall.status === 'completed' && (
          <div style={{ fontSize: 12, color: 'var(--success)' }}>✓ {toolCall.output}</div>
        )}
      </div>
    );
  }

  // ── web_search ───────────────────────────────────────────────────────────────
  if (toolCall.name === 'web_search') {
    const { query } = toolCall.args as { query?: string };
    return (
      <div style={{
        padding: '8px 12px',
        background: 'rgba(20,184,166,0.08)',
        border: '1px solid rgba(20,184,166,0.25)',
        borderRadius: 'var(--radius-md)',
        margin: '4px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Globe size={14} style={{ color: '#14b8a6' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#14b8a6', fontWeight: 600, letterSpacing: '0.05em' }}>WEB SEARCH</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>{query}</div>
          </div>
          <StatusBadge status={toolCall.status} />
        </div>
        {toolCall.output && toolCall.status === 'completed' && (
          <div style={{
            marginTop: 8, fontSize: 12, color: 'var(--text-secondary)',
            lineHeight: 1.5, maxHeight: 100, overflow: 'hidden',
            maskImage: 'linear-gradient(to bottom, black 70%, transparent)',
          }}>
            {toolCall.output}
          </div>
        )}
      </div>
    );
  }

  // ── shell_exec ───────────────────────────────────────────────────────────────
  const { command } = toolCall.args as { command?: string };
  const isPending = toolCall.status === 'pending';
  const isCompleted = toolCall.status === 'completed' || toolCall.status === 'error';
  const isRejected = toolCall.status === 'rejected';

  return (
    <div style={{
      padding: '10px 12px',
      background: isPending
        ? 'rgba(234,179,8,0.08)'
        : isRejected
        ? 'rgba(239,68,68,0.06)'
        : 'rgba(34,197,94,0.06)',
      border: `1px solid ${isPending ? 'rgba(234,179,8,0.3)' : isRejected ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
      borderRadius: 'var(--radius-md)',
      margin: '4px 0',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isPending || isCompleted ? 8 : 0 }}>
        <Terminal size={14} style={{ color: isPending ? '#eab308' : isRejected ? 'var(--danger)' : 'var(--success)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: isPending ? '#eab308' : isRejected ? 'var(--danger)' : 'var(--success)', fontWeight: 600, letterSpacing: '0.05em' }}>
            {isPending ? 'TERMINAL — APPROVAL NEEDED' : isRejected ? 'TERMINAL — REJECTED' : 'TERMINAL — EXECUTED'}
          </div>
          <code style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
            {command}
          </code>
        </div>
        <StatusBadge status={toolCall.status} />
      </div>

      {/* Approval Buttons */}
      {isPending && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            disabled={approving}
            onClick={() => handleApprove(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 12px', fontSize: 12, fontWeight: 600,
              background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
              borderRadius: 'var(--radius-sm)', color: 'var(--success)', cursor: 'pointer',
            }}
          >
            <Check size={12} /> Approve
          </button>
          <button
            type="button"
            disabled={approving}
            onClick={() => handleApprove(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 12px', fontSize: 12, fontWeight: 600,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius-sm)', color: 'var(--danger)', cursor: 'pointer',
            }}
          >
            <X size={12} /> Reject
          </button>
        </div>
      )}

      {/* Terminal Output */}
      {isCompleted && toolCall.output && (
        <div style={{ marginTop: 4 }}>
          <button
            type="button"
            onClick={() => setOutputExpanded((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 11, padding: '2px 0',
            }}
          >
            {outputExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {outputExpanded ? 'Hide output' : 'Show output'}
          </button>
          {outputExpanded && (
            <pre style={{
              marginTop: 6, padding: 10,
              background: 'var(--bg-overlay)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11.5, fontFamily: 'var(--font-mono)',
              color: toolCall.status === 'error' ? 'var(--danger)' : 'var(--text-secondary)',
              maxHeight: 200, overflow: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {toolCall.output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ToolCall['status'] }) {
  const map: Record<ToolCall['status'], { label: string; color: string }> = {
    pending: { label: 'Pending', color: '#eab308' },
    approved: { label: 'Approved', color: 'var(--success)' },
    rejected: { label: 'Rejected', color: 'var(--danger)' },
    completed: { label: 'Done', color: 'var(--success)' },
    error: { label: 'Error', color: 'var(--danger)' },
  };
  const { label, color } = map[status] ?? { label: status, color: 'var(--text-muted)' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
      padding: '2px 6px', borderRadius: 4,
      background: `${color}20`, color,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {label}
    </span>
  );
}
