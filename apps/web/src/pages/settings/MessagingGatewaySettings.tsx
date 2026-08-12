/**
 * MessagingGatewaySettings — Advanced step-by-step setup wizard for Hermes messaging gateways.
 *
 * Supports: Telegram Bot, WhatsApp Cloud API, Email (IMAP/SMTP), Webhooks
 * Credentials are written to ~/.hermes/.env and ~/.hermes/config.yaml on save.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Mail, Webhook, Send, CheckCircle2, XCircle,
  Loader2, Eye, EyeOff, Plus, Trash2, RefreshCw, ExternalLink,
  ChevronRight, ChevronDown, Copy, Check, AlertTriangle, Info,
  Save, Zap, Settings2, Globe, Shield, Clock, Hash,
} from 'lucide-react';
import { api, type HermesMessagingSettings } from '../../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

type GatewayId = 'telegram' | 'whatsapp' | 'email' | 'webhooks';

interface TestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
  detail?: string;
}

// ── Default State ─────────────────────────────────────────────────────────────

const DEFAULT_FORM: HermesMessagingSettings = {
  telegramEnabled: false,
  telegramBotToken: '',
  telegramAllowedUsers: '',
  telegramAllowedChats: '',
  telegramGroupAllowedChats: '',
  telegramRequireMention: true,
  telegramStatusIndicator: true,
  telegramStatusOnline: '🟢 Online',
  telegramStatusOffline: '🔴 Offline',
  telegramCommandMenuMax: 60,
  telegramCommandMenuPriorityMode: 'prepend',
  telegramObserveUnmentioned: false,
  telegramWebhookUrl: '',
  telegramWebhookSecret: '',
  telegramWebhookPort: 8443,
  whatsappEnabled: false,
  whatsappAccessToken: '',
  whatsappPhoneNumberId: '',
  whatsappWabaId: '',
  whatsappVerifyToken: '',
  whatsappAllowedUsers: '',
  whatsappTextBatchDelay: 2,
  emailEnabled: false,
  emailAddress: '',
  emailPassword: '',
  emailImapHost: 'imap.gmail.com',
  emailSmtpHost: 'smtp.gmail.com',
  emailImapPort: 993,
  emailSmtpPort: 587,
  emailPollInterval: 15,
  emailAllowedUsers: '',
  webhookEnabled: false,
  webhookPort: 8644,
  webhookSecret: '',
  webhookRoutes: [],
};

// ── Email Presets ─────────────────────────────────────────────────────────────

const EMAIL_PRESETS = [
  { id: 'gmail', label: '📧 Gmail', imapHost: 'imap.gmail.com', smtpHost: 'smtp.gmail.com', imapPort: 993, smtpPort: 587 },
  { id: 'outlook', label: '📘 Outlook', imapHost: 'outlook.office365.com', smtpHost: 'smtp.office365.com', imapPort: 993, smtpPort: 587 },
  { id: 'yahoo', label: '🟣 Yahoo', imapHost: 'imap.mail.yahoo.com', smtpHost: 'smtp.mail.yahoo.com', imapPort: 993, smtpPort: 587 },
  { id: 'icloud', label: '🍎 iCloud', imapHost: 'imap.mail.me.com', smtpHost: 'smtp.mail.me.com', imapPort: 993, smtpPort: 587 },
  { id: 'proton', label: '🔒 Proton Bridge', imapHost: '127.0.0.1', smtpHost: '127.0.0.1', imapPort: 1143, smtpPort: 1025 },
  { id: 'custom', label: '⚙️ Custom IMAP', imapHost: '', smtpHost: '', imapPort: 993, smtpPort: 587 },
];

// ── Reusable Subcomponents ────────────────────────────────────────────────────

function SectionCard({ children, glow }: { children: React.ReactNode; glow?: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {glow && (
        <div
          style={{
            position: 'absolute',
            top: -40,
            right: -40,
            width: 160,
            height: 160,
            background: `radial-gradient(circle, ${glow}22 0%, transparent 70%)`,
            pointerEvents: 'none',
            filter: 'blur(20px)',
          }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {children}
      </label>
      {hint && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</p>}
    </div>
  );
}

function InputField({
  value, onChange, placeholder, type = 'text', prefix, suffix, mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
      {prefix && (
        <div style={{ padding: '0 10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-subtle)' }}>
          {prefix}
        </div>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          padding: '9px 12px',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text-primary)',
          fontSize: 13,
          fontFamily: mono ? 'monospace' : 'inherit',
        }}
      />
      {suffix && (
        <div style={{ padding: '0 10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', borderLeft: '1px solid var(--border-subtle)' }}>
          {suffix}
        </div>
      )}
    </div>
  );
}

function NumberField({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      style={{
        width: '100%',
        padding: '9px 12px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-primary)',
        fontSize: 13,
        outline: 'none',
      }}
    />
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: checked ? 'var(--accent-primary)' : 'var(--bg-elevated)',
        border: `2px solid ${checked ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 20 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s ease',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }}
      />
    </button>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border-subtle)' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function SecretField({
  value, onChange, placeholder, isSet,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  isSet?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isSet && !value ? '••••••••  (stored — clear to reset)' : placeholder}
        style={{ flex: 1, padding: '9px 12px', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'monospace' }}
      />
      {isSet && !value && (
        <span style={{ fontSize: 10, color: 'var(--text-accent)', padding: '0 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>SET</span>
      )}
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        style={{ padding: '0 10px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderLeft: '1px solid var(--border-subtle)', height: '100%', display: 'flex', alignItems: 'center' }}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function InstructionStep({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
        {number}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function TestResultBadge({ result }: { result: TestResult | null }) {
  if (!result) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 'var(--radius-md)',
        background: result.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
        border: `1px solid ${result.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
        fontSize: 12,
        color: result.ok ? '#10b981' : '#ef4444',
      }}
    >
      {result.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      <span style={{ flex: 1 }}>{result.message}</span>
      {result.latencyMs && <span style={{ opacity: 0.7 }}>{result.latencyMs}ms</span>}
    </motion.div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div style={{ position: 'relative', background: 'var(--bg-deep)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-accent)', border: '1px solid var(--border-subtle)', marginTop: 6 }}>
      <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{code}</code>
      <button
        onClick={copyCode}
        style={{ position: 'absolute', top: 8, right: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: 'var(--text-muted)' }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </div>
  );
}

function InfoBox({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'info' | 'warning' | 'tip' }) {
  const colors = {
    info: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', text: '#3b82f6' },
    warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', text: '#f59e0b' },
    tip: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', text: '#10b981' },
  };
  const c = colors[variant];
  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
      <Info size={14} style={{ color: c.text, flexShrink: 0, marginTop: 1 }} />
      <div style={{ lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, marginTop: 20, paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
      {children}
    </div>
  );
}

// ── Gateway Status Badge ──────────────────────────────────────────────────────

function GatewayCard({
  id, icon, label, desc, color, isActive, isConfigured, isSelected, onClick,
}: {
  id: GatewayId;
  icon: React.ReactNode;
  label: string;
  desc: string;
  color: string;
  isActive: boolean;
  isConfigured: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: '1 1 200px',
        minWidth: 160,
        background: isSelected ? `${color}15` : 'var(--bg-card)',
        border: `2px solid ${isSelected ? color : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {isSelected && (
        <div
          style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, background: `radial-gradient(circle, ${color}30, transparent 70%)`, pointerEvents: 'none' }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          {icon}
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 999,
            background: isConfigured ? 'rgba(16,185,129,0.15)' : 'var(--bg-elevated)',
            color: isConfigured ? '#10b981' : 'var(--text-muted)',
            border: `1px solid ${isConfigured ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)'}`,
          }}
        >
          {isConfigured ? '✅ Configured' : '○ Not set'}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{desc}</div>
    </button>
  );
}

// ── Accordion ─────────────────────────────────────────────────────────────────

function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-elevated)', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}
      >
        {title}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '14px', borderTop: '1px solid var(--border-subtle)' }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function MessagingGatewaySettings() {
  const [form, setForm] = useState<HermesMessagingSettings>(DEFAULT_FORM);
  const [activeGateway, setActiveGateway] = useState<GatewayId>('telegram');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Per-platform test states
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<TestResult | null>(null);
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [whatsappTestResult, setWhatsappTestResult] = useState<TestResult | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<TestResult | null>(null);

  const set = useCallback(<K extends keyof HermesMessagingSettings>(key: K, value: HermesMessagingSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveMsg(null);
  }, []);

  // Load settings on mount
  useEffect(() => {
    api.hermes.getMessagingSettings()
      .then((data) => {
        if (data) setForm((prev) => ({ ...prev, ...data }));
      })
      .catch((err) => console.warn('Failed to load messaging settings:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await api.hermes.saveMessagingSettings(form);
      if (res?.settings) setForm((prev) => ({ ...prev, ...res.settings }));
      setSaveMsg({ type: 'success', text: '✅ Settings saved — gateway daemon restarting with new configuration.' });
    } catch (err: any) {
      setSaveMsg({ type: 'error', text: `❌ ${err?.message || 'Failed to save settings'}` });
    } finally {
      setSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    setTelegramTestResult(null);
    try {
      const res = await api.hermes.testTelegramToken(form.telegramBotToken || '');
      setTelegramTestResult({ ok: res.ok, message: res.message, latencyMs: res.latencyMs });
    } catch (err: any) {
      setTelegramTestResult({ ok: false, message: err?.message || 'Test failed' });
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleTestWhatsApp = async () => {
    setTestingWhatsApp(true);
    setWhatsappTestResult(null);
    try {
      const res = await api.hermes.testWhatsAppCredentials(
        form.whatsappAccessToken || '',
        form.whatsappPhoneNumberId || '',
      );
      setWhatsappTestResult({ ok: res.ok, message: res.message, latencyMs: res.latencyMs });
    } catch (err: any) {
      setWhatsappTestResult({ ok: false, message: err?.message || 'Test failed' });
    } finally {
      setTestingWhatsApp(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setEmailTestResult(null);
    try {
      const res = await api.hermes.testEmailConnection(
        form.emailImapHost || 'imap.gmail.com',
        form.emailImapPort || 993,
      );
      setEmailTestResult({ ok: res.ok, message: res.message, latencyMs: res.latencyMs });
    } catch (err: any) {
      setEmailTestResult({ ok: false, message: err?.message || 'Test failed' });
    } finally {
      setTestingEmail(false);
    }
  };

  const applyEmailPreset = (presetId: string) => {
    const preset = EMAIL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      emailImapHost: preset.imapHost,
      emailSmtpHost: preset.smtpHost,
      emailImapPort: preset.imapPort,
      emailSmtpPort: preset.smtpPort,
    }));
  };

  const addWebhookRoute = () => {
    setForm((prev) => ({
      ...prev,
      webhookRoutes: [...(prev.webhookRoutes || []), { name: '', events: ['push'], secret: '' }],
    }));
  };

  const removeWebhookRoute = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      webhookRoutes: (prev.webhookRoutes || []).filter((_, i) => i !== idx),
    }));
  };

  const updateWebhookRoute = (idx: number, field: string, value: string) => {
    setForm((prev) => {
      const routes = [...(prev.webhookRoutes || [])];
      routes[idx] = { ...routes[idx], [field]: field === 'events' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value };
      return { ...prev, webhookRoutes: routes };
    });
  };

  const configured = form.configured || {
    telegram: !!(form.telegramEnabled && form.telegramBotToken),
    whatsapp: !!(form.whatsappEnabled && form.whatsappAccessToken),
    email: !!(form.emailEnabled && form.emailAddress),
    webhooks: !!form.webhookEnabled,
  };

  const webhookCallbackUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1/hermes/messaging/whatsapp-webhook`
    : 'https://your-domain.com/api/v1/hermes/messaging/whatsapp-webhook';

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80, color: 'var(--text-muted)' }}>
        <Loader2 size={24} className="spin" />
        <span style={{ marginLeft: 12 }}>Loading messaging settings…</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── Gateway Selector ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <GatewayCard
          id="telegram"
          icon={<Send size={18} />}
          label="Telegram Bot"
          desc="Long-polling / webhook via python-telegram-bot"
          color="#2AABEE"
          isActive={configured.telegram}
          isConfigured={configured.telegram}
          isSelected={activeGateway === 'telegram'}
          onClick={() => setActiveGateway('telegram')}
        />
        <GatewayCard
          id="whatsapp"
          icon={<MessageSquare size={18} />}
          label="WhatsApp Cloud API"
          desc="Meta Graph API & webhooks for Business accounts"
          color="#25D366"
          isActive={configured.whatsapp}
          isConfigured={configured.whatsapp}
          isSelected={activeGateway === 'whatsapp'}
          onClick={() => setActiveGateway('whatsapp')}
        />
        <GatewayCard
          id="email"
          icon={<Mail size={18} />}
          label="Email (IMAP/SMTP)"
          desc="Receive & reply via standard email protocols"
          color="#f59e0b"
          isActive={configured.email}
          isConfigured={configured.email}
          isSelected={activeGateway === 'email'}
          onClick={() => setActiveGateway('email')}
        />
        <GatewayCard
          id="webhooks"
          icon={<Webhook size={18} />}
          label="Webhooks"
          desc="GitHub, GitLab & custom HTTP event triggers"
          color="#7c3aed"
          isActive={configured.webhooks}
          isConfigured={configured.webhooks}
          isSelected={activeGateway === 'webhooks'}
          onClick={() => setActiveGateway('webhooks')}
        />
      </div>

      {/* ── Telegram Panel ────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeGateway === 'telegram' && (
          <motion.div key="telegram" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Enable toggle */}
            <SectionCard glow="#2AABEE">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Send size={18} style={{ color: '#2AABEE' }} /> Telegram Gateway
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Uses long-polling by default — switches to webhook mode when TELEGRAM_WEBHOOK_URL is set
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{form.telegramEnabled ? 'Enabled' : 'Disabled'}</span>
                  <Toggle checked={!!form.telegramEnabled} onChange={(v) => set('telegramEnabled', v)} />
                </div>
              </div>
            </SectionCard>

            {/* Step 1 – BotFather */}
            <SectionCard>
              <SectionHeader>Step 1 — Create a Telegram Bot</SectionHeader>
              <InstructionStep number={1}>
                Open Telegram and search for <strong>@BotFather</strong>{' '}
                <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" style={{ color: '#2AABEE', textDecoration: 'none' }}>→ t.me/BotFather <ExternalLink size={10} style={{ verticalAlign: 'middle' }} /></a>
              </InstructionStep>
              <InstructionStep number={2}>
                Send the command <code style={{ background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }}>/newbot</code>, choose a display name, then a unique username ending in <code style={{ background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }}>bot</code> (e.g. <em>my_hermes_bot</em>)
              </InstructionStep>
              <InstructionStep number={3}>
                Copy the <strong>HTTP API token</strong> BotFather gives you — it looks like:<br />
                <code style={{ fontFamily: 'monospace', fontSize: 12 }}>123456789:ABCdefGHIjklMNOpqrSTUvwxYZ</code>
              </InstructionStep>

              <div style={{ marginTop: 20 }}>
                <FieldLabel hint="Keep this secret — anyone with this token controls your bot">
                  Bot Token (TELEGRAM_BOT_TOKEN)
                </FieldLabel>
                <SecretField
                  value={form.telegramBotToken || ''}
                  onChange={(v) => set('telegramBotToken', v)}
                  placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                  isSet={!!form.telegramBotTokenSet}
                />
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleTestTelegram}
                    disabled={testingTelegram || !form.telegramBotToken}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#2AABEE20', border: '1px solid #2AABEE50', borderRadius: 'var(--radius-md)', color: '#2AABEE', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: testingTelegram || !form.telegramBotToken ? 0.5 : 1 }}
                  >
                    {testingTelegram ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
                    Test Token
                  </button>
                </div>
                {telegramTestResult && <div style={{ marginTop: 8 }}><TestResultBadge result={telegramTestResult} /></div>}
              </div>
            </SectionCard>

            {/* Step 2 – User IDs */}
            <SectionCard>
              <SectionHeader>Step 2 — Find Your User ID & Set Access</SectionHeader>
              <InfoBox variant="tip">
                Hermes uses numeric Telegram User IDs for access control. Your ID is a number like <strong>123456789</strong> — not your @username.
                Message <a href="https://t.me/userinfobot" target="_blank" rel="noopener" style={{ color: '#10b981' }}>@userinfobot</a> to get yours instantly.
              </InfoBox>

              <FieldLabel hint="Comma-separated numeric user IDs that can interact with the bot">
                Allowed User IDs (TELEGRAM_ALLOWED_USERS)
              </FieldLabel>
              <InputField
                value={form.telegramAllowedUsers || ''}
                onChange={(v) => set('telegramAllowedUsers', v)}
                placeholder="123456789, 987654321"
                prefix={<Hash size={12} />}
              />

              <div style={{ marginTop: 14 }}>
                <FieldLabel hint="Comma-separated chat IDs (use negative IDs for groups)">
                  Allowed Chat IDs (TELEGRAM_ALLOWED_CHATS) — optional
                </FieldLabel>
                <InputField
                  value={form.telegramAllowedChats || ''}
                  onChange={(v) => set('telegramAllowedChats', v)}
                  placeholder="-1001234567890"
                  prefix={<Hash size={12} />}
                />
              </div>
            </SectionCard>

            {/* Step 3 – Group behavior */}
            <SectionCard>
              <SectionHeader>Step 3 — Group Chat Behavior</SectionHeader>
              <InfoBox variant="warning">
                By default Telegram bots in groups only see messages starting with <code>/</code> (privacy mode).
                Disable privacy in <a href="https://t.me/BotFather" target="_blank" rel="noopener" style={{ color: '#f59e0b' }}>@BotFather → Bot Settings → Group Privacy → Turn Off</a>, then remove and re-add the bot from any affected groups.
              </InfoBox>

              <ToggleRow
                label="Require @mention in groups"
                hint="Bot only replies in group chats when directly @mentioned — prevents unwanted spam"
                checked={!!form.telegramRequireMention}
                onChange={(v) => set('telegramRequireMention', v)}
              />
              <ToggleRow
                label="Observe unmentioned group messages"
                hint="Append group messages to context without triggering the agent — enables Yuanbao-style group awareness"
                checked={!!form.telegramObserveUnmentioned}
                onChange={(v) => set('telegramObserveUnmentioned', v)}
              />
              {form.telegramObserveUnmentioned && (
                <div style={{ marginTop: 10 }}>
                  <FieldLabel hint="Same IDs as Allowed Chat IDs for observe mode">
                    Group Allowed Chats (TELEGRAM_GROUP_ALLOWED_CHATS)
                  </FieldLabel>
                  <InputField
                    value={form.telegramGroupAllowedChats || ''}
                    onChange={(v) => set('telegramGroupAllowedChats', v)}
                    placeholder="-1001234567890"
                    prefix={<Hash size={12} />}
                  />
                </div>
              )}
            </SectionCard>

            {/* Step 4 – Advanced */}
            <SectionCard>
              <SectionHeader>Step 4 — Advanced Options</SectionHeader>

              <ToggleRow
                label="Status indicator"
                hint="Updates bot's short description to 🟢 Online / 🔴 Offline on gateway connect / shutdown"
                checked={!!form.telegramStatusIndicator}
                onChange={(v) => set('telegramStatusIndicator', v)}
              />

              {form.telegramStatusIndicator && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <div>
                    <FieldLabel>Online Status Text</FieldLabel>
                    <InputField value={form.telegramStatusOnline || '🟢 Online'} onChange={(v) => set('telegramStatusOnline', v)} />
                  </div>
                  <div>
                    <FieldLabel>Offline Status Text</FieldLabel>
                    <InputField value={form.telegramStatusOffline || '🔴 Offline'} onChange={(v) => set('telegramStatusOffline', v)} />
                  </div>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <FieldLabel hint="Telegram allows max 100 commands, Hermes defaults to 60 for reliability">
                  Command Menu Max Commands
                </FieldLabel>
                <NumberField value={form.telegramCommandMenuMax ?? 60} onChange={(v) => set('telegramCommandMenuMax', v)} min={1} max={100} />
              </div>

              <div style={{ marginTop: 14 }}>
                <FieldLabel hint="How your priority commands are combined with Hermes built-ins">
                  Command Priority Mode
                </FieldLabel>
                <select
                  value={form.telegramCommandMenuPriorityMode || 'prepend'}
                  onChange={(e) => set('telegramCommandMenuPriorityMode', e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 13 }}
                >
                  <option value="prepend">prepend — your commands first, then Hermes defaults</option>
                  <option value="append">append — Hermes defaults first, then your commands</option>
                  <option value="replace">replace — use only your list for ordering</option>
                </select>
              </div>

              {/* Webhook mode section */}
              <Accordion title="☁️ Webhook Mode (for cloud deployments — Fly.io, Railway, Render)">
                <InfoBox variant="info">
                  Webhook mode lets Telegram push updates to your HTTPS URL instead of the bot polling. Required for sleep-when-idle cloud deployments where outbound polling prevents sleeping.
                  When <code>TELEGRAM_WEBHOOK_URL</code> is set, the gateway starts an HTTP webhook server instead of polling.
                </InfoBox>
                <FieldLabel hint="Your public HTTPS URL — must be accessible from the internet">
                  Webhook URL (TELEGRAM_WEBHOOK_URL)
                </FieldLabel>
                <InputField
                  value={form.telegramWebhookUrl || ''}
                  onChange={(v) => set('telegramWebhookUrl', v)}
                  placeholder="https://my-app.fly.dev/telegram"
                  prefix={<Globe size={12} />}
                />
                <div style={{ marginTop: 12 }}>
                  <FieldLabel hint="Required secret for validating Telegram requests — generate with: openssl rand -hex 32">
                    Webhook Secret (TELEGRAM_WEBHOOK_SECRET)
                  </FieldLabel>
                  <SecretField
                    value={form.telegramWebhookSecret || ''}
                    onChange={(v) => set('telegramWebhookSecret', v)}
                    placeholder="random hex secret"
                    isSet={!!form.telegramWebhookSecretSet}
                  />
                </div>
                <div style={{ marginTop: 12 }}>
                  <FieldLabel>Webhook Port (TELEGRAM_WEBHOOK_PORT)</FieldLabel>
                  <NumberField value={form.telegramWebhookPort ?? 8443} onChange={(v) => set('telegramWebhookPort', v)} min={1024} max={65535} />
                </div>
              </Accordion>
            </SectionCard>

          </motion.div>
        )}

        {/* ── WhatsApp Panel ──────────────────────────────────────────────── */}
        {activeGateway === 'whatsapp' && (
          <motion.div key="whatsapp" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <SectionCard glow="#25D366">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MessageSquare size={18} style={{ color: '#25D366' }} /> WhatsApp Business Cloud API
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Uses Meta Graph API & webhooks — requires a WhatsApp Business Account
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{form.whatsappEnabled ? 'Enabled' : 'Disabled'}</span>
                  <Toggle checked={!!form.whatsappEnabled} onChange={(v) => set('whatsappEnabled', v)} />
                </div>
              </div>
            </SectionCard>

            {/* Step 1 – Meta Developer Setup */}
            <SectionCard>
              <SectionHeader>Step 1 — Meta Developer App Setup</SectionHeader>
              <InstructionStep number={1}>
                Go to <a href="https://developers.facebook.com" target="_blank" rel="noopener" style={{ color: '#25D366' }}>developers.facebook.com <ExternalLink size={10} style={{ verticalAlign: 'middle' }} /></a> → Create App → Business type → Add WhatsApp product
              </InstructionStep>
              <InstructionStep number={2}>
                Navigate to <strong>Meta Business Settings → Users → System Users</strong> → Create a System User → Assign it the <em>WhatsApp</em> asset with <strong>Full Control</strong>
              </InstructionStep>
              <InstructionStep number={3}>
                Generate a <strong>Permanent System User Token</strong> (never expires) by clicking Generate Token on the System User page. Select your app and the <code>whatsapp_business_messaging</code> + <code>whatsapp_business_management</code> permissions.
              </InstructionStep>
              <InstructionStep number={4}>
                In the Meta App Dashboard, navigate to <strong>WhatsApp → Configuration</strong> and set the Webhook Callback URL:
              </InstructionStep>
              <FieldLabel>Your Webhook Callback URL</FieldLabel>
              <CodeBlock code={webhookCallbackUrl} />
            </SectionCard>

            {/* Step 2 – Credentials */}
            <SectionCard>
              <SectionHeader>Step 2 — Enter API Credentials</SectionHeader>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <FieldLabel hint="Permanent System User Access Token (starts with EAAG...)">
                    Access Token (WHATSAPP_CLOUD_ACCESS_TOKEN)
                  </FieldLabel>
                  <SecretField
                    value={form.whatsappAccessToken || ''}
                    onChange={(v) => set('whatsappAccessToken', v)}
                    placeholder="EAAG..."
                    isSet={!!form.whatsappAccessTokenSet}
                  />
                </div>
                <div>
                  <FieldLabel hint="Numeric Phone Number ID from Meta Dashboard (not the phone number itself)">
                    Phone Number ID (WHATSAPP_CLOUD_PHONE_NUMBER_ID)
                  </FieldLabel>
                  <InputField
                    value={form.whatsappPhoneNumberId || ''}
                    onChange={(v) => set('whatsappPhoneNumberId', v)}
                    placeholder="100609321..."
                    mono
                  />
                </div>
                <div>
                  <FieldLabel hint="WhatsApp Business Account ID (WABA ID) from Meta Dashboard">
                    WABA ID (WHATSAPP_CLOUD_WABA_ID)
                  </FieldLabel>
                  <InputField
                    value={form.whatsappWabaId || ''}
                    onChange={(v) => set('whatsappWabaId', v)}
                    placeholder="101509123..."
                    mono
                  />
                </div>
                <div>
                  <FieldLabel hint="Your custom secret string for validating Meta webhook subscriptions">
                    Webhook Verify Token (WHATSAPP_CLOUD_VERIFY_TOKEN)
                  </FieldLabel>
                  <InputField
                    value={form.whatsappVerifyToken || ''}
                    onChange={(v) => set('whatsappVerifyToken', v)}
                    placeholder="my_custom_verify_secret"
                    mono
                  />
                </div>
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleTestWhatsApp}
                  disabled={testingWhatsApp || !form.whatsappAccessToken || !form.whatsappPhoneNumberId}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#25D36620', border: '1px solid #25D36650', borderRadius: 'var(--radius-md)', color: '#25D366', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: testingWhatsApp || !form.whatsappAccessToken ? 0.5 : 1 }}
                >
                  {testingWhatsApp ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
                  Verify Credentials
                </button>
              </div>
              {whatsappTestResult && <div style={{ marginTop: 8 }}><TestResultBadge result={whatsappTestResult} /></div>}
            </SectionCard>

            {/* Step 3 – Access control + behavior */}
            <SectionCard>
              <SectionHeader>Step 3 — Access Control & Behavior</SectionHeader>

              <FieldLabel hint="Comma-separated E.164 phone numbers (with country code, no +) — e.g. 15551234567">
                Allowed Sender Phone Numbers (WHATSAPP_CLOUD_ALLOWED_USERS)
              </FieldLabel>
              <InputField
                value={form.whatsappAllowedUsers || ''}
                onChange={(v) => set('whatsappAllowedUsers', v)}
                placeholder="15551234567, 447911123456"
                prefix={<Hash size={12} />}
              />

              <div style={{ marginTop: 14 }}>
                <FieldLabel hint="Seconds to wait before sending a text reply (batches multiple sends)">
                  Text Batch Delay Seconds
                </FieldLabel>
                <NumberField value={form.whatsappTextBatchDelay ?? 2} onChange={(v) => set('whatsappTextBatchDelay', v)} min={0} max={30} />
              </div>
            </SectionCard>

          </motion.div>
        )}

        {/* ── Email Panel ────────────────────────────────────────────────────── */}
        {activeGateway === 'email' && (
          <motion.div key="email" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <SectionCard glow="#f59e0b">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Mail size={18} style={{ color: '#f59e0b' }} /> Email Gateway (IMAP / SMTP)
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Hermes polls the mailbox every {form.emailPollInterval || 15}s via IMAP and replies via SMTP
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{form.emailEnabled ? 'Enabled' : 'Disabled'}</span>
                  <Toggle checked={!!form.emailEnabled} onChange={(v) => set('emailEnabled', v)} />
                </div>
              </div>
            </SectionCard>

            {/* Provider presets */}
            <SectionCard>
              <SectionHeader>Quick Setup — Email Provider Presets</SectionHeader>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {EMAIL_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyEmailPreset(p.id)}
                    style={{ padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, transition: 'all 0.15s ease' }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <FieldLabel hint="The email address Hermes will use as its inbox (EMAIL_ADDRESS)">
                    Agent Email Address
                  </FieldLabel>
                  <InputField
                    value={form.emailAddress || ''}
                    onChange={(v) => set('emailAddress', v)}
                    placeholder="hermes@gmail.com"
                    type="email"
                    prefix={<Mail size={12} />}
                  />
                </div>
                <div>
                  <FieldLabel hint="Use an App Password (NOT your account password) — required for Gmail, Yahoo, Outlook">
                    App Password (EMAIL_PASSWORD)
                  </FieldLabel>
                  <SecretField
                    value={form.emailPassword || ''}
                    onChange={(v) => set('emailPassword', v)}
                    placeholder="xxxx xxxx xxxx xxxx"
                    isSet={!!form.emailPasswordSet}
                  />
                </div>
              </div>

              {/* IMAP */}
              <div style={{ marginTop: 16 }}>
                <SectionHeader>IMAP (Incoming)</SectionHeader>
                <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 10 }}>
                  <div>
                    <FieldLabel>IMAP Host (EMAIL_IMAP_HOST)</FieldLabel>
                    <InputField value={form.emailImapHost || 'imap.gmail.com'} onChange={(v) => set('emailImapHost', v)} placeholder="imap.gmail.com" mono />
                  </div>
                  <div>
                    <FieldLabel>Port (EMAIL_IMAP_PORT)</FieldLabel>
                    <NumberField value={form.emailImapPort ?? 993} onChange={(v) => set('emailImapPort', v)} min={1} max={65535} />
                  </div>
                </div>
              </div>

              {/* SMTP */}
              <div style={{ marginTop: 14 }}>
                <SectionHeader>SMTP (Outgoing)</SectionHeader>
                <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 10 }}>
                  <div>
                    <FieldLabel>SMTP Host (EMAIL_SMTP_HOST)</FieldLabel>
                    <InputField value={form.emailSmtpHost || 'smtp.gmail.com'} onChange={(v) => set('emailSmtpHost', v)} placeholder="smtp.gmail.com" mono />
                  </div>
                  <div>
                    <FieldLabel>Port (EMAIL_SMTP_PORT)</FieldLabel>
                    <NumberField value={form.emailSmtpPort ?? 587} onChange={(v) => set('emailSmtpPort', v)} min={1} max={65535} />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleTestEmail}
                  disabled={testingEmail || !form.emailImapHost}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#f59e0b20', border: '1px solid #f59e0b50', borderRadius: 'var(--radius-md)', color: '#f59e0b', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: testingEmail || !form.emailImapHost ? 0.5 : 1 }}
                >
                  {testingEmail ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
                  Test IMAP Connection
                </button>
              </div>
              {emailTestResult && <div style={{ marginTop: 8 }}><TestResultBadge result={emailTestResult} /></div>}
            </SectionCard>

            {/* Access control + polling */}
            <SectionCard>
              <SectionHeader>Access Control & Polling</SectionHeader>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <FieldLabel hint="How often Hermes checks for new emails (in seconds)">
                    Poll Interval (EMAIL_POLL_INTERVAL) — seconds
                  </FieldLabel>
                  <NumberField value={form.emailPollInterval ?? 15} onChange={(v) => set('emailPollInterval', v)} min={5} max={3600} />
                </div>
                <div>
                  <FieldLabel hint="Comma-separated email addresses that can send tasks to Hermes">
                    Allowed Senders (EMAIL_ALLOWED_USERS)
                  </FieldLabel>
                  <InputField
                    value={form.emailAllowedUsers || ''}
                    onChange={(v) => set('emailAllowedUsers', v)}
                    placeholder="user@company.com, boss@corp.com"
                    prefix={<Mail size={12} />}
                  />
                </div>
              </div>
            </SectionCard>

            {/* Gmail App Password guide */}
            <Accordion title="📋 How to create a Gmail App Password">
              <InstructionStep number={1}>
                Go to <a href="https://myaccount.google.com/security" target="_blank" rel="noopener" style={{ color: '#f59e0b' }}>myaccount.google.com/security</a> and enable <strong>2-Step Verification</strong> if not already on
              </InstructionStep>
              <InstructionStep number={2}>
                Search for <strong>"App Passwords"</strong> in your Google Account or visit <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener" style={{ color: '#f59e0b' }}>myaccount.google.com/apppasswords</a>
              </InstructionStep>
              <InstructionStep number={3}>
                Click <strong>Create</strong>, choose "Mail" and "Other (Custom name)", name it "Hermes" — copy the 16-character code
              </InstructionStep>
              <InstructionStep number={4}>
                Paste the 16-character App Password (without spaces) in the <em>App Password</em> field above
              </InstructionStep>
            </Accordion>

          </motion.div>
        )}

        {/* ── Webhooks Panel ────────────────────────────────────────────────── */}
        {activeGateway === 'webhooks' && (
          <motion.div key="webhooks" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <SectionCard glow="#7c3aed">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Webhook size={18} style={{ color: '#7c3aed' }} /> Webhook Event Server
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    HTTP server listening on port {form.webhookPort || 8644} — receives GitHub, GitLab and custom events
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{form.webhookEnabled ? 'Enabled' : 'Disabled'}</span>
                  <Toggle checked={!!form.webhookEnabled} onChange={(v) => set('webhookEnabled', v)} />
                </div>
              </div>
            </SectionCard>

            <SectionCard>
              <SectionHeader>Server Configuration</SectionHeader>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <FieldLabel hint="TCP port the webhook HTTP server listens on (WEBHOOK_PORT)">
                    Listener Port
                  </FieldLabel>
                  <NumberField value={form.webhookPort ?? 8644} onChange={(v) => set('webhookPort', v)} min={1024} max={65535} />
                </div>
                <div>
                  <FieldLabel hint="Global HMAC-SHA256 secret for validating all incoming webhook payloads (WEBHOOK_SECRET)">
                    Global HMAC Secret (WEBHOOK_SECRET)
                  </FieldLabel>
                  <SecretField
                    value={form.webhookSecret || ''}
                    onChange={(v) => set('webhookSecret', v)}
                    placeholder="global_hmac_secret"
                    isSet={!!form.webhookSecretSet}
                  />
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <FieldLabel>Your Webhook Base URL</FieldLabel>
                <CodeBlock code={`${typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}:${form.webhookPort || 8644}`} />
              </div>
            </SectionCard>

            {/* Route Configurator */}
            <SectionCard>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <SectionHeader>Webhook Routes</SectionHeader>
                </div>
                <button
                  type="button"
                  onClick={addWebhookRoute}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#7c3aed20', border: '1px solid #7c3aed50', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: '#7c3aed', fontSize: 12, fontWeight: 600 }}
                >
                  <Plus size={13} /> Add Route
                </button>
              </div>

              <InfoBox variant="info">
                Each route tells Hermes which events from a specific integration (e.g. GitHub) should trigger the agent.
                The route name becomes the URL path: <code>/your-route-name</code>.
                Per-route secrets override the global HMAC secret for that integration.
              </InfoBox>

              {(form.webhookRoutes || []).length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  <Webhook size={28} style={{ opacity: 0.3, marginBottom: 10, display: 'block', margin: '0 auto 10px' }} />
                  No routes configured yet. Click <strong>Add Route</strong> to create one.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(form.webhookRoutes || []).map((route, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px', position: 'relative' }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <FieldLabel>Route Name (URL path segment)</FieldLabel>
                        <InputField
                          value={route.name}
                          onChange={(v) => updateWebhookRoute(idx, 'name', v)}
                          placeholder="github-events"
                          prefix={<span style={{ fontSize: 11 }}>/</span>}
                        />
                      </div>
                      <div>
                        <FieldLabel hint="Comma-separated — e.g. push, pull_request, issues">
                          Event Types to Handle
                        </FieldLabel>
                        <InputField
                          value={(route.events || []).join(', ')}
                          onChange={(v) => updateWebhookRoute(idx, 'events', v)}
                          placeholder="push, pull_request, issues"
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <FieldLabel hint="Per-route HMAC secret — overrides global secret for this integration">
                          Per-Route Secret (optional)
                        </FieldLabel>
                        <InputField
                          value={route.secret || ''}
                          onChange={(v) => updateWebhookRoute(idx, 'secret', v)}
                          placeholder="per_route_secret"
                          type="password"
                        />
                      </div>
                      <div>
                        <FieldLabel hint="Agent profile or skill set to activate for this route">
                          Agent Profile (optional)
                        </FieldLabel>
                        <InputField
                          value={route.profile || ''}
                          onChange={(v) => updateWebhookRoute(idx, 'profile', v)}
                          placeholder="devops-agent"
                        />
                      </div>
                    </div>

                    {route.name && (
                      <div style={{ marginTop: 10 }}>
                        <FieldLabel>Webhook URL for this route</FieldLabel>
                        <CodeBlock code={`${typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}:${form.webhookPort || 8644}/${route.name}`} />
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => removeWebhookRoute(idx)}
                      style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: '#ef4444' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </motion.div>
                ))}
              </div>

              <Accordion title="🔑 Supported event types by platform">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>GitHub</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 2, fontFamily: 'monospace' }}>
                      push · pull_request · issues · issue_comment<br />
                      create · delete · release · workflow_run<br />
                      check_run · check_suite · deployment<br />
                      deployment_status · status · star
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>GitLab</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 2, fontFamily: 'monospace' }}>
                      push · merge_request · issues · note<br />
                      confidential_issues · confidential_note<br />
                      tag_push · pipeline · job · wiki_page<br />
                      deployment · release · feature_flag
                    </div>
                  </div>
                </div>
              </Accordion>
            </SectionCard>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Save Bar ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '14px 20px',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
          zIndex: 10,
        }}
      >
        <div style={{ flex: 1 }}>
          <AnimatePresence>
            {saveMsg && (
              <motion.div
                key="savemsg"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                style={{
                  fontSize: 13,
                  color: saveMsg.type === 'success' ? '#10b981' : '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {saveMsg.type === 'success' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                {saveMsg.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 24px',
            background: saving ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #7c3aed, #06b6d4)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            transition: 'all 0.2s ease',
            opacity: saving ? 0.6 : 1,
            boxShadow: saving ? 'none' : '0 4px 16px rgba(124,58,237,0.35)',
          }}
        >
          {saving ? (
            <><Loader2 size={16} className="spin" /> Applying…</>
          ) : (
            <><Save size={16} /> Save & Apply Gateway Settings</>
          )}
        </button>
      </div>
    </div>
  );
}
