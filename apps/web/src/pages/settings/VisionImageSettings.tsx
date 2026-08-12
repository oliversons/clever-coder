import React, { useEffect, useState, useMemo } from 'react';
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
  RiDownload2Line,
  RiEdit2Line,
  RiSearchLine,
  RiDatabase2Line
} from 'react-icons/ri';
import {
  api,
  type HermesVisionImageSettings,
  type SatDiscoveredModel,
  type SatModelDiscoveryResult
} from '../../api/client';
import { VisionImageSelect, type VisionImageSelectOption } from '../../components/hermes/VisionImageSelect';
import { VisionImageModelTable } from '../../components/hermes/VisionImageModelTable';

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

const DEFAULT_POPULAR_MODELS: VisionImageSelectOption[] = [
  { id: 'gemini/gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite (Fastest ~1.7s)', isVision: true, isImageGen: false },
  { id: 'gemini/gemini-flash-lite-latest', name: 'Gemini Flash Lite Latest (~2.3s)', isVision: true, isImageGen: false },
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite Preview (~2.7s)', isVision: true, isImageGen: false },
  { id: '@cf/meta/llama-3.2-11b-vision-instruct', name: 'Llama 3.2 11B Vision Instruct', isVision: true, isImageGen: false },
  { id: '@cf/zai-org/glm-4.2', name: 'GLM 4.2 Multimodal Vision', isVision: true, isImageGen: false },
  { id: 'gpt-4o', name: 'OpenAI GPT-4o Omnimodal', isVision: true, isImageGen: false, contextLength: 128000 },
  { id: 'gpt-4o-mini', name: 'OpenAI GPT-4o Mini', isVision: true, isImageGen: false, contextLength: 128000 },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet Vision', isVision: true, isImageGen: false, contextLength: 200000 },
  { id: 'qwen/qwen-2.5-vl-72b-instruct', name: 'Qwen 2.5 VL 72B Instruct', isVision: true, isImageGen: false, contextLength: 32000 },
  { id: 'sat-flux-1-schnell', name: 'SAT FLUX.1 Schnell Turbo', isVision: false, isImageGen: true },
  { id: 'dall-e-3', name: 'OpenAI DALL-E 3', isVision: false, isImageGen: true },
  { id: 'fal-ai/flux-2-pro', name: 'FLUX 2 Pro Studio Photorealism', isVision: false, isImageGen: true },
  { id: 'fal-ai/flux-2/klein/9b', name: 'FLUX 2 Klein 9B', isVision: false, isImageGen: true },
];

const SAMPLE_IMAGES = [
  { name: 'Developer Workstation', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80' },
  { name: 'Modern Architecture', url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80' },
  { name: 'Analytics Chart', url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=80' },
];

const ENDPOINT_PRESETS = [
  { name: 'Clever Cloud Custom API', url: 'https://app-fcbf4053-74e6-4498-ac0e-eb160010a3c5.cleverapps.io/v1' },
  { name: 'SAT AI API (/v1)', url: 'https://api.sat.ai/v1' },
  { name: 'OpenRouter (/v1)', url: 'https://openrouter.ai/api/v1' },
  { name: 'Local Ollama / vLLM', url: 'http://127.0.0.1:11434/v1' },
  { name: 'OpenAI Official (/v1)', url: 'https://api.openai.com/v1' },
];

export const VisionImageSettings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Model Discovery Results
  const [discoveredCatalog, setDiscoveredCatalog] = useState<SatModelDiscoveryResult | null>(null);

  // Form State
  const [form, setForm] = useState<HermesVisionImageSettings>({
    satApiKey: '',
    satBaseUrl: 'https://app-fcbf4053-74e6-4498-ac0e-eb160010a3c5.cleverapps.io/v1',
    visionProvider: 'custom',
    defaultVisionModel: '@cf/zai-org/glm-4.2',
    visionBaseUrl: '',
    visionApiKey: '',
    imageGenProvider: 'custom',
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
  const [visionTestPrompt, setVisionTestPrompt] = useState('Describe this image in detail and list all key visual elements.');
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
          satBaseUrl: data.satBaseUrl || 'https://app-fcbf4053-74e6-4498-ac0e-eb160010a3c5.cleverapps.io/v1',
        }));
      }
    } catch (err: any) {
      console.error('Failed to load Vision & Image Gen settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDiscoverModels = async () => {
    setDiscovering(true);
    setMessage(null);
    try {
      const targetBaseUrl = form.satBaseUrl || 'https://api.sat.ai/v1';
      const res = await api.hermes.discoverSatModels(targetBaseUrl, form.satApiKey);
      setDiscoveredCatalog(res);
      if (res.success) {
        setMessage({
          type: 'success',
          text: `Successfully discovered ${res.count} models from endpoint (${res.visionModels.length} Vision models, ${res.imageGenModels.length} Image Generation models)!`,
        });

        // If vision or image models found, suggest defaults if currently generic
        if (res.visionModels.length > 0 && (!form.defaultVisionModel || form.defaultVisionModel === 'sat-vision-v1')) {
          setForm((prev) => ({ ...prev, defaultVisionModel: res.visionModels[0].id }));
        }
        if (res.imageGenModels.length > 0 && (!form.defaultImageGenModel || form.defaultImageGenModel === 'sat-flux-1-schnell')) {
          setForm((prev) => ({ ...prev, defaultImageGenModel: res.imageGenModels[0].id }));
        }
      } else {
        setMessage({
          type: 'error',
          text: res.error || 'Failed to discover models from API endpoint',
        });
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || 'Could not connect to API endpoint',
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
  // Comprehensive options lists for Vision & Image Gen comboboxes
  const allSelectableModels = useMemo<VisionImageSelectOption[]>(() => {
    if (discoveredCatalog && discoveredCatalog.models.length > 0) {
      return discoveredCatalog.models;
    }
    // Fallback: merge FAL models & popular defaults
    const falAsOptions: VisionImageSelectOption[] = FAL_MODELS.map((f) => ({
      id: f.id,
      name: f.name,
      description: `${f.strengths} (${f.speed} • ${f.price})`,
      isVision: false,
      isImageGen: true,
    }));
    return [...DEFAULT_POPULAR_MODELS, ...falAsOptions];
  }, [discoveredCatalog]);

  const imageGenOptions = useMemo<VisionImageSelectOption[]>(() => {
    if (form.imageGenProvider === 'fal') {
      return FAL_MODELS.map((f) => ({
        id: f.id,
        name: f.name,
        description: `${f.strengths} (${f.speed} • ${f.price})`,
        isVision: false,
        isImageGen: true,
      }));
    }
    return allSelectableModels;
  }, [form.imageGenProvider, allSelectableModels]);

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
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Vision &amp; Image Generation Studio</h2>
              <span className="badge badge-primary">Multimodal Suite</span>
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
            <span style={{ color: 'var(--text-secondary)' }}>Vision:</span>
            <strong style={{ color: 'var(--text-accent)' }}>{form.defaultVisionModel || 'sat-vision-v1'}</strong>
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
            <span style={{ color: 'var(--text-secondary)' }}>Image Gen:</span>
            <strong style={{ color: 'var(--text-accent)' }}>{form.defaultImageGenModel || 'sat-flux-1-schnell'}</strong>
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

      {/* ── 1. Custom OpenAI-Compatible / SAT AI Endpoint & Dynamic Discovery ── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <RiRobot2Line size={22} style={{ color: 'var(--primary)' }} />
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Custom OpenAI-Compatible / SAT AI Model Endpoint</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Connect any custom endpoint (Clever Cloud, SAT AI, vLLM, Ollama, OpenRouter) to discover vision &amp; image generation models
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDiscoverModels}
            disabled={discovering}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {discovering ? <RiRefreshLine className="spin" size={16} /> : <RiRefreshLine size={16} />}
            {discovering ? 'Querying Endpoint Models...' : 'Discover Models from Endpoint'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
              Custom API Base URL (<code>SAT_BASE_URL</code> / <code>BASE_URL</code>)
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="https://app-fcbf4053-74e6-4498-ac0e-eb160010a3c5.cleverapps.io/v1"
              value={form.satBaseUrl}
              onChange={(e) => setForm({ ...form, satBaseUrl: e.target.value })}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Presets:</span>
              {ENDPOINT_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setForm({ ...form, satBaseUrl: p.url })}
                  style={{
                    padding: '2px 8px',
                    fontSize: 10,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
              API Key &amp; Credentials (<code>SAT_API_KEY</code> / <code>API_KEY</code>)
            </label>
            <input
              type="password"
              className="form-input"
              placeholder="Bearer token (e.g. sk-... / sat_...)"
              value={form.satApiKey || ''}
              onChange={(e) => setForm({ ...form, satApiKey: e.target.value })}
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Authorization key used for model discovery, multimodal inference, and image generation
            </span>
          </div>
        </div>

      </section>

      {/* ── Discovered Models Giant Searchable Table Card ─────────────── */}
      {discoveredCatalog && discoveredCatalog.success && discoveredCatalog.models.length > 0 && (
        <VisionImageModelTable
          models={discoveredCatalog.models}
          baseUrl={discoveredCatalog.baseUrl}
          defaultVisionModel={form.defaultVisionModel}
          defaultImageGenModel={form.defaultImageGenModel}
          onSetVisionDefault={(modelId) => {
            setForm((prev) => ({ ...prev, defaultVisionModel: modelId }));
            setMessage({
              type: 'success',
              text: `Updated Default Vision Model to "${modelId}". Remember to click "Save Vision & Image Settings" to sync.`,
            });
          }}
          onSetImageGenDefault={(modelId) => {
            setForm((prev) => ({ ...prev, defaultImageGenModel: modelId }));
            setMessage({
              type: 'success',
              text: `Updated Default Image Model to "${modelId}". Remember to click "Save Vision & Image Settings" to sync.`,
            });
          }}
          onRefresh={handleDiscoverModels}
          isRefreshing={discovering}
        />
      )}

      {/* ── 2. Auxiliary Multimodal Vision (`auxiliary.vision`) ───────── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RiEyeLine size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Auxiliary Multimodal Vision (<code>auxiliary.vision</code>)</h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Handles screenshot reasoning, image attachments, and <code>/paste</code> clipboard reasoning
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Vision Provider</label>
            <select
              className="form-input"
              value={form.visionProvider}
              onChange={(e) => setForm({ ...form, visionProvider: e.target.value })}
              autoComplete="off"
            >
              <option value="custom">Custom OpenAI-Compatible API (Default Endpoint)</option>
              <option value="sat">SAT AI API (/v1/chat/completions)</option>
              <option value="openai">OpenAI (GPT-4o / GPT-4-Vision)</option>
              <option value="openrouter">OpenRouter Multi-Provider</option>
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
              Default Vision Model (Advanced Searchable Selector)
            </label>
            <VisionImageSelect
              value={form.defaultVisionModel}
              onChange={(modelId) => setForm({ ...form, defaultVisionModel: modelId })}
              models={allSelectableModels}
              mode="vision"
              placeholder="Search or select vision model (e.g. @cf/zai-org/glm-4.2, gpt-4o, qwen-vl)..."
              onDiscover={handleDiscoverModels}
              loading={discovering}
            />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
              Select from discovered API models, filter by Vision/Image Gen capabilities, or input custom ID
            </span>
          </div>
        </div>

        {form.visionProvider === 'custom' && form.visionBaseUrl && (
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <div>
              <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Override Vision Base URL (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Leave blank to use main endpoint"
                value={form.visionBaseUrl || ''}
                onChange={(e) => setForm({ ...form, visionBaseUrl: e.target.value })}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Override Vision API Key (Optional)</label>
              <input
                type="password"
                className="form-input"
                placeholder="Leave blank to use main key"
                value={form.visionApiKey || ''}
                onChange={(e) => setForm({ ...form, visionApiKey: e.target.value })}
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
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
            Powers text-to-image synthesis and image editing tool execution during conversation loops
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Image Generation Provider</label>
            <select
              className="form-input"
              value={form.imageGenProvider}
              onChange={(e) => setForm({ ...form, imageGenProvider: e.target.value })}
              autoComplete="off"
            >
              <option value="custom">Custom OpenAI-Compatible API (/v1/images/generations)</option>
              <option value="sat">SAT AI API (Custom FLUX / SD)</option>
              <option value="fal">FAL.ai (FLUX 2, Ideogram, Recraft, Krea)</option>
              <option value="openai">OpenAI (DALL-E 3 / GPT-Image)</option>
              <option value="nous_subscription">Nous Subscription Gateway</option>
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>
              Default Image Model (Advanced Searchable Selector)
            </label>
            <VisionImageSelect
              value={form.defaultImageGenModel}
              onChange={(modelId) => setForm({ ...form, defaultImageGenModel: modelId })}
              models={imageGenOptions}
              mode="image"
              placeholder="Search or select image model (e.g. sat-flux-1-schnell, fal-ai/flux-2-pro, dall-e-3)..."
              onDiscover={handleDiscoverModels}
              loading={discovering}
            />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
              Discovered from your active API endpoint or chosen provider presets
            </span>
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
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
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
            Test multimodal image reasoning against configured model (<code>{form.defaultVisionModel}</code>) on <code>{form.satBaseUrl}</code>
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
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
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
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
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

            {visionTestResult.analysis && (
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  background: 'var(--bg-card)',
                  padding: 12,
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {visionTestResult.analysis}
              </div>
            )}

            {visionTestResult.error && (
              <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>
                {visionTestResult.error}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── 5. Interactive Image Generation Studio & Preview ──────────── */}
      <section className="glass-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RiSparklingLine size={18} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Live Image Generation Studio</h3>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Generate high-resolution test graphics using <code>{form.defaultImageGenModel}</code> on <code>{form.satBaseUrl}</code>
          </p>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>Image Generation Prompt</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder="A futuristic AI developer workstation with neon lights..."
            value={imageGenPrompt}
            onChange={(e) => setImageGenPrompt(e.target.value)}
            style={{ width: '100%', resize: 'vertical' }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Style Presets:</span>
            {[
              { label: 'Cyberpunk Workspace', text: 'A futuristic cybernetic workstation with holographic monitors, dark glass reflection, neon cyan and violet lighting, 8k render' },
              { label: 'Japanese Landscape', text: 'Serene traditional Japanese garden with blooming cherry blossoms, wooden pagoda, foggy mountain backdrop, golden hour' },
              { label: 'Minimalist Vector', text: 'Clean modern minimalist vector illustration of an AI neural network core, flat pastel colors, white background' },
              { label: 'Studio Portrait', text: 'Cinematic dramatic studio portrait of a futuristic robotic co-pilot, 85mm lens, shallow depth of field, sharp detail' },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setImageGenPrompt(preset.text)}
                style={{
                  padding: '2px 8px',
                  fontSize: 10,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRunImageGenTest}
            disabled={testingImageGen || !imageGenPrompt.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {testingImageGen ? <RiRefreshLine className="spin" size={16} /> : <RiSparklingLine size={16} />}
            {testingImageGen ? 'Generating Image...' : 'Generate Image'}
          </button>
        </div>

        {imageGenResult && (
          <div
            style={{
              marginTop: 16,
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
                  {imageGenResult.success ? `Image Rendered (${imageGenResult.model})` : 'Image Generation Failed'}
                </strong>
              </div>
              {imageGenResult.latencyMs !== undefined && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Latency: <strong>{imageGenResult.latencyMs}ms</strong>
                </span>
              )}
            </div>

            {imageGenResult.imageUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <img
                  src={imageGenResult.imageUrl}
                  alt={imageGenResult.prompt || 'Generated art'}
                  style={{
                    maxWidth: '100%',
                    maxHeight: 480,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                    objectFit: 'contain',
                  }}
                />
                <a
                  href={imageGenResult.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <RiExternalLinkLine size={14} /> Open Full Resolution
                </a>
              </div>
            )}

            {imageGenResult.error && (
              <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>
                {imageGenResult.error}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Sticky Save Footer Bar ─────────────────────────────────────── */}
      <div
        className="glass-card"
        style={{
          position: 'sticky',
          bottom: 20,
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 50,
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RiShieldCheckLine size={18} style={{ color: 'var(--success, #10b981)' }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Syncs to <code>auxiliary.vision</code> &amp; <code>image_gen</code> in <code>~/.hermes/config.yaml</code>
          </span>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', fontSize: 14 }}
        >
          {saving ? <RiRefreshLine className="spin" size={16} /> : <RiCheckLine size={16} />}
          {saving ? 'Saving & Syncing...' : 'Save Vision & Image Settings'}
        </button>
      </div>
    </div>
  );
};
