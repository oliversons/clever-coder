/**
 * HermesSettings — /settings/hermes
 *
 * Modern, full-width, responsive settings dashboard for Hermes AI Agent:
 *   Tab 1: Browser Automation & Cloudflare Kitesurf
 *   Tab 2: Model & API Provider
 *   Tab 3: Execution & Sandbox
 *   Tab 4: Memory & Skills
 *   Tab 5: Tools & MCP
 *   Tab 6: S3 & Storage
 *   Tab 7: Standalone WebUI
 *   Tab 8: Job Scheduler & Gateway Daemon
 */

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Cpu, Brain, Wrench, Database, Eye, EyeOff,
  CheckCircle, XCircle, Loader, ChevronRight, Zap,
  ToggleLeft, ToggleRight, Server, Globe, FlaskConical,
  Clock, Play, Pause, Trash2, RefreshCw, Plus, Terminal,
  CheckCircle2, AlertTriangle, FileText, Sparkles, Copy, Check,
  ExternalLink, Calendar, Activity, Sliders, Shield, HardDrive,
  Code2, ArrowUpRight, HelpCircle, Layers, FolderKanban,
  Search, Lock, CheckSquare, Settings2, Laptop, Gauge,
  Compass, Chrome, Radio, Video, ScreenShare, ShieldAlert,
  type LucideIcon
} from 'lucide-react';
import { useHermesStore } from '../store/hermesStore';
import {
  api,
  type GatewayStatus,
  type CronJobItem,
  type Project,
  type HermesBrowserSettings,
  type HermesSyncStatus,
} from '../api/client';

// ── Types & Constants ──────────────────────────────────────────────────────────

type TabId = 'browser' | 'model' | 'execution' | 'memory' | 'tools' | 's3' | 'webui' | 'scheduler';

interface TabItem {
  id: TabId;
  label: string;
  badge?: string | number;
  icon: LucideIcon;
  description: string;
}

const TABS: TabItem[] = [
  { id: 'browser', label: 'Browser Automation', icon: Compass, description: 'Cloudflare Kitesurf, CDP, local & cloud', badge: 'New' },
  { id: 'model', label: 'Model & API', icon: Bot, description: 'LLM providers, endpoints & keys' },
  { id: 'execution', label: 'Execution', icon: Cpu, description: 'Sandbox, multi-core & approval' },
  { id: 'memory', label: 'Memory & Skills', icon: Brain, description: 'Cross-session memory & persona' },
  { id: 'tools', label: 'Tools & MCP', icon: Wrench, description: 'Shell, file edit & agent tools' },
  { id: 's3', label: 'S3 & Storage', icon: Database, description: 'Cellar S3 archiving & exports' },
  { id: 'webui', label: 'Hermes WebUI', icon: Globe, description: 'Standalone 3-panel interface' },
  { id: 'scheduler', label: 'Job Scheduler', icon: Clock, description: 'Cron daemon & automated jobs' },
];

const BROWSER_PROVIDERS = [
  {
    value: 'local_chromium',
    label: 'Local Chromium (Built-in)',
    desc: 'Headless / Headed Chromium driven by agent-browser & Playwright in container',
    badge: 'Built-in / Zero Config',
    icon: '🖥️',
    color: '#10b981',
  },
  {
    value: 'kitesurf_cdp',
    label: 'Cloudflare Kitesurf',
    desc: 'Stateless, agent-first browser on Cloudflare Workers Wasm isolates (3x-7x less CPU/RAM)',
    badge: 'Workers Wasm / SOTA',
    icon: '🏄‍♂️',
    color: '#f59e0b',
  },
  {
    value: 'cdp',
    label: 'Custom Remote CDP Endpoint',
    desc: 'Direct WebSocket/HTTP Chrome DevTools Protocol URL (Browserless, Brave, Chrome remote)',
    badge: 'Direct CDP',
    icon: '🔌',
    color: '#06b6d4',
  },
  {
    value: 'browserbase',
    label: 'Browserbase Cloud',
    desc: 'Managed cloud browsers with residential proxies, CAPTCHA bypass & stealth fingerprinting',
    badge: 'Stealth Cloud',
    icon: '🛡️',
    color: '#7c3aed',
  },
  {
    value: 'browser_use',
    label: 'Browser Use 3.0 Cloud',
    desc: 'State-of-the-art Python web automation harness & Browser Use cloud sessions',
    badge: 'CLI 3.0 Harness',
    icon: '🚀',
    color: '#ec4899',
  },
  {
    value: 'firecrawl',
    label: 'Firecrawl Cloud & Self-Hosted',
    desc: 'Cloud scraping and web interaction engine with session TTL management',
    badge: 'Scraping Engine',
    icon: '🕸️',
    color: '#ea580c',
  },
  {
    value: 'camofox',
    label: 'Camofox Local Anti-Detection',
    desc: 'Self-hosted Firefox C++ fingerprint spoofing with persistent profiles & VNC live view',
    badge: 'Anti-Bot Firefox',
    icon: '🦊',
    color: '#8b5cf6',
  },
  {
    value: 'nous_portal',
    label: 'Nous Portal Gateway',
    desc: 'Direct Nous Subscription Tool Gateway — zero external API keys needed',
    badge: 'Nous Native',
    icon: '🏛️',
    color: '#3b82f6',
  },
];

const PROVIDERS = [
  {
    value: 'openrouter',
    label: 'OpenRouter',
    desc: 'Unified multi-provider gateway with 200+ models',
    badge: 'Popular',
    icon: '⚡',
  },
  {
    value: 'custom_openai',
    label: 'Custom OpenAI API',
    desc: 'DeepSeek, Claude Router, Grok, vLLM, private LLMs',
    badge: 'Custom URL',
    icon: '🔌',
  },
  {
    value: 'openai',
    label: 'OpenAI Official',
    desc: 'GPT-4o, GPT-4o-mini, o1-mini, o3',
    badge: 'Official',
    icon: '🤖',
  },
  {
    value: 'nous_portal',
    label: 'Nous Portal',
    desc: 'Native Hermes-3 models with OAuth authentication',
    badge: 'Hermes Native',
    icon: '🏛️',
  },
  {
    value: 'ollama',
    label: 'Local Ollama / vLLM',
    desc: 'Self-hosted models running on localhost / private network',
    badge: 'Self-Hosted',
    icon: '🖥️',
  },
];

const OPENROUTER_MODELS = [
  'nousresearch/hermes-3-llama-3.1-405b',
  'anthropic/claude-3.5-sonnet',
  'openai/gpt-4o',
  'meta-llama/llama-3.1-70b-instruct',
  'google/gemini-2.0-flash-001',
  'deepseek/deepseek-r1',
  'mistralai/mistral-large',
];

const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini', 'gpt-4-turbo'];

const TOOLS_LIST = [
  {
    id: 'shell',
    label: 'Terminal / Shell Execution',
    desc: 'Execute bash commands, scripts, builds, and tests inside the workspace container',
    category: 'System',
    icon: Terminal,
    color: '#06b6d4',
  },
  {
    id: 'code_runner',
    label: 'File Read & Write',
    desc: 'Inspect files, propose diffs, edit source code, and create workspace files',
    category: 'Editor',
    icon: FileText,
    color: '#7c3aed',
  },
  {
    id: 'browser',
    label: 'Browser Automation (Kitesurf / Playwright)',
    desc: 'Navigate web pages, inspect DOM accessibility trees, click buttons, fill forms & evaluate JS',
    category: 'Browser',
    icon: Compass,
    color: '#f59e0b',
  },
  {
    id: 'web_search',
    label: 'Web Search & Intelligence',
    desc: 'Query DuckDuckGo for live API documentation, package updates, and answers',
    category: 'Search',
    icon: Search,
    color: '#10b981',
  },
  {
    id: 'vision',
    label: 'Vision & Screenshot Analysis',
    desc: 'Analyze UI screenshots, diagrams, and image attachments',
    category: 'Vision',
    icon: Eye,
    color: '#ec4899',
  },
];

const PERSONA_TEMPLATES = [
  {
    name: 'Senior Full-Stack Architect',
    prompt: 'You are Hermes, an expert principal software architect embedded in CleverCoder IDE. You write robust, elegant, type-safe code, follow best design patterns, and verify every step thoroughly.',
  },
  {
    name: 'Vibe Coder / Fast Prototyper',
    prompt: 'You are Hermes, a rapid vibe-coding specialist. You prioritize speed, beautiful aesthetics, modern UI/UX design, and clean working prototypes with zero fluff.',
  },
  {
    name: 'Test & DevOps Engineer',
    prompt: 'You are Hermes, a senior QA and DevOps engineer. You focus on comprehensive test suites, automation scripts, CI/CD health, container optimization, and resilience.',
  },
];

// ── Main Component ─────────────────────────────────────────────────────────────

export default function HermesSettings() {
  const { hermesSettings, loadSettings, saveSettings, testConnection } = useHermesStore();
  const [activeTab, setActiveTab] = useState<TabId>('browser');
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(null);

  // ── Browser Settings State ─────────────────────────────────────────────────
  const [browserForm, setBrowserForm] = useState<Partial<HermesBrowserSettings>>({
    provider: 'kitesurf_cdp',
    backend: 'auto',
    headless: true,
    headed: false,
    cdpUrl: 'wss://kitesurf.cloudflare.app/devtools/browser',
    visionEnabled: true,
    timeoutSeconds: 300,
    inactivityTimeout: 120,
    recordSessions: false,
    proxyUrl: '',
    autoLocalForPrivateUrls: true,
    allowPrivateUrls: false,
    restrictEvaluate: false,
    dialogPolicy: 'must_respond',
    dialogTimeoutS: 30,
    agentBrowserArgs: '--no-sandbox,--disable-dev-shm-usage',
    kitesurfMcpEnabled: true,
    kitesurfAccountToken: '',
    browserbaseApiKey: '',
    browserbaseProjectId: '',
    browserbaseProxies: true,
    browserbaseAdvancedStealth: false,
    browserbaseKeepAlive: true,
    browserbaseSessionTimeout: 1800,
    browserUseApiKey: '',
    firecrawlApiKey: '',
    firecrawlApiUrl: 'https://api.firecrawl.dev',
    firecrawlBrowserTtl: 300,
    camofoxUrl: 'http://localhost:9377',
    camofoxRewriteLoopbackUrls: true,
    camofoxLoopbackHostAlias: 'host.docker.internal',
    camofoxManagedPersistence: true,
    camofoxUserId: '',
    camofoxSessionKey: '',
    camofoxAdoptExistingTab: true,
  });

  const [loadingBrowser, setLoadingBrowser] = useState(false);
  const [testingBrowser, setTestingBrowser] = useState(false);
  const [browserTestResult, setBrowserTestResult] = useState<{ ok: boolean; message: string; latencyMs?: number; details?: any } | null>(null);
  const [showBrowserKeys, setShowBrowserKeys] = useState<Record<string, boolean>>({});

  // ── Global Config Sync Status State ──
  const [syncStatus, setSyncStatus] = useState<HermesSyncStatus | null>(null);
  const [loadingSyncStatus, setLoadingSyncStatus] = useState(false);
  const [resyncingConfigs, setResyncingConfigs] = useState(false);
  const [showConfigInspector, setShowConfigInspector] = useState(false);
  const [configInspectorTab, setConfigInspectorTab] = useState<'yaml' | 'mcp'>('yaml');
  const [copiedConfig, setCopiedConfig] = useState(false);

  // ── Gateway & Scheduler State ──────────────────────────────────────────────
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [cronJobs, setCronJobs] = useState<CronJobItem[]>([]);
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [loadingGateway, setLoadingGateway] = useState(false);
  const [restartingGateway, setRestartingGateway] = useState(false);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [gatewayLogs, setGatewayLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logFilter, setLogFilter] = useState('');
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [schedulerActionMsg, setSchedulerActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Job Wizard State ───────────────────────────────────────────────────────
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [newJob, setNewJob] = useState({
    name: '',
    preset: 'daily',
    customCron: '0 9 * * *',
    workdir: '/workspaces',
    mode: 'agent' as 'agent' | 'script',
    prompt: '',
    script: '',
  });

  const loadBrowserSettings = async () => {
    setLoadingBrowser(true);
    try {
      const res = await api.hermes.getBrowserSettings();
      if (res) {
        setBrowserForm((prev) => ({ ...prev, ...res }));
      }
    } catch (err) {
      console.warn('Failed to load browser settings:', err);
    } finally {
      setLoadingBrowser(false);
    }
  };

  const loadSyncStatus = async () => {
    setLoadingSyncStatus(true);
    try {
      const res = await api.hermes.getBrowserSyncStatus();
      if (res) {
        setSyncStatus(res);
      }
    } catch (err) {
      console.warn('Failed to load sync status:', err);
    } finally {
      setLoadingSyncStatus(false);
    }
  };

  const handleForceResync = async () => {
    setResyncingConfigs(true);
    try {
      const res = await api.hermes.forceResyncBrowserConfig();
      if (res?.status) {
        setSyncStatus(res.status);
      }
      setSaveMsg({ type: 'success', text: 'All Hermes global configs, profiles, and MCP toolsets successfully synchronized across disk!' });
    } catch (err: any) {
      setSaveMsg({ type: 'error', text: err?.message || 'Failed to resync configs' });
    } finally {
      setResyncingConfigs(false);
    }
  };

  const loadGatewayAndCrons = async () => {
    setLoadingGateway(true);
    try {
      const [statusRes, jobsRes, projectsRes] = await Promise.all([
        api.hermes.getGatewayStatus().catch(() => null),
        api.hermes.listCronJobs().catch(() => ({ jobs: [] })),
        api.projects.list().catch(() => []),
      ]);
      if (statusRes) setGatewayStatus(statusRes);
      if (jobsRes?.jobs) setCronJobs(jobsRes.jobs);
      if (projectsRes) setProjectsList(projectsRes);
    } catch (err) {
      console.warn('Failed to load gateway data:', err);
    } finally {
      setLoadingGateway(false);
    }
  };

  const loadGatewayLogs = async () => {
    try {
      const res = await api.hermes.getGatewayLogs();
      if (res?.logs) setGatewayLogs(res.logs);
    } catch (err) {
      console.warn('Failed to load gateway logs:', err);
    }
  };

  useEffect(() => {
    loadSettings();
    loadBrowserSettings();
    loadSyncStatus();
    loadGatewayAndCrons();
  }, []);

  useEffect(() => {
    if (hermesSettings) {
      setForm({ ...hermesSettings, apiKey: '' });
      setIsDirty(false);
    }
  }, [hermesSettings]);

  useEffect(() => {
    if (activeTab === 'scheduler') {
      loadGatewayAndCrons();
      loadGatewayLogs();
      const timer = setInterval(() => {
        api.hermes.getGatewayStatus().then((s) => s && setGatewayStatus(s)).catch(() => {});
      }, 6000);
      return () => clearInterval(timer);
    }
  }, [activeTab]);

  const setField = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
    if (saveMsg) setSaveMsg(null);
  };

  const setBrowserField = (key: keyof HermesBrowserSettings, value: unknown) => {
    setBrowserForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
    if (saveMsg) setSaveMsg(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload = { ...form };
      if (!payload.apiKey) delete payload.apiKey;

      // Save both main Hermes settings and Browser settings concurrently
      await Promise.all([
        saveSettings(payload),
        api.hermes.saveBrowserSettings(browserForm),
      ]);

      setSaveMsg({ type: 'success', text: 'All Hermes settings & Browser automation configurations saved successfully' });
      setIsDirty(false);
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection({
        provider: form.provider,
        baseUrl: form.baseUrl || undefined,
        apiKey: form.apiKey || undefined,
        model: form.model,
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleTestBrowser = async () => {
    setTestingBrowser(true);
    setBrowserTestResult(null);
    try {
      const result = await api.hermes.testBrowserConnection(browserForm);
      setBrowserTestResult(result);
    } catch (err: any) {
      setBrowserTestResult({ ok: false, message: err?.message || 'Browser connection test failed' });
    } finally {
      setTestingBrowser(false);
    }
  };

  const handleRestartGateway = async () => {
    setRestartingGateway(true);
    setSchedulerActionMsg(null);
    try {
      const res = await api.hermes.restartGateway();
      if (res?.success) {
        setSchedulerActionMsg({ type: 'success', text: res.message || 'Gateway daemon restarted successfully' });
        await loadGatewayAndCrons();
        await loadGatewayLogs();
      } else {
        setSchedulerActionMsg({ type: 'error', text: res?.message || 'Failed to restart gateway' });
      }
    } catch (err: any) {
      setSchedulerActionMsg({ type: 'error', text: err.message || 'Restart error' });
    } finally {
      setRestartingGateway(false);
    }
  };

  const handleToggleGateway = async () => {
    setLoadingGateway(true);
    setSchedulerActionMsg(null);
    try {
      if (gatewayStatus?.active) {
        const res = await api.hermes.stopGateway();
        setSchedulerActionMsg({ type: 'success', text: res?.message || 'Gateway daemon stopped' });
      } else {
        const res = await api.hermes.startGateway();
        setSchedulerActionMsg({ type: 'success', text: res?.message || 'Gateway daemon started' });
      }
      await loadGatewayAndCrons();
      await loadGatewayLogs();
    } catch (err: any) {
      setSchedulerActionMsg({ type: 'error', text: err.message || 'Operation failed' });
    } finally {
      setLoadingGateway(false);
    }
  };

  const handleCreateJob = async () => {
    if (!newJob.name.trim()) {
      setSchedulerActionMsg({ type: 'error', text: 'Task name is required' });
      return;
    }
    if (newJob.mode === 'agent' && !newJob.prompt.trim()) {
      setSchedulerActionMsg({ type: 'error', text: 'Agent instructions/prompt are required' });
      return;
    }
    if (newJob.mode === 'script' && !newJob.script.trim()) {
      setSchedulerActionMsg({ type: 'error', text: 'Shell script command is required' });
      return;
    }

    setCreatingJob(true);
    setSchedulerActionMsg(null);

    let scheduleExpr = '0 9 * * *';
    let scheduleDisplay = 'Daily at 09:00';
    if (newJob.preset === '5min') {
      scheduleExpr = '*/5 * * * *';
      scheduleDisplay = 'Every 5 minutes';
    } else if (newJob.preset === 'hourly') {
      scheduleExpr = '0 * * * *';
      scheduleDisplay = 'Every hour';
    } else if (newJob.preset === 'weekdays') {
      scheduleExpr = '0 9 * * 1-5';
      scheduleDisplay = 'Weekdays at 09:00';
    } else if (newJob.preset === 'weekly') {
      scheduleExpr = '0 9 * * 1';
      scheduleDisplay = 'Weekly on Monday';
    } else if (newJob.preset === 'custom') {
      scheduleExpr = newJob.customCron || '0 9 * * *';
      scheduleDisplay = `Custom (${scheduleExpr})`;
    }

    try {
      const res = await api.hermes.createCronJob({
        name: newJob.name.trim(),
        schedule: scheduleExpr,
        schedule_display: scheduleDisplay,
        prompt: newJob.mode === 'agent' ? newJob.prompt.trim() : undefined,
        script: newJob.mode === 'script' ? newJob.script.trim() : undefined,
        workdir: newJob.workdir,
        no_agent: newJob.mode === 'script',
        enabled: true,
      });

      if (res?.success && res?.job) {
        setCronJobs((prev) => [...prev, res.job]);
        setShowCreateWizard(false);
        setNewJob({
          name: '',
          preset: 'daily',
          customCron: '0 9 * * *',
          workdir: '/workspaces',
          mode: 'agent',
          prompt: '',
          script: '',
        });
        setSchedulerActionMsg({ type: 'success', text: `Created scheduled job "${res.job.name}"` });
        await loadGatewayLogs();
      } else {
        setSchedulerActionMsg({ type: 'error', text: (res as any)?.message || 'Failed to create job' });
      }
    } catch (err: any) {
      setSchedulerActionMsg({ type: 'error', text: err.message || 'Failed to schedule job' });
    } finally {
      setCreatingJob(false);
    }
  };

  const handleToggleJob = async (job: CronJobItem) => {
    try {
      const updated = await api.hermes.toggleCronJob(job.id, !job.enabled);
      if (updated?.success) {
        setCronJobs((prev) => prev.map((j) => (j.id === job.id ? updated.job : j)));
      }
    } catch (err: any) {
      setSchedulerActionMsg({ type: 'error', text: err.message || 'Failed to toggle job' });
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this scheduled job?')) return;
    try {
      await api.hermes.deleteCronJob(jobId);
      setCronJobs((prev) => prev.filter((j) => j.id !== jobId));
      setSchedulerActionMsg({ type: 'success', text: 'Scheduled job deleted' });
    } catch (err: any) {
      setSchedulerActionMsg({ type: 'error', text: err.message || 'Failed to delete job' });
    }
  };

  const handleRunJobNow = async (jobId: string) => {
    setRunningJobId(jobId);
    setSchedulerActionMsg(null);
    try {
      const res = await api.hermes.runCronJob(jobId);
      if (res?.success) {
        setSchedulerActionMsg({ type: 'success', text: res.message || 'Job triggered successfully' });
      } else {
        setSchedulerActionMsg({ type: 'error', text: res.message || 'Failed to trigger job' });
      }
      await loadGatewayLogs();
    } catch (err: any) {
      setSchedulerActionMsg({ type: 'error', text: err.message || 'Failed to execute job' });
    } finally {
      setRunningJobId(null);
    }
  };

  const models = form.provider === 'openai' ? OPENAI_MODELS : OPENROUTER_MODELS;
  const activeToolsCount = (form.enabledTools as string[] ?? []).length;
  const activeJobsCount = cronJobs.filter((j) => j.enabled !== false).length;

  const filteredLogs = useMemo(() => {
    if (!logFilter.trim()) return gatewayLogs;
    const q = logFilter.toLowerCase();
    return gatewayLogs.filter((l) => l.toLowerCase().includes(q));
  }, [gatewayLogs, logFilter]);

  return (
    <div style={{ width: '100%', minHeight: '100%', paddingBottom: 90 }}>
      {/* ── Top Hero Header Bar ────────────────────────────────────────────── */}
      <div className="hermes-hero-banner">
        <div
          style={{
            position: 'absolute',
            top: -60,
            right: -60,
            width: 240,
            height: 240,
            background: 'radial-gradient(circle, rgba(124,58,237,0.35) 0%, transparent 70%)',
            pointerEvents: 'none',
            filter: 'blur(20px)',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 'var(--radius-lg)',
                background: 'linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(124,58,237,0.45)',
                color: '#fff',
                flexShrink: 0,
              }}
            >
              <Bot size={28} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                  Hermes AI Agent Control Center
                </h1>
                <span
                  style={{
                    padding: '3px 9px',
                    borderRadius: 9999,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-accent)',
                    border: '1px solid var(--border-accent)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                  }}
                >
                  Browser &amp; AI Suite
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0', lineHeight: 1.45, fontWeight: 500 }}>
                Configure browser automation (Kitesurf Wasm / CDP / Playwright), sandbox limits, multi-core clustering, and cron scheduling.
              </p>
            </div>
          </div>

          {/* Quick Metrics & Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: browserForm.provider === 'kitesurf_cdp' ? '#f59e0b' : '#10b981', boxShadow: '0 0 6px rgba(16,185,129,0.6)' }} />
              <span style={{ color: 'var(--text-muted)' }}>Browser:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {browserForm.provider === 'kitesurf_cdp' ? 'Cloudflare Kitesurf' : (browserForm.provider || 'Local Chromium')}
              </span>
            </div>

            <button
              type="button"
              onClick={handleTestBrowser}
              disabled={testingBrowser}
              className="btn btn-secondary"
              style={{
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {testingBrowser ? <Loader size={14} className="spin" /> : <Compass size={14} />}
              <span>Test Browser CDP</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await api.hermes.launchWebUI();
                  if (res?.url) window.open(res.url, '_blank', 'noopener,noreferrer');
                } catch (err) {
                  console.error('Failed to open WebUI:', err);
                }
              }}
              className="btn btn-primary"
              style={{ padding: '8px 16px', fontSize: 12, fontWeight: 700 }}
            >
              <Globe size={14} />
              <span>Launch WebUI</span>
              <ArrowUpRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Status Alerts ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {saveMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              padding: '12px 18px',
              borderRadius: 'var(--radius-md)',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: saveMsg.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${saveMsg.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: saveMsg.type === 'success' ? '#10b981' : '#ef4444',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {saveMsg.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
              <span>{saveMsg.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setSaveMsg(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Full-Width Grid Layout ──────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          gap: 24,
          alignItems: 'start',
        }}
        className="hermes-settings-grid"
      >
        {/* ── Navigation Sidebar with Light Pattern Background ───────────── */}
        <div className="hermes-nav-sidebar">
          <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
            Hermes Navigation
          </div>

          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            let badgeContent: React.ReactNode = tab.badge || null;
            if (tab.id === 'tools') badgeContent = activeToolsCount;
            if (tab.id === 'scheduler') badgeContent = activeJobsCount > 0 ? `${activeJobsCount} active` : null;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`hermes-nav-btn${isActive ? ' active' : ''}`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '15%',
                      bottom: '15%',
                      width: 3,
                      borderRadius: 2,
                      background: 'linear-gradient(180deg, #7c3aed, #06b6d4)',
                    }}
                  />
                )}

                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 'var(--radius-sm)',
                    background: isActive ? 'rgba(124,58,237,0.2)' : 'var(--bg-elevated)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isActive ? 'var(--text-accent)' : 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={16} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 13, lineHeight: 1.2 }}>{tab.label}</span>
                    {badgeContent && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 9999,
                          background: isActive ? 'var(--accent-1)' : 'var(--bg-overlay)',
                          color: isActive ? '#ffffff' : 'var(--text-muted)',
                        }}
                      >
                        {badgeContent}
                      </span>
                    )}
                  </div>
                  <div className="truncate" style={{ fontSize: 11, color: isActive ? 'var(--text-accent)' : 'var(--text-muted)', marginTop: 2 }}>
                    {tab.description}
                  </div>
                </div>
              </button>
            );
          })}

          <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />

          {/* Quick Info Tile */}
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(6,182,212,0.05)',
              border: '1px solid rgba(6,182,212,0.15)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Gauge size={12} style={{ color: '#06b6d4' }} /> Multi-Core Cluster
            </div>
            <div>Active Compute: <strong>12 Cores / 24 GiB</strong></div>
            <div>Virtual Display: <strong>Xvfb (:99 active)</strong></div>
          </div>
        </div>

        {/* ── Content Canvas ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* ══════════════════════════════════════════════════════════════
                TAB 1: BROWSER AUTOMATION & CLOUDFLARE KITESURF
               ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'browser' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Hero Browser Intro Card */}
                <section className="glass-card" style={{ padding: 28 }}>
                  <SectionHeader
                    icon={Compass}
                    title="Browser Automation Engine & Execution Backends"
                    subtitle="Control web pages via accessibility trees (@e1, @e2), screenshots, and Chrome DevTools Protocol"
                  />

                  {/* Provider Selection Grid */}
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Select Browser Execution Provider (8 Backends Supported)
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                      {BROWSER_PROVIDERS.map((p) => {
                        const isSelected = (browserForm.provider || 'local_chromium') === p.value;
                        return (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setBrowserField('provider', p.value)}
                            style={{
                              padding: '16px 18px',
                              textAlign: 'left',
                              borderRadius: 'var(--radius-lg)',
                              cursor: 'pointer',
                              background: isSelected
                                ? 'linear-gradient(135deg, rgba(124,58,237,0.16), rgba(6,182,212,0.08))'
                                : 'var(--bg-elevated)',
                              border: `1px solid ${isSelected ? 'rgba(124,58,237,0.5)' : 'var(--border)'}`,
                              boxShadow: isSelected ? '0 4px 20px rgba(124,58,237,0.2)' : 'none',
                              transition: 'all 0.15s ease',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: 12,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 20 }}>{p.icon}</span>
                                <div>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{p.label}</div>
                                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-overlay)', color: p.color, fontWeight: 700 }}>
                                    {p.badge}
                                  </span>
                                </div>
                              </div>

                              <div
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: '50%',
                                  border: `2px solid ${isSelected ? '#7c3aed' : 'var(--border)'}`,
                                  background: isSelected ? '#7c3aed' : 'transparent',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#fff',
                                }}
                              >
                                {isSelected && <Check size={12} />}
                              </div>
                            </div>

                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{p.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Dynamic Provider Specific Configuration ──────────────── */}

                  {/* 1. Cloudflare Kitesurf */}
                  {browserForm.provider === 'kitesurf_cdp' && (
                    <div
                      style={{
                        padding: 22,
                        borderRadius: 'var(--radius-lg)',
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(124,58,237,0.05) 100%)',
                        border: '1px solid rgba(245,158,11,0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                        marginBottom: 20,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>
                          <Compass size={18} />
                          Cloudflare Kitesurf — Stateless Workers Browser Configuration
                        </div>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.2)', color: '#f59e0b', fontWeight: 700 }}>
                          V8 / Wasm Isolates
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                        Kitesurf renders pages on Cloudflare Workers Wasm isolates using 3x-7x less RAM than heavy Chromium instances. Speaks raw Chrome DevTools Protocol over WebSockets.
                      </p>

                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                          Kitesurf WebSocket CDP Endpoint (wss://)
                        </label>
                        <input
                          type="text"
                          value={browserForm.cdpUrl ?? 'wss://kitesurf.cloudflare.app/devtools/browser'}
                          onChange={(e) => setBrowserField('cdpUrl', e.target.value)}
                          placeholder="wss://kitesurf.cloudflare.app/devtools/browser"
                          style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                            Cloudflare Account API Token (Optional / Enterprise)
                          </label>
                          <input
                            type="password"
                            value={browserForm.kitesurfAccountToken ?? ''}
                            onChange={(e) => setBrowserField('kitesurfAccountToken', e.target.value)}
                            placeholder="Optional account token for browser-run"
                            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 18 }}>
                          <input
                            type="checkbox"
                            id="kitesurfMcp"
                            checked={browserForm.kitesurfMcpEnabled !== false}
                            onChange={(e) => setBrowserField('kitesurfMcpEnabled', e.target.checked)}
                            style={{ accentColor: '#7c3aed', width: 16, height: 16 }}
                          />
                          <label htmlFor="kitesurfMcp" style={{ fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer' }}>
                            Auto-register <code>chrome-devtools-mcp</code> server in Hermes MCP registry
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. Custom CDP Endpoint */}
                  {browserForm.provider === 'cdp' && (
                    <div
                      style={{
                        padding: 22,
                        borderRadius: 'var(--radius-lg)',
                        background: 'rgba(6,182,212,0.06)',
                        border: '1px solid rgba(6,182,212,0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        marginBottom: 20,
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#06b6d4', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Chrome size={18} />
                        Custom Remote Chrome DevTools Protocol Target
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                          CDP Endpoint URL (ws:// or wss:// or http://)
                        </label>
                        <input
                          type="text"
                          value={browserForm.cdpUrl ?? ''}
                          onChange={(e) => setBrowserField('cdpUrl', e.target.value)}
                          placeholder="ws://127.0.0.1:9222 or wss://chrome.browserless.io?token=..."
                          style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                        />
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                        💡 When launching local Chrome/Brave with <code>--remote-debugging-port=9222</code>, always pass a dedicated <code>--user-data-dir=$HOME/.hermes/chrome-debug</code> so the debug port comes up properly on Chrome 136+.
                      </p>
                    </div>
                  )}

                  {/* 3. Browserbase Cloud */}
                  {browserForm.provider === 'browserbase' && (
                    <div
                      style={{
                        padding: 22,
                        borderRadius: 'var(--radius-lg)',
                        background: 'rgba(124,58,237,0.06)',
                        border: '1px solid rgba(124,58,237,0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                        marginBottom: 20,
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Shield size={18} />
                        Browserbase Managed Anti-Bot Cloud Browser Credentials
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                            Browserbase API Key (BROWSERBASE_API_KEY)
                          </label>
                          <input
                            type="password"
                            value={browserForm.browserbaseApiKey ?? ''}
                            onChange={(e) => setBrowserField('browserbaseApiKey', e.target.value)}
                            placeholder={browserForm.browserbaseApiKeySet ? '•••••••••••••••• (Saved)' : 'bb_...'}
                            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                            Project ID (BROWSERBASE_PROJECT_ID)
                          </label>
                          <input
                            type="text"
                            value={browserForm.browserbaseProjectId ?? ''}
                            onChange={(e) => setBrowserField('browserbaseProjectId', e.target.value)}
                            placeholder="e.g. prj_..."
                            style={inputStyle}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        <ModernToggleCard
                          title="Residential Proxies"
                          description="Auto-rotate stealth proxies for CAPTCHA bypass"
                          checked={browserForm.browserbaseProxies !== false}
                          onChange={(v) => setBrowserField('browserbaseProxies', v)}
                        />
                        <ModernToggleCard
                          title="Keep-Alive Sessions"
                          description="Reconnect after disconnects without loss"
                          checked={browserForm.browserbaseKeepAlive !== false}
                          onChange={(v) => setBrowserField('browserbaseKeepAlive', v)}
                        />
                        <ModernToggleCard
                          title="Advanced Stealth"
                          description="Custom Chromium fingerprinting (Scale plan)"
                          checked={Boolean(browserForm.browserbaseAdvancedStealth)}
                          onChange={(v) => setBrowserField('browserbaseAdvancedStealth', v)}
                        />
                      </div>
                    </div>
                  )}

                  {/* 4. Browser Use 3.0 Cloud & Harness */}
                  {browserForm.provider === 'browser_use' && (
                    <div
                      style={{
                        padding: 22,
                        borderRadius: 'var(--radius-lg)',
                        background: 'rgba(236,72,153,0.06)',
                        border: '1px solid rgba(236,72,153,0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                        marginBottom: 20,
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#ec4899', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Zap size={18} />
                        Browser Use CLI 3.0 Web Automation Harness
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                            Browser Use API Key (Optional for Cloud)
                          </label>
                          <input
                            type="password"
                            value={browserForm.browserUseApiKey ?? ''}
                            onChange={(e) => setBrowserField('browserUseApiKey', e.target.value)}
                            placeholder={browserForm.browserUseApiKeySet ? '•••••••••••••••• (Saved)' : 'bu_...'}
                            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                            Driver Backend Mode (browser.backend)
                          </label>
                          <select
                            value={browserForm.backend || 'auto'}
                            onChange={(e) => setBrowserField('backend', e.target.value)}
                            style={selectStyle}
                          >
                            <option value="auto">Auto (Use browser-use CLI if installed)</option>
                            <option value="browser-use">Force Browser Use CLI 3.0 Harness</option>
                            <option value="builtin">Built-in Hermes Browser Tools (off)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 5. Firecrawl */}
                  {browserForm.provider === 'firecrawl' && (
                    <div
                      style={{
                        padding: 22,
                        borderRadius: 'var(--radius-lg)',
                        background: 'rgba(234,88,12,0.06)',
                        border: '1px solid rgba(234,88,12,0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                        marginBottom: 20,
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#ea580c', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Globe size={18} />
                        Firecrawl Cloud & Self-Hosted Engine
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                            Firecrawl API Key (FIRECRAWL_API_KEY)
                          </label>
                          <input
                            type="password"
                            value={browserForm.firecrawlApiKey ?? ''}
                            onChange={(e) => setBrowserField('firecrawlApiKey', e.target.value)}
                            placeholder={browserForm.firecrawlApiKeySet ? '•••••••••••••••• (Saved)' : 'fc-...'}
                            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                            Firecrawl API Endpoint URL
                          </label>
                          <input
                            type="text"
                            value={browserForm.firecrawlApiUrl ?? 'https://api.firecrawl.dev'}
                            onChange={(e) => setBrowserField('firecrawlApiUrl', e.target.value)}
                            placeholder="https://api.firecrawl.dev or http://localhost:3002"
                            style={inputStyle}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 6. Camofox */}
                  {browserForm.provider === 'camofox' && (
                    <div
                      style={{
                        padding: 22,
                        borderRadius: 'var(--radius-lg)',
                        background: 'rgba(139,92,246,0.06)',
                        border: '1px solid rgba(139,92,246,0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                        marginBottom: 20,
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Eye size={18} />
                        Camofox Self-Hosted Anti-Detection Firefox (C++ Fingerprint Spoofing)
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                            Camofox Control API URL (CAMOFOX_URL)
                          </label>
                          <input
                            type="text"
                            value={browserForm.camofoxUrl ?? 'http://localhost:9377'}
                            onChange={(e) => setBrowserField('camofoxUrl', e.target.value)}
                            placeholder="http://localhost:9377"
                            style={inputStyle}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                            Loopback Host Alias
                          </label>
                          <input
                            type="text"
                            value={browserForm.camofoxLoopbackHostAlias ?? 'host.docker.internal'}
                            onChange={(e) => setBrowserField('camofoxLoopbackHostAlias', e.target.value)}
                            placeholder="host.docker.internal"
                            style={inputStyle}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                        <ModernToggleCard
                          title="Managed Persistence"
                          description="Keep cookies & logins alive across agent tasks"
                          checked={browserForm.camofoxManagedPersistence !== false}
                          onChange={(v) => setBrowserField('camofoxManagedPersistence', v)}
                        />
                        <ModernToggleCard
                          title="Rewrite Loopback URLs"
                          description="Rewrite 127.0.0.1 to host.docker.internal for container"
                          checked={browserForm.camofoxRewriteLoopbackUrls !== false}
                          onChange={(v) => setBrowserField('camofoxRewriteLoopbackUrls', v)}
                        />
                        <ModernToggleCard
                          title="Adopt Existing Tabs"
                          description="Attach to running tabs opened by external apps"
                          checked={browserForm.camofoxAdoptExistingTab !== false}
                          onChange={(v) => setBrowserField('camofoxAdoptExistingTab', v)}
                        />
                      </div>
                    </div>
                  )}

                  {/* ── Universal Browser Options & Policies ─────────────────── */}
                  <div style={{ marginTop: 12 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Sliders size={18} style={{ color: 'var(--text-accent)' }} />
                      Universal Browser Capabilities & Policies
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 20 }}>
                      <ModernToggleCard
                        title="Headless Mode (browser.headless)"
                        description="Run browser in background without visible window frame. Turn off for headed mode."
                        checked={browserForm.headless !== false}
                        onChange={(v) => setBrowserField('headless', v)}
                        icon={Laptop}
                      />

                      <ModernToggleCard
                        title="Vision & Visual AI (browser.vision_enabled)"
                        description="Allow Hermes to capture screenshots and run multimodal reasoning over page visual layout."
                        checked={browserForm.visionEnabled !== false}
                        onChange={(v) => setBrowserField('visionEnabled', v)}
                        icon={Eye}
                      />

                      <ModernToggleCard
                        title="Session Recording (WebM)"
                        description="Record full browser sessions as WebM video files in ~/.hermes/browser_recordings/."
                        checked={Boolean(browserForm.recordSessions)}
                        onChange={(v) => setBrowserField('recordSessions', v)}
                        icon={Video}
                      />

                      <ModernToggleCard
                        title="Hybrid Routing (LAN/Local Sidecar)"
                        description="Auto-spawn local sidecar for localhost / 127.0.0.1 / private LAN URLs even when using cloud."
                        checked={browserForm.autoLocalForPrivateUrls !== false}
                        onChange={(v) => setBrowserField('autoLocalForPrivateUrls', v)}
                        icon={Server}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                      <div style={{ padding: 18, borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                          Inactivity Timeout ({browserForm.inactivityTimeout ?? 120}s)
                        </label>
                        <input
                          type="range"
                          min="30"
                          max="600"
                          step="15"
                          value={browserForm.inactivityTimeout ?? 120}
                          onChange={(e) => setBrowserField('inactivityTimeout', Number(e.target.value))}
                          style={{ width: '100%', accentColor: '#7c3aed', cursor: 'pointer' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          <span>30s</span><span>120s (Default)</span><span>600s</span>
                        </div>
                      </div>

                      <div style={{ padding: 18, borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                          Native JS Dialog Policy
                        </label>
                        <select
                          value={browserForm.dialogPolicy || 'must_respond'}
                          onChange={(e) => setBrowserField('dialogPolicy', e.target.value)}
                          style={selectStyle}
                        >
                          <option value="must_respond">Must Respond (Agent inspects alert/confirm/prompt)</option>
                          <option value="auto_dismiss">Auto-Dismiss (Reject all native dialogs)</option>
                          <option value="auto_accept">Auto-Accept (Accept all native dialogs)</option>
                        </select>
                      </div>

                      <div style={{ padding: 18, borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                          Chromium CLI Flags (AGENT_BROWSER_ARGS)
                        </label>
                        <input
                          type="text"
                          value={browserForm.agentBrowserArgs ?? '--no-sandbox,--disable-dev-shm-usage'}
                          onChange={(e) => setBrowserField('agentBrowserArgs', e.target.value)}
                          style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                          placeholder="--no-sandbox,--disable-dev-shm-usage"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── Test Browser Connection Bar ──────────────────────────── */}
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        type="button"
                        onClick={handleTestBrowser}
                        disabled={testingBrowser}
                        className="btn"
                        style={{
                          background: 'linear-gradient(135deg, rgba(6,182,212,0.18), rgba(124,58,237,0.12))',
                          border: '1px solid rgba(6,182,212,0.4)',
                          color: '#06b6d4',
                          padding: '10px 20px',
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        {testingBrowser ? <Loader size={15} className="spin" /> : <Compass size={15} />}
                        <span>Test Browser Connection</span>
                      </button>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Tests WebSocket CDP handshake with {browserForm.provider === 'kitesurf_cdp' ? 'Cloudflare Kitesurf' : (browserForm.provider || 'local browser')}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="btn btn-primary"
                      style={{ padding: '10px 24px', fontSize: 13, fontWeight: 800 }}
                    >
                      {saving ? <><span className="spinner" /> Saving...</> : '💾 Save Browser Settings'}
                    </button>
                  </div>

                  {/* Browser Test Results */}
                  {browserTestResult && (
                    <div
                      style={{
                        marginTop: 16,
                        padding: '14px 18px',
                        borderRadius: 'var(--radius-md)',
                        background: browserTestResult.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                        border: `1px solid ${browserTestResult.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        fontSize: 13,
                        color: browserTestResult.ok ? '#10b981' : '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {browserTestResult.ok ? <CheckCircle size={18} /> : <XCircle size={18} />}
                        <span style={{ fontWeight: 700 }}>{browserTestResult.message}</span>
                      </div>

                      {browserTestResult.latencyMs && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--bg-overlay)', color: 'var(--text-secondary)', fontSize: 11 }}>
                            ⚡ Latency: {browserTestResult.latencyMs} ms
                          </span>
                          {browserTestResult.details?.product && (
                            <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(6,182,212,0.15)', color: '#06b6d4', fontSize: 11, fontWeight: 700 }}>
                              Engine: {browserTestResult.details.product}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* ── Global Hermes & WebUI Sync Verification Panel ────────────── */}
                <section className="glass-card" style={{ padding: 26, border: '1px solid rgba(124,58,237,0.25)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Shield style={{ color: '#10b981' }} size={20} />
                        Global Hermes & WebUI Configuration Synchronization
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                        Verifies that Hermes WebUI and Hermes Agent CLI share identical active configuration, browser backends, and toolsets across all profile paths.
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        type="button"
                        onClick={handleForceResync}
                        disabled={resyncingConfigs}
                        className="btn"
                        style={{
                          background: 'rgba(124,58,237,0.12)',
                          border: '1px solid rgba(124,58,237,0.3)',
                          color: 'var(--text-accent)',
                          padding: '8px 14px',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {resyncingConfigs ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />}
                        <span>Force Re-Sync All Profiles</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowConfigInspector(!showConfigInspector);
                          loadSyncStatus();
                        }}
                        className="btn"
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-primary)',
                          padding: '8px 14px',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        <Code2 size={14} />
                        <span>{showConfigInspector ? 'Hide Raw Files' : 'Inspect Live Files'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Sync Status Badge Grid */}
                  {syncStatus && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 16 }}>
                      {syncStatus.fileStatuses.map((f) => (
                        <div
                          key={f.path}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 'var(--radius-md)',
                            background: f.exists ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                            border: `1px solid ${f.exists ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{f.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {f.path}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            {f.exists ? (
                              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 700 }}>
                                ✓ Active ({f.sizeBytes} B)
                              </span>
                            ) : (
                              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700 }}>
                                ✗ Missing
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Expandable Live File Inspector */}
                  {showConfigInspector && syncStatus && (
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 'var(--radius-md)',
                        background: '#090d16',
                        border: '1px solid rgba(124,58,237,0.3)',
                        marginTop: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => setConfigInspectorTab('yaml')}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 4,
                              background: configInspectorTab === 'yaml' ? 'rgba(124,58,237,0.3)' : 'transparent',
                              border: `1px solid ${configInspectorTab === 'yaml' ? '#7c3aed' : 'transparent'}`,
                              color: configInspectorTab === 'yaml' ? '#fff' : 'var(--text-muted)',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            config.yaml (Live)
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfigInspectorTab('mcp')}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 4,
                              background: configInspectorTab === 'mcp' ? 'rgba(124,58,237,0.3)' : 'transparent',
                              border: `1px solid ${configInspectorTab === 'mcp' ? '#7c3aed' : 'transparent'}`,
                              color: configInspectorTab === 'mcp' ? '#fff' : 'var(--text-muted)',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            mcp.json (Live)
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const text = configInspectorTab === 'yaml' ? syncStatus.rawConfigYaml : syncStatus.rawMcpJson;
                            navigator.clipboard.writeText(text);
                            setCopiedConfig(true);
                            setTimeout(() => setCopiedConfig(false), 2000);
                          }}
                          className="btn"
                          style={{ padding: '4px 10px', fontSize: 11 }}
                        >
                          {copiedConfig ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                          <span>{copiedConfig ? 'Copied!' : 'Copy'}</span>
                        </button>
                      </div>

                      <pre
                        style={{
                          margin: 0,
                          padding: 14,
                          borderRadius: 6,
                          background: '#040711',
                          color: '#a7f3d0',
                          fontSize: 12,
                          lineHeight: 1.5,
                          maxHeight: 320,
                          overflowY: 'auto',
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                        }}
                      >
                        {configInspectorTab === 'yaml' ? (syncStatus.rawConfigYaml || '# No config.yaml found') : (syncStatus.rawMcpJson || '{}')}
                      </pre>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 2: MODEL & API PROVIDER
               ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'model' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <section className="glass-card" style={{ padding: 28 }}>
                  <SectionHeader
                    icon={Bot}
                    title="LLM Provider & Gateway Selection"
                    subtitle="Choose how Hermes connects to language models for reasoning and tool execution"
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 24 }}>
                    {PROVIDERS.map((p) => {
                      const isSelected = form.provider === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setField('provider', p.value)}
                          style={{
                            padding: '16px 18px',
                            textAlign: 'left',
                            borderRadius: 'var(--radius-lg)',
                            cursor: 'pointer',
                            background: isSelected
                              ? 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(6,182,212,0.08))'
                              : 'var(--bg-elevated)',
                            border: `1px solid ${isSelected ? 'rgba(124,58,237,0.5)' : 'var(--border)'}`,
                            boxShadow: isSelected ? '0 4px 20px rgba(124,58,237,0.2)' : 'none',
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: 12,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 20 }}>{p.icon}</span>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{p.label}</div>
                                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-overlay)', color: 'var(--text-muted)' }}>
                                  {p.badge}
                                </span>
                              </div>
                            </div>

                            <div
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: '50%',
                                border: `2px solid ${isSelected ? '#7c3aed' : 'var(--border)'}`,
                                background: isSelected ? '#7c3aed' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                              }}
                            >
                              {isSelected && <Check size={12} />}
                            </div>
                          </div>

                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{p.desc}</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Dynamic Endpoint Configuration */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {form.provider === 'custom_openai' && (
                      <div
                        style={{
                          padding: 20,
                          borderRadius: 'var(--radius-lg)',
                          background: 'rgba(124,58,237,0.04)',
                          border: '1px solid rgba(124,58,237,0.2)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Custom OpenAI-Compatible Base URL
                          </label>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Must include <code style={{ fontFamily: 'var(--font-mono)' }}>/v1</code></span>
                        </div>

                        <input
                          type="text"
                          value={(form.baseUrl as string) ?? ''}
                          onChange={(e) => setField('baseUrl', e.target.value)}
                          placeholder="https://app-fcbf4053-74e6-4498-ac0e-eb160010a3c5.cleverapps.io/v1"
                          style={inputStyle}
                        />

                        {/* Quick Preset Buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Quick Presets:</span>
                          {[
                            { name: 'Local vLLM / Ollama', url: 'http://127.0.0.1:11434/v1' },
                            { name: 'OpenRouter /v1', url: 'https://openrouter.ai/api/v1' },
                            { name: 'Together AI', url: 'https://api.together.xyz/v1' },
                          ].map((preset) => (
                            <button
                              key={preset.name}
                              type="button"
                              onClick={() => setField('baseUrl', preset.url)}
                              style={{
                                padding: '3px 8px',
                                fontSize: 11,
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border)',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                              }}
                            >
                              {preset.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Model Selector */}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Active Model Identifier
                      </label>

                      {form.provider === 'custom_openai' || form.provider === 'ollama' ? (
                        <div style={{ display: 'flex', gap: 10 }}>
                          <input
                            type="text"
                            value={(form.model as string) ?? ''}
                            onChange={(e) => setField('model', e.target.value)}
                            placeholder="e.g. deepseek-chat, hermes-3-llama-3.1-405b, claude-3-5-sonnet"
                            style={{ ...inputStyle, flex: 1, fontFamily: 'var(--font-mono)' }}
                          />
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <select
                            value={(form.model as string) ?? ''}
                            onChange={(e) => setField('model', e.target.value)}
                            style={{ ...selectStyle, flex: 1, minWidth: 240 }}
                          >
                            {models.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <input
                            type="text"
                            value={(form.model as string) ?? ''}
                            onChange={(e) => setField('model', e.target.value)}
                            placeholder="Or enter custom model ID..."
                            style={{ ...inputStyle, flex: 1, minWidth: 200, fontFamily: 'var(--font-mono)' }}
                          />
                        </div>
                      )}
                    </div>

                    {/* API Key Vault Card */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          API Key & Credentials
                        </label>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {hermesSettings?.apiKeySet ? '🔒 Encrypted key currently active' : '⚠️ No key configured'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                          <input
                            type={showApiKey ? 'text' : 'password'}
                            value={(form.apiKey as string) ?? ''}
                            onChange={(e) => setField('apiKey', e.target.value)}
                            placeholder={hermesSettings?.apiKeySet ? '•••••••••••••••••••••••• (Saved in DB)' : 'Paste API Key (cag_... / sk-or-...) ...'}
                            style={{ ...inputStyle, paddingRight: 40, fontFamily: 'var(--font-mono)' }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey((v) => !v)}
                            style={{
                              position: 'absolute',
                              right: 12,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--text-muted)',
                              padding: 4,
                            }}
                          >
                            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={handleTest}
                          disabled={testing}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '0 20px',
                            fontSize: 13,
                            fontWeight: 700,
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            color: 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {testing ? <Loader size={14} className="spin" /> : <FlaskConical size={14} style={{ color: '#06b6d4' }} />}
                          <span>Test Endpoint</span>
                        </button>
                      </div>

                      {/* Connection Test Result Badge */}
                      {testResult && (
                        <div
                          style={{
                            marginTop: 12,
                            padding: '12px 16px',
                            borderRadius: 'var(--radius-md)',
                            background: testResult.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                            border: `1px solid ${testResult.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                            fontSize: 12,
                            color: testResult.ok ? '#10b981' : '#ef4444',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          {testResult.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
                          <span style={{ flex: 1, fontWeight: 600 }}>{testResult.message}</span>
                          {testResult.latencyMs && (
                            <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--bg-overlay)', color: 'var(--text-secondary)' }}>
                              ⚡ {testResult.latencyMs} ms
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Hyperparameters Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginTop: 8 }}>
                      <div style={{ padding: 18, borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Temperature</span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-accent)', fontFamily: 'var(--font-mono)' }}>
                            {((form.temperature as number ?? 70) / 100).toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={form.temperature as number ?? 70}
                          onChange={(e) => setField('temperature', Number(e.target.value))}
                          style={{ width: '100%', accentColor: '#7c3aed', cursor: 'pointer' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                          <span>0.0 (Precise / Code)</span>
                          <span>0.7 (Default)</span>
                          <span>1.0 (Creative)</span>
                        </div>
                      </div>

                      <div style={{ padding: 18, borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Context Window (Tokens)</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#06b6d4', fontFamily: 'var(--font-mono)' }}>
                            {Number(form.contextWindow ?? 128000).toLocaleString()}
                          </span>
                        </div>
                        <input
                          type="number"
                          min="4096"
                          max="1000000"
                          step="4096"
                          value={form.contextWindow as number ?? 128000}
                          onChange={(e) => setField('contextWindow', Number(e.target.value))}
                          style={inputStyle}
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          {[32000, 64000, 128000, 200000].map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setField('contextWindow', t)}
                              style={{
                                padding: '2px 6px',
                                fontSize: 10,
                                borderRadius: 4,
                                background: form.contextWindow === t ? 'rgba(6,182,212,0.2)' : 'var(--bg-overlay)',
                                border: '1px solid var(--border)',
                                color: form.contextWindow === t ? '#06b6d4' : 'var(--text-muted)',
                                cursor: 'pointer',
                              }}
                            >
                              {(t / 1000)}k
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 3: EXECUTION & SANDBOX
               ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'execution' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <section className="glass-card" style={{ padding: 28 }}>
                  <SectionHeader
                    icon={Cpu}
                    title="Execution Sandbox & Multi-Core Allocation"
                    subtitle="Control command execution isolation, container limits, and safety approval modes"
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {/* Execution Backends */}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Execution Runtime Backend
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                        {[
                          { value: 'local', label: 'Local Host Container', icon: '🖥️', desc: 'Direct execution in Clever Cloud Linux container' },
                          { value: 'docker', label: 'Docker Sandboxing', icon: '🐳', desc: 'Isolated cgroup with explicit CPU/RAM constraints' },
                          { value: 'ssh', label: 'Remote SSH Target', icon: '🔐', desc: 'Secure tunnel to external server target' },
                        ].map((opt) => {
                          const isSelected = form.executionBackend === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setField('executionBackend', opt.value)}
                              style={{
                                padding: '16px',
                                borderRadius: 'var(--radius-lg)',
                                textAlign: 'left',
                                cursor: 'pointer',
                                background: isSelected ? 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(6,182,212,0.08))' : 'var(--bg-elevated)',
                                border: `1px solid ${isSelected ? 'rgba(124,58,237,0.5)' : 'var(--border)'}`,
                                boxShadow: isSelected ? '0 4px 16px rgba(124,58,237,0.15)' : 'none',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <div style={{ fontSize: 24, marginBottom: 8 }}>{opt.icon}</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{opt.label}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{opt.desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Multi-Core & Resource Sliders */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                      <div style={{ padding: 18, borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>CPU Core Limit</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: '#06b6d4' }}>
                            {form.containerCpu === 0 ? '⚡ 12 Cores (All Host)' : `${form.containerCpu ?? 0} Cores`}
                          </span>
                        </div>
                        <select
                          value={(form.containerCpu as number) ?? 0}
                          onChange={(e) => setField('containerCpu', Number(e.target.value))}
                          style={selectStyle}
                        >
                          <option value={0}>⚡ Auto / All 12 Cores (Max Performance)</option>
                          <option value={1}>1 Core (Low Power)</option>
                          <option value={2}>2 Cores</option>
                          <option value={4}>4 Cores</option>
                          <option value={8}>8 Cores</option>
                          <option value={12}>12 Cores (Dedicated Full)</option>
                        </select>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                          Clever Cloud 2XL instance detected with 12 CPU cores.
                        </p>
                      </div>

                      <div style={{ padding: 18, borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Memory Cap</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-accent)' }}>
                            {((form.containerMemoryMb as number ?? 4096) / 1024).toFixed(0)} GB
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1024"
                          max="24576"
                          step="1024"
                          value={form.containerMemoryMb as number ?? 4096}
                          onChange={(e) => setField('containerMemoryMb', Number(e.target.value))}
                          style={{ width: '100%', accentColor: '#7c3aed', cursor: 'pointer' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          <span>1 GB</span>
                          <span>12 GB</span>
                          <span>24 GB (Full RAM)</span>
                        </div>
                      </div>

                      <div style={{ padding: 18, borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Execution Timeout</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)' }}>
                            {Number(form.timeoutSeconds ?? 300)}s
                          </span>
                        </div>
                        <input
                          type="number"
                          min="30"
                          max="3600"
                          step="30"
                          value={form.timeoutSeconds as number ?? 300}
                          onChange={(e) => setField('timeoutSeconds', Number(e.target.value))}
                          style={inputStyle}
                        />
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                          Auto-kills runaway commands after deadline.
                        </p>
                      </div>
                    </div>

                    {/* Security & Command Approval Mode */}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Command Approval Security Policy
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[
                          {
                            value: 'ask_destructive',
                            label: 'Ask for Destructive Commands Only (Recommended)',
                            desc: 'Auto-executes safe read/inspect commands (ls, git status, cat); prompts for git push, rm, delete, npm install.',
                            badge: 'Recommended',
                            badgeColor: '#10b981',
                          },
                          {
                            value: 'always_ask',
                            label: 'Always Ask (Maximum Security)',
                            desc: 'Requires manual human confirmation before executing any shell command.',
                            badge: 'High Security',
                            badgeColor: '#06b6d4',
                          },
                          {
                            value: 'auto_approve',
                            label: 'Auto-Approve All Commands (Autonomous)',
                            desc: '⚠️ Full autonomous mode — runs all shell operations immediately without stopping for prompt approvals.',
                            badge: 'Caution',
                            badgeColor: '#ef4444',
                          },
                        ].map((opt) => {
                          const isSelected = form.commandApprovalMode === opt.value;
                          return (
                            <label
                              key={opt.value}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 14,
                                cursor: 'pointer',
                                padding: '16px 18px',
                                borderRadius: 'var(--radius-lg)',
                                background: isSelected ? 'rgba(124,58,237,0.08)' : 'var(--bg-elevated)',
                                border: `1px solid ${isSelected ? 'rgba(124,58,237,0.4)' : 'var(--border)'}`,
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <input
                                type="radio"
                                name="approvalMode"
                                value={opt.value}
                                checked={isSelected}
                                onChange={() => setField('commandApprovalMode', opt.value)}
                                style={{ marginTop: 3, accentColor: '#7c3aed' }}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{opt.label}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: `${opt.badgeColor}20`, color: opt.badgeColor }}>
                                    {opt.badge}
                                  </span>
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{opt.desc}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 4: MEMORY & SKILLS
               ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'memory' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <section className="glass-card" style={{ padding: 28 }}>
                  <SectionHeader
                    icon={Brain}
                    title="Cross-Session Memory & Persona"
                    subtitle="Configure persistent memories, autonomous skill generation, and customized agent instructions"
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                      <ModernToggleCard
                        title="Cross-Session Memory"
                        description="Hermes stores architectural decisions, project conventions, and user preferences in ~/.hermes/memory/ across sessions."
                        checked={form.persistentMemory as boolean ?? true}
                        onChange={(v) => setField('persistentMemory', v)}
                        icon={Layers}
                      />

                      <ModernToggleCard
                        title="Autonomous Skill Creation"
                        description="Automatically generates reusable modular skills in ~/.hermes/skills/ when completing complex multi-step tasks."
                        checked={form.autoSkillCreation as boolean ?? false}
                        onChange={(v) => setField('autoSkillCreation', v)}
                        icon={Sparkles}
                      />
                    </div>

                    {/* Persona Editor */}
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          System Prompt & Developer Persona
                        </label>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {(form.systemPrompt as string ?? '').length} characters
                        </span>
                      </div>

                      {/* Persona Quick Templates */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Apply Template:</span>
                        {PERSONA_TEMPLATES.map((tmpl) => (
                          <button
                            key={tmpl.name}
                            type="button"
                            onClick={() => setField('systemPrompt', tmpl.prompt)}
                            style={{
                              padding: '4px 10px',
                              fontSize: 11,
                              fontWeight: 600,
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--bg-elevated)',
                              border: '1px solid var(--border)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                            }}
                          >
                            + {tmpl.name}
                          </button>
                        ))}
                      </div>

                      <textarea
                        value={(form.systemPrompt as string) ?? ''}
                        onChange={(e) => setField('systemPrompt', e.target.value)}
                        placeholder="Customize Hermes' developer personality, language rules, coding standards, and architectural instructions. Leave blank for default."
                        rows={6}
                        style={{
                          ...inputStyle,
                          lineHeight: 1.6,
                          resize: 'vertical',
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                        Default: "You are Hermes, an expert AI co-developer embedded in CleverCoder IDE."
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 5: TOOLS & MCP
               ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'tools' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <section className="glass-card" style={{ padding: 28 }}>
                  <SectionHeader
                    icon={Wrench}
                    title="Agent Capabilities & Tool Access"
                    subtitle="Enable or disable the built-in system tools that Hermes can invoke during conversation turns"
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                    {TOOLS_LIST.map((tool) => {
                      const enabledTools = (form.enabledTools as string[] ?? ['shell', 'code_runner', 'web_search', 'browser', 'vision']);
                      const isEnabled = enabledTools.includes(tool.id);
                      const Icon = tool.icon;

                      return (
                        <div
                          key={tool.id}
                          style={{
                            padding: '18px 20px',
                            borderRadius: 'var(--radius-lg)',
                            background: isEnabled ? 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(6,182,212,0.04))' : 'var(--bg-elevated)',
                            border: `1px solid ${isEnabled ? 'rgba(124,58,237,0.3)' : 'var(--border)'}`,
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 16,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 'var(--radius-md)',
                                background: `${tool.color}15`,
                                border: `1px solid ${tool.color}30`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: tool.color,
                                flexShrink: 0,
                              }}
                            >
                              <Icon size={18} />
                            </div>

                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{tool.label}</span>
                                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: isEnabled ? 'rgba(16,185,129,0.15)' : 'var(--bg-overlay)', color: isEnabled ? '#10b981' : 'var(--text-muted)', fontWeight: 700 }}>
                                  {isEnabled ? 'Active' : 'Disabled'}
                                </span>
                              </div>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0', lineHeight: 1.4 }}>
                                {tool.desc}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const next = isEnabled
                                ? enabledTools.filter((t) => t !== tool.id)
                                : [...enabledTools, tool.id];
                              setField('enabledTools', next);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: isEnabled ? '#7c3aed' : 'var(--text-muted)',
                              padding: 2,
                            }}
                          >
                            {isEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 6: S3 & STORAGE
               ══════════════════════════════════════════════════════════════ */}
            {activeTab === 's3' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <section className="glass-card" style={{ padding: 28 }}>
                  <SectionHeader
                    icon={Database}
                    title="Cellar S3 Object Storage & Archival"
                    subtitle="Configure trajectory sync, message offloading, and compressed conversation exports"
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <ModernToggleCard
                      title="Automated S3 Archiving"
                      description="Automatically offload large tool outputs, code diffs, and trajectory states to Clever Cloud Cellar S3."
                      checked={form.s3ArchivingEnabled as boolean ?? true}
                      onChange={(v) => setField('s3ArchivingEnabled', v)}
                      icon={HardDrive}
                    />

                    {/* S3 Specs Banner */}
                    <div
                      style={{
                        padding: 20,
                        borderRadius: 'var(--radius-lg)',
                        background: 'linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(124,58,237,0.04) 100%)',
                        border: '1px solid rgba(6,182,212,0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>📦 Cellar S3 Bucket Routing</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                        <div style={{ padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Artifacts Prefix</span>
                          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginTop: 4 }}>
                            hermes/artifacts/&#123;userId&#125;/
                          </div>
                        </div>
                        <div style={{ padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Trajectories Prefix</span>
                          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginTop: 4 }}>
                            hermes/trajectories/&#123;userId&#125;/
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Storage Policies */}
                    <div style={{ padding: 20, borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px', color: 'var(--text-primary)' }}>Storage & Sync Retention Policy</h4>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                        <li>Message payloads &le; 10 KB stay in PostgreSQL for high-speed indexing.</li>
                        <li>Heavy tool outputs, file diffs, and execution logs &gt; 10 KB are automatically offloaded to Cellar S3.</li>
                        <li>Full workspace snapshots are synchronized bidirectional via <code style={{ fontFamily: 'var(--font-mono)' }}>rclone bisync</code>.</li>
                        <li>Gzip-compressed JSON trajectory exports available for offline auditing and fine-tuning datasets.</li>
                      </ul>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 7: HERMES STANDALONE WEBUI
               ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'webui' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <section className="glass-card" style={{ padding: 28 }}>
                  <SectionHeader
                    icon={Globe}
                    title="Hermes Standalone WebUI Portal"
                    subtitle="Manage and launch the official multi-panel nesquena/hermes-webui interface"
                  />

                  {/* Launch Hero Card */}
                  <div
                    style={{
                      padding: 24,
                      background: 'linear-gradient(135deg, rgba(124,58,237,0.2) 0%, rgba(6,182,212,0.15) 100%)',
                      border: '1px solid rgba(124,58,237,0.4)',
                      borderRadius: 'var(--radius-xl)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 16,
                      boxShadow: '0 8px 32px rgba(124,58,237,0.25)',
                      marginBottom: 20,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 280 }}>
                      <h3 style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Globe size={20} style={{ color: '#06b6d4' }} />
                        Official Standalone WebUI Interface
                      </h3>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', margin: 0, lineHeight: 1.5 }}>
                        Launch the complete 3-panel Hermes WebUI with interactive chat, workspace session trees, terminal, memory explorer, and browser automation tools.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.hermes.launchWebUI();
                          if (res?.url) window.open(res.url, '_blank', 'noopener,noreferrer');
                        } catch (err) {
                          console.error('Launch WebUI error:', err);
                        }
                      }}
                      className="btn"
                      style={{
                        background: '#fff',
                        color: '#7c3aed',
                        padding: '12px 24px',
                        fontSize: 14,
                        fontWeight: 800,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                      }}
                    >
                      <span>Open Hermes WebUI</span>
                      <ExternalLink size={16} />
                    </button>
                  </div>

                  {/* WebUI Settings Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                    <div style={{ padding: 18, borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                        Internal WebUI Port
                      </label>
                      <input
                        type="number"
                        value={Number(form.webuiPort ?? 8787)}
                        onChange={(e) => setField('webuiPort', Number(e.target.value))}
                        style={inputStyle}
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginTop: 6 }}>
                        Loopback port inside container (default: 8787). Proxied via <code style={{ fontFamily: 'var(--font-mono)' }}>/hermes-ui/*</code>.
                      </span>
                    </div>

                    <div style={{ padding: 18, borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                        Optional Access Password
                      </label>
                      <input
                        type="password"
                        value={String(form.webuiPassword ?? '')}
                        onChange={(e) => setField('webuiPassword', e.target.value)}
                        placeholder="•••••••• (optional)"
                        style={inputStyle}
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginTop: 6 }}>
                        Injected as <code style={{ fontFamily: 'var(--font-mono)' }}>HERMES_WEBUI_PASSWORD</code> for password protection.
                      </span>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 8: JOB SCHEDULER & GATEWAY DAEMON
               ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'scheduler' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {schedulerActionMsg && (
                  <div
                    style={{
                      padding: '12px 18px',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: 13,
                      fontWeight: 600,
                      background: schedulerActionMsg.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                      border: `1px solid ${schedulerActionMsg.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      color: schedulerActionMsg.type === 'success' ? '#10b981' : '#ef4444',
                    }}
                  >
                    {schedulerActionMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    <span style={{ flex: 1 }}>{schedulerActionMsg.text}</span>
                    <button
                      type="button"
                      onClick={() => setSchedulerActionMsg(null)}
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Gateway Daemon Status Command Center */}
                <section className="glass-card" style={{ padding: 24, position: 'relative', overflow: 'hidden' }}>
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 4,
                      background: gatewayStatus?.active
                        ? 'linear-gradient(90deg, #10b981, #06b6d4)'
                        : 'linear-gradient(90deg, #ef4444, #f59e0b)',
                    }}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: 'var(--radius-lg)',
                          background: gatewayStatus?.active ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          border: `1px solid ${gatewayStatus?.active ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: gatewayStatus?.active ? '#10b981' : '#ef4444',
                        }}
                      >
                        <Activity size={24} />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                            Hermes Gateway Daemon Supervisor
                          </h3>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '3px 10px',
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              background: gatewayStatus?.active ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                              color: gatewayStatus?.active ? '#10b981' : '#ef4444',
                              border: `1px solid ${gatewayStatus?.active ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: gatewayStatus?.active ? '#10b981' : '#ef4444' }} />
                            {gatewayStatus?.active ? 'Active & Ticking (15s Heartbeat)' : 'Offline / Inactive'}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                          Autonomous background tick manager runs recurring tasks, synchronizes jobs.json, and streams logs.
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={handleRestartGateway}
                        disabled={restartingGateway || loadingGateway}
                        className="btn"
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-primary)',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        <RefreshCw size={13} className={restartingGateway ? 'spin' : ''} />
                        <span>Restart Daemon</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleToggleGateway}
                        disabled={loadingGateway || restartingGateway}
                        className="btn"
                        style={{
                          background: gatewayStatus?.active ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                          border: `1px solid ${gatewayStatus?.active ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                          color: gatewayStatus?.active ? '#ef4444' : '#10b981',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {gatewayStatus?.active ? <Pause size={13} /> : <Play size={13} />}
                        <span>{gatewayStatus?.active ? 'Pause Daemon' : 'Start Daemon'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await api.hermes.launchWebUI();
                            if (res?.url) window.open(`${res.url}#tasks`, '_blank', 'noopener,noreferrer');
                          } catch {}
                        }}
                        className="btn btn-primary"
                        style={{ fontSize: 12, fontWeight: 700 }}
                      >
                        <span>Tasks WebUI</span>
                        <ExternalLink size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Status Metric Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                    <div style={{ padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Process PID</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
                        {gatewayStatus?.pid ? `#${gatewayStatus.pid}` : '—'}
                      </div>
                    </div>

                    <div style={{ padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tick Interval</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#06b6d4', marginTop: 4 }}>
                        60 Seconds
                      </div>
                    </div>

                    <div style={{ padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Cron Tasks</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-accent)', marginTop: 4 }}>
                        {activeJobsCount} / {cronJobs.length}
                      </div>
                    </div>

                    <div style={{ padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Last Heartbeat</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {gatewayStatus?.lastTick ? new Date(gatewayStatus.lastTick).toLocaleTimeString() : 'Recent'}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Scheduled Cron Tasks Table / List */}
                <section className="glass-card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Clock size={18} style={{ color: 'var(--text-accent)' }} />
                        Scheduled Automated Tasks
                      </h3>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                        Configure recurring background agent runs and scheduled maintenance scripts.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowCreateWizard((v) => !v)}
                      className="btn btn-primary"
                      style={{ fontSize: 13, fontWeight: 700 }}
                    >
                      {showCreateWizard ? <span>Cancel</span> : <><Plus size={14} /> <span>New Scheduled Task</span></>}
                    </button>
                  </div>

                  {/* Create Task Form */}
                  <AnimatePresence>
                    {showCreateWizard && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{
                          marginBottom: 24,
                          padding: 24,
                          borderRadius: 'var(--radius-lg)',
                          background: 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(6,182,212,0.04) 100%)',
                          border: '1px solid rgba(124,58,237,0.3)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 18,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
                          <Sparkles size={18} style={{ color: '#06b6d4' }} />
                          Schedule a New Automated Job
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                              Task Name
                            </label>
                            <input
                              type="text"
                              value={newJob.name}
                              onChange={(e) => setNewJob({ ...newJob, name: e.target.value })}
                              placeholder="e.g. Hourly Test Verification & Git Health"
                              style={inputStyle}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                              Schedule Preset
                            </label>
                            <select
                              value={newJob.preset}
                              onChange={(e) => setNewJob({ ...newJob, preset: e.target.value })}
                              style={selectStyle}
                            >
                              <option value="5min">⏱️ Every 5 Minutes (*/5 * * * *)</option>
                              <option value="hourly">🕒 Every Hour (0 * * * *)</option>
                              <option value="daily">☀️ Daily at 09:00 (0 9 * * *)</option>
                              <option value="weekdays">💼 Weekdays at 09:00 (0 9 * * 1-5)</option>
                              <option value="weekly">📅 Weekly on Monday (0 9 * * 1)</option>
                              <option value="custom">⚙️ Custom 5-Field Cron Expression</option>
                            </select>
                          </div>
                        </div>

                        {newJob.preset === 'custom' && (
                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                              Custom Cron Expression (Minute Hour Day Month Weekday)
                            </label>
                            <input
                              type="text"
                              value={newJob.customCron}
                              onChange={(e) => setNewJob({ ...newJob, customCron: e.target.value })}
                              placeholder="0 9 * * *"
                              style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                            />
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                              Target Workspace Directory
                            </label>
                            <select
                              value={newJob.workdir}
                              onChange={(e) => setNewJob({ ...newJob, workdir: e.target.value })}
                              style={selectStyle}
                            >
                              <option value="/workspaces">📁 /workspaces (Default Root)</option>
                              {projectsList.map((p) => (
                                <option key={p.id} value={`/workspaces/${p.id}`}>
                                  📂 {p.name} (/workspaces/{p.id})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                              Execution Mode
                            </label>
                            <div style={{ display: 'flex', gap: 10 }}>
                              <button
                                type="button"
                                onClick={() => setNewJob({ ...newJob, mode: 'agent' })}
                                style={{
                                  flex: 1,
                                  padding: '9px 12px',
                                  borderRadius: 'var(--radius-md)',
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  fontWeight: newJob.mode === 'agent' ? 700 : 500,
                                  background: newJob.mode === 'agent' ? 'rgba(124,58,237,0.2)' : 'var(--bg-elevated)',
                                  border: `1px solid ${newJob.mode === 'agent' ? 'rgba(124,58,237,0.5)' : 'var(--border)'}`,
                                  color: newJob.mode === 'agent' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                }}
                              >
                                🤖 AI Agent Prompt
                              </button>
                              <button
                                type="button"
                                onClick={() => setNewJob({ ...newJob, mode: 'script' })}
                                style={{
                                  flex: 1,
                                  padding: '9px 12px',
                                  borderRadius: 'var(--radius-md)',
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  fontWeight: newJob.mode === 'script' ? 700 : 500,
                                  background: newJob.mode === 'script' ? 'rgba(124,58,237,0.2)' : 'var(--bg-elevated)',
                                  border: `1px solid ${newJob.mode === 'script' ? 'rgba(124,58,237,0.5)' : 'var(--border)'}`,
                                  color: newJob.mode === 'script' ? 'var(--text-primary)' : 'var(--text-secondary)',
                                }}
                              >
                                📜 Shell Script
                              </button>
                            </div>
                          </div>
                        </div>

                        {newJob.mode === 'agent' ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                Agent Instructions
                              </label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setNewJob({
                                      ...newJob,
                                      name: newJob.name || 'Automated Test Verification',
                                      prompt: 'Check repository status, run `pnpm test` or `npm test`, analyze any test failures, and fix broken tests.',
                                    })
                                  }
                                  style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)' }}
                                >
                                  + Test Template
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setNewJob({
                                      ...newJob,
                                      name: newJob.name || 'Git Sync & Health Check',
                                      prompt: 'Check git status, pull latest changes if remote is updated, verify server builds cleanly without errors.',
                                    })
                                  }
                                  style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)' }}
                                >
                                  + Sync Template
                                </button>
                              </div>
                            </div>
                            <textarea
                              value={newJob.prompt}
                              onChange={(e) => setNewJob({ ...newJob, prompt: e.target.value })}
                              placeholder="Describe exactly what Hermes should do on each scheduled execution..."
                              rows={4}
                              style={{ ...inputStyle, resize: 'vertical' }}
                            />
                          </div>
                        ) : (
                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                              Shell Script Command
                            </label>
                            <textarea
                              value={newJob.script}
                              onChange={(e) => setNewJob({ ...newJob, script: e.target.value })}
                              placeholder="git status && pnpm test"
                              rows={3}
                              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
                            />
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => setShowCreateWizard(false)}
                            className="btn"
                            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleCreateJob}
                            disabled={creatingJob}
                            className="btn btn-primary"
                          >
                            {creatingJob ? <Loader size={14} className="spin" /> : <Check size={14} />}
                            <span>Schedule Task</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Tasks List */}
                  {cronJobs.length === 0 ? (
                    <div
                      style={{
                        padding: '48px 24px',
                        textAlign: 'center',
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--bg-elevated)',
                        border: '1px dashed var(--border)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <Clock size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                        No Scheduled Tasks Configured Yet
                      </div>
                      <p style={{ fontSize: 13, margin: '0 0 16px' }}>
                        Click "New Scheduled Task" above to configure your first automated background job.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowCreateWizard(true)}
                        className="btn btn-primary"
                        style={{ fontSize: 12 }}
                      >
                        + Create Your First Task
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                      {cronJobs.map((job) => {
                        const isRunningThis = runningJobId === job.id;
                        const isAgentMode = !job.no_agent;
                        const scheduleLabel =
                          job.schedule_display || (typeof job.schedule === 'string' ? job.schedule : job.schedule?.expression) || '—';

                        return (
                          <div
                            key={job.id}
                            style={{
                              padding: '16px 20px',
                              borderRadius: 'var(--radius-lg)',
                              background: 'var(--bg-elevated)',
                              border: `1px solid ${job.enabled ? 'var(--border)' : 'rgba(255,255,255,0.04)'}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: 16,
                              opacity: job.enabled ? 1 : 0.65,
                              transition: 'all 0.15s',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 280 }}>
                              <div
                                style={{
                                  width: 38,
                                  height: 38,
                                  borderRadius: 'var(--radius-md)',
                                  background: isAgentMode ? 'rgba(124,58,237,0.15)' : 'rgba(6,182,212,0.15)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 18,
                                }}
                              >
                                {isAgentMode ? '🤖' : '📜'}
                              </div>

                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {job.name}
                                  </span>
                                  <span
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: 999,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      background: job.enabled ? 'rgba(16,185,129,0.12)' : 'rgba(156,163,175,0.12)',
                                      color: job.enabled ? '#10b981' : 'var(--text-muted)',
                                    }}
                                  >
                                    {job.enabled ? 'Active' : 'Paused'}
                                  </span>
                                  <span
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: 999,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      background: 'rgba(6,182,212,0.1)',
                                      color: '#06b6d4',
                                      fontFamily: 'var(--font-mono)',
                                    }}
                                  >
                                    {scheduleLabel}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginTop: 6, flexWrap: 'wrap' }}>
                                  <span>Dir: <code style={{ fontFamily: 'var(--font-mono)' }}>{job.workdir || '/workspaces'}</code></span>
                                  {job.last_run_at && (
                                    <span>Last run: {new Date(job.last_run_at).toLocaleTimeString()}</span>
                                  )}
                                  {job.prompt && (
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                                      "{job.prompt}"
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => handleRunJobNow(job.id)}
                                disabled={isRunningThis}
                                className="btn"
                                style={{
                                  background: 'rgba(6,182,212,0.12)',
                                  border: '1px solid rgba(6,182,212,0.3)',
                                  color: '#06b6d4',
                                  padding: '6px 12px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                {isRunningThis ? <Loader size={12} className="spin" /> : <Play size={12} />}
                                <span>Run Now</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleJob(job)}
                                title={job.enabled ? 'Pause job' : 'Resume job'}
                                className="btn"
                                style={{
                                  background: 'var(--bg-overlay)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--text-secondary)',
                                  padding: '6px 10px',
                                }}
                              >
                                {job.enabled ? <Pause size={13} /> : <Play size={13} />}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteJob(job.id)}
                                title="Delete job"
                                className="btn"
                                style={{
                                  background: 'rgba(239,68,68,0.1)',
                                  border: '1px solid rgba(239,68,68,0.3)',
                                  color: '#ef4444',
                                  padding: '6px 10px',
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Gateway Daemon Logs Streamer Terminal Card */}
                <section className="glass-card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Terminal size={16} style={{ color: 'var(--text-accent)' }} />
                      <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                        Live Gateway Daemon Logs
                      </h3>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        (~/.hermes/logs/gateway.log)
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          value={logFilter}
                          onChange={(e) => setLogFilter(e.target.value)}
                          placeholder="Filter logs..."
                          style={{
                            padding: '4px 8px 4px 24px',
                            fontSize: 11,
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-primary)',
                            outline: 'none',
                            width: 140,
                          }}
                        />
                        <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      </div>

                      <button
                        type="button"
                        onClick={loadGatewayLogs}
                        className="btn"
                        style={{ padding: '4px 10px', fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                      >
                        <RefreshCw size={11} />
                        <span>Refresh</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(gatewayLogs.join('\n'));
                          setCopiedLogs(true);
                          setTimeout(() => setCopiedLogs(false), 2000);
                        }}
                        className="btn"
                        style={{ padding: '4px 10px', fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                      >
                        {copiedLogs ? <Check size={11} /> : <Copy size={11} />}
                        <span>{copiedLogs ? 'Copied' : 'Copy'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowLogs((v) => !v)}
                        className="btn"
                        style={{ padding: '4px 10px', fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                      >
                        {showLogs ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      maxHeight: showLogs ? 480 : 180,
                      overflowY: 'auto',
                      background: '#090d16',
                      borderRadius: 'var(--radius-lg)',
                      padding: '14px 18px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: '#d1d5db',
                      lineHeight: 1.6,
                      border: '1px solid var(--border)',
                      transition: 'max-height 0.2s ease',
                    }}
                  >
                    {filteredLogs.length === 0 ? (
                      <div style={{ color: '#6b7280', fontStyle: 'italic' }}>
                        No daemon log entries matching filter. Gateway logs stream here automatically as cron ticks execute.
                      </div>
                    ) : (
                      filteredLogs.map((log, i) => (
                        <div key={i} style={{ wordBreak: 'break-all', display: 'flex', gap: 10 }}>
                          <span style={{ color: '#06b6d4', opacity: 0.7, flexShrink: 0 }}>[{i + 1}]</span>
                          <span>{log}</span>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* ── Sticky Bottom Action Save Bar ──────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 260,
          right: 0,
          padding: '14px 32px',
          background: 'rgba(13,17,23,0.9)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 40,
          boxShadow: '0 -4px 20px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isDirty ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
              Unsaved changes pending
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              <CheckCircle size={14} style={{ color: '#10b981' }} />
              All settings & browser configs synchronized
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
            style={{ minWidth: 160, padding: '10px 22px', fontSize: 13, fontWeight: 800 }}
          >
            {saving ? <><span className="spinner" /> Saving...</> : '💾 Save All Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle }: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 'var(--radius-lg)',
          background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(6,182,212,0.1))',
          border: '1px solid rgba(124,58,237,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-accent)',
        }}
      >
        <Icon size={22} />
      </div>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>{title}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>{subtitle}</p>
      </div>
    </div>
  );
}

function ModernToggleCard({ title, description, checked, onChange, icon: Icon }: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: LucideIcon;
}) {
  return (
    <div
      style={{
        padding: '18px 20px',
        borderRadius: 'var(--radius-lg)',
        background: checked ? 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(6,182,212,0.04))' : 'var(--bg-elevated)',
        border: `1px solid ${checked ? 'rgba(124,58,237,0.35)' : 'var(--border)'}`,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {Icon && (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-md)',
              background: checked ? 'rgba(124,58,237,0.2)' : 'var(--bg-overlay)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: checked ? 'var(--text-accent)' : 'var(--text-muted)',
              flexShrink: 0,
            }}
          >
            <Icon size={18} />
          </div>
        )}

        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>{description}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: checked ? '#7c3aed' : 'var(--text-muted)',
          padding: 2,
        }}
      >
        {checked ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
      </button>
    </div>
  );
}

// ── Common Input Styles ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  fontSize: 13,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6,9 12,15 18,9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 14px center',
  paddingRight: 36,
  cursor: 'pointer',
};
