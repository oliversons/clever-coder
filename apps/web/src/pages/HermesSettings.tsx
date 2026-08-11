/**
 * HermesSettings — /settings/hermes
 *
 * Multi-tab settings page for configuring Hermes AI Agent:
 *   Tab 1: Model & API Provider
 *   Tab 2: Execution & Sandbox
 *   Tab 3: Memory & Skills
 *   Tab 4: Tools & MCP
 *   Tab 5: S3 & Storage
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Cpu, Brain, Wrench, Database, Eye, EyeOff,
  CheckCircle, XCircle, Loader, ChevronRight, Zap,
  ToggleLeft, ToggleRight, Server, Globe, FlaskConical,
  Clock, Play, Pause, Trash2, RefreshCw, Plus, Terminal,
  CheckCircle2, AlertTriangle, FileText, Sparkles, Copy, Check,
  ExternalLink, Calendar, Activity,
} from 'lucide-react';
import { useHermesStore } from '../store/hermesStore';
import { api, type GatewayStatus, type CronJobItem, type Project } from '../api/client';

// ── Types ──────────────────────────────────────────────────────────────────────

type TabId = 'model' | 'execution' | 'memory' | 'tools' | 's3' | 'webui' | 'scheduler';

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'model', label: 'Model & API', icon: <Bot size={16} /> },
  { id: 'execution', label: 'Execution', icon: <Cpu size={16} /> },
  { id: 'memory', label: 'Memory & Skills', icon: <Brain size={16} /> },
  { id: 'tools', label: 'Tools & MCP', icon: <Wrench size={16} /> },
  { id: 's3', label: 'S3 & Storage', icon: <Database size={16} /> },
  { id: 'webui', label: 'Hermes WebUI', icon: <Globe size={16} /> },
  { id: 'scheduler', label: 'Job Scheduler', icon: <Clock size={16} /> },
];

const PROVIDERS = [
  { value: 'openrouter', label: 'OpenRouter', desc: 'Multi-model gateway' },
  { value: 'openai', label: 'OpenAI Official', desc: 'GPT-4o, o1, etc.' },
  { value: 'custom_openai', label: 'Custom OpenAI API', desc: 'DeepSeek, Grok, Gemini, private LLMs' },
  { value: 'nous_portal', label: 'Nous Portal', desc: 'Hermes models (OAuth)' },
  { value: 'ollama', label: 'Local Ollama / vLLM', desc: 'Self-hosted models' },
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

const TOOLS = [
  { id: 'shell', label: 'Terminal / Shell', desc: 'Execute shell commands in workspace', icon: '💻' },
  { id: 'code_runner', label: 'File Read/Write', desc: 'Read and propose edits to files', icon: '📝' },
  { id: 'web_search', label: 'Web Search', desc: 'DuckDuckGo instant answers', icon: '🔍' },
  { id: 'browser', label: 'Browser Automation', desc: 'Headless browser (coming soon)', icon: '🌐', disabled: true },
  { id: 'vision', label: 'Vision / Screenshot', desc: 'Analyze images (coming soon)', icon: '👁️', disabled: true },
];

// ── Main Component ─────────────────────────────────────────────────────────────

export default function HermesSettings() {
  const { hermesSettings, loadSettings, saveSettings, testConnection } = useHermesStore();
  const [activeTab, setActiveTab] = useState<TabId>('model');
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(null);

  // ── Gateway & Scheduler State ──────────────────────────────────────────────
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [cronJobs, setCronJobs] = useState<CronJobItem[]>([]);
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [loadingGateway, setLoadingGateway] = useState(false);
  const [restartingGateway, setRestartingGateway] = useState(false);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [gatewayLogs, setGatewayLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
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
    loadGatewayAndCrons();
  }, []);

  useEffect(() => {
    if (activeTab === 'scheduler') {
      loadGatewayAndCrons();
      loadGatewayLogs();
      const timer = setInterval(() => {
        api.hermes.getGatewayStatus().then((s) => s && setGatewayStatus(s)).catch(() => {});
      }, 8000);
      return () => clearInterval(timer);
    }
  }, [activeTab]);

  const handleRestartGateway = async () => {
    setRestartingGateway(true);
    setSchedulerActionMsg(null);
    try {
      const res = await api.hermes.restartGateway();
      if (res.success) {
        setSchedulerActionMsg({ type: 'success', text: res.message || 'Gateway restarted successfully' });
      } else {
        setSchedulerActionMsg({ type: 'error', text: res.message || 'Failed to restart gateway' });
      }
      await loadGatewayAndCrons();
      await loadGatewayLogs();
    } catch (err: any) {
      setSchedulerActionMsg({ type: 'error', text: err.message || 'Failed to restart gateway daemon' });
    } finally {
      setRestartingGateway(false);
    }
  };

  const handleToggleGateway = async () => {
    setLoadingGateway(true);
    setSchedulerActionMsg(null);
    try {
      if (gatewayStatus?.active) {
        await api.hermes.stopGateway();
        setSchedulerActionMsg({ type: 'success', text: 'Gateway daemon stopped' });
      } else {
        await api.hermes.startGateway();
        setSchedulerActionMsg({ type: 'success', text: 'Gateway daemon started' });
      }
      await loadGatewayAndCrons();
    } catch (err: any) {
      setSchedulerActionMsg({ type: 'error', text: err.message || 'Failed to toggle gateway daemon' });
    } finally {
      setLoadingGateway(false);
    }
  };

  const handleCreateJob = async () => {
    if (!newJob.name.trim()) {
      setSchedulerActionMsg({ type: 'error', text: 'Please enter a job name' });
      return;
    }

    setCreatingJob(true);
    setSchedulerActionMsg(null);

    let expression = '0 9 * * *';
    let scheduleDisplay = 'Daily at 09:00';

    if (newJob.preset === '5min') {
      expression = '*/5 * * * *';
      scheduleDisplay = 'Every 5 minutes';
    } else if (newJob.preset === 'hourly') {
      expression = '0 * * * *';
      scheduleDisplay = 'Every hour';
    } else if (newJob.preset === 'daily') {
      expression = '0 9 * * *';
      scheduleDisplay = 'Daily at 09:00';
    } else if (newJob.preset === 'weekdays') {
      expression = '0 9 * * 1-5';
      scheduleDisplay = 'Mon-Fri at 09:00';
    } else if (newJob.preset === 'weekly') {
      expression = '0 9 * * 1';
      scheduleDisplay = 'Weekly on Monday at 09:00';
    } else {
      expression = newJob.customCron.trim() || '0 9 * * *';
      scheduleDisplay = `Custom: ${expression}`;
    }

    try {
      const res = await api.hermes.createCronJob({
        name: newJob.name.trim(),
        schedule: expression,
        schedule_display: scheduleDisplay,
        workdir: newJob.workdir,
        no_agent: newJob.mode === 'script',
        prompt: newJob.mode === 'agent' ? newJob.prompt : undefined,
        script: newJob.mode === 'script' ? newJob.script : undefined,
        enabled: true,
      });

      if (res?.success) {
        setSchedulerActionMsg({ type: 'success', text: `Created scheduled job "${res.job.name}"` });
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
        await loadGatewayAndCrons();
      }
    } catch (err: any) {
      setSchedulerActionMsg({ type: 'error', text: err.message || 'Failed to create scheduled job' });
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

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (hermesSettings) {
      setForm({ ...hermesSettings, apiKey: '' }); // never prefill apiKey
    }
  }, [hermesSettings]);

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload = { ...form };
      if (!payload.apiKey) delete payload.apiKey; // don't overwrite if empty
      await saveSettings(payload);
      setSaveMsg({ type: 'success', text: 'Settings saved successfully' });
    } catch (err) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
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
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const models = form.provider === 'openai' ? OPENAI_MODELS : OPENROUTER_MODELS;

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={20} style={{ color: '#fff' }} />
            </div>
            <h1 className="page-title" style={{ margin: 0 }}>Hermes AI Agent</h1>
          </div>
          <p className="page-subtitle">Configure your AI co-developer: provider, sandbox, memory, tools, and storage</p>
        </div>
      </div>

      {saveMsg && (
        <div className={`alert alert-${saveMsg.type} mb-6`} style={{ marginBottom: 20 }}>
          {saveMsg.type === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
          {saveMsg.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: 24 }}>
        {/* ── Sidebar Tabs ─────────────────────────────────────────────────── */}
        <div style={{
          width: 180, flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 'var(--radius-md)',
                background: activeTab === tab.id ? 'rgba(124,58,237,0.12)' : 'transparent',
                border: `1px solid ${activeTab === tab.id ? 'rgba(124,58,237,0.3)' : 'transparent'}`,
                color: activeTab === tab.id ? 'var(--text-accent)' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400,
                transition: 'all 0.15s', textAlign: 'left',
              }}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && <ChevronRight size={12} style={{ marginLeft: 'auto' }} />}
            </button>
          ))}
        </div>

        {/* ── Content Panel ────────────────────────────────────────────────── */}
        <div style={{ flex: 1 }}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18 }}
          >
            {/* ── Tab 1: Model & API ──────────────────────────────────────── */}
            {activeTab === 'model' && (
              <section className="glass-card" style={{ padding: 28 }}>
                <SectionTitle icon={<Bot size={18} />} title="Model & Provider" subtitle="Configure your LLM backend and API credentials" />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <FieldRow label="Model Provider">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                      {PROVIDERS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => set('provider', p.value)}
                          style={{
                            padding: '10px 14px', textAlign: 'left',
                            borderRadius: 'var(--radius-md)', cursor: 'pointer',
                            background: form.provider === p.value ? 'rgba(124,58,237,0.1)' : 'var(--bg-elevated)',
                            border: `1px solid ${form.provider === p.value ? 'rgba(124,58,237,0.4)' : 'var(--border)'}`,
                            transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.desc}</div>
                        </button>
                      ))}
                    </div>
                  </FieldRow>

                  {form.provider === 'custom_openai' && (
                    <FieldRow label="Base URL (Must end with /v1, do not include /chat/completions)">
                      <input
                        type="text"
                        value={(form.baseUrl as string) ?? ''}
                        onChange={(e) => set('baseUrl', e.target.value)}
                        placeholder="https://api.your-provider.com/v1"
                        style={inputStyle}
                      />
                    </FieldRow>
                  )}

                  <FieldRow label="Model ID">
                    {form.provider === 'custom_openai' || form.provider === 'ollama' ? (
                      <input
                        type="text"
                        value={(form.model as string) ?? ''}
                        onChange={(e) => set('model', e.target.value)}
                        placeholder="e.g. deepseek-chat, custom-model-name, claude-3-5-sonnet"
                        style={inputStyle}
                      />
                    ) : (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <select
                          value={(form.model as string) ?? ''}
                          onChange={(e) => set('model', e.target.value)}
                          style={{ ...selectStyle, flex: 1 }}
                        >
                          {models.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <input
                          type="text"
                          value={(form.model as string) ?? ''}
                          onChange={(e) => set('model', e.target.value)}
                          placeholder="Or enter custom model ID..."
                          style={{ ...inputStyle, flex: 1 }}
                        />
                      </div>
                    )}
                  </FieldRow>

                  <FieldRow label="API Key">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={form.apiKey as string ?? ''}
                          onChange={(e) => set('apiKey', e.target.value)}
                          placeholder={hermesSettings?.apiKeySet ? '••••••••••••••• (saved)' : 'Enter API key...'}
                          style={{ ...inputStyle, paddingRight: 36 }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey((v) => !v)}
                          style={{
                            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', padding: 2,
                          }}
                        >
                          {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleTest}
                        disabled={testing}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '0 14px', fontSize: 12, fontWeight: 600,
                          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)', cursor: 'pointer',
                          color: 'var(--text-secondary)', whiteSpace: 'nowrap',
                        }}
                      >
                        {testing ? <Loader size={13} className="spin" /> : <FlaskConical size={13} />}
                        Test Connection
                      </button>
                    </div>
                    {testResult && (
                      <div style={{
                        marginTop: 8, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                        background: testResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                        border: `1px solid ${testResult.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                        fontSize: 12, color: testResult.ok ? 'var(--success)' : 'var(--danger)',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        {testResult.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        {testResult.message}
                        {testResult.latencyMs && <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{testResult.latencyMs}ms</span>}
                      </div>
                    )}
                  </FieldRow>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <FieldRow label={`Temperature: ${((form.temperature as number ?? 70) / 100).toFixed(2)}`}>
                      <input
                        type="range" min="0" max="100" step="1"
                        value={form.temperature as number ?? 70}
                        onChange={(e) => set('temperature', Number(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--accent-1)' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                        <span>Precise (0.0)</span><span>Creative (1.0)</span>
                      </div>
                    </FieldRow>

                    <FieldRow label="Context Window (tokens)">
                      <input
                        type="number" min="4096" max="256000" step="1024"
                        value={form.contextWindow as number ?? 128000}
                        onChange={(e) => set('contextWindow', Number(e.target.value))}
                        style={inputStyle}
                      />
                    </FieldRow>
                  </div>
                </div>
              </section>
            )}

            {/* ── Tab 2: Execution & Sandbox ──────────────────────────────── */}
            {activeTab === 'execution' && (
              <section className="glass-card" style={{ padding: 28 }}>
                <SectionTitle icon={<Cpu size={18} />} title="Execution & Sandbox" subtitle="Control how Hermes runs commands and isolates execution" />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <FieldRow label="Execution Backend">
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[
                        { value: 'local', label: 'Local Host', icon: '🖥️' },
                        { value: 'docker', label: 'Docker Container', icon: '🐳' },
                        { value: 'ssh', label: 'Remote SSH', icon: '🔐' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => set('executionBackend', opt.value)}
                          style={{
                            flex: 1, padding: '10px 8px', textAlign: 'center',
                            borderRadius: 'var(--radius-md)', cursor: 'pointer',
                            background: form.executionBackend === opt.value ? 'rgba(124,58,237,0.1)' : 'var(--bg-elevated)',
                            border: `1px solid ${form.executionBackend === opt.value ? 'rgba(124,58,237,0.4)' : 'var(--border)'}`,
                            fontSize: 13, fontWeight: form.executionBackend === opt.value ? 600 : 400,
                            color: form.executionBackend === opt.value ? 'var(--text-accent)' : 'var(--text-secondary)',
                          }}
                        >
                          <div style={{ fontSize: 18, marginBottom: 4 }}>{opt.icon}</div>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </FieldRow>

                  {form.executionBackend === 'docker' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                      <FieldRow label={`CPU Core Allocation: ${form.containerCpu === 0 ? '⚡ Auto / All Cores' : `${form.containerCpu ?? 0} Cores`}`}>
                        <select
                          value={(form.containerCpu as number) ?? 0}
                          onChange={(e) => set('containerCpu', Number(e.target.value))}
                          style={selectStyle}
                        >
                          <option value={0}>⚡ Auto / All Host Cores (Recommended)</option>
                          <option value={1}>1 Core (Low Power)</option>
                          <option value={2}>2 Cores</option>
                          <option value={4}>4 Cores</option>
                          <option value={8}>8 Cores</option>
                          <option value={16}>16 Cores</option>
                        </select>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                          Detected {typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4} cores. "Auto" uses all host cores.
                        </div>
                      </FieldRow>
                      <FieldRow label={`RAM: ${(form.containerMemoryMb as number ?? 4096) / 1024} GB`}>
                        <input type="range" min="1024" max="16384" step="1024"
                          value={form.containerMemoryMb as number ?? 4096}
                          onChange={(e) => set('containerMemoryMb', Number(e.target.value))}
                          style={{ width: '100%', accentColor: 'var(--accent-1)' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                          <span>1 GB</span><span>16 GB</span>
                        </div>
                      </FieldRow>
                      <FieldRow label="Timeout (seconds)">
                        <input type="number" min="30" max="3600" step="30"
                          value={form.timeoutSeconds as number ?? 300}
                          onChange={(e) => set('timeoutSeconds', Number(e.target.value))}
                          style={inputStyle}
                        />
                      </FieldRow>
                    </div>
                  )}

                  <FieldRow label="Command Approval Mode">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { value: 'always_ask', label: 'Always Ask', desc: 'Confirm every command before execution' },
                        { value: 'ask_destructive', label: 'Ask for Destructive Commands Only', desc: 'Auto-approve read-only; ask for write/delete/exec' },
                        { value: 'auto_approve', label: 'Auto-Approve All', desc: '⚠️ Dangerous — runs all commands without confirmation' },
                      ].map((opt) => (
                        <label
                          key={opt.value}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                            padding: '10px 12px', borderRadius: 'var(--radius-md)',
                            background: form.commandApprovalMode === opt.value ? 'rgba(124,58,237,0.08)' : 'var(--bg-elevated)',
                            border: `1px solid ${form.commandApprovalMode === opt.value ? 'rgba(124,58,237,0.3)' : 'var(--border)'}`,
                          }}
                        >
                          <input
                            type="radio"
                            name="approvalMode"
                            value={opt.value}
                            checked={form.commandApprovalMode === opt.value}
                            onChange={() => set('commandApprovalMode', opt.value)}
                            style={{ marginTop: 2, accentColor: 'var(--accent-1)' }}
                          />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{opt.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </FieldRow>
                </div>
              </section>
            )}

            {/* ── Tab 3: Memory & Skills ──────────────────────────────────── */}
            {activeTab === 'memory' && (
              <section className="glass-card" style={{ padding: 28 }}>
                <SectionTitle icon={<Brain size={18} />} title="Memory & Skills" subtitle="Configure cross-session memory and autonomous skill learning" />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <ToggleSetting
                    label="Cross-Session Memory"
                    description="Hermes remembers context from previous conversations"
                    checked={form.persistentMemory as boolean ?? true}
                    onChange={(v) => set('persistentMemory', v)}
                  />
                  <ToggleSetting
                    label="Auto-Skill Creation"
                    description="Automatically save reusable skills to ~/.hermes/skills/ after successful tasks"
                    checked={form.autoSkillCreation as boolean ?? false}
                    onChange={(v) => set('autoSkillCreation', v)}
                  />

                  <FieldRow label="System Prompt / Persona">
                    <textarea
                      value={form.systemPrompt as string ?? ''}
                      onChange={(e) => set('systemPrompt', e.target.value)}
                      placeholder="Customize Hermes' behavior and persona. Leave blank for default."
                      rows={5}
                      style={{
                        ...inputStyle,
                        resize: 'vertical', minHeight: 100, lineHeight: 1.5,
                      }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      Default: "You are Hermes, an expert AI co-developer embedded in CleverCoder IDE."
                    </div>
                  </FieldRow>
                </div>
              </section>
            )}

            {/* ── Tab 4: Tools & MCP ──────────────────────────────────────── */}
            {activeTab === 'tools' && (
              <section className="glass-card" style={{ padding: 28 }}>
                <SectionTitle icon={<Wrench size={18} />} title="Tools & MCP" subtitle="Enable or disable tools Hermes can use during conversations" />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {TOOLS.map((tool) => {
                    const enabledTools = (form.enabledTools as string[] ?? []);
                    const isEnabled = enabledTools.includes(tool.id);
                    return (
                      <div
                        key={tool.id}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '14px 16px', borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                          opacity: tool.disabled ? 0.5 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 22 }}>{tool.icon}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {tool.label}
                              {tool.disabled && <span style={{ fontSize: 10, padding: '1px 6px', background: 'var(--bg-overlay)', borderRadius: 4, color: 'var(--text-muted)' }}>Coming Soon</span>}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tool.desc}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={tool.disabled}
                          onClick={() => {
                            const next = isEnabled
                              ? enabledTools.filter((t) => t !== tool.id)
                              : [...enabledTools, tool.id];
                            set('enabledTools', next);
                          }}
                          style={{ background: 'none', border: 'none', cursor: tool.disabled ? 'default' : 'pointer' }}
                        >
                          {isEnabled
                            ? <ToggleRight size={26} style={{ color: 'var(--accent-1)' }} />
                            : <ToggleLeft size={26} style={{ color: 'var(--text-muted)' }} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Tab 5: S3 & Storage ─────────────────────────────────────── */}
            {activeTab === 's3' && (
              <section className="glass-card" style={{ padding: 28 }}>
                <SectionTitle icon={<Database size={18} />} title="S3 & Storage" subtitle="Configure message archiving to S3-compatible object storage" />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <ToggleSetting
                    label="S3 Archiving"
                    description="Automatically upload large tool outputs and conversation trajectories to S3"
                    checked={form.s3ArchivingEnabled as boolean ?? true}
                    onChange={(v) => set('s3ArchivingEnabled', v)}
                  />

                  <div style={{
                    padding: '14px 16px', borderRadius: 'var(--radius-md)',
                    background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)',
                    fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
                  }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📦 Current S3 Configuration</div>
                    <div>Using the platform's Clever Cloud Cellar S3 bucket with prefix <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>hermes/</code></div>
                    <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>
                      Artifacts: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>hermes/artifacts/&#123;userId&#125;/</code> ·
                      Trajectories: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>hermes/trajectories/&#123;userId&#125;/</code>
                    </div>
                  </div>

                  <div style={{
                    padding: '14px 16px', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    fontSize: 12, color: 'var(--text-muted)',
                  }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Storage Policy</div>
                    <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 2 }}>
                      <li>Message payloads ≤ 10 KB stay in PostgreSQL</li>
                      <li>Payloads &gt; 10 KB are automatically offloaded to S3</li>
                      <li>Tool outputs and diffs are always stored in S3</li>
                      <li>Full trajectory exports available as gzip-compressed JSON</li>
                    </ul>
                  </div>
                </div>
              </section>
            )}

            {/* ── Tab 6: Hermes Standalone WebUI ──────────────────────────── */}
            {activeTab === 'webui' && (
              <section className="glass-card" style={{ padding: 28 }}>
                <SectionTitle icon={<Globe size={18} />} title="Hermes Standalone WebUI" subtitle="Manage and launch the official nesquena/hermes-webui interface" />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Launch Card Banner */}
                  <div style={{
                    padding: 20,
                    background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(6,182,212,0.1))',
                    border: '1px solid rgba(124,58,237,0.3)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    boxShadow: 'var(--shadow-md)',
                  }}>
                    <div style={{ flex: 1, paddingRight: 20 }}>
                      <h4 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        🖥️ Official Standalone WebUI
                      </h4>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                        Launch the full three-panel web interface (<code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>nesquena/hermes-webui</code>) in a new browser tab with full access to sessions, memory, file browsers, and agent tools.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.hermes.launchWebUI();
                          if (res?.url) {
                            window.open(res.url, '_blank', 'noopener,noreferrer');
                          }
                        } catch (err) {
                          console.error('Failed to launch WebUI:', err);
                        }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 18px', fontSize: 13, fontWeight: 700,
                        background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
                        border: 'none', borderRadius: 'var(--radius-md)', color: '#fff',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        boxShadow: '0 4px 14px rgba(124,58,237,0.4)',
                        transition: 'transform 0.15s, opacity 0.15s',
                      }}
                    >
                      <span>Open Hermes WebUI</span>
                      <span>↗</span>
                    </button>
                  </div>

                  {/* Config Controls */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div style={{
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                        WebUI Server Port
                      </label>
                      <input
                        type="number"
                        value={Number(form.webuiPort ?? 8787)}
                        onChange={(e) => set('webuiPort', Number(e.target.value))}
                        style={inputStyle}
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Internal container loopback port (default: 8787). Proxied via <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>/hermes-ui/*</code>.
                      </span>
                    </div>

                    <div style={{
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                        Optional Web Password
                      </label>
                      <input
                        type="password"
                        value={String(form.webuiPassword ?? '')}
                        onChange={(e) => set('webuiPassword', e.target.value)}
                        placeholder="•••••••• (optional)"
                        style={inputStyle}
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Optional password passed as <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>HERMES_WEBUI_PASSWORD</code>.
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* ── Tab 7: Job Scheduler & Gateway Daemon ──────────────────── */}
            {activeTab === 'scheduler' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {schedulerActionMsg && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: 13,
                      fontWeight: 500,
                      background: schedulerActionMsg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                      border: `1px solid ${schedulerActionMsg.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      color: schedulerActionMsg.type === 'success' ? '#22c55e' : '#ef4444',
                    }}
                  >
                    {schedulerActionMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    <span style={{ flex: 1 }}>{schedulerActionMsg.text}</span>
                    <button
                      type="button"
                      onClick={() => setSchedulerActionMsg(null)}
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7 }}
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* ── Gateway Daemon Status Hero Card ──────────────────────── */}
                <section className="glass-card" style={{ padding: 24, position: 'relative', overflow: 'hidden' }}>
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 3,
                      background: gatewayStatus?.active
                        ? 'linear-gradient(90deg, #22c55e, #06b6d4)'
                        : 'linear-gradient(90deg, #ef4444, #f59e0b)',
                    }}
                  />

                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 'var(--radius-md)',
                          background: gatewayStatus?.active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                          border: `1px solid ${gatewayStatus?.active ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: gatewayStatus?.active ? '#22c55e' : '#ef4444',
                        }}
                      >
                        <Activity size={22} className={gatewayStatus?.active ? 'pulse' : ''} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                            Hermes Gateway Daemon
                          </h3>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '2px 10px',
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              background: gatewayStatus?.active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                              color: gatewayStatus?.active ? '#22c55e' : '#ef4444',
                              border: `1px solid ${gatewayStatus?.active ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: gatewayStatus?.active ? '#22c55e' : '#ef4444',
                              }}
                            />
                            {gatewayStatus?.active ? 'Active & Ticking' : 'Offline / Inactive'}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                          {gatewayStatus?.info || 'Background cron daemon ticks scheduled agent tasks every 60 seconds.'}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={handleRestartGateway}
                        disabled={restartingGateway || loadingGateway}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 14px',
                          fontSize: 12,
                          fontWeight: 600,
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          color: 'var(--text-primary)',
                          transition: 'all 0.15s',
                        }}
                      >
                        <RefreshCw size={13} className={restartingGateway ? 'spin' : ''} />
                        {restartingGateway ? 'Restarting...' : 'Restart Daemon'}
                      </button>

                      <button
                        type="button"
                        onClick={handleToggleGateway}
                        disabled={loadingGateway || restartingGateway}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 14px',
                          fontSize: 12,
                          fontWeight: 600,
                          background: gatewayStatus?.active ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                          border: `1px solid ${gatewayStatus?.active ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                          color: gatewayStatus?.active ? '#ef4444' : '#22c55e',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                        }}
                      >
                        {gatewayStatus?.active ? <Pause size={13} /> : <Play size={13} />}
                        {gatewayStatus?.active ? 'Stop Gateway' : 'Start Gateway'}
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await api.hermes.launchWebUI();
                            if (res?.url) {
                              window.open(`${res.url}#tasks`, '_blank', 'noopener,noreferrer');
                            }
                          } catch {
                            // ignore
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 14px',
                          fontSize: 12,
                          fontWeight: 700,
                          background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
                          border: 'none',
                          color: '#fff',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
                        }}
                      >
                        <span>Tasks WebUI</span>
                        <ExternalLink size={12} />
                      </button>
                    </div>
                  </div>

                  {/* ── Status Metrics Grid ─────────────────────────────────── */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Daemon PID
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
                        {gatewayStatus?.pid ? `#${gatewayStatus.pid}` : '—'}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 12,
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Tick Interval
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#06b6d4', marginTop: 4 }}>
                        60 Seconds
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 12,
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Active Jobs
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-accent)', marginTop: 4 }}>
                        {cronJobs.filter((j) => j.enabled !== false).length} / {cronJobs.length}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 12,
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Last Heartbeat
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {gatewayStatus?.lastTick ? new Date(gatewayStatus.lastTick).toLocaleTimeString() : 'Recent'}
                      </div>
                    </div>
                  </div>
                </section>

                {/* ── Scheduled Jobs Section Header & Creator ──────────────── */}
                <section className="glass-card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Clock size={18} style={{ color: 'var(--text-accent)' }} />
                        Scheduled Cron Tasks
                      </h3>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                        Create recurring jobs that run autonomously in the container on fixed intervals.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowCreateWizard((v) => !v)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 16px',
                        fontSize: 13,
                        fontWeight: 600,
                        background: showCreateWizard ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #7c3aed, #06b6d4)',
                        border: showCreateWizard ? '1px solid var(--border)' : 'none',
                        color: showCreateWizard ? 'var(--text-secondary)' : '#fff',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        boxShadow: showCreateWizard ? 'none' : '0 2px 10px rgba(124,58,237,0.3)',
                      }}
                    >
                      {showCreateWizard ? <span>Cancel</span> : <><Plus size={14} /> <span>New Scheduled Task</span></>}
                    </button>
                  </div>

                  {/* ── Collapsible Create Job Wizard Form ────────────────────── */}
                  <AnimatePresence>
                    {showCreateWizard && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{
                          marginBottom: 24,
                          padding: 20,
                          borderRadius: 'var(--radius-md)',
                          background: 'rgba(124,58,237,0.04)',
                          border: '1px solid rgba(124,58,237,0.25)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 16,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                          <Sparkles size={16} style={{ color: '#06b6d4' }} />
                          Configure New Scheduled Task
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                              Task Name
                            </label>
                            <input
                              type="text"
                              value={newJob.name}
                              onChange={(e) => setNewJob({ ...newJob, name: e.target.value })}
                              placeholder="e.g. Daily Build & Test Check"
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
                              <option value="custom">⚙️ Custom Cron Expression</option>
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

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                              Target Workspace / Project
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
                                  padding: '8px 12px',
                                  borderRadius: 'var(--radius-md)',
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  fontWeight: newJob.mode === 'agent' ? 700 : 400,
                                  background: newJob.mode === 'agent' ? 'rgba(124,58,237,0.15)' : 'var(--bg-elevated)',
                                  border: `1px solid ${newJob.mode === 'agent' ? 'rgba(124,58,237,0.4)' : 'var(--border)'}`,
                                  color: newJob.mode === 'agent' ? 'var(--text-accent)' : 'var(--text-secondary)',
                                }}
                              >
                                🤖 AI Agent Prompt
                              </button>
                              <button
                                type="button"
                                onClick={() => setNewJob({ ...newJob, mode: 'script' })}
                                style={{
                                  flex: 1,
                                  padding: '8px 12px',
                                  borderRadius: 'var(--radius-md)',
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  fontWeight: newJob.mode === 'script' ? 700 : 400,
                                  background: newJob.mode === 'script' ? 'rgba(124,58,237,0.15)' : 'var(--bg-elevated)',
                                  border: `1px solid ${newJob.mode === 'script' ? 'rgba(124,58,237,0.4)' : 'var(--border)'}`,
                                  color: newJob.mode === 'script' ? 'var(--text-accent)' : 'var(--text-secondary)',
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
                                Agent Instructions / Prompt
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
                              placeholder="git status && npm run test"
                              rows={3}
                              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', resize: 'vertical' }}
                            />
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => setShowCreateWizard(false)}
                            style={{
                              padding: '8px 16px',
                              fontSize: 13,
                              background: 'transparent',
                              border: '1px solid var(--border)',
                              borderRadius: 'var(--radius-md)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleCreateJob}
                            disabled={creatingJob}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '8px 18px',
                              fontSize: 13,
                              fontWeight: 700,
                              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
                              border: 'none',
                              color: '#fff',
                              borderRadius: 'var(--radius-md)',
                              cursor: 'pointer',
                            }}
                          >
                            {creatingJob ? <Loader size={14} className="spin" /> : <Check size={14} />}
                            <span>Schedule Task</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* ── Scheduled Jobs Table / List ──────────────────────────── */}
                  {cronJobs.length === 0 ? (
                    <div
                      style={{
                        padding: '36px 20px',
                        textAlign: 'center',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-elevated)',
                        border: '1px dashed var(--border)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <Clock size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                        No Scheduled Tasks Configured Yet
                      </div>
                      <p style={{ fontSize: 12, margin: '0 0 16px' }}>
                        Click "New Scheduled Task" above to configure your first automated background job.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowCreateWizard(true)}
                        style={{
                          padding: '6px 14px',
                          fontSize: 12,
                          fontWeight: 600,
                          background: 'rgba(124,58,237,0.12)',
                          border: '1px solid rgba(124,58,237,0.3)',
                          color: 'var(--text-accent)',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                        }}
                      >
                        + Create Your First Task
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {cronJobs.map((job) => {
                        const isRunningThis = runningJobId === job.id;
                        const isAgentMode = !job.no_agent;
                        const scheduleLabel =
                          job.schedule_display || (typeof job.schedule === 'string' ? job.schedule : job.schedule?.expression) || '—';

                        return (
                          <div
                            key={job.id}
                            style={{
                              padding: '14px 16px',
                              borderRadius: 'var(--radius-md)',
                              background: 'var(--bg-elevated)',
                              border: `1px solid ${job.enabled ? 'var(--border)' : 'rgba(255,255,255,0.04)'}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 16,
                              opacity: job.enabled ? 1 : 0.6,
                              transition: 'all 0.15s',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 20 }}>{isAgentMode ? '🤖' : '📜'}</span>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {job.name}
                                  </span>
                                  <span
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: 10,
                                      fontSize: 10,
                                      fontWeight: 600,
                                      background: job.enabled ? 'rgba(34,197,94,0.12)' : 'rgba(156,163,175,0.12)',
                                      color: job.enabled ? '#22c55e' : 'var(--text-muted)',
                                    }}
                                  >
                                    {job.enabled ? 'Active' : 'Paused'}
                                  </span>
                                  <span
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: 10,
                                      fontSize: 10,
                                      fontWeight: 600,
                                      background: 'rgba(6,182,212,0.1)',
                                      color: '#06b6d4',
                                      fontFamily: 'var(--font-mono)',
                                    }}
                                  >
                                    {scheduleLabel}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                  <span>Dir: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{job.workdir || '/workspaces'}</code></span>
                                  {job.last_run_at && (
                                    <span>Last run: {new Date(job.last_run_at).toLocaleString()}</span>
                                  )}
                                  {job.prompt && (
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                                      "{job.prompt}"
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={() => handleRunJobNow(job.id)}
                                disabled={isRunningThis}
                                title="Run now"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '6px 12px',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: 'rgba(6,182,212,0.12)',
                                  border: '1px solid rgba(6,182,212,0.3)',
                                  color: '#06b6d4',
                                  borderRadius: 'var(--radius-sm)',
                                  cursor: 'pointer',
                                }}
                              >
                                {isRunningThis ? <Loader size={12} className="spin" /> : <Play size={12} />}
                                <span>Run Now</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleJob(job)}
                                title={job.enabled ? 'Pause job' : 'Resume job'}
                                style={{
                                  background: 'none',
                                  border: '1px solid var(--border)',
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '6px 8px',
                                  cursor: 'pointer',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                {job.enabled ? <Pause size={13} /> : <Play size={13} />}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteJob(job.id)}
                                title="Delete job"
                                style={{
                                  background: 'none',
                                  border: '1px solid rgba(239,68,68,0.2)',
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '6px 8px',
                                  cursor: 'pointer',
                                  color: '#ef4444',
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

                {/* ── Gateway Daemon Logs Terminal Card ────────────────────── */}
                <section className="glass-card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Terminal size={16} style={{ color: 'var(--text-accent)' }} />
                      <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                        Gateway Daemon Logs
                      </h3>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        (~/.hermes/logs/gateway.log)
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={async () => {
                          await loadGatewayLogs();
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 10px',
                          fontSize: 11,
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        <RefreshCw size={11} />
                        <span>Refresh Logs</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(gatewayLogs.join('\n'));
                          setCopiedLogs(true);
                          setTimeout(() => setCopiedLogs(false), 2000);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 10px',
                          fontSize: 11,
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        {copiedLogs ? <Check size={11} /> : <Copy size={11} />}
                        <span>{copiedLogs ? 'Copied' : 'Copy'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowLogs((v) => !v)}
                        style={{
                          padding: '4px 10px',
                          fontSize: 11,
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        {showLogs ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      maxHeight: showLogs ? 400 : 160,
                      overflowY: 'auto',
                      background: '#0d1117',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 16px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: '#c9d1d9',
                      lineHeight: 1.6,
                      border: '1px solid var(--border)',
                      transition: 'max-height 0.2s',
                    }}
                  >
                    {gatewayLogs.length === 0 ? (
                      <div style={{ color: '#8b949e', fontStyle: 'italic' }}>
                        No daemon output yet. Gateway logs will stream here as cron ticks execute.
                      </div>
                    ) : (
                      gatewayLogs.map((log, i) => (
                        <div key={i} style={{ wordBreak: 'break-all' }}>
                          <span style={{ color: '#58a6ff', opacity: 0.7 }}>[{i + 1}]</span> {log}
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            )}
          </motion.div>

          {/* Save Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary"
              style={{ minWidth: 140 }}
            >
              {saving ? <><span className="spinner" /> Saving...</> : '💾 Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 'var(--radius-md)',
        background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-accent)',
      }}>
        {icon}
      </div>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{subtitle}</p>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ToggleSetting({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 16px', borderRadius: 'var(--radius-md)',
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{description}</div>
      </div>
      <button type="button" onClick={() => onChange(!checked)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
        {checked
          ? <ToggleRight size={28} style={{ color: 'var(--accent-1)' }} />
          : <ToggleLeft size={28} style={{ color: 'var(--text-muted)' }} />}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', fontSize: 13,
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
  outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6,9 12,15 18,9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: 30,
  cursor: 'pointer',
};
