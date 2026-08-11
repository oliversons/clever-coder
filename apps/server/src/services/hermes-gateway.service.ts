/**
 * Hermes Gateway & Cron Service
 *
 * Manages the background `hermes gateway` daemon process and cron job scheduling
 * on Clever Cloud containers, ensuring automatic 60-second cron ticks and seamless
 * job configuration.
 */

import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { syncHermesConfigFiles } from './hermes-webui.service.js';

const execAsync = promisify(exec);

export interface CronJobItem {
  id: string;
  name: string;
  schedule: string | { expression: string; tz?: string };
  schedule_display?: string;
  prompt?: string;
  script?: string;
  workdir?: string;
  enabled: boolean;
  state?: 'active' | 'paused' | 'completed' | 'error';
  no_agent?: boolean;
  deliver?: string;
  skills?: string[];
  model?: string;
  provider?: string;
  next_run_at?: string;
  last_run_at?: string;
  last_status?: string;
  last_error?: string;
  created_at?: string;
  updated_at?: string;
}

export interface GatewayStatus {
  active: boolean;
  pid?: number;
  status: 'running' | 'stopped' | 'error' | 'not_installed';
  info: string;
  uptime?: string;
  configured: boolean;
  lastTick?: string;
  jobsCount: number;
  activeJobsCount: number;
  logPath: string;
  recentLogs: string[];
}

function getHermesHome(): string {
  return process.env.HERMES_HOME || path.resolve(process.env.HOME || '/root', '.hermes');
}

function getGatewayLogPath(): string {
  const hermesHome = getHermesHome();
  const logDir = path.join(hermesHome, 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return path.join(logDir, 'gateway.log');
}

function getJobsJsonPath(): string {
  const hermesHome = getHermesHome();
  const cronDir = path.join(hermesHome, 'cron');
  if (!fs.existsSync(cronDir)) {
    fs.mkdirSync(cronDir, { recursive: true });
  }
  return path.join(cronDir, 'jobs.json');
}

function getGatewayStatePath(): string {
  return path.join(getHermesHome(), 'gateway_state.json');
}

function getGatewayPidPath(): string {
  return path.join(getHermesHome(), 'gateway.pid');
}

/**
 * Check if a PID is currently running on the system
 */
function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the latest lines from the gateway log file
 */
export function getGatewayRecentLogs(maxLines = 40): string[] {
  const logPath = getGatewayLogPath();
  if (!fs.existsSync(logPath)) {
    return [];
  }
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

/**
 * Get comprehensive Hermes Gateway daemon status
 */
export async function getGatewayStatus(): Promise<GatewayStatus> {
  const hermesHome = getHermesHome();
  const logPath = getGatewayLogPath();
  const pidPath = getGatewayPidPath();
  const statePath = getGatewayStatePath();
  const jobs = await listCronJobs();

  let activePid: number | undefined;
  let isRunning = false;
  let lastTick: string | undefined;

  // 1. Check PID file
  if (fs.existsSync(pidPath)) {
    try {
      const pidStr = fs.readFileSync(pidPath, 'utf8').trim();
      const pid = parseInt(pidStr, 10);
      if (!isNaN(pid) && isPidRunning(pid)) {
        activePid = pid;
        isRunning = true;
      }
    } catch {
      // ignore PID read errors
    }
  }

  // 2. Check system process table via pgrep if not confirmed yet
  if (!isRunning) {
    try {
      const { stdout } = await execAsync('pgrep -f "hermes.*gateway|hermes_cli.*gateway"');
      const pids = stdout.trim().split('\n').map((p) => parseInt(p.trim(), 10)).filter((p) => !isNaN(p));
      if (pids.length > 0) {
        activePid = pids[0];
        isRunning = true;
      }
    } catch {
      // pgrep exits 1 when no process matches
    }
  }

  // 3. Read gateway_state.json metadata
  if (fs.existsSync(statePath)) {
    try {
      const raw = fs.readFileSync(statePath, 'utf8');
      const stateObj = JSON.parse(raw);
      if (stateObj?.updated_at) {
        lastTick = stateObj.updated_at;
      }
    } catch {
      // ignore json parse error
    }
  }

  const activeJobs = jobs.filter((j) => j.enabled !== false);
  const recentLogs = getGatewayRecentLogs(30);

  return {
    active: isRunning,
    pid: activePid,
    status: isRunning ? 'running' : 'stopped',
    info: isRunning
      ? `Gateway daemon active (PID ${activePid}) — ticking scheduled jobs every 60s`
      : 'Gateway daemon is offline. Background cron ticks are inactive.',
    configured: true,
    lastTick,
    jobsCount: jobs.length,
    activeJobsCount: activeJobs.length,
    logPath,
    recentLogs,
  };
}

/**
 * Start the Hermes Gateway daemon in the background
 */
export async function startGateway(options?: { userId?: string }): Promise<{ success: boolean; message: string; pid?: number }> {
  try {
    const currentStatus = await getGatewayStatus();
    if (currentStatus.active && currentStatus.pid) {
      return {
        success: true,
        message: `Gateway daemon is already running (PID ${currentStatus.pid})`,
        pid: currentStatus.pid,
      };
    }

    const hermesHome = getHermesHome();
    const logPath = getGatewayLogPath();
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Ensure Hermes config files are fresh
    await syncHermesConfigFiles(options?.userId);

    // Initialize/update gateway_state.json
    const statePath = getGatewayStatePath();
    const nowIso = new Date().toISOString();
    try {
      fs.writeFileSync(
        statePath,
        JSON.stringify(
          {
            gateway_state: 'running',
            updated_at: nowIso,
            active_agents: 0,
            platforms: {},
          },
          null,
          2
        ),
        'utf8'
      );
    } catch {
      // ignore
    }

    // Attempt to launch via CLI or Python module
    const outFd = fs.openSync(logPath, 'a');
    let child;

    // Check if hermes command exists
    let useHermesCli = false;
    try {
      await execAsync('which hermes');
      useHermesCli = true;
    } catch {
      useHermesCli = false;
    }

    const env = {
      ...process.env,
      HERMES_HOME: hermesHome,
      PYTHONUNBUFFERED: '1',
    };

    if (useHermesCli) {
      child = spawn('hermes', ['gateway', 'start'], {
        detached: true,
        stdio: ['ignore', outFd, outFd],
        env,
      });
    } else {
      // Fallback to python3 -m hermes_cli or python3 -m gateway.status
      child = spawn('python3', ['-m', 'hermes_cli', 'gateway', 'start'], {
        detached: true,
        stdio: ['ignore', outFd, outFd],
        env,
      });
    }

    child.unref();

    if (child.pid) {
      const pidPath = getGatewayPidPath();
      fs.writeFileSync(pidPath, String(child.pid), 'utf8');
      console.log(`🚀 [Hermes Gateway] Daemon started with PID ${child.pid}, logging to ${logPath}`);
      return {
        success: true,
        message: `Gateway daemon started successfully (PID ${child.pid})`,
        pid: child.pid,
      };
    }

    return {
      success: true,
      message: 'Gateway launch command dispatched',
    };
  } catch (err: any) {
    console.error('❌ [Hermes Gateway] Failed to start gateway daemon:', err);
    return {
      success: false,
      message: err.message || 'Failed to start gateway daemon',
    };
  }
}

/**
 * Stop the Hermes Gateway daemon
 */
export async function stopGateway(): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Try hermes gateway stop
    try {
      await execAsync('hermes gateway stop || true');
    } catch {
      // ignore
    }

    // 2. Terminate any matching processes
    try {
      await execAsync('pkill -f "hermes.*gateway|hermes_cli.*gateway" || true');
    } catch {
      // ignore
    }

    // 3. Clean up PID file & mark state as stopped
    const pidPath = getGatewayPidPath();
    if (fs.existsSync(pidPath)) {
      try {
        fs.unlinkSync(pidPath);
      } catch {
        // ignore
      }
    }

    const statePath = getGatewayStatePath();
    try {
      fs.writeFileSync(
        statePath,
        JSON.stringify(
          {
            gateway_state: 'stopped',
            updated_at: new Date().toISOString(),
            active_agents: 0,
            platforms: {},
          },
          null,
          2
        ),
        'utf8'
      );
    } catch {
      // ignore
    }

    console.log('🛑 [Hermes Gateway] Daemon stopped successfully');
    return { success: true, message: 'Gateway daemon stopped' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to stop gateway' };
  }
}

/**
 * Restart the Hermes Gateway daemon
 */
export async function restartGateway(userId?: string): Promise<{ success: boolean; message: string; pid?: number }> {
  await stopGateway();
  await new Promise((res) => setTimeout(res, 800));
  return startGateway({ userId });
}

// ── Cron Job Management ────────────────────────────────────────────────────────

/**
 * Read all configured cron jobs from ~/.hermes/cron/jobs.json
 */
export async function listCronJobs(): Promise<CronJobItem[]> {
  const jobsPath = getJobsJsonPath();
  if (!fs.existsSync(jobsPath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(jobsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && Array.isArray(parsed.jobs)) {
      return parsed.jobs;
    }
    return [];
  } catch (err) {
    console.warn('[Hermes Gateway] Failed to read jobs.json:', err);
    return [];
  }
}

/**
 * Save the list of cron jobs to ~/.hermes/cron/jobs.json
 */
export async function saveCronJobs(jobs: CronJobItem[]): Promise<void> {
  const jobsPath = getJobsJsonPath();
  fs.writeFileSync(jobsPath, JSON.stringify(jobs, null, 2), 'utf8');
}

/**
 * Create a new scheduled cron job
 */
export async function createCronJob(jobData: Partial<CronJobItem>): Promise<CronJobItem> {
  const jobs = await listCronJobs();
  const id = jobData.id || `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const nowIso = new Date().toISOString();

  const newJob: CronJobItem = {
    id,
    name: jobData.name || 'Untitled Scheduled Job',
    schedule: jobData.schedule || '0 9 * * *',
    schedule_display: jobData.schedule_display || (typeof jobData.schedule === 'string' ? jobData.schedule : 'Daily at 09:00'),
    prompt: jobData.prompt || '',
    script: jobData.script || undefined,
    workdir: jobData.workdir || '/workspaces',
    enabled: jobData.enabled !== false,
    state: 'active',
    no_agent: !!jobData.no_agent,
    deliver: jobData.deliver || 'local',
    skills: jobData.skills || ['shell', 'code_runner', 'web_search'],
    model: jobData.model,
    provider: jobData.provider,
    created_at: nowIso,
    updated_at: nowIso,
  };

  jobs.push(newJob);
  await saveCronJobs(jobs);
  console.log(`✅ [Hermes Gateway] Created scheduled job "${newJob.name}" (${newJob.id})`);
  return newJob;
}

/**
 * Toggle (enable/pause) a scheduled cron job
 */
export async function toggleCronJob(id: string, enabled: boolean): Promise<CronJobItem | null> {
  const jobs = await listCronJobs();
  const job = jobs.find((j) => j.id === id);
  if (!job) return null;

  job.enabled = enabled;
  job.state = enabled ? 'active' : 'paused';
  job.updated_at = new Date().toISOString();

  await saveCronJobs(jobs);
  return job;
}

/**
 * Delete a scheduled cron job
 */
export async function deleteCronJob(id: string): Promise<boolean> {
  const jobs = await listCronJobs();
  const filtered = jobs.filter((j) => j.id !== id);
  if (filtered.length === jobs.length) return false;

  await saveCronJobs(filtered);
  console.log(`🗑️ [Hermes Gateway] Deleted scheduled job ${id}`);
  return true;
}

/**
 * Trigger an immediate one-off execution of a scheduled job
 */
export async function runCronJobNow(id: string): Promise<{ success: boolean; message: string; output?: string }> {
  const jobs = await listCronJobs();
  const job = jobs.find((j) => j.id === id);
  if (!job) {
    return { success: false, message: `Job ${id} not found` };
  }

  try {
    // Try running via hermes CLI
    const { stdout } = await execAsync(`hermes cron run "${id}" 2>&1 || true`);
    return {
      success: true,
      message: `Triggered scheduled job "${job.name}"`,
      output: stdout.trim(),
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to trigger cron run',
    };
  }
}
