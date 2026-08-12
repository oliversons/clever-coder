import React, { useEffect, useState, useMemo } from 'react';
import {
  RiTelegramLine,
  RiWhatsappLine,
  RiMailLine,
  RiWebhookLine,
  RiSendPlane2Line,
  RiCheckLine,
  RiAlertLine,
  RiRefreshLine,
  RiKeyLine,
  RiSettings4Line,
  RiInformationLine,
  RiExternalLinkLine,
  RiTimeLine,
  RiShieldCheckLine,
  RiGlobalLine,
  RiTerminalBoxLine,
  RiStackLine,
  RiCpuLine,
  RiDatabase2Line,
  RiLockLine,
  RiAddLine,
  RiDeleteBin6Line,
  RiEyeLine,
  RiEyeOffLine,
  RiMessengerLine,
  RiFileCopyLine,
  RiFlashlightLine,
} from 'react-icons/ri';
import { api, type HermesMessagingSettings } from '../../api/client';

type GatewayId = 'telegram' | 'whatsapp' | 'email' | 'webhooks';

interface GatewayMeta {
  id: GatewayId;
  name: string;
  badge: string;
  badgeType: 'free' | 'freemium' | 'paid' | 'selfhosted';
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  channelType: string;
}

const GATEWAY_PROVIDERS: GatewayMeta[] = [
  {
    id: 'telegram',
    name: 'Telegram Bot Gateway',
    badge: 'Long-Polling & Webhooks',
    badgeType: 'free',
    description: 'Direct bi-directional chat via Telegram Bot API. Supports direct messages, group chats with @mention, and rich formatting.',
    icon: RiTelegramLine,
    channelType: 'python-telegram-bot',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Cloud API',
    badge: 'Meta Graph API',
    badgeType: 'freemium',
    description: 'Official WhatsApp Business Cloud integration with webhook event ingestion and text message batching.',
    icon: RiWhatsappLine,
    channelType: 'Meta Graph API v18+',
  },
  {
    id: 'email',
    name: 'Email (IMAP / SMTP)',
    badge: 'Standard Mail Protocols',
    badgeType: 'selfhosted',
    description: 'Autonomous inbox polling via IMAP with automatic AI response dispatching through authenticated SMTP transport.',
    icon: RiMailLine,
    channelType: 'IMAP (993) / SMTP (587)',
  },
  {
    id: 'webhooks',
    name: 'Webhook Event Server',
    badge: 'HTTP Ingestion Server',
    badgeType: 'paid',
    description: 'Dedicated HTTP daemon listening for GitHub, GitLab, and custom webhook payloads with HMAC validation and routing.',
    icon: RiWebhookLine,
    channelType: 'HTTP Daemon (Port 8644)',
  },
];

const EMAIL_PRESETS = [
  { id: 'gmail', label: 'Gmail', imapHost: 'imap.gmail.com', smtpHost: 'smtp.gmail.com', imapPort: 993, smtpPort: 587 },
  { id: 'outlook', label: 'Outlook / 365', imapHost: 'outlook.office365.com', smtpHost: 'smtp.office365.com', imapPort: 993, smtpPort: 587 },
  { id: 'yahoo', label: 'Yahoo Mail', imapHost: 'imap.mail.yahoo.com', smtpHost: 'smtp.mail.yahoo.com', imapPort: 993, smtpPort: 587 },
  { id: 'icloud', label: 'Apple iCloud', imapHost: 'imap.mail.me.com', smtpHost: 'smtp.mail.me.com', imapPort: 993, smtpPort: 587 },
  { id: 'proton', label: 'Proton Bridge', imapHost: '127.0.0.1', smtpHost: '127.0.0.1', imapPort: 1143, smtpPort: 1025 },
];

export const MessagingGatewaySettings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeGateway, setActiveGateway] = useState<GatewayId>('telegram');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [form, setForm] = useState<HermesMessagingSettings>({
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
  });

  // Sensitive Field Visibility State
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Per-platform test states
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<{
    ok: boolean;
    botUsername?: string;
    botName?: string;
    botId?: number;
    message: string;
    latencyMs?: number;
  } | null>(null);

  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [whatsappTestResult, setWhatsappTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
    displayPhoneNumber?: string;
  } | null>(null);

  const [testingEmail, setTestingEmail] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  const [copiedText, setCopiedText] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await api.hermes.getMessagingSettings();
      if (data) {
        setForm((prev) => ({
          ...prev,
          ...data,
          telegramCommandMenuMax: data.telegramCommandMenuMax || 60,
          telegramCommandMenuPriorityMode: data.telegramCommandMenuPriorityMode || 'prepend',
          emailPollInterval: data.emailPollInterval || 15,
          whatsappTextBatchDelay: data.whatsappTextBatchDelay || 2,
          webhookPort: data.webhookPort || 8644,
          webhookRoutes: data.webhookRoutes || [],
        }));
      }
    } catch (err: any) {
      console.error('Failed to load messaging gateway settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.hermes.saveMessagingSettings(form);
      if (res.success && res.settings) {
        setForm((prev) => ({ ...prev, ...res.settings }));
      }
      setMessage({
        type: 'success',
        text: 'Messaging gateway settings saved and synchronized to ~/.hermes/config.yaml and .env! Gateway supervisor restarting...',
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || 'Failed to save messaging settings',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    setTelegramTestResult(null);
    try {
      const res = await api.hermes.testTelegramToken(form.telegramBotToken || '');
      setTelegramTestResult(res);
    } catch (err: any) {
      setTelegramTestResult({
        ok: false,
        message: err?.message || 'Telegram bot verification failed',
      });
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
      setWhatsappTestResult(res);
    } catch (err: any) {
      setWhatsappTestResult({
        ok: false,
        message: err?.message || 'WhatsApp Cloud credentials verification failed',
      });
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
      setEmailTestResult(res);
    } catch (err: any) {
      setEmailTestResult({
        ok: false,
        message: err?.message || 'IMAP connection verification failed',
      });
    } finally {
      setTestingEmail(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
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
      webhookRoutes: [...(prev.webhookRoutes || []), { name: '', events: ['push', 'pull_request'], secret: '', profile: '' }],
    }));
  };

  const removeWebhookRoute = (index: number) => {
    setForm((prev) => ({
      ...prev,
      webhookRoutes: (prev.webhookRoutes || []).filter((_, i) => i !== index),
    }));
  };

  const updateWebhookRoute = (index: number, field: string, value: any) => {
    setForm((prev) => {
      const routes = [...(prev.webhookRoutes || [])];
      routes[index] = {
        ...routes[index],
        [field]: field === 'events' && typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value,
      };
      return { ...prev, webhookRoutes: routes };
    });
  };

  const toggleSecret = (field: string) => {
    setShowSecrets((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const activeMeta = GATEWAY_PROVIDERS.find((g) => g.id === activeGateway) || GATEWAY_PROVIDERS[0];

  const webhookCallbackUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1/hermes/messaging/whatsapp-webhook`
    : 'https://your-domain.com/api/v1/hermes/messaging/whatsapp-webhook';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
      {/* ── Top Status Overview Banner ─────────────────────────────────── */}
      <div
        className="glass-card"
        style={{
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          borderLeft: '4px solid var(--primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)',
            }}
          >
            <RiMessengerLine size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Messaging Gateways &amp; Webhooks</h2>
              <span className="badge badge-primary">Gateway Daemon</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Configure multi-channel communication (<code>hermes gateway</code>) for Telegram, WhatsApp, Email, and Webhooks
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div
            style={{
              padding: '6px 12px',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>Telegram:</span>
            <strong style={{ color: form.telegramEnabled ? 'var(--success, #10b981)' : 'var(--text-muted)' }}>
              {form.telegramEnabled ? (form.telegramBotTokenSet || form.telegramBotToken ? '🟢 Active' : '🟡 Token Missing') : '⚪ Off'}
            </strong>
          </div>

          <div
            style={{
              padding: '6px 12px',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>WhatsApp:</span>
            <strong style={{ color: form.whatsappEnabled ? 'var(--success, #10b981)' : 'var(--text-muted)' }}>
              {form.whatsappEnabled ? '🟢 Active' : '⚪ Off'}
            </strong>
          </div>

          <div
            style={{
              padding: '6px 12px',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>Email:</span>
            <strong style={{ color: form.emailEnabled ? 'var(--success, #10b981)' : 'var(--text-muted)' }}>
              {form.emailEnabled ? '🟢 IMAP:993' : '⚪ Off'}
            </strong>
          </div>

          <div
            style={{
              padding: '6px 12px',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>Webhooks:</span>
            <strong style={{ color: form.webhookEnabled ? 'var(--success, #10b981)' : 'var(--text-muted)' }}>
              {form.webhookEnabled ? `🟢 Port ${form.webhookPort || 8644}` : '⚪ Off'}
            </strong>
          </div>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {message.type === 'success' ? <RiCheckLine size={18} /> : <RiAlertLine size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* ── 1. Gateway Channel Selection Grid ──────────────────────────── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RiStackLine size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Messaging Platform Gateways</h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Select a communication channel below to configure authentication tokens, access control, and behavior parameters
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {GATEWAY_PROVIDERS.map((provider) => {
            const isSelected = activeGateway === provider.id;
            const Icon = provider.icon;
            let isEnabled = false;
            if (provider.id === 'telegram') isEnabled = !!form.telegramEnabled;
            if (provider.id === 'whatsapp') isEnabled = !!form.whatsappEnabled;
            if (provider.id === 'email') isEnabled = !!form.emailEnabled;
            if (provider.id === 'webhooks') isEnabled = !!form.webhookEnabled;

            return (
              <div
                key={provider.id}
                onClick={() => setActiveGateway(provider.id)}
                style={{
                  padding: 16,
                  borderRadius: 'var(--radius-md)',
                  background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-card)',
                  border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  boxShadow: isSelected ? '0 4px 18px rgba(124, 58, 237, 0.15)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 'var(--radius-sm)',
                        background: isSelected ? 'var(--primary)' : 'var(--bg-elevated)',
                        color: isSelected ? '#ffffff' : 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={18} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{provider.name}</h4>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: isEnabled ? 'var(--success, #10b981)' : 'var(--text-secondary)',
                        }}
                      >
                        {isEnabled ? '● Active Channel' : '○ Disabled'}
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <RiCheckLine size={14} />
                    </div>
                  )}
                </div>

                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4, flexGrow: 1 }}>
                  {provider.description}
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: 8,
                    borderTop: '1px solid var(--border)',
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>Protocol: {provider.channelType}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-accent)' }}>
                    {provider.badge}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 2. Active Gateway Configuration Studio ─────────────────────── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {activeGateway === 'telegram' && <RiTelegramLine size={22} style={{ color: '#2AABEE' }} />}
            {activeGateway === 'whatsapp' && <RiWhatsappLine size={22} style={{ color: '#25D366' }} />}
            {activeGateway === 'email' && <RiMailLine size={22} style={{ color: '#f59e0b' }} />}
            {activeGateway === 'webhooks' && <RiWebhookLine size={22} style={{ color: '#7c3aed' }} />}
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                {activeMeta.name} Configuration
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Manage authentication credentials, ACLs, and runtime behavior parameters
              </p>
            </div>
          </div>

          {/* Master Enable/Disable Button */}
          {activeGateway === 'telegram' && (
            <button
              type="button"
              className={form.telegramEnabled ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setForm({ ...form, telegramEnabled: !form.telegramEnabled })}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RiCheckLine size={16} />
              {form.telegramEnabled ? 'Telegram Gateway Enabled' : 'Enable Telegram Gateway'}
            </button>
          )}

          {activeGateway === 'whatsapp' && (
            <button
              type="button"
              className={form.whatsappEnabled ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setForm({ ...form, whatsappEnabled: !form.whatsappEnabled })}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RiCheckLine size={16} />
              {form.whatsappEnabled ? 'WhatsApp Cloud Enabled' : 'Enable WhatsApp Cloud'}
            </button>
          )}

          {activeGateway === 'email' && (
            <button
              type="button"
              className={form.emailEnabled ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setForm({ ...form, emailEnabled: !form.emailEnabled })}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RiCheckLine size={16} />
              {form.emailEnabled ? 'Email Gateway Enabled' : 'Enable Email Gateway'}
            </button>
          )}

          {activeGateway === 'webhooks' && (
            <button
              type="button"
              className={form.webhookEnabled ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setForm({ ...form, webhookEnabled: !form.webhookEnabled })}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RiCheckLine size={16} />
              {form.webhookEnabled ? 'Webhook Server Enabled' : 'Enable Webhook Server'}
            </button>
          )}
        </div>

        {/* ── TELEGRAM PANEL ────────────────────────────────────────── */}
        {activeGateway === 'telegram' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* BotFather Quick Setup Guide */}
            <div
              style={{
                padding: 16,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <RiInformationLine size={22} style={{ color: '#2AABEE', flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Quick Telegram Setup via @BotFather:</strong>
                <ol style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  <li>Open Telegram and message <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" style={{ color: '#2AABEE', textDecoration: 'none', fontWeight: 600 }}>@BotFather <RiExternalLinkLine style={{ verticalAlign: 'middle' }} /></a>.</li>
                  <li>Send <code>/newbot</code>, choose a bot name, and a unique username ending with <code>bot</code>.</li>
                  <li>Paste the resulting <strong>HTTP API Token</strong> into the field below and click <strong>Verify Token</strong>.</li>
                  <li>To find your user ID for access control, send any message to <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" style={{ color: '#2AABEE', textDecoration: 'none', fontWeight: 600 }}>@userinfobot <RiExternalLinkLine style={{ verticalAlign: 'middle' }} /></a>.</li>
                </ol>
              </div>
            </div>

            {/* Telegram Credentials Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              <div>
                <label className="form-label">
                  Bot Token (<code>TELEGRAM_BOT_TOKEN</code>)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showSecrets['telegramBotToken'] ? 'text' : 'password'}
                    className="form-input"
                    placeholder={form.telegramBotTokenSet && !form.telegramBotToken ? '•••••••• (Stored Securely)' : '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ'}
                    value={form.telegramBotToken || ''}
                    onChange={(e) => setForm({ ...form, telegramBotToken: e.target.value })}
                    style={{ paddingRight: 40 }}
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecret('telegramBotToken')}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {showSecrets['telegramBotToken'] ? <RiEyeOffLine size={16} /> : <RiEyeLine size={16} />}
                  </button>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                  {form.telegramBotTokenSet ? 'Token configured in database.' : 'Enter bot token issued by @BotFather'}
                </span>
              </div>

              <div>
                <label className="form-label">
                  Allowed User IDs (<code>TELEGRAM_ALLOWED_USERS</code>)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="123456789, 987654321"
                  value={form.telegramAllowedUsers || ''}
                  onChange={(e) => setForm({ ...form, telegramAllowedUsers: e.target.value })}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                  Comma-separated numeric user IDs authorized to interact with the bot
                </span>
              </div>

              <div>
                <label className="form-label">
                  Allowed Chat IDs (<code>TELEGRAM_ALLOWED_CHATS</code>)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="-1001234567890"
                  value={form.telegramAllowedChats || ''}
                  onChange={(e) => setForm({ ...form, telegramAllowedChats: e.target.value })}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                  Optional allowed chat IDs (use negative numbers for Telegram group chats)
                </span>
              </div>

              <div>
                <label className="form-label">
                  Command Priority Mode (<code>command_menu.priority_mode</code>)
                </label>
                <select
                  className="form-input"
                  value={form.telegramCommandMenuPriorityMode || 'prepend'}
                  onChange={(e) => setForm({ ...form, telegramCommandMenuPriorityMode: e.target.value })}
                  autoComplete="off"
                >
                  <option value="prepend">prepend — custom commands first, then Hermes defaults</option>
                  <option value="append">append — Hermes defaults first, then custom</option>
                  <option value="replace">replace — custom commands only</option>
                </select>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                  Order of bot command menu suggestions in Telegram client
                </span>
              </div>
            </div>

            {/* Telegram Behavior & Group Options */}
            <div style={{ padding: 18, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px 0' }}>Group Chat &amp; Status Behavior</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Require @Mention in Groups</span>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                      Bot only responds when directly tagged in group conversations
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.telegramRequireMention}
                    onChange={(e) => setForm({ ...form, telegramRequireMention: e.target.checked })}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Status Indicator in Bio</span>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                      Updates short description to 🟢 Online / 🔴 Offline automatically
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.telegramStatusIndicator}
                    onChange={(e) => setForm({ ...form, telegramStatusIndicator: e.target.checked })}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Observe Unmentioned Group Messages</span>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                      Captures group context silently without triggering responses
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.telegramObserveUnmentioned}
                    onChange={(e) => setForm({ ...form, telegramObserveUnmentioned: e.target.checked })}
                  />
                </label>
              </div>

              {/* Status String Customization */}
              {form.telegramStatusIndicator && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 14 }}>
                  <div>
                    <label className="form-label">Online Status String</label>
                    <input
                      type="text"
                      className="form-input"
                      value={form.telegramStatusOnline || '🟢 Online'}
                      onChange={(e) => setForm({ ...form, telegramStatusOnline: e.target.value })}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                  </div>
                  <div>
                    <label className="form-label">Offline Status String</label>
                    <input
                      type="text"
                      className="form-input"
                      value={form.telegramStatusOffline || '🔴 Offline'}
                      onChange={(e) => setForm({ ...form, telegramStatusOffline: e.target.value })}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Optional Webhook Mode Accordion */}
            <div style={{ padding: 18, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <RiGlobalLine size={18} style={{ color: 'var(--primary)' }} />
                <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Webhook Mode (Optional for Cloud / Serverless Deployments)</h4>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px 0' }}>
                When <code>TELEGRAM_WEBHOOK_URL</code> is set, the gateway transitions from outbound long-polling to an inbound HTTPS webhook listener.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                <div>
                  <label className="form-label">Webhook URL</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="https://your-domain.com/telegram"
                    value={form.telegramWebhookUrl || ''}
                    onChange={(e) => setForm({ ...form, telegramWebhookUrl: e.target.value })}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label className="form-label">Webhook Secret Token</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Secret for request validation"
                    value={form.telegramWebhookSecret || ''}
                    onChange={(e) => setForm({ ...form, telegramWebhookSecret: e.target.value })}
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label className="form-label">Webhook Listener Port</label>
                  <input
                    type="number"
                    className="form-input"
                    value={form.telegramWebhookPort || 8443}
                    onChange={(e) => setForm({ ...form, telegramWebhookPort: Number(e.target.value) })}
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── WHATSAPP CLOUD PANEL ──────────────────────────────────── */}
        {activeGateway === 'whatsapp' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Meta Developer Setup Guide */}
            <div
              style={{
                padding: 16,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <RiInformationLine size={22} style={{ color: '#25D366', flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--text-primary)' }}>WhatsApp Business Cloud Setup:</strong>
                <ol style={{ margin: '6px 0 0 16px', padding: 0 }}>
                  <li>Create a Business App on <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" style={{ color: '#25D366', textDecoration: 'none', fontWeight: 600 }}>developers.facebook.com <RiExternalLinkLine style={{ verticalAlign: 'middle' }} /></a> and add the WhatsApp product.</li>
                  <li>In Meta Business Settings &rarr; System Users, generate a <strong>Permanent System User Token</strong> with <code>whatsapp_business_messaging</code>.</li>
                  <li>In Meta WhatsApp &rarr; Configuration, set the Webhook URL to: <code>{webhookCallbackUrl}</code></li>
                </ol>
              </div>
            </div>

            {/* Webhook URL Copy Box */}
            <div style={{ padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <label className="form-label">Your Public Meta Webhook Callback URL</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input
                  type="text"
                  className="form-input"
                  readOnly
                  value={webhookCallbackUrl}
                  style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--bg-card)' }}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleCopy(webhookCallbackUrl, 'whatsapp_webhook')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {copiedText === 'whatsapp_webhook' ? <RiCheckLine size={16} /> : <RiFileCopyLine size={16} />}
                  {copiedText === 'whatsapp_webhook' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* WhatsApp Credentials Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              <div>
                <label className="form-label">
                  Permanent Access Token (<code>WHATSAPP_CLOUD_ACCESS_TOKEN</code>)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showSecrets['whatsappAccessToken'] ? 'text' : 'password'}
                    className="form-input"
                    placeholder={form.whatsappAccessTokenSet && !form.whatsappAccessToken ? '•••••••• (Stored Securely)' : 'EAAG...'}
                    value={form.whatsappAccessToken || ''}
                    onChange={(e) => setForm({ ...form, whatsappAccessToken: e.target.value })}
                    style={{ paddingRight: 40 }}
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecret('whatsappAccessToken')}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {showSecrets['whatsappAccessToken'] ? <RiEyeOffLine size={16} /> : <RiEyeLine size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="form-label">
                  Phone Number ID (<code>WHATSAPP_CLOUD_PHONE_NUMBER_ID</code>)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="100609321..."
                  value={form.whatsappPhoneNumberId || ''}
                  onChange={(e) => setForm({ ...form, whatsappPhoneNumberId: e.target.value })}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>

              <div>
                <label className="form-label">
                  WhatsApp Business Account ID (WABA ID)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="101509123..."
                  value={form.whatsappWabaId || ''}
                  onChange={(e) => setForm({ ...form, whatsappWabaId: e.target.value })}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>

              <div>
                <label className="form-label">
                  Webhook Verify Token (<code>WHATSAPP_CLOUD_VERIFY_TOKEN</code>)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="my_custom_webhook_secret"
                  value={form.whatsappVerifyToken || ''}
                  onChange={(e) => setForm({ ...form, whatsappVerifyToken: e.target.value })}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>

              <div>
                <label className="form-label">
                  Allowed Sender Numbers (E.164 without +)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="15551234567, 447911123456"
                  value={form.whatsappAllowedUsers || ''}
                  onChange={(e) => setForm({ ...form, whatsappAllowedUsers: e.target.value })}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>

              <div>
                <label className="form-label">
                  Text Batch Delay (Seconds)
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={form.whatsappTextBatchDelay || 2}
                  onChange={(e) => setForm({ ...form, whatsappTextBatchDelay: Number(e.target.value) })}
                  autoComplete="off"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── EMAIL (IMAP/SMTP) PANEL ───────────────────────────────── */}
        {activeGateway === 'email' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Preset Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Quick Presets:</span>
              {EMAIL_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => applyEmailPreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Email Credentials Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              <div>
                <label className="form-label">
                  Hermes Email Address (<code>EMAIL_ADDRESS</code>)
                </label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="hermes-agent@yourdomain.com"
                  value={form.emailAddress || ''}
                  onChange={(e) => setForm({ ...form, emailAddress: e.target.value })}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>

              <div>
                <label className="form-label">
                  App Password / SMTP Password (<code>EMAIL_PASSWORD</code>)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showSecrets['emailPassword'] ? 'text' : 'password'}
                    className="form-input"
                    placeholder={form.emailPasswordSet && !form.emailPassword ? '•••••••• (Stored Securely)' : 'App-specific password'}
                    value={form.emailPassword || ''}
                    onChange={(e) => setForm({ ...form, emailPassword: e.target.value })}
                    style={{ paddingRight: 40 }}
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecret('emailPassword')}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {showSecrets['emailPassword'] ? <RiEyeOffLine size={16} /> : <RiEyeLine size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="form-label">
                  IMAP Host (Incoming Mail)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="imap.gmail.com"
                  value={form.emailImapHost || 'imap.gmail.com'}
                  onChange={(e) => setForm({ ...form, emailImapHost: e.target.value })}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>

              <div>
                <label className="form-label">
                  IMAP Port (Default: 993 SSL)
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={form.emailImapPort || 993}
                  onChange={(e) => setForm({ ...form, emailImapPort: Number(e.target.value) })}
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="form-label">
                  SMTP Host (Outgoing Mail)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="smtp.gmail.com"
                  value={form.emailSmtpHost || 'smtp.gmail.com'}
                  onChange={(e) => setForm({ ...form, emailSmtpHost: e.target.value })}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>

              <div>
                <label className="form-label">
                  SMTP Port (Default: 587 STARTTLS)
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={form.emailSmtpPort || 587}
                  onChange={(e) => setForm({ ...form, emailSmtpPort: Number(e.target.value) })}
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="form-label">
                  Poll Interval (Seconds)
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={form.emailPollInterval || 15}
                  onChange={(e) => setForm({ ...form, emailPollInterval: Number(e.target.value) })}
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="form-label">
                  Allowed Sender Email Addresses
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="user@company.com, admin@org.com"
                  value={form.emailAllowedUsers || ''}
                  onChange={(e) => setForm({ ...form, emailAllowedUsers: e.target.value })}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── WEBHOOKS PANEL ────────────────────────────────────────── */}
        {activeGateway === 'webhooks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              <div>
                <label className="form-label">
                  Webhook Server Port (<code>WEBHOOK_PORT</code>)
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={form.webhookPort || 8644}
                  onChange={(e) => setForm({ ...form, webhookPort: Number(e.target.value) })}
                  autoComplete="off"
                />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                  Internal TCP port for the Hermes webhook daemon listener
                </span>
              </div>

              <div>
                <label className="form-label">
                  Global HMAC Secret (<code>WEBHOOK_SECRET</code>)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showSecrets['webhookSecret'] ? 'text' : 'password'}
                    className="form-input"
                    placeholder={form.webhookSecretSet && !form.webhookSecret ? '•••••••• (Stored Securely)' : 'Global HMAC secret token'}
                    value={form.webhookSecret || ''}
                    onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })}
                    style={{ paddingRight: 40 }}
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecret('webhookSecret')}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {showSecrets['webhookSecret'] ? <RiEyeOffLine size={16} /> : <RiEyeLine size={16} />}
                  </button>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                  Used to verify HMAC-SHA256 signature on inbound webhooks
                </span>
              </div>
            </div>

            {/* Webhook Routes Configurator */}
            <div style={{ padding: 18, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Configured Webhook Routes</h4>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                    Map URL paths to event types and custom agent skill profiles
                  </p>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={addWebhookRoute}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <RiAddLine size={16} />
                  Add Route
                </button>
              </div>

              {(!form.webhookRoutes || form.webhookRoutes.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                  No webhook routes defined. Click <strong>Add Route</strong> to configure GitHub / GitLab endpoints.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {form.webhookRoutes.map((route, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 14,
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr)) 40px',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <label className="form-label" style={{ fontSize: 11 }}>Route Name (URL Path)</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="github-events"
                          value={route.name}
                          onChange={(e) => updateWebhookRoute(idx, 'name', e.target.value)}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                      </div>

                      <div>
                        <label className="form-label" style={{ fontSize: 11 }}>Events (Comma-separated)</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="push, pull_request"
                          value={(route.events || []).join(', ')}
                          onChange={(e) => updateWebhookRoute(idx, 'events', e.target.value)}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                      </div>

                      <div>
                        <label className="form-label" style={{ fontSize: 11 }}>Per-Route Secret (Optional)</label>
                        <input
                          type="password"
                          className="form-input"
                          placeholder="Override secret"
                          value={route.secret || ''}
                          onChange={(e) => updateWebhookRoute(idx, 'secret', e.target.value)}
                          autoComplete="new-password"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                      </div>

                      <div>
                        <label className="form-label" style={{ fontSize: 11 }}>Agent Profile (Optional)</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="devops"
                          value={route.profile || ''}
                          onChange={(e) => updateWebhookRoute(idx, 'profile', e.target.value)}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => removeWebhookRoute(idx)}
                          style={{ padding: 6 }}
                        >
                          <RiDeleteBin6Line size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── 3. Live Diagnostic & Connection Testing Console ────────────── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RiRefreshLine size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Live Gateway Diagnostic Console</h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Execute real-time API queries against active credentials to verify connectivity and network latency
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {activeGateway === 'telegram' && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleTestTelegram}
              disabled={testingTelegram || (!form.telegramBotToken && !form.telegramBotTokenSet)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {testingTelegram ? <RiRefreshLine className="spin" size={16} /> : <RiTelegramLine size={16} />}
              {testingTelegram ? 'Testing Telegram API...' : 'Test Telegram Bot Token'}
            </button>
          )}

          {activeGateway === 'whatsapp' && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleTestWhatsApp}
              disabled={testingWhatsApp || (!form.whatsappAccessToken && !form.whatsappAccessTokenSet)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {testingWhatsApp ? <RiRefreshLine className="spin" size={16} /> : <RiWhatsappLine size={16} />}
              {testingWhatsApp ? 'Testing Meta Graph API...' : 'Test WhatsApp Cloud Credentials'}
            </button>
          )}

          {activeGateway === 'email' && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleTestEmail}
              disabled={testingEmail || !form.emailImapHost}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {testingEmail ? <RiRefreshLine className="spin" size={16} /> : <RiMailLine size={16} />}
              {testingEmail ? 'Probing IMAP Socket...' : 'Test IMAP Connection'}
            </button>
          )}

          {activeGateway === 'webhooks' && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <RiInformationLine size={16} style={{ color: 'var(--primary)' }} />
              <span>Webhook server runs continuously inside the <code>hermes gateway</code> supervisor process on port <strong>{form.webhookPort || 8644}</strong>.</span>
            </div>
          )}
        </div>

        {/* Telegram Diagnostic Result */}
        {activeGateway === 'telegram' && telegramTestResult && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 'var(--radius-md)',
              background: telegramTestResult.ok ? 'var(--bg-elevated)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${telegramTestResult.ok ? 'var(--border)' : 'rgba(239, 68, 68, 0.3)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {telegramTestResult.ok ? (
                  <RiCheckLine size={18} style={{ color: 'var(--success, #10b981)' }} />
                ) : (
                  <RiAlertLine size={18} style={{ color: '#ef4444' }} />
                )}
                <strong style={{ fontSize: 13, color: telegramTestResult.ok ? 'var(--text-primary)' : '#ef4444' }}>
                  {telegramTestResult.message}
                </strong>
              </div>
              {telegramTestResult.latencyMs !== undefined && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Latency: <strong>{telegramTestResult.latencyMs}ms</strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* WhatsApp Diagnostic Result */}
        {activeGateway === 'whatsapp' && whatsappTestResult && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 'var(--radius-md)',
              background: whatsappTestResult.ok ? 'var(--bg-elevated)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${whatsappTestResult.ok ? 'var(--border)' : 'rgba(239, 68, 68, 0.3)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {whatsappTestResult.ok ? (
                  <RiCheckLine size={18} style={{ color: 'var(--success, #10b981)' }} />
                ) : (
                  <RiAlertLine size={18} style={{ color: '#ef4444' }} />
                )}
                <strong style={{ fontSize: 13, color: whatsappTestResult.ok ? 'var(--text-primary)' : '#ef4444' }}>
                  {whatsappTestResult.message}
                </strong>
              </div>
              {whatsappTestResult.latencyMs !== undefined && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Latency: <strong>{whatsappTestResult.latencyMs}ms</strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Email Diagnostic Result */}
        {activeGateway === 'email' && emailTestResult && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 'var(--radius-md)',
              background: emailTestResult.ok ? 'var(--bg-elevated)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${emailTestResult.ok ? 'var(--border)' : 'rgba(239, 68, 68, 0.3)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {emailTestResult.ok ? (
                  <RiCheckLine size={18} style={{ color: 'var(--success, #10b981)' }} />
                ) : (
                  <RiAlertLine size={18} style={{ color: '#ef4444' }} />
                )}
                <strong style={{ fontSize: 13, color: emailTestResult.ok ? 'var(--text-primary)' : '#ef4444' }}>
                  {emailTestResult.message}
                </strong>
              </div>
              {emailTestResult.latencyMs !== undefined && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Latency: <strong>{emailTestResult.latencyMs}ms</strong>
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── Save Configuration Action Bar ─────────────────────────────── */}
      <div
        className="glass-card"
        style={{
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          position: 'sticky',
          bottom: 20,
          zIndex: 10,
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Changes are atomically synced to PostgreSQL database, <code>~/.hermes/config.yaml</code>, and runtime environment.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchSettings}
            disabled={saving || loading}
          >
            Reset
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {saving ? <RiRefreshLine className="spin" size={16} /> : <RiCheckLine size={16} />}
            {saving ? 'Saving...' : 'Save Gateway Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
};
