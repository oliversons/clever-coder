import React, { useEffect, useState } from 'react';
import {
  RiImageEditLine,
  RiEyeLine,
  RiRobot2Line,
  RiFlashlightLine,
  RiSparklingLine,
  RiCpuLine,
  RiCheckLine,
  RiAlertLine,
  RiRefreshLine,
  RiKeyLine,
  RiExternalLinkLine,
  RiUploadCloud2Line,
  RiGalleryLine,
  RiTerminalBoxLine,
  RiInformationLine,
  RiShieldCheckLine,
  RiSettings4Line,
  RiDownload2Line
} from 'react-icons/ri';
import {
  api,
  type HermesVisionImageSettings,
  type SatDiscoveredModel,
  type SatModelDiscoveryResult
} from '../../api/client';

const FAL_MODELS = [
  { id: 'fal-ai/flux-2/klein/9b', name: 'FLUX 2 Klein 9B', speed: '<1s', strengths: 'Fast, crisp text, lowest cost', price: '$0.006/MP', recommended: true },
  { id: 'fal-ai/flux-2-pro', name: 'FLUX 2 Pro', speed: '~6s', strengths: 'Studio photorealism, professional', price: '$0.03/MP' },
  { id: 'fal-ai/z-image/turbo', name: 'Z-Image Turbo', speed: '~2s', strengths: 'Bilingual EN/CN, 6B params', price: '$0.005/MP' },
  { id: 'fal-ai/nano-banana-pro', name: 'Nano Banana Pro', speed: '~8s', strengths: 'Gemini 3 Pro reasoning depth, text rendering', price: '$0.15/img' },
  { id: 'fal-ai/gpt-image-1.5', name: 'GPT Image 1.5', speed: '~15s', strengths: 'High prompt adherence', price: '$0.034/img' },
  { id: 'fal-ai/gpt-image-2', name: 'GPT Image 2', speed: '~20s', strengths: 'SOTA typography & world photorealism', price: '$0.04-0.06/img' },
  { id: 'fal-ai/ideogram/v3', name: 'Ideogram v3', speed: '~5s', strengths: 'Best typography and graphic design', price: '$0.03-0.09/img' },
  { id: 'fal-ai/recraft/v4/pro/text-to-image', name: 'Recraft v4 Pro', speed: '~8s', strengths: 'Brand systems, production vector/raster', price: '$0.25/img' },
  { id: 'fal-ai/qwen-image', name: 'Qwen Image', speed: '~12s', strengths: 'LLM-based text rendering', price: '$0.02/MP' },
  { id: 'fal-ai/krea/v2/medium/text-to-image', name: 'Krea v2 Medium', speed: '~15-25s', strengths: 'Illustration, anime, painting styles', price: '$0.030/img' },
  { id: 'fal-ai/krea/v2/large/text-to-image', name: 'Krea v2 Large', speed: '~25-60s', strengths: 'Raw film textures, motion blur', price: '$0.060/img' },
];

const SAMPLE_IMAGES = [
  { name: 'Developer Workstation', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80' },
  { name: 'Modern Architecture', url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80' },
  { name: 'Analytics Chart', url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=80' },
];

export const VisionImageSettings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // SAT Models
  const [satDiscovery, setSatDiscovery] = useState<SatModelDiscoveryResult | null>(null);

  // Form State
  const [form, setForm] = useState<HermesVisionImageSettings>({
    satApiKey: '',
    satBaseUrl: 'https://api.sat.ai/v1',
    visionProvider: 'sat',
    defaultVisionModel: 'sat-vision-v1',
    visionBaseUrl: '',
    visionApiKey: '',
    imageGenProvider: 'sat',
    defaultImageGenModel: 'sat-flux-1-schnell',
    imageGenBaseUrl: '',
    imageGenApiKey: '',
    falApiKey: '',
    openaiImageApiKey: '',
    maxParallelRequests: 4,
    autoUpscale: true,
    useGateway: false,
  });

  // Vision Test Console State
  const [visionTestPrompt, setVisionTestPrompt] = useState('Describe this image in detail and list all key components.');
  const [visionTestImage, setVisionTestImage] = useState(SAMPLE_IMAGES[0].url);
  const [testingVision, setTestingVision] = useState(false);
  const [visionTestResult, setVisionTestResult] = useState<{
    success: boolean;
    model?: string;
    latencyMs?: number;
    analysis?: string;
    error?: string;
  } | null>(null);

  // Image Gen Test Console State
  const [imageGenPrompt, setImageGenPrompt] = useState('A futuristic high-tech AI programming workstation with holographic code displays, dark cyberpunk aesthetic, neon cyan and purple lighting, 8k resolution');
  const [testingImageGen, setTestingImageGen] = useState(false);
  const [imageGenResult, setImageGenResult] = useState<{
    success: boolean;
    model?: string;
    latencyMs?: number;
    imageUrl?: string;
    prompt?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await api.hermes.getVisionImageSettings();
      if (data) {
        setForm((prev) => ({
          ...prev,
          ...data,
          satBaseUrl: data.satBaseUrl || 'https://api.sat.ai/v1',
        }));
      }
    } catch (err: any) {
      console.error('Failed to load Vision & Image Gen settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDiscoverSatModels = async () => {
    setDiscovering(true);
    setMessage(null);
    try {
      const res = await api.hermes.discoverSatModels(form.satBaseUrl, form.satApiKey);
      setSatDiscovery(res);
      if (res.success) {
        setMessage({
          type: 'success',
          text: `Successfully discovered ${res.count} models from SAT AI API (${res.visionModels.length} Vision, ${res.imageGenModels.length} Image Generation)!`,
        });

        // If vision or image models found and currently unset, suggest defaults
        if (res.visionModels.length > 0 && form.defaultVisionModel === 'sat-vision-v1') {
          setForm((prev) => ({ ...prev, defaultVisionModel: res.visionModels[0].id }));
        }
        if (res.imageGenModels.length > 0 && form.defaultImageGenModel === 'sat-flux-1-schnell') {
          setForm((prev) => ({ ...prev, defaultImageGenModel: res.imageGenModels[0].id }));
        }
      } else {
        setMessage({
          type: 'error',
          text: res.error || 'Failed to discover models from SAT AI API',
        });
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || 'Could not connect to SAT AI API endpoint',
      });
    } finally {
      setDiscovering(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.hermes.saveVisionImageSettings(form);
      if (res.success && res.settings) {
        setForm((prev) => ({ ...prev, ...res.settings }));
      }
      setMessage({
        type: 'success',
        text: 'Vision & Image Generation settings saved and synchronized to ~/.hermes/config.yaml and .env!',
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || 'Failed to save settings',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRunVisionTest = async () => {
    if (!visionTestImage.trim()) return;
    setTestingVision(true);
    setVisionTestResult(null);
    try {
      const res = await api.hermes.testVision(visionTestPrompt, visionTestImage, form);
      setVisionTestResult(res);
    } catch (err: any) {
      setVisionTestResult({
        success: false,
        model: form.defaultVisionModel,
        latencyMs: 0,
        error: err?.message || 'Vision analysis request failed',
      });
    } finally {
      setTestingVision(false);
    }
  };

  const handleRunImageGenTest = async () => {
    if (!imageGenPrompt.trim()) return;
    setTestingImageGen(true);
    setImageGenResult(null);
    try {
      const res = await api.hermes.testImageGen(imageGenPrompt, form);
      setImageGenResult(res);
    } catch (err: any) {
      setImageGenResult({
        success: false,
        model: form.defaultImageGenModel,
        latencyMs: 0,
        error: err?.message || 'Image generation request failed',
      });
    } finally {
      setTestingImageGen(false);
    }
  };

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
            <RiImageEditLine size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Vision &amp; Image Generation</h2>
              <span className="badge badge-primary">Multimodal Studio</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Configure auxiliary multimodal vision analysis (<code>auxiliary.vision</code>) and AI image generation (<code>image_generate</code>)
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
            <span style={{ color: 'var(--text-secondary)' }}>Vision Model:</span>
            <strong style={{ color: 'var(--text-accent)' }}>{form.defaultVisionModel}</strong>
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
            <span style={{ color: 'var(--text-secondary)' }}>Image Model:</span>
            <strong style={{ color: 'var(--text-accent)' }}>{form.defaultImageGenModel}</strong>
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
            <span style={{ color: 'var(--text-secondary)' }}>Parallel:</span>
            <strong>{form.maxParallelRequests || 4}x</strong>
          </div>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {message.type === 'success' ? <RiCheckLine size={18} /> : <RiAlertLine size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* ── 1. SAT AI API Endpoint Connection & Discovery ──────────────── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <RiRobot2Line size={22} style={{ color: 'var(--primary)' }} />
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>SAT AI API Endpoint &amp; Model Discovery</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Connect to SAT AI&apos;s OpenAI-compatible vision and image generation model endpoints
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDiscoverSatModels}
            disabled={discovering}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {discovering ? <RiRefreshLine className="spin" size={16} /> : <RiRefreshLine size={16} />}
            {discovering ? 'Querying SAT AI Models...' : 'Discover Models from SAT AI API'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
              SAT Base URL (<code>SAT_BASE_URL</code>)
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="https://api.sat.ai/v1"
              value={form.satBaseUrl}
              onChange={(e) => setForm({ ...form, satBaseUrl: e.target.value })}
            />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>OpenAI-compatible base API endpoint</span>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
              SAT API Key (<code>SAT_API_KEY</code>)
            </label>
            <input
              type="password"
              className="form-input"
              placeholder="sat_sk_..."
              value={form.satApiKey || ''}
              onChange={(e) => setForm({ ...form, satApiKey: e.target.value })}
            />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Bearer token for model discovery &amp; inference</span>
          </div>
        </div>

        {/* Discovery Results Overview */}
        {satDiscovery && satDiscovery.success && (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <RiCheckLine size={18} style={{ color: 'var(--success, #10b981)' }} />
                <strong style={{ fontSize: 13 }}>
                  Discovered {satDiscovery.count} Available Models on {satDiscovery.baseUrl}
                </strong>
              </div>
              <span className="badge badge-primary" style={{ fontSize: 11 }}>
                Live Connection Active
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {satDiscovery.models.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    fontSize: 11,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{m.id}</span>
                  {m.isVision && <span className="badge badge-success" style={{ fontSize: 9 }}>Vision</span>}
                  {m.isImageGen && <span className="badge badge-primary" style={{ fontSize: 9 }}>Image Gen</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── 2. Auxiliary Multimodal Vision (`auxiliary.vision`) ───────── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RiEyeLine size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Auxiliary Multimodal Vision (<code>auxiliary.vision</code>)</h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Routes clipboard image paste (<code>/paste</code>, <code>Cmd+V</code>/<code>Ctrl+V</code>) and screenshot analysis when the primary LLM is text-only or custom vision routing is enabled
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Vision Provider</label>
            <select
              className="form-input"
              value={form.visionProvider}
              onChange={(e) => setForm({ ...form, visionProvider: e.target.value })}
            >
              <option value="sat">SAT AI API (Custom OpenAI-Compatible)</option>
              <option value="openai">OpenAI (GPT-4o / GPT-4-Vision)</option>
              <option value="openrouter">OpenRouter Multi-Provider</option>
              <option value="custom">Custom Endpoint</option>
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Default Vision Model</label>
            {satDiscovery && satDiscovery.models.length > 0 ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  className="form-input"
                  value={form.defaultVisionModel}
                  onChange={(e) => setForm({ ...form, defaultVisionModel: e.target.value })}
                  style={{ flexGrow: 1 }}
                >
                  {satDiscovery.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} {m.isVision ? '👁️ (Vision)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0 10px', fontSize: 11 }}
                  onClick={() => {
                    const custom = prompt('Enter custom vision model name:', form.defaultVisionModel);
                    if (custom) setForm({ ...form, defaultVisionModel: custom });
                  }}
                >
                  Custom
                </button>
              </div>
            ) : (
              <input
                type="text"
                className="form-input"
                placeholder="sat-vision-v1 or gpt-4o"
                value={form.defaultVisionModel}
                onChange={(e) => setForm({ ...form, defaultVisionModel: e.target.value })}
              />
            )}
          </div>
        </div>

        {form.visionProvider === 'custom' && (
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <div>
              <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Custom Vision Base URL</label>
              <input
                type="text"
                className="form-input"
                placeholder="https://your-custom-llm.com/v1"
                value={form.visionBaseUrl || ''}
                onChange={(e) => setForm({ ...form, visionBaseUrl: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Custom Vision API Key</label>
              <input
                type="password"
                className="form-input"
                placeholder="Bearer token"
                value={form.visionApiKey || ''}
                onChange={(e) => setForm({ ...form, visionApiKey: e.target.value })}
              />
            </div>
          </div>
        )}
      </section>

      {/* ── 3. Image Generation Studio (`image_generate`) ─────────────── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RiImageEditLine size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Image Generation Backend (<code>image_generate</code>)</h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Powers text-to-image synthesis and image-to-image editing tool calls during conversation loops
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Image Generation Provider</label>
            <select
              className="form-input"
              value={form.imageGenProvider}
              onChange={(e) => setForm({ ...form, imageGenProvider: e.target.value })}
            >
              <option value="sat">SAT AI API (Custom /v1/images/generations)</option>
              <option value="fal">FAL.ai (FLUX 2, Ideogram, Recraft, Krea)</option>
              <option value="openai">OpenAI (DALL-E 3 / GPT-Image)</option>
              <option value="nous_subscription">Nous Subscription Gateway</option>
              <option value="custom">Custom Endpoint</option>
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Default Image Model</label>
            {form.imageGenProvider === 'sat' && satDiscovery && satDiscovery.models.length > 0 ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  className="form-input"
                  value={form.defaultImageGenModel}
                  onChange={(e) => setForm({ ...form, defaultImageGenModel: e.target.value })}
                  style={{ flexGrow: 1 }}
                >
                  {satDiscovery.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} {m.isImageGen ? '🎨 (Image Gen)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0 10px', fontSize: 11 }}
                  onClick={() => {
                    const custom = prompt('Enter custom image model name:', form.defaultImageGenModel);
                    if (custom) setForm({ ...form, defaultImageGenModel: custom });
                  }}
                >
                  Custom
                </button>
              </div>
            ) : form.imageGenProvider === 'fal' ? (
              <select
                className="form-input"
                value={form.defaultImageGenModel}
                onChange={(e) => setForm({ ...form, defaultImageGenModel: e.target.value })}
              >
                {FAL_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.speed} — {m.price})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="form-input"
                placeholder="sat-flux-1-schnell or dall-e-3"
                value={form.defaultImageGenModel}
                onChange={(e) => setForm({ ...form, defaultImageGenModel: e.target.value })}
              />
            )}
          </div>
        </div>

        {/* FAL.ai Specific API Key */}
        {form.imageGenProvider === 'fal' && (
          <div style={{ padding: 16, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', marginBottom: 16 }}>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
              FAL.ai API Key (<code>FAL_KEY</code>)
            </label>
            <input
              type="password"
              className="form-input"
              placeholder="fal_key_..."
              value={form.falApiKey || ''}
              onChange={(e) => setForm({ ...form, falApiKey: e.target.value })}
            />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Direct access key for FAL.ai cloud inference (or leave blank if using Nous Subscription Gateway)
            </span>
          </div>
        )}

        {/* Concurrency & Auto-Upscale */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="form-label" style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>
                Max Concurrent Parallel Requests
              </label>
              <strong style={{ color: 'var(--primary)' }}>{form.maxParallelRequests} concurrent</strong>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={form.maxParallelRequests || 4}
              onChange={(e) => setForm({ ...form, maxParallelRequests: Number(e.target.value) })}
              style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Limits parallel batch image generations to preserve GPU bandwidth
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Auto-Upscaling Enhancement</span>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Runs resolution upscaling pass on sub-2MP generated images
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.autoUpscale}
                onChange={(e) => setForm({ ...form, autoUpscale: e.target.checked })}
              />
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Use Nous Portal Gateway</span>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Proxy image generation requests through managed Nous Subscription
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.useGateway}
                onChange={(e) => setForm({ ...form, useGateway: e.target.checked })}
              />
            </label>
          </div>
        </div>
      </section>

      {/* ── 4. Interactive Vision Diagnostic Test Console ─────────────── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RiEyeLine size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Live Vision Analysis Diagnostic Console</h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Test image reasoning and description against the configured model (<code>{form.defaultVisionModel}</code>)
          </p>
        </div>

        {/* Sample Images Picker */}
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Choose sample image:</span>
          <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            {SAMPLE_IMAGES.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setVisionTestImage(img.url)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: visionTestImage === img.url ? 'var(--primary)' : 'var(--bg-elevated)',
                  color: visionTestImage === img.url ? '#fff' : 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {img.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 14 }}>
          <div>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Image URL or Base64</label>
            <input
              type="text"
              className="form-input"
              placeholder="https://example.com/photo.jpg"
              value={visionTestImage}
              onChange={(e) => setVisionTestImage(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Visual Prompt</label>
            <input
              type="text"
              className="form-input"
              placeholder="Describe this image in detail..."
              value={visionTestPrompt}
              onChange={(e) => setVisionTestPrompt(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {visionTestImage && (
              <img
                src={visionTestImage}
                alt="Vision preview"
                style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
              />
            )}
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Ready for inference</span>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleRunVisionTest}
            disabled={testingVision || !visionTestImage.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {testingVision ? <RiRefreshLine className="spin" size={16} /> : <RiEyeLine size={16} />}
            {testingVision ? 'Analyzing Image...' : 'Run Vision Test'}
          </button>
        </div>

        {visionTestResult && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 'var(--radius-md)',
              background: visionTestResult.success ? 'var(--bg-elevated)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${visionTestResult.success ? 'var(--border)' : 'rgba(239, 68, 68, 0.3)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {visionTestResult.success ? (
                  <RiCheckLine size={18} style={{ color: 'var(--success, #10b981)' }} />
                ) : (
                  <RiAlertLine size={18} style={{ color: '#ef4444' }} />
                )}
                <strong style={{ fontSize: 13 }}>
                  {visionTestResult.success ? `Vision Analysis Completed (${visionTestResult.model})` : 'Vision Request Failed'}
                </strong>
              </div>
              {visionTestResult.latencyMs !== undefined && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Latency: <strong>{visionTestResult.latencyMs}ms</strong>
                </span>
              )}
            </div>

            {visionTestResult.error ? (
              <div style={{ fontSize: 12, color: '#ef4444', fontFamily: 'monospace' }}>{visionTestResult.error}</div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
                {visionTestResult.analysis}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── 5. Interactive Image Generation Studio Console ────────────── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RiSparklingLine size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Live Image Generation Studio</h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Generate a test image using model <code>{form.defaultImageGenModel}</code> on <code>{form.imageGenProvider.toUpperCase()}</code>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <input
            type="text"
            className="form-input"
            value={imageGenPrompt}
            onChange={(e) => setImageGenPrompt(e.target.value)}
            placeholder="Type prompt to generate image..."
            style={{ flexGrow: 1, minWidth: 280 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRunImageGenTest();
            }}
          />

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleRunImageGenTest}
            disabled={testingImageGen || !imageGenPrompt.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {testingImageGen ? <RiRefreshLine className="spin" size={16} /> : <RiImageEditLine size={16} />}
            {testingImageGen ? 'Generating Image...' : 'Generate Test Image'}
          </button>
        </div>

        {/* Quick Style Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Style Presets:</span>
          {[
            'Cyberpunk glowing developer workstation with holographic displays',
            'Serene Japanese mountain landscape with cherry blossoms at sunrise',
            'Minimalist modern vector logo of a wise geometric owl',
            'Studio portrait of a futuristic robotic assistant with soft lighting',
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setImageGenPrompt(preset)}
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
              {preset.slice(0, 36)}...
            </button>
          ))}
        </div>

        {/* Image Generation Result */}
        {imageGenResult && (
          <div
            style={{
              padding: 16,
              borderRadius: 'var(--radius-md)',
              background: imageGenResult.success ? 'var(--bg-elevated)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${imageGenResult.success ? 'var(--border)' : 'rgba(239, 68, 68, 0.3)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {imageGenResult.success ? (
                  <RiCheckLine size={18} style={{ color: 'var(--success, #10b981)' }} />
                ) : (
                  <RiAlertLine size={18} style={{ color: '#ef4444' }} />
                )}
                <strong style={{ fontSize: 13 }}>
                  {imageGenResult.success ? `Image Generated Successfully (${imageGenResult.model})` : 'Image Generation Failed'}
                </strong>
              </div>
              {imageGenResult.latencyMs !== undefined && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Latency: <strong>{imageGenResult.latencyMs}ms</strong>
                </span>
              )}
            </div>

            {imageGenResult.error ? (
              <div style={{ fontSize: 12, color: '#ef4444', fontFamily: 'monospace' }}>{imageGenResult.error}</div>
            ) : imageGenResult.imageUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                <img
                  src={imageGenResult.imageUrl}
                  alt={imageGenResult.prompt}
                  style={{
                    maxWidth: '100%',
                    maxHeight: 480,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
                  }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <a
                    href={imageGenResult.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary"
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <RiExternalLinkLine size={14} /> Open Full Size
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* ── Save Action Toolbar ───────────────────────────────────────── */}
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
          Settings are atomically written to <code>~/.hermes/config.yaml</code> under <code>auxiliary.vision</code> and <code>image_gen</code>.
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
            {saving ? 'Saving...' : 'Save Vision & Image Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
};
