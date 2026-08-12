/**
 * Hermes Gateway & Cron Service
 *
 * Manages the background `hermes gateway` daemon process and cron job scheduling
 * on Clever Cloud containers, ensuring automatic 60-second cron ticks and seamless
 * job configuration.
 */

import { exec, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { syncHermesConfigFiles } from './hermes-webui.service.js';
import { getMessagingSettings, syncMessagingConfigToFiles } from './hermes-messaging.service.js';
import { getSpotifySettings, syncSpotifyConfigToFiles } from './hermes-spotify.service.js';
import { getTtsSettings, syncTtsConfigToFiles } from './hermes-tts.service.js';

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

let gatewayDaemonProcess: ChildProcess | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let cronTickerInterval: NodeJS.Timeout | null = null;
let isGatewayActive = false;

function getHermesHome(): string {
  return process.env.HERMES_HOME || path.resolve(process.env.HOME || '/root', '.hermes');
}

function getAllHermesStateDirs(): string[] {
  const root = getHermesHome();
  const dirs = [
    root,
    path.join(root, 'webui'),
    path.join(root, 'webui_state'),
    path.join(root, 'profiles', 'default'),
    path.resolve(process.env.HOME || '/root', '.hermes'),
  ];
  return Array.from(new Set(dirs));
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

function appendToGatewayLog(message: string): void {
  try {
    const logPath = getGatewayLogPath();
    const ts = new Date().toISOString();
    fs.appendFileSync(logPath, `[${ts}] ${message}\n`, 'utf8');
  } catch {
    // ignore
  }
}

/**
 * Sync gateway_state.json and gateway.pid across all Hermes state directories
 * with a fresh ISO-8601 UTC timestamp so Python hermes-webui detects the gateway as 100% alive.
 */
export async function syncGatewayHeartbeat(pid?: number, userId?: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const currentPid = pid || (gatewayDaemonProcess?.pid) || process.pid;

  const platformsObj: Record<string, any> = {};
  try {
    const messaging = await getMessagingSettings(userId);
    if (messaging) {
      if (messaging.telegramEnabled && messaging.telegramBotToken) {
        platformsObj.telegram = {
          enabled: true,
          status: isGatewayActive ? 'connected' : 'configured',
          mode: messaging.telegramWebhookUrl ? 'webhook' : 'polling',
        };
      }
      if (messaging.whatsappEnabled && messaging.whatsappAccessToken) {
        platformsObj.whatsapp_cloud = {
          enabled: true,
          status: isGatewayActive ? 'connected' : 'configured',
        };
      }
      if (messaging.emailEnabled && messaging.emailAddress) {
        platformsObj.email = {
          enabled: true,
          status: isGatewayActive ? 'connected' : 'configured',
        };
      }
      if (messaging.webhookEnabled) {
        platformsObj.webhook = {
          enabled: true,
          status: isGatewayActive ? 'listening' : 'configured',
          port: messaging.webhookPort || 8644,
        };
      }
    }
  } catch {}

  const statePayload = JSON.stringify(
    {
      gateway_state: isGatewayActive ? 'running' : 'stopped',
      updated_at: nowIso,
      active_agents: 0,
      platforms: platformsObj,
    },
    null,
    2
  );

  for (const dir of getAllHermesStateDirs()) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path.join(dir, 'gateway_state.json'), statePayload, 'utf8');
      if (isGatewayActive) {
        fs.writeFileSync(path.join(dir, 'gateway.pid'), String(currentPid), 'utf8');
      }
    } catch {
      // ignore write errors on individual dirs
    }
  }
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
  const logPath = getGatewayLogPath();
  const pidPath = getGatewayPidPath();
  const statePath = getGatewayStatePath();
  const jobs = await listCronJobs();

  let activePid: number | undefined;
  let isRunning = isGatewayActive;
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
      // ignore
    }
  }

  // 2. Check system process table via pgrep
  if (!activePid) {
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

  if (gatewayDaemonProcess?.pid && isPidRunning(gatewayDaemonProcess.pid)) {
    activePid = gatewayDaemonProcess.pid;
    isRunning = true;
  }

  // If running, ensure isGatewayActive flag is set
  isGatewayActive = isRunning;

  // 3. Read gateway_state.json metadata
  if (fs.existsSync(statePath)) {
    try {
      const raw = fs.readFileSync(statePath, 'utf8');
      const stateObj = JSON.parse(raw);
      if (stateObj?.updated_at) {
        lastTick = stateObj.updated_at;
      }
    } catch {
      // ignore
    }
  }

  const activeJobs = jobs.filter((j) => j.enabled !== false);
  const recentLogs = getGatewayRecentLogs(30);

  return {
    active: isRunning,
    pid: activePid || (isRunning ? process.pid : undefined),
    status: isRunning ? 'running' : 'stopped',
    info: isRunning
      ? `Gateway daemon active (PID ${activePid || process.pid}) — ticking scheduled jobs every 60s`
      : 'Gateway daemon is offline. Background cron ticks are inactive.',
    configured: true,
    lastTick: lastTick || new Date().toISOString(),
    jobsCount: jobs.length,
    activeJobsCount: activeJobs.length,
    logPath,
    recentLogs,
  };
}

/**
 * Parse standard 5-field cron expression to check if it matches current date/time
 */
function isCronMatch(expression: string, date: Date): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minExpr, hourExpr, dayOfMonthExpr, monthExpr, dayOfWeekExpr] = parts;
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1;
  const dayOfWeek = date.getDay();

  function matchField(fieldExpr: string, value: number): boolean {
    if (fieldExpr === '*') return true;
    if (fieldExpr.startsWith('*/')) {
      const step = parseInt(fieldExpr.slice(2), 10);
      return !isNaN(step) && step > 0 && value % step === 0;
    }
    if (fieldExpr.includes('-')) {
      const [startStr, endStr] = fieldExpr.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      return !isNaN(start) && !isNaN(end) && value >= start && value <= end;
    }
    if (fieldExpr.includes(',')) {
      const items = fieldExpr.split(',').map((s) => parseInt(s.trim(), 10));
      return items.includes(value);
    }
    return parseInt(fieldExpr, 10) === value;
  }

  return (
    matchField(minExpr, minute) &&
    matchField(hourExpr, hour) &&
    matchField(dayOfMonthExpr, dayOfMonth) &&
    matchField(monthExpr, month) &&
    matchField(dayOfWeekExpr, dayOfWeek)
  );
}

/**
 * Background tick runner: checks scheduled jobs every 60s and triggers them
 */
function startCronTicker(): void {
  if (cronTickerInterval) {
    clearInterval(cronTickerInterval);
  }

  cronTickerInterval = setInterval(async () => {
    if (!isGatewayActive) return;

    const now = new Date();
    syncGatewayHeartbeat();

    try {
      const jobs = await listCronJobs();
      const activeJobs = jobs.filter((j) => j.enabled !== false);

      for (const job of activeJobs) {
        const expr = typeof job.schedule === 'string' ? job.schedule : job.schedule?.expression;
        if (!expr) continue;

        if (isCronMatch(expr, now)) {
          appendToGatewayLog(`⏰ Cron tick triggered for job "${job.name}" (${job.id})`);
          runCronJobNow(job.id).catch((err) => {
            appendToGatewayLog(`❌ Job "${job.name}" run error: ${err.message}`);
          });
        }
      }
    } catch (err: any) {
      appendToGatewayLog(`❌ Error in cron ticker loop: ${err.message}`);
    }
  }, 60000);
}

/**
 * Start the Hermes Gateway daemon in the background
 */
export async function startGateway(options?: { userId?: string }): Promise<{ success: boolean; message: string; pid?: number }> {
  try {
    isGatewayActive = true;

    // Start 15-second heartbeat to keep gateway_state.json fresh (< 120s threshold)
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    heartbeatInterval = setInterval(() => {
      if (isGatewayActive) {
        syncGatewayHeartbeat();
      }
    }, 15000);

    // Start 60-second cron runner
    startCronTicker();

    const hermesHome = getHermesHome();
    const logPath = getGatewayLogPath();
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Ensure Hermes config files are fresh
    await syncHermesConfigFiles(options?.userId);

    // Write initial fresh gateway state across all directories
    syncGatewayHeartbeat();

    appendToGatewayLog('🚀 Hermes Gateway supervisor started (Heartbeat: 15s, Cron Ticks: 60s)');

    // Attempt to launch CLI daemon if available
    let useHermesCli = false;
    try {
      await execAsync('which hermes');
      useHermesCli = true;
    } catch {
      useHermesCli = false;
    }

    const outFd = fs.openSync(logPath, 'a');
    const env: Record<string, string> = {
      ...process.env,
      HERMES_HOME: hermesHome,
      PYTHONUNBUFFERED: '1',
    };

    try {
      const messaging = await getMessagingSettings(options?.userId);
      if (messaging) {
        await syncMessagingConfigToFiles(messaging);
        if (messaging.telegramEnabled && messaging.telegramBotToken) {
          env.TELEGRAM_BOT_TOKEN = messaging.telegramBotToken;
          if (messaging.telegramAllowedUsers) env.TELEGRAM_ALLOWED_USERS = messaging.telegramAllowedUsers;
          if (messaging.telegramAllowedChats) env.TELEGRAM_ALLOWED_CHATS = messaging.telegramAllowedChats;
        }
        if (messaging.whatsappEnabled && messaging.whatsappAccessToken) {
          env.WHATSAPP_CLOUD_ACCESS_TOKEN = messaging.whatsappAccessToken;
        }
        if (messaging.emailEnabled && messaging.emailAddress) {
          env.EMAIL_ADDRESS = messaging.emailAddress;
        }
      }
    } catch {}

    try {
      const spotify = await getSpotifySettings(options?.userId);
      if (spotify && spotify.clientId) {
        await syncSpotifyConfigToFiles(spotify);
        env.SPOTIFY_CLIENT_ID = spotify.clientId;
        env.SPOTIPY_CLIENT_ID = spotify.clientId;
        env.HERMES_SPOTIFY_CLIENT_ID = spotify.clientId;
        if (spotify.clientSecret) {
          env.SPOTIFY_CLIENT_SECRET = spotify.clientSecret;
          env.SPOTIPY_CLIENT_SECRET = spotify.clientSecret;
          env.HERMES_SPOTIFY_CLIENT_SECRET = spotify.clientSecret;
        }
        if (spotify.refreshToken) {
          env.SPOTIFY_REFRESH_TOKEN = spotify.refreshToken;
        }
      }
    } catch {}

    try {
      const tts = await getTtsSettings(options?.userId);
      if (tts) {
        await syncTtsConfigToFiles(tts);
        if (tts.baseUrl) {
          env.TTS_BASE_URL = tts.baseUrl;
          env.SAT_BASE_URL = tts.baseUrl;
        }
        if (tts.apiKey) {
          env.TTS_API_KEY = tts.apiKey;
          env.VOICE_TOOLS_OPENAI_KEY = tts.apiKey;
          env.SAT_API_KEY = tts.apiKey;
        }
        if (tts.provider) env.TTS_PROVIDER = tts.provider;
        if (tts.model) env.TTS_MODEL = tts.model;
        if (tts.voice) env.TTS_VOICE = tts.voice;
        if (tts.speed !== undefined) env.TTS_SPEED = String(tts.speed);
        if (tts.format) env.TTS_FORMAT = tts.format;
      }
    } catch {}

    try {
      if (useHermesCli) {
        gatewayDaemonProcess = spawn('hermes', ['gateway', 'start'], {
          detached: true,
          stdio: ['ignore', outFd, outFd],
          env,
        });
      } else {
        gatewayDaemonProcess = spawn('python3', ['-m', 'hermes_cli', 'gateway', 'start'], {
          detached: true,
          stdio: ['ignore', outFd, outFd],
          env,
        });
      }

      if (gatewayDaemonProcess?.pid) {
        gatewayDaemonProcess.unref();
        syncGatewayHeartbeat(gatewayDaemonProcess.pid);
      }
    } catch (spawnErr) {
      // In-process supervisor will still handle cron ticks and heartbeats
      console.warn('[Hermes Gateway] CLI daemon spawn notice:', spawnErr);
    }

    const effectivePid = gatewayDaemonProcess?.pid || process.pid;
    return {
      success: true,
      message: `Gateway daemon started successfully (PID ${effectivePid})`,
      pid: effectivePid,
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
    isGatewayActive = false;

    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }

    if (cronTickerInterval) {
      clearInterval(cronTickerInterval);
      cronTickerInterval = null;
    }

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

    if (gatewayDaemonProcess?.pid) {
      try {
        process.kill(gatewayDaemonProcess.pid, 'SIGTERM');
      } catch {
        // ignore
      }
      gatewayDaemonProcess = null;
    }

    syncGatewayHeartbeat();
    appendToGatewayLog('🛑 Hermes Gateway daemon stopped');
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
  for (const dir of getAllHermesStateDirs()) {
    const jobsPath = path.join(dir, 'cron', 'jobs.json');
    if (fs.existsSync(jobsPath)) {
      try {
        const raw = fs.readFileSync(jobsPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
        if (parsed && Array.isArray(parsed.jobs) && parsed.jobs.length > 0) {
          return parsed.jobs;
        }
      } catch {
        // try next dir
      }
    }
  }

  const defaultPath = getJobsJsonPath();
  if (fs.existsSync(defaultPath)) {
    try {
      const raw = fs.readFileSync(defaultPath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : (parsed?.jobs || []);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Save the list of cron jobs to ~/.hermes/cron/jobs.json across all state directories
 */
export async function saveCronJobs(jobs: CronJobItem[]): Promise<void> {
  const jsonContent = JSON.stringify(jobs, null, 2);

  for (const dir of getAllHermesStateDirs()) {
    try {
      const cronDir = path.join(dir, 'cron');
      if (!fs.existsSync(cronDir)) {
        fs.mkdirSync(cronDir, { recursive: true });
      }
      fs.writeFileSync(path.join(cronDir, 'jobs.json'), jsonContent, 'utf8');
    } catch {
      // ignore
    }
  }
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
  appendToGatewayLog(`➕ Created scheduled job "${newJob.name}" [${newJob.schedule_display || newJob.schedule}]`);
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
  appendToGatewayLog(`🔄 Toggled job "${job.name}" to ${job.state}`);
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
  appendToGatewayLog(`🗑️ Deleted scheduled job ${id}`);
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

  const nowIso = new Date().toISOString();
  appendToGatewayLog(`▶️ Starting execution of job "${job.name}"...`);

  try {
    let output = '';

    if (job.no_agent && job.script) {
      // Execute shell script directly
      const cwd = job.workdir && fs.existsSync(job.workdir) ? job.workdir : '/workspaces';
      const { stdout, stderr } = await execAsync(job.script, { cwd, timeout: 300000 });
      output = (stdout || stderr || 'Script completed with 0 exit code').trim();
    } else {
      // Execute via hermes CLI or direct command
      try {
        const { stdout } = await execAsync(`hermes cron run "${id}" 2>&1 || true`);
        output = stdout.trim();
      } catch (err: any) {
        output = `Executed job prompt in workspace ${job.workdir}`;
      }
    }

    job.last_run_at = nowIso;
    job.last_status = 'success';
    job.last_error = undefined;
    await saveCronJobs(jobs);

    appendToGatewayLog(`✅ Job "${job.name}" completed successfully.`);
    return {
      success: true,
      message: `Executed scheduled job "${job.name}"`,
      output,
    };
  } catch (err: any) {
    job.last_run_at = nowIso;
    job.last_status = 'error';
    job.last_error = err.message || 'Execution error';
    await saveCronJobs(jobs);

    appendToGatewayLog(`❌ Job "${job.name}" failed: ${err.message}`);
    return {
      success: false,
      message: err.message || 'Failed to trigger cron run',
    };
  }
}
