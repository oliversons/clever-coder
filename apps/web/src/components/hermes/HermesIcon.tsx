/** Small Hermes bot icon trigger button */
import { Bot } from 'lucide-react';
import { useHermesStore } from '../../store/hermesStore';

interface HermesIconProps {
  compact?: boolean;
}

export default function HermesIcon({ compact = false }: HermesIconProps) {
  const { toggleDrawer, isDrawerOpen, isStreaming } = useHermesStore();

  return (
    <button
      id="hermes-trigger-btn"
      type="button"
      onClick={toggleDrawer}
      title="Open Hermes AI Agent (Ctrl+Shift+H)"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 0 : 8,
        padding: compact ? '7px' : '7px 12px',
        background: isDrawerOpen
          ? 'var(--accent-1)'
          : 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(6,182,212,0.15))',
        border: `1px solid ${isDrawerOpen ? 'var(--accent-1)' : 'rgba(124,58,237,0.3)'}`,
        borderRadius: 'var(--radius-md)',
        color: isDrawerOpen ? '#fff' : 'var(--text-accent)',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
        transition: 'all 0.2s ease',
        position: 'relative',
        whiteSpace: 'nowrap',
      }}
    >
      {/* Pulse indicator when streaming */}
      {isStreaming && (
        <span style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: 'var(--success)',
          animation: 'hermes-pulse 1.5s infinite',
        }} />
      )}
      <Bot size={15} />
      {!compact && <span>Hermes</span>}
    </button>
  );
}
