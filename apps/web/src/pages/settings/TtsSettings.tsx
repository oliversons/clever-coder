import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RiVolumeUpLine,
  RiMicLine,
  RiCheckLine,
  RiErrorWarningLine,
  RiRefreshLine,
  RiSearchEyeLine,
  RiPlayFill,
  RiKey2Line,
  RiGlobalLine,
  RiVoiceprintLine,
  RiEqualizerLine,
  RiSoundModuleLine,
  RiFlashlightLine,
  RiMusic2Line,
  RiShieldUserLine,
  RiDiscLine,
} from 'react-icons/ri';
import { api } from '../../api/client';

export interface HermesTtsSettingsData {
  enabled: boolean;
  provider: string;
  baseUrl: string;
  apiKey?: string;
  apiKeySet?: boolean;
  model: string;
  voice: string;
  speed: number;
  format: string;
  autoPlayInWebui: boolean;
}

const STANDARD_VOICES = [
  { id: 'alloy', name: 'Alloy', desc: 'Neutral, balanced & versatile' },
  { id: 'echo', name: 'Echo', desc: 'Warm, rounded male tone' },
  { id: 'fable', name: 'Fable', desc: 'Expressive british narrative' },
  { id: 'onyx', name: 'Onyx', desc: 'Deep, authoritative male tone' },
  { id: 'nova', name: 'Nova', desc: 'Energetic, bright female tone' },
  { id: 'shimmer', name: 'Shimmer', desc: 'Clear, gentle female tone' },
];

const TTS_PROVIDERS = [
  { id: 'custom_openai', name: 'Custom OpenAI-Compatible API (SAT AI / Self-Hosted)', badge: 'Recommended', tag: 'Discovers models on /v1/models & synthesizes on /v1/audio/speech' },
  { id: 'openai', name: 'OpenAI TTS (tts-1 / tts-1-hd)', badge: 'Cloud', tag: 'Official OpenAI speech endpoint' },
  { id: 'elevenlabs', name: 'ElevenLabs (High Realism)', badge: 'Paid', tag: 'Ultra-realistic voice cloning & multilingual' },
  { id: 'edge', name: 'Edge TTS (Free, Zero API Key)', badge: 'Free', tag: 'Microsoft Edge neural speech engines' },
  { id: 'gemini', name: 'Google Gemini TTS', badge: 'Cloud', tag: 'Google Cloud text-to-speech API' },
  { id: 'minimax', name: 'MiniMax TTS', badge: 'Paid', tag: 'High definition speech synthesis' },
  { id: 'xai', name: 'xAI TTS', badge: 'Cloud', tag: 'Grok xAI speech endpoint' },
  { id: 'deepinfra', name: 'DeepInfra TTS', badge: 'Cloud', tag: 'Open source hosted speech models' },
  { id: 'piper', name: 'Piper (Local CPU)', badge: 'Local', tag: 'Fast local ONNX neural text-to-speech' },
];

export const TtsSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);

  const [showApiKey, setShowApiKey] = useState(false);
  const [models, setModels] = useState<Array<{ id: string; name?: string; description?: string }>>([]);
  const [sampleText, setSampleText] = useState('Hello! Voice and Text-to-Speech synthesis is successfully configured on Hermes Agent.');
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);

  const [form, setForm] = useState<HermesTtsSettingsData>({
    enabled: true,
    provider: 'custom_openai',
    baseUrl: 'https://api.sat.ai/v1',
    apiKey: '',
    model: 'sat-tts-hd',
    voice: 'alloy',
    speed: 1.0,
    format: 'mp3',
    autoPlayInWebui: true,
  });

  const [banner, setBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await api.hermes.getTtsSettings();
      if (data) {
        setForm((prev) => ({
          ...prev,
          ...data,
          baseUrl: data.baseUrl || 'https://api.sat.ai/v1',
        }));
      }
    } catch (err: any) {
      console.warn('[TtsSettings] Load warning:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleDiscoverModels = async () => {
    setDiscovering(true);
    setBanner(null);
    try {
      const data = await api.hermes.getTtsModels(form.baseUrl, form.apiKey);
      if (data.models && data.models.length > 0) {
        setModels(data.models);
        setBanner({ type: 'success', msg: `Discovered ${data.models.length} model(s) from endpoint.` });
        if (!data.models.some((m: any) => m.id === form.model)) {
          setForm((prev) => ({ ...prev, model: data.models[0].id }));
        }
      } else {
        setBanner({ type: 'error', msg: 'No models found on the specified endpoint.' });
      }
    } catch (err: any) {
      setBanner({ type: 'error', msg: 'Model discovery failed: ' + (err.message || 'Could not connect') });
    } finally {
      setDiscovering(false);
    }
  };

  const handleGeneratePreview = async () => {
    setSynthesizing(true);
    setBanner(null);
    setAudioPreviewUrl(null);
    try {
      const data = await api.hermes.generateTtsPreview({
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        model: form.model,
        voice: form.voice,
        speed: form.speed,
        text: sampleText,
        format: form.format,
      });

      if (data.audioDataUrl) {
        setAudioPreviewUrl(data.audioDataUrl);
        setBanner({ type: 'success', msg: '🔊 Speech audio synthesized successfully! Click play below to listen.' });
      }
    } catch (err: any) {
      setBanner({ type: 'error', msg: 'Speech preview synthesis failed: ' + err.message });
    } finally {
      setSynthesizing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setBanner(null);
    try {
      await api.hermes.saveTtsSettings(form);
      setBanner({ type: 'success', msg: 'Voice & TTS configuration saved and synced to ~/.hermes state files.' });
      fetchSettings();
    } catch (err: any) {
      setBanner({ type: 'error', msg: 'Save failed: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <RiRefreshLine className="spin" style={{ fontSize: 24, marginBottom: 12 }} />
        <div>Loading Voice & TTS Integration Settings...</div>
      </div>
    );
  }

  const isCustomVoice = !STANDARD_VOICES.some((v) => v.id === form.voice);

  return (
    <div className="space-y-6" style={{ maxWidth: 920 }}>
      {/* ── Top Header Banner ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15) 0%, rgba(6, 182, 212, 0.08) 100%)',
          border: '1px solid rgba(124, 58, 237, 0.3)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 26,
              boxShadow: '0 8px 20px rgba(124, 58, 237, 0.3)',
            }}
          >
            <RiVolumeUpLine />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              Voice & Text-to-Speech (TTS) Setup
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 20,
                  background: form.enabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: form.enabled ? '#10b981' : '#ef4444',
                  border: `1px solid ${form.enabled ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {form.enabled ? '● Active' : '○ Disabled'}
              </span>
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Real-time speech synthesis for Hermes CLI & WebUI via Custom OpenAI-compatible endpoints, ElevenLabs, or Edge TTS.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            <span>Enable TTS Engine</span>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: '#7c3aed' }}
            />
          </label>
        </div>
      </div>

      {/* ── Status Toast ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {banner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: banner.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${banner.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: banner.type === 'success' ? '#10b981' : '#ef4444',
            }}
          >
            {banner.type === 'success' ? <RiCheckLine /> : <RiErrorWarningLine />}
            <div style={{ flex: 1 }}>{banner.msg}</div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.7 }}
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── STEP 1: Provider & Endpoint Credentials ──────────────────────────── */}
      <div
        style={{
          padding: 20,
          borderRadius: 14,
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            1
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Step 1: TTS Engine Provider & Endpoint Credentials
          </h3>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label">TTS Provider Engine (`tts.provider`)</label>
          <select
            className="form-input"
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
          >
            {TTS_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} [{p.badge}]
              </option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {TTS_PROVIDERS.find((p) => p.id === form.provider)?.tag}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RiGlobalLine style={{ color: '#06b6d4' }} />
              API Base URL (`TTS_BASE_URL`)
            </label>
            <input
              type="text"
              className="form-input"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://api.sat.ai/v1 or http://localhost:8000/v1"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>

          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RiKey2Line style={{ color: '#7c3aed' }} />
              API Secret Key (`TTS_API_KEY`)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showApiKey ? 'text' : 'password'}
                className="form-input"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder={form.apiKeySet ? '•••••••• (Secret Stored)' : 'sk-... Bearer token'}
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleDiscoverModels}
            disabled={discovering}
            className="btn-secondary"
            style={{
              fontSize: 12,
              padding: '8px 14px',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {discovering ? <RiRefreshLine className="spin" /> : <RiSearchEyeLine style={{ color: '#06b6d4' }} />}
            {discovering ? 'Discovering Models...' : '🔍 Discover Models from Endpoint'}
          </button>
        </div>
      </div>

      {/* ── STEP 2: Model & Voice Persona Selection ───────────────────────────── */}
      <div
        style={{
          padding: 20,
          borderRadius: 14,
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #06b6d4, #10b981)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            2
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Step 2: AI Speech Model & Voice Persona
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RiDiscLine style={{ color: '#10b981' }} />
              Speech AI Model (`tts.model`)
            </label>
            {models.length > 0 ? (
              <select
                className="form-input"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id} ({m.description || 'Model'})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="form-input"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="sat-tts-hd, tts-1, or tts-1-hd"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            )}
          </div>

          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RiVoiceprintLine style={{ color: '#7c3aed' }} />
              Voice Identifier / Persona (`tts.voice`)
            </label>
            <div className="space-y-2">
              <select
                className="form-input"
                value={isCustomVoice ? 'custom' : form.voice}
                onChange={(e) => {
                  if (e.target.value !== 'custom') {
                    setForm({ ...form, voice: e.target.value });
                  } else {
                    setForm({ ...form, voice: 'custom-voice-id' });
                  }
                }}
              >
                {STANDARD_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} — {v.desc}
                  </option>
                ))}
                <option value="custom">-- Custom Voice ID / Name --</option>
              </select>

              {isCustomVoice && (
                <input
                  type="text"
                  className="form-input"
                  value={form.voice}
                  onChange={(e) => setForm({ ...form, voice: e.target.value })}
                  placeholder="Enter custom voice ID (e.g., ElevenLabs ID or model voice)"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              )}
            </div>
          </div>
        </div>

        {/* Speed Slider & Output Encoding */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RiEqualizerLine style={{ color: '#06b6d4' }} />
                Speech Playback Speed (`tts.speed`)
              </span>
              <span style={{ color: '#06b6d4', fontWeight: 700 }}>{form.speed}x</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={form.speed}
                onChange={(e) => setForm({ ...form, speed: Number(e.target.value) })}
                style={{ flex: 1, accentColor: '#7c3aed' }}
              />
              <input
                type="number"
                min="0.5"
                max="2.0"
                step="0.1"
                className="form-input"
                value={form.speed}
                onChange={(e) => setForm({ ...form, speed: Math.min(2.0, Math.max(0.5, Number(e.target.value))) })}
                style={{ width: 64, textAlign: 'center' }}
                autoComplete="off"
              />
            </div>
          </div>

          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RiSoundModuleLine style={{ color: '#f59e0b' }} />
              Audio File Encoding (`tts.format`)
            </label>
            <select
              className="form-input"
              value={form.format}
              onChange={(e) => setForm({ ...form, format: e.target.value })}
            >
              <option value="mp3">MP3 (Universal Standard)</option>
              <option value="opus">Opus (Optimized Voice Messaging)</option>
              <option value="aac">AAC (High Efficiency)</option>
              <option value="wav">WAV (Uncompressed Audio)</option>
              <option value="flac">FLAC (Lossless)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, marginTop: 12, borderTop: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Auto-Play Speech in Hermes WebUI
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Automatically play synthesized voice bubbles when receiving assistant responses.
            </div>
          </div>

          <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.autoPlayInWebui}
              onChange={(e) => setForm({ ...form, autoPlayInWebui: e.target.checked })}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 24,
                background: form.autoPlayInWebui ? '#7c3aed' : 'rgba(255,255,255,0.1)',
                transition: '0.2s ease',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  content: '""',
                  height: 18,
                  width: 18,
                  left: form.autoPlayInWebui ? 22 : 3,
                  bottom: 3,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: '0.2s ease',
                }}
              />
            </span>
          </label>
        </div>
      </div>

      {/* ── STEP 3: Live Voice Preview & Verification ────────────────────────── */}
      <div
        style={{
          padding: 20,
          borderRadius: 14,
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981, #06b6d4)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            3
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Step 3: Live Voice Preview & Synthesis Verification
          </h3>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Speech Synthesis Test Prompt</label>
          <input
            type="text"
            className="form-input"
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            placeholder="Text to convert into speech audio"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            type="button"
            onClick={handleGeneratePreview}
            disabled={synthesizing}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #10b981, #06b6d4)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
            }}
          >
            {synthesizing ? <RiRefreshLine className="spin" /> : <RiPlayFill />}
            {synthesizing ? 'Synthesizing Speech...' : '▶ Generate Speech Preview'}
          </button>

          {audioPreviewUrl && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
              <audio controls src={audioPreviewUrl} autoPlay style={{ height: 38, flex: 1 }} />
            </div>
          )}
        </div>
      </div>

      {/* ── Save Action Bar ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 10 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(124, 58, 237, 0.3)',
          }}
        >
          {saving ? 'Saving Voice Settings...' : 'Save Voice Configuration'}
        </button>
      </div>
    </div>
  );
};
