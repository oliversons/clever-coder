import React, { useEffect, useState } from 'react';
import {
  RiSearchEyeLine,
  RiGlobalLine,
  RiFireLine,
  RiShieldCheckLine,
  RiFlashlightLine,
  RiSparklingLine,
  RiRobot2Line,
  RiCheckLine,
  RiAlertLine,
  RiExternalLinkLine,
  RiRefreshLine,
  RiTimeLine,
  RiInformationLine,
  RiStackLine,
  RiCpuLine,
  RiDatabase2Line,
  RiLockLine,
  RiKeyLine,
  RiTerminalBoxLine
} from 'react-icons/ri';
import { api, type HermesWebSearchSettings, type HermesWebSearchResultItem } from '../../api/client';

interface ProviderMeta {
  id: string;
  name: string;
  category: 'unified' | 'search_only';
  supportsSearch: boolean;
  supportsExtract: boolean;
  badge: string;
  badgeType: 'free' | 'freemium' | 'paid' | 'selfhosted';
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  freeTier: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo (DDGS)',
    category: 'search_only',
    supportsSearch: true,
    supportsExtract: false,
    badge: '100% Free & Zero-Key',
    badgeType: 'free',
    description: 'Built-in privacy search engine requiring zero credentials or API keys. Fast, reliable query indexing.',
    icon: RiGlobalLine,
    freeTier: 'Unlimited free queries',
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    category: 'unified',
    supportsSearch: true,
    supportsExtract: true,
    badge: 'Recommended (Default)',
    badgeType: 'freemium',
    description: 'Full-featured web search & deep clean markdown extraction. Supports cloud API & self-hosted instances.',
    icon: RiFireLine,
    freeTier: '500 free credits/mo or Self-Hosted',
  },
  {
    id: 'searxng',
    name: 'SearXNG',
    category: 'search_only',
    supportsSearch: true,
    supportsExtract: false,
    badge: 'Self-Hosted Metasearch',
    badgeType: 'selfhosted',
    description: 'Open-source privacy metasearch engine aggregating 70+ search engines with zero tracking or rate limits.',
    icon: RiShieldCheckLine,
    freeTier: 'Free (Self-hosted Docker instance)',
  },
  {
    id: 'brave',
    name: 'Brave Search',
    category: 'search_only',
    supportsSearch: true,
    supportsExtract: false,
    badge: 'Independent Index',
    badgeType: 'freemium',
    description: 'Independent, high-quality search index without Google or Bing tracking. Fast response latency.',
    icon: RiFlashlightLine,
    freeTier: '2,000 free queries/mo',
  },
  {
    id: 'tavily',
    name: 'Tavily AI',
    category: 'unified',
    supportsSearch: true,
    supportsExtract: true,
    badge: 'AI Search & Extract',
    badgeType: 'freemium',
    description: 'Search engine optimized specifically for LLMs and AI agents with real-time synthesis & extraction.',
    icon: RiSparklingLine,
    freeTier: '1,000 free searches/mo',
  },
  {
    id: 'exa',
    name: 'Exa Neural Search',
    category: 'unified',
    supportsSearch: true,
    supportsExtract: true,
    badge: 'Semantic Neural',
    badgeType: 'freemium',
    description: 'Neural embeddings search designed for deep research, conceptual similarity, and clean page extraction.',
    icon: RiCpuLine,
    freeTier: '1,000 free searches/mo',
  },
  {
    id: 'parallel',
    name: 'Parallel AI',
    category: 'unified',
    supportsSearch: true,
    supportsExtract: true,
    badge: 'Enterprise Research',
    badgeType: 'paid',
    description: 'AI-native enterprise search & extraction backend built for high-throughput automated agent research.',
    icon: RiDatabase2Line,
    freeTier: 'Commercial API plan',
  },
  {
    id: 'xai',
    name: 'xAI Grok Search',
    category: 'search_only',
    supportsSearch: true,
    supportsExtract: false,
    badge: 'Grok Responses API',
    badgeType: 'paid',
    description: 'Routes search through Grok web_search reasoning tool on the Responses API. Returns LLM-curated ranked results.',
    icon: RiRobot2Line,
    freeTier: 'xAI API Key or SuperGrok OAuth',
  },
];

const EXTRACT_PROVIDERS = [
  { id: 'firecrawl', name: 'Firecrawl (Cloud & Self-Hosted)', icon: RiFireLine, desc: 'Clean readability markdown with structured tables and link preservation' },
  { id: 'tavily', name: 'Tavily AI Extractor', icon: RiSparklingLine, desc: 'AI-filtered concise content extraction optimized for context windows' },
  { id: 'exa', name: 'Exa Neural Extractor', icon: RiCpuLine, desc: 'Semantic neural page content and document representation' },
  { id: 'parallel', name: 'Parallel Extractor', icon: RiDatabase2Line, desc: 'Enterprise multi-page and deeply nested document parsing' },
  { id: 'browser', name: 'Active Browser Automation (Chromium / Kitesurf)', icon: RiGlobalLine, desc: 'Loads live DOM via browser engine, handles dynamic JavaScript and SPAs' },
];

export const WebSearchSettings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testQuery, setTestQuery] = useState('Hermes AI Agent capabilities and tools');
  const [testResult, setTestResult] = useState<{
    success: boolean;
    backend?: string;
    latencyMs?: number;
    count?: number;
    results?: HermesWebSearchResultItem[];
    rawOutput?: string;
    error?: string;
  } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [form, setForm] = useState<HermesWebSearchSettings>({
    splitProviders: false,
    searchBackend: 'duckduckgo',
    extractBackend: 'firecrawl',
    extractCharLimit: 15000,
    firecrawlApiKey: '',
    firecrawlApiUrl: 'https://api.firecrawl.dev',
    searxngUrl: '',
    braveSearchApiKey: '',
    tavilyApiKey: '',
    exaApiKey: '',
    parallelApiKey: '',
    xaiApiKey: '',
    xaiModel: 'grok-build-0.1',
    xaiTimeout: 90,
    xaiAllowedDomains: '',
    xaiExcludedDomains: '',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await api.hermes.getWebSearchSettings();
      if (data) {
        setForm((prev) => ({
          ...prev,
          ...data,
          extractCharLimit: data.extractCharLimit || 15000,
        }));
      }
    } catch (err: any) {
      console.error('Failed to load web search settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const isSearchOnly = (provider: string) => {
    return ['duckduckgo', 'ddgs', 'searxng', 'brave', 'xai'].includes(provider);
  };

  const handleSelectSearchBackend = (id: string) => {
    const searchOnly = isSearchOnly(id);
    setForm((prev) => ({
      ...prev,
      searchBackend: id,
      // Auto-enable split capability if search-only provider is picked
      splitProviders: searchOnly ? true : prev.splitProviders,
      extractBackend: searchOnly && prev.extractBackend === id ? 'firecrawl' : prev.extractBackend,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.hermes.saveWebSearchSettings(form);
      if (res.success && res.settings) {
        setForm((prev) => ({ ...prev, ...res.settings }));
      }
      setMessage({
        type: 'success',
        text: 'Web Search & Extract settings saved and synchronized to ~/.hermes/config.yaml and .env!',
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || 'Failed to save web search settings',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSearch = async () => {
    if (!testQuery.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.hermes.testWebSearch(testQuery, form);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        backend: form.searchBackend,
        latencyMs: 0,
        error: err?.message || 'Search execution request failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const activeSearchMeta = PROVIDERS.find((p) => p.id === form.searchBackend) || PROVIDERS[0];
  const activeExtractMeta = EXTRACT_PROVIDERS.find((p) => p.id === form.extractBackend) || EXTRACT_PROVIDERS[0];

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
            <RiSearchEyeLine size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Web Search &amp; Content Extraction</h2>
              <span className="badge badge-primary">Official Engine</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Configure query indexing engines (<code>web_search</code>) and URL markdown parsers (<code>web_extract</code>)
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
            <span style={{ color: 'var(--text-secondary)' }}>Search:</span>
            <strong style={{ color: 'var(--text-accent)' }}>{activeSearchMeta.name}</strong>
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
            <span style={{ color: 'var(--text-secondary)' }}>Extract:</span>
            <strong style={{ color: 'var(--text-accent)' }}>
              {form.splitProviders ? activeExtractMeta.name : `${activeSearchMeta.name} (Unified)`}
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
            <span style={{ color: 'var(--text-secondary)' }}>Budget:</span>
            <strong>{(form.extractCharLimit || 15000).toLocaleString()} chars</strong>
          </div>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {message.type === 'success' ? <RiCheckLine size={18} /> : <RiAlertLine size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* ── Architecture Capability Split Mode ─────────────────────────── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <RiStackLine size={20} style={{ color: 'var(--primary)' }} />
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Capability Architecture Mode</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Choose between a single unified backend or per-capability independent routing
              </p>
            </div>
          </div>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              userSelect: 'none',
              padding: '8px 16px',
              background: form.splitProviders ? 'var(--primary-dim, rgba(124, 58, 237, 0.12))' : 'var(--bg-elevated)',
              border: `1px solid ${form.splitProviders ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-full)',
              transition: 'all 0.2s ease',
            }}
          >
            <input
              type="checkbox"
              checked={form.splitProviders}
              onChange={(e) => setForm({ ...form, splitProviders: e.target.checked })}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: form.splitProviders ? 'var(--primary)' : 'var(--text-primary)' }}>
              Enable Split Search &amp; Extraction Backends
            </span>
          </label>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
          <strong>Per-capability split</strong> allows pairing a 100% free search engine (such as DuckDuckGo or SearXNG) for searching queries, with a specialized extraction provider (Firecrawl, Tavily, Exa, or Cloudflare Browser Automation) for downloading deep page markdown.
        </p>

        {isSearchOnly(form.searchBackend) && (
          <div
            style={{
              marginTop: 14,
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#f59e0b',
              fontSize: 13,
            }}
          >
            <RiInformationLine size={20} style={{ flexShrink: 0 }} />
            <div>
              <strong>{activeSearchMeta.name}</strong> is a <em>Search-Only</em> backend. Capability splitting is active to ensure <code>web_extract</code> has a dedicated URL content parser.
            </div>
          </div>
        )}
      </section>

      {/* ── 1. Search Engine Providers Grid (`web_search`) ────────────── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RiSearchEyeLine size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Primary Search Provider (<code>web_search</code>)</h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Select the query indexing engine used by the agent to find and rank relevant web results
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {PROVIDERS.map((provider) => {
            const isSelected = form.searchBackend === provider.id;
            const Icon = provider.icon;

            return (
              <div
                key={provider.id}
                onClick={() => handleSelectSearchBackend(provider.id)}
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
                          color: provider.badgeType === 'free' ? 'var(--success, #10b981)' : provider.badgeType === 'freemium' ? 'var(--primary)' : 'var(--text-secondary)',
                        }}
                      >
                        {provider.badge}
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
                  <span>Quota: {provider.freeTier}</span>
                  <span style={{ fontWeight: 600, color: provider.supportsExtract ? 'var(--success, #10b981)' : 'var(--amber, #f59e0b)' }}>
                    {provider.supportsExtract ? 'Search & Extract' : 'Search Only'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 2. Dedicated Extraction Provider (`web_extract`) ──────────── */}
      {(form.splitProviders || isSearchOnly(form.searchBackend)) && (
        <section className="glass-card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RiGlobalLine size={18} style={{ color: 'var(--primary)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Dedicated Content Extraction Backend (<code>web_extract</code>)</h3>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Specifies the engine used when downloading and parsing full web pages into readable Markdown
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {EXTRACT_PROVIDERS.map((ext) => {
              const isSelected = form.extractBackend === ext.id;
              const Icon = ext.icon;

              return (
                <div
                  key={ext.id}
                  onClick={() => setForm({ ...form, extractBackend: ext.id })}
                  style={{
                    padding: 14,
                    borderRadius: 'var(--radius-md)',
                    background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-card)',
                    border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--radius-sm)',
                      background: isSelected ? 'var(--primary)' : 'var(--bg-elevated)',
                      color: isSelected ? '#fff' : 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={16} />
                  </div>
                  <div style={{ flexGrow: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{ext.name}</h4>
                      {isSelected && <RiCheckLine size={14} style={{ color: 'var(--primary)' }} />}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '4px 0 0 0', lineHeight: 1.3 }}>
                      {ext.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 3. Provider Credentials & Endpoint Details Studio ──────────── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RiKeyLine size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Credentials &amp; Endpoint Parameters</h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Configure authentication keys, self-hosted API endpoints, and reasoning model parameters
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* DuckDuckGo Info */}
          {form.searchBackend === 'duckduckgo' && (
            <div
              style={{
                padding: 16,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <RiCheckLine size={24} style={{ color: 'var(--success, #10b981)', flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: 14 }}>Zero Configuration Required</strong>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  DuckDuckGo is fully pre-installed and ready out of the box. No API keys, credits, or subscriptions needed.
                </p>
              </div>
            </div>
          )}

          {/* Firecrawl Credentials */}
          {(form.searchBackend === 'firecrawl' || form.extractBackend === 'firecrawl') && (
            <div style={{ padding: 18, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <RiFireLine size={18} style={{ color: '#ef4444' }} />
                <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Firecrawl API &amp; Self-Hosted Parameters</h4>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                <div>
                  <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
                    Firecrawl API Key (<code>FIRECRAWL_API_KEY</code>)
                  </label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="fc-..."
                    value={form.firecrawlApiKey || ''}
                    onChange={(e) => setForm({ ...form, firecrawlApiKey: e.target.value })}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Get free key at firecrawl.dev (500 credits/mo)</span>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
                    Custom API URL (Optional, for Self-Hosted)
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="https://api.firecrawl.dev or http://localhost:3002"
                    value={form.firecrawlApiUrl || ''}
                    onChange={(e) => setForm({ ...form, firecrawlApiUrl: e.target.value })}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Leave default for Firecrawl Cloud API</span>
                </div>
              </div>
            </div>
          )}

          {/* SearXNG Endpoint */}
          {form.searchBackend === 'searxng' && (
            <div style={{ padding: 18, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <RiShieldCheckLine size={18} style={{ color: 'var(--primary)' }} />
                <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>SearXNG Instance URL</h4>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
                  SearXNG URL (<code>SEARXNG_URL</code>)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="http://localhost:8888 or https://searx.yourdomain.com"
                  value={form.searxngUrl || ''}
                  onChange={(e) => setForm({ ...form, searxngUrl: e.target.value })}
                />
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '6px 0 0 0' }}>
                  Important: Ensure JSON format output is enabled in SearXNG&apos;s <code>settings.yml</code> under <code>search.formats: [html, json]</code>.
                </p>
              </div>
            </div>
          )}

          {/* Brave Search */}
          {form.searchBackend === 'brave' && (
            <div style={{ padding: 18, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <RiFlashlightLine size={18} style={{ color: '#f59e0b' }} />
                <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Brave Search Credentials</h4>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
                  Brave Search API Key (<code>BRAVE_SEARCH_API_KEY</code>)
                </label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="BSA..."
                  value={form.braveSearchApiKey || ''}
                  onChange={(e) => setForm({ ...form, braveSearchApiKey: e.target.value })}
                />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Includes 2,000 free queries/month from Brave API console</span>
              </div>
            </div>
          )}

          {/* Tavily */}
          {(form.searchBackend === 'tavily' || form.extractBackend === 'tavily') && (
            <div style={{ padding: 18, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <RiSparklingLine size={18} style={{ color: '#8b5cf6' }} />
                <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Tavily AI Credentials</h4>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
                  Tavily API Key (<code>TAVILY_API_KEY</code>)
                </label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="tvly-..."
                  value={form.tavilyApiKey || ''}
                  onChange={(e) => setForm({ ...form, tavilyApiKey: e.target.value })}
                />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Includes 1,000 free searches/month at app.tavily.com</span>
              </div>
            </div>
          )}

          {/* Exa */}
          {(form.searchBackend === 'exa' || form.extractBackend === 'exa') && (
            <div style={{ padding: 18, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <RiCpuLine size={18} style={{ color: '#06b6d4' }} />
                <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Exa Neural Search Credentials</h4>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
                  Exa API Key (<code>EXA_API_KEY</code>)
                </label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="exa-..."
                  value={form.exaApiKey || ''}
                  onChange={(e) => setForm({ ...form, exaApiKey: e.target.value })}
                />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Includes 1,000 free neural searches/month at exa.ai</span>
              </div>
            </div>
          )}

          {/* Parallel */}
          {(form.searchBackend === 'parallel' || form.extractBackend === 'parallel') && (
            <div style={{ padding: 18, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <RiDatabase2Line size={18} style={{ color: '#3b82f6' }} />
                <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Parallel AI Credentials</h4>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
                  Parallel API Key (<code>PARALLEL_API_KEY</code>)
                </label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="parallel-..."
                  value={form.parallelApiKey || ''}
                  onChange={(e) => setForm({ ...form, parallelApiKey: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* xAI Grok */}
          {form.searchBackend === 'xai' && (
            <div style={{ padding: 18, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <RiRobot2Line size={18} style={{ color: '#10b981' }} />
                <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>xAI Grok Responses API Search Parameters</h4>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                <div>
                  <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
                    xAI API Key (<code>XAI_API_KEY</code>)
                  </label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="xai-..."
                    value={form.xaiApiKey || ''}
                    onChange={(e) => setForm({ ...form, xaiApiKey: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
                    Reasoning Model (Default: grok-build-0.1)
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="grok-build-0.1"
                    value={form.xaiModel || 'grok-build-0.1'}
                    onChange={(e) => setForm({ ...form, xaiModel: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
                    Search Timeout (Seconds)
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="90"
                    value={form.xaiTimeout || 90}
                    onChange={(e) => setForm({ ...form, xaiTimeout: Number(e.target.value) })}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
                    Allowed Domains Filter (Comma-separated, max 5)
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="arxiv.org, github.com"
                    value={form.xaiAllowedDomains || ''}
                    onChange={(e) => setForm({ ...form, xaiAllowedDomains: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── 4. Character Budget Limit (web.extract_char_limit) ─────────── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RiTerminalBoxLine size={18} style={{ color: 'var(--primary)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                Page Content Truncation Budget (<code>web.extract_char_limit</code>)
              </h3>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>
              {(form.extractCharLimit || 15000).toLocaleString()} characters (~{Math.round((form.extractCharLimit || 15000) / 4).toLocaleString()} tokens)
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Deterministic character budget for <code>web_extract</code>. Pages exceeding this budget append a clean <code>[TRUNCATED]</code> paging footer with disk path for the agent to inspect via <code>read_file</code>.
          </p>
        </div>

        <input
          type="range"
          min={2000}
          max={100000}
          step={1000}
          value={form.extractCharLimit || 15000}
          onChange={(e) => setForm({ ...form, extractCharLimit: Number(e.target.value) })}
          style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
          <span>2,000 chars (Strict)</span>
          <span>15,000 chars (Default Recommended)</span>
          <span>50,000 chars</span>
          <span>100,000 chars (Deep Docs)</span>
        </div>
      </section>

      {/* ── 5. Live Search Engine Testing Console ──────────────────────── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RiRefreshLine size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Live Query &amp; Engine Diagnostic Console</h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Execute a real-time query test against the active search engine to verify index reachability and response latency
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <input
            type="text"
            className="form-input"
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            placeholder="Type query to test search engine..."
            style={{ flexGrow: 1, minWidth: 260 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTestSearch();
            }}
          />

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleTestSearch}
            disabled={testing || !testQuery.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {testing ? <RiRefreshLine className="spin" size={16} /> : <RiSearchEyeLine size={16} />}
            {testing ? 'Testing Query...' : 'Run Query Test'}
          </button>
        </div>

        {/* Preset quick test chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Quick Presets:</span>
          {[
            'Hermes AI Agent capabilities and tools',
            'Domain Driven Design Persian resources',
            'Quantum Computing latest breakthroughs',
            'TypeScript 5.8 ECMAScript features',
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setTestQuery(preset)}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Test Result Display */}
        {testResult && (
          <div
            style={{
              padding: 16,
              borderRadius: 'var(--radius-md)',
              background: testResult.success ? 'var(--bg-elevated)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${testResult.success ? 'var(--border)' : 'rgba(239, 68, 68, 0.3)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {testResult.success ? (
                  <RiCheckLine size={18} style={{ color: 'var(--success, #10b981)' }} />
                ) : (
                  <RiAlertLine size={18} style={{ color: '#ef4444' }} />
                )}
                <strong style={{ fontSize: 13, color: testResult.success ? 'var(--text-primary)' : '#ef4444' }}>
                  {testResult.success ? `Search Succeeded via ${testResult.backend?.toUpperCase()}` : 'Search Failed'}
                </strong>
              </div>

              {testResult.latencyMs !== undefined && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Latency: <strong>{testResult.latencyMs}ms</strong> | Results: <strong>{testResult.count || 0}</strong>
                </span>
              )}
            </div>

            {testResult.error && (
              <div style={{ fontSize: 12, color: '#ef4444', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {testResult.error}
              </div>
            )}

            {testResult.results && testResult.results.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {testResult.results.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: 12,
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--primary)',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {item.title} <RiExternalLinkLine size={12} />
                      </a>
                      <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                        {item.engine || testResult.backend}
                      </span>
                    </div>

                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0 0', lineHeight: 1.4 }}>
                      {item.snippet}
                    </p>

                    <div style={{ fontSize: 10, color: 'var(--text-muted, #888)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.url}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
            {saving ? 'Saving...' : 'Save Web Search Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
};
