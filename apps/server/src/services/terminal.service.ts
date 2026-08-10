import { spawn } from 'child_process';
import { join } from 'path';
import { config } from '../config.js';
import type { WebSocket } from 'ws';
import { existsSync, mkdirSync } from 'fs';

export interface TerminalSession {
  id: string;
  projectId: string;
  pty?: ReturnType<typeof import('node-pty').spawn>;
}

const sessions = new Map<string, TerminalSession>();

export async function createTerminalSession(
  projectId: string,
  ws: WebSocket,
): Promise<void> {
  const workspacePath = join(config.WORKSPACES_ROOT, projectId);
  mkdirSync(workspacePath, { recursive: true });

  const sessionId = `${projectId}-${Date.now()}`;

  try {
    // Dynamic import node-pty (native module)
    const pty = await import('node-pty');
    const shell = process.env.SHELL ?? '/bin/bash';

    const ptyProc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: workspacePath,
      env: {
        ...process.env,
        HOME: workspacePath,
        TERM: 'xterm-256color',
      },
    });

    const session: TerminalSession = { id: sessionId, projectId, pty: ptyProc };
    sessions.set(sessionId, session);

    // PTY → WebSocket
    ptyProc.onData((data: string) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'output', data }));
      }
    });

    ptyProc.onExit(({ exitCode }: { exitCode: number }) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'exit', exitCode }));
        ws.close();
      }
      sessions.delete(sessionId);
    });

    // WebSocket → PTY
    ws.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString()) as
          | { type: 'input'; data: string }
          | { type: 'resize'; cols: number; rows: number };

        if (msg.type === 'input') {
          ptyProc.write(msg.data);
        } else if (msg.type === 'resize') {
          ptyProc.resize(msg.cols, msg.rows);
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      try {
        ptyProc.kill();
      } catch {
        // ignore kill error
      }
      sessions.delete(sessionId);
    });
  } catch (err) {
    console.error(`[terminal] Failed to spawn PTY session for ${projectId}:`, err);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        data: `Failed to initialize terminal session: ${err instanceof Error ? err.message : String(err)}`,
      }));
      ws.close(1011, 'Terminal initialization failed');
    }
  }
}

export async function runCommand(
  projectId: string,
  command: string,
): Promise<{ exitCode: number; output: string; duration: number }> {
  const workspacePath = join(config.WORKSPACES_ROOT, projectId);
  mkdirSync(workspacePath, { recursive: true });
  const start = Date.now();

  return new Promise((resolve) => {
    const proc = spawn('/bin/bash', ['-c', command], {
      cwd: workspacePath,
      env: { ...process.env, HOME: workspacePath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    proc.stdout.on('data', (d: Buffer) => (output += d.toString()));
    proc.stderr.on('data', (d: Buffer) => (output += d.toString()));

    proc.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? -1, output, duration: Date.now() - start });
    });
    proc.on('error', (err) => {
      resolve({ exitCode: 1, output: err.message, duration: Date.now() - start });
    });
  });
}
