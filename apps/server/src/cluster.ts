/**
 * cluster.ts — Multi-Core Cluster Entry Point
 *
 * Forks one worker per CPU core. Each worker runs the full Fastify server.
 * Stateful singletons (gateway daemon, Hermes WebUI, workspace watchers) are
 * started only in the PRIMARY process and shared via IPC + shared ports.
 *
 * Architecture on a 12-core 2XL instance:
 *   - 1 Primary process: manages worker lifecycle, starts gateway daemon
 *   - 11 Worker processes: handle HTTP/WS traffic in parallel
 */

import cluster from 'node:cluster';
import os from 'node:os';
import process from 'node:process';

// ── Runtime tuning — must be set before any I/O libraries load ──────────────
const numCPUs = os.availableParallelism?.() ?? os.cpus().length;

// Libuv async threadpool: 2× CPUs so file I/O, crypto, dns never queue behind each other
process.env.UV_THREADPOOL_SIZE ??= String(Math.min(numCPUs * 2, 128));

// Tell Go runtimes (hermes-agent, rclone) to use all available cores
process.env.GOMAXPROCS ??= String(numCPUs);

// V8 heap: use 60% of available RAM, leaving headroom for OS + Python + Go processes
const totalRamMb = Math.floor(os.totalmem() / 1024 / 1024);
const heapMb = Math.floor(totalRamMb * 0.6);
process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS ?? '')
  .replace(/--max-old-space-size=\d+/g, '')
  .trim() + ` --max-old-space-size=${heapMb}`;

if (cluster.isPrimary) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  CleverCoder — Multi-Core Cluster                            ║
║  CPUs: ${String(numCPUs).padEnd(4)} │ Heap: ${String(heapMb).padEnd(6)} MB │ RAM: ${String(totalRamMb).padEnd(6)} MB   ║
║  UV_THREADPOOL_SIZE: ${String(process.env.UV_THREADPOOL_SIZE).padEnd(4)} │ GOMAXPROCS: ${String(process.env.GOMAXPROCS).padEnd(4)}       ║
╚══════════════════════════════════════════════════════════════╝
  `);

  // ── Start gateway daemon ONCE on the primary (avoids duplicate daemons) ──
  // Workers inherit env but don't start their own gateway
  process.env.CLUSTER_PRIMARY = '1';

  // Fork one worker per CPU core
  // Reserve 1 core for the primary + OS overhead on very small instances
  const workerCount = numCPUs > 2 ? numCPUs - 1 : numCPUs;
  console.log(`[cluster] Primary PID ${process.pid} — forking ${workerCount} workers`);

  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  // Auto-restart crashed workers
  cluster.on('exit', (worker, code, signal) => {
    const reason = signal ?? `exit code ${code}`;
    console.warn(`[cluster] Worker ${worker.process.pid} died (${reason}) — restarting...`);
    // Small delay to avoid restart storms on systematic failures
    setTimeout(() => cluster.fork(), 500);
  });

  cluster.on('online', (worker) => {
    console.log(`[cluster] Worker ${worker.process.pid} online (${Object.keys(cluster.workers ?? {}).length}/${workerCount} active)`);
  });

  // Start gateway & browser daemons on primary only
  import('./services/hermes-gateway.service.js')
    .then(({ startGateway }) => startGateway())
    .catch((err) => console.warn('[cluster] Gateway auto-start notice:', err?.message));

  import('./services/hermes-browser.service.js')
    .then(({ ensureCamofoxDaemonRunning }) => ensureCamofoxDaemonRunning())
    .catch((err) => console.warn('[cluster] Camofox auto-start notice:', err?.message));
} else {
  // Worker process — run the full server application
  // Don't start gateway in workers (primary handles it)
  process.env.CLUSTER_WORKER = String(process.pid);
  import('./index.js').catch((err) => {
    console.error(`[cluster-worker ${process.pid}] Fatal:`, err);
    process.exit(1);
  });
}
