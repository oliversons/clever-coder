/**
 * HermesDiffViewer — Monaco side-by-side diff editor for file patch review
 *
 * Lazy-loaded to keep the main bundle lean.
 * Renders original vs. proposed file content with Accept / Discard controls.
 */

import { Suspense, lazy } from 'react';
import { X, Check, FileEdit } from 'lucide-react';
import { useHermesStore, type DiffProposal } from '../../store/hermesStore';

const DiffEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.DiffEditor })),
);

interface Props {
  proposal: DiffProposal;
}

export default function HermesDiffViewer({ proposal }: Props) {
  const { setDiffProposal, approveToolCall } = useHermesStore();
  const { theme } = { theme: 'dark' }; // default dark; could pull from themeStore

  const handleAccept = async () => {
    // Approve the write_file tool call
    await approveToolCall(proposal.toolCallId, true);
    setDiffProposal(null);
  };

  const handleDiscard = async () => {
    await approveToolCall(proposal.toolCallId, false);
    setDiffProposal(null);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 900,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-base)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <FileEdit size={18} style={{ color: '#8b5cf6' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            Review Proposed Changes
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {proposal.filePath}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleDiscard}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', fontSize: 13, fontWeight: 600,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 'var(--radius-md)', color: 'var(--danger)', cursor: 'pointer',
            }}
          >
            <X size={14} /> Discard
          </button>
          <button
            type="button"
            onClick={handleAccept}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', fontSize: 13, fontWeight: 600,
              background: 'var(--accent-1)', border: 'none',
              borderRadius: 'var(--radius-md)', color: '#fff', cursor: 'pointer',
            }}
          >
            <Check size={14} /> Accept Patch
          </button>
          <button
            type="button"
            onClick={() => setDiffProposal(null)}
            style={{
              padding: '7px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 24, padding: '8px 20px',
        background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)',
        fontSize: 12, color: 'var(--text-muted)',
      }}>
        <span>← <strong>Original</strong> (current file)</span>
        <span>→ <strong>Proposed</strong> (Hermes edit)</span>
      </div>

      {/* Monaco Diff Editor */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            Loading diff editor...
          </div>
        }>
          <DiffEditor
            height="100%"
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            original={proposal.originalContent}
            modified={proposal.proposedContent}
            language={detectLanguage(proposal.filePath)}
            options={{
              renderSideBySide: true,
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              lineNumbers: 'on',
              wordWrap: 'on',
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
    css: 'css', scss: 'scss', html: 'html', json: 'json', yaml: 'yaml',
    yml: 'yaml', md: 'markdown', sh: 'shell', bash: 'shell',
    sql: 'sql', toml: 'toml', dockerfile: 'dockerfile',
  };
  return map[ext] ?? 'plaintext';
}
