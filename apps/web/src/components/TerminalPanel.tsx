import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface TerminalPanelProps {
  projectId: string;
}

export default function TerminalPanel({ projectId }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Init terminal
    const term = new XTerm({
      theme: {
        background: '#0a0c14',
        foreground: '#f0f4ff',
        cursor: '#7c3aed',
        selectionBackground: 'rgba(124,58,237,0.3)',
        black: '#1e2535',
        brightBlack: '#4f5a73',
        red: '#ef4444', brightRed: '#f87171',
        green: '#10b981', brightGreen: '#34d399',
        yellow: '#f59e0b', brightYellow: '#fbbf24',
        blue: '#3b82f6', brightBlue: '#60a5fa',
        magenta: '#a855f7', brightMagenta: '#c084fc',
        cyan: '#06b6d4', brightCyan: '#22d3ee',
        white: '#8b95b0', brightWhite: '#f0f4ff',
      },
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    const links = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // WebSocket connection
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/api/v1/projects/${projectId}/terminal`);
    wsRef.current = ws;

    ws.onopen = () => {
      term.write('\r\n\x1b[32m● Connected to workspace terminal\x1b[0m\r\n\r\n');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output') term.write(msg.data);
        if (msg.type === 'exit') term.write(`\r\n\x1b[31mProcess exited with code ${msg.exitCode}\x1b[0m\r\n`);
        if (msg.type === 'error') term.write(`\r\n\x1b[31m${msg.data}\x1b[0m\r\n`);
      } catch {
        term.write(event.data);
      }
    };

    ws.onclose = () => {
      term.write('\r\n\x1b[33m● Connection closed\x1b[0m\r\n');
    };

    ws.onerror = () => {
      term.write('\r\n\x1b[31m● WebSocket error\x1b[0m\r\n');
    };

    // Terminal input → WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Resize handling
    const handleResize = () => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };

    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(containerRef.current);

    return () => {
      ws.close();
      term.dispose();
      resizeObs.disconnect();
    };
  }, [projectId]);

  return (
    <div className="terminal-wrapper" style={{ height: 500 }}>
      <div className="terminal-header">
        <div className="terminal-dot" style={{ background: '#ef4444' }} />
        <div className="terminal-dot" style={{ background: '#f59e0b' }} />
        <div className="terminal-dot" style={{ background: '#10b981' }} />
        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          bash — {projectId}
        </span>
      </div>
      <div className="terminal-body" style={{ height: 'calc(100% - 44px)', padding: 4 }}>
        <div ref={containerRef} style={{ height: '100%' }} />
      </div>
    </div>
  );
}
