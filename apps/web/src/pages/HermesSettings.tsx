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
import { motion } from 'framer-motion';
import {
  Bot, Cpu, Brain, Wrench, Database, Eye, EyeOff,
  CheckCircle, XCircle, Loader, ChevronRight, Zap,
  ToggleLeft, ToggleRight, Server, Globe, FlaskConical,
} from 'lucide-react';
import { useHermesStore } from '../store/hermesStore';

// ── Types ──────────────────────────────────────────────────────────────────────

type TabId = 'model' | 'execution' | 'memory' | 'tools' | 's3';

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'model', label: 'Model & API', icon: <Bot size={16} /> },
  { id: 'execution', label: 'Execution', icon: <Cpu size={16} /> },
  { id: 'memory', label: 'Memory & Skills', icon: <Brain size={16} /> },
  { id: 'tools', label: 'Tools & MCP', icon: <Wrench size={16} /> },
  { id: 's3', label: 'S3 & Storage', icon: <Database size={16} /> },
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
