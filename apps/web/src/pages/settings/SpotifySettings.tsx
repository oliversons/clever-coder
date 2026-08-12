import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RiMusic2Line,
  RiCheckLine,
  RiErrorWarningLine,
  RiRefreshLine,
  RiExternalLinkLine,
  RiVolumeUpLine,
  RiSmartphoneLine,
  RiTvLine,
  RiComputerLine,
  RiSpeakerLine,
  RiKey2Line,
  RiShieldUserLine,
  RiFileCopyLine,
  RiGlobalLine,
  RiFlashlightLine,
} from 'react-icons/ri';
import { api } from '../../api/client';

export interface SpotifySettingsData {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  clientSecretSet?: boolean;
  redirectUri: string;
  defaultDeviceId: string;
  defaultVolume: number;
  autoTransfer: boolean;
  market: string;
  isConnected?: boolean;
  hasRefreshToken?: boolean;
}

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  volume_percent: number;
}

export const SpotifySettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [scanningDevices, setScanningDevices] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; user?: any } | null>(null);

  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [showSecret, setShowSecret] = useState(false);

  const [form, setForm] = useState<SpotifySettingsData>({
    enabled: true,
    clientId: '',
    clientSecret: '',
    redirectUri: `${window.location.protocol}//${window.location.host}/api/v1/hermes/spotify/callback`,
    defaultDeviceId: '',
    defaultVolume: 70,
    autoTransfer: true,
    market: 'US',
    isConnected: false,
  });

  const [banner, setBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await api.hermes.getSpotifySettings();
      if (data) {
        setForm((prev) => ({
          ...prev,
          ...data,
          redirectUri: data.redirectUri || `${window.location.protocol}//${window.location.host}/api/v1/hermes/spotify/callback`,
        }));
      }
    } catch (err: any) {
      console.warn('[SpotifySettings] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();

    // Listen for OAuth completion message from popup window
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SPOTIFY_AUTH_SUCCESS') {
        setBanner({ type: 'success', msg: '🎵 Spotify account authorized successfully!' });
        fetchSettings();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleCopyRedirectUri = () => {
    navigator.clipboard.writeText(form.redirectUri);
    setCopiedUri(true);
    setTimeout(() => setCopiedUri(false), 2000);
  };

  const handleConnectSpotify = async () => {
    if (!form.clientId) {
      setBanner({ type: 'error', msg: 'Please enter your Spotify Client ID first.' });
      return;
    }

    try {
      // Save credentials first
      await api.hermes.saveSpotifySettings(form);

      // Get authorization URL
      const data = await api.hermes.getSpotifyAuthorizeUrl(form.clientId, form.redirectUri);

      if (data?.authUrl) {
        const width = 600;
        const height = 750;
        const left = window.screenX + (window.innerWidth - width) / 2;
        const top = window.screenY + (window.innerHeight - height) / 2;
        const popup = window.open(
          data.authUrl,
          'Spotify Authorization',
          `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
        );

        // Poll popup status
        const timer = setInterval(async () => {
          if (popup?.closed) {
            clearInterval(timer);
            fetchSettings();
          }
        }, 1000);
      }
    } catch (err: any) {
      setBanner({ type: 'error', msg: 'Authorization failed: ' + err.message });
    }
  };

  const handleScanDevices = async () => {
    setScanningDevices(true);
    setBanner(null);
    try {
      const data = await api.hermes.getSpotifyDevices();
      setDevices(data.devices || []);
      if ((data.devices || []).length === 0) {
        setBanner({ type: 'error', msg: 'No active Spotify Connect devices found. Open Spotify on your phone, desktop, or speaker and retry.' });
      } else {
        setBanner({ type: 'success', msg: `Discovered ${data.devices.length} Spotify Connect device(s).` });
      }
    } catch (err: any) {
      setBanner({ type: 'error', msg: 'Device scan error: ' + err.message });
    } finally {
      setScanningDevices(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.hermes.testSpotifyConnection();
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Spotify account?')) return;
    try {
      await api.hermes.disconnectSpotify();
      setBanner({ type: 'success', msg: 'Spotify account disconnected.' });
      fetchSettings();
    } catch (err: any) {
      setBanner({ type: 'error', msg: 'Disconnect error: ' + err.message });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setBanner(null);
    try {
      await api.hermes.saveSpotifySettings(form);
      setBanner({ type: 'success', msg: 'Spotify configuration saved successfully.' });
      fetchSettings();
    } catch (err: any) {
      setBanner({ type: 'error', msg: 'Save failed: ' + err.message });
    } finally {
      setSaving(false);
    }
  };

  const getDeviceIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('phone')) return <RiSmartphoneLine style={{ color: '#10b981' }} />;
    if (t.includes('tv')) return <RiTvLine style={{ color: '#06b6d4' }} />;
    if (t.includes('speaker')) return <RiSpeakerLine style={{ color: '#f59e0b' }} />;
    return <RiComputerLine style={{ color: '#7c3aed' }} />;
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <RiRefreshLine className="spin" style={{ fontSize: 24, marginBottom: 12 }} />
        <div>Loading Spotify Integration Settings...</div>
      </div>
    );
  }

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
          background: 'linear-gradient(135deg, rgba(29, 185, 84, 0.12) 0%, rgba(9, 13, 22, 0.6) 100%)',
          border: '1px solid rgba(29, 185, 84, 0.3)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #1DB954 0%, #191414 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 26,
              boxShadow: '0 8px 20px rgba(29, 185, 84, 0.3)',
            }}
          >
            <RiMusic2Line />
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              Spotify Integration Setup
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 20,
                  background: form.isConnected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: form.isConnected ? '#10b981' : '#f59e0b',
                  border: `1px solid ${form.isConnected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {form.isConnected ? '● Connected' : '○ Disconnected'}
              </span>
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Control Spotify playback, search tracks, manage playlists & target Connect devices via Web API.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || !form.isConnected}
            className="btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              padding: '8px 14px',
              borderRadius: 8,
              opacity: form.isConnected ? 1 : 0.5,
            }}
          >
            {testing ? <RiRefreshLine className="spin" /> : <RiFlashlightLine />}
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </div>

      {/* ── Status Banner Toast ──────────────────────────────────────────────── */}
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

      {/* ── STEP 1: Developer App Setup Guide ────────────────────────────────── */}
      <div
        style={{
          padding: 20,
          borderRadius: 14,
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1DB954, #10b981)',
              color: '#000',
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
            Step 1: Register Spotify Developer Application
          </h3>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 14px' }}>
          Spotify requires each instance to register a lightweight Developer Application to enable Web API access.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
          <div style={{ padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, color: '#10b981', marginBottom: 4 }}>1. Open Developer Dashboard</div>
            <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
              Go to Spotify Developer Dashboard and click <strong>Create App</strong>.
            </div>
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: '#1DB954',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Open Dashboard <RiExternalLinkLine />
            </a>
          </div>

          <div style={{ padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, color: '#06b6d4', marginBottom: 4 }}>2. Configure Redirect URI</div>
            <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>
              Copy your callback URI and paste it into App Settings under <strong>Redirect URIs</strong>:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <code style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 4, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {form.redirectUri}
              </code>
              <button
                type="button"
                onClick={handleCopyRedirectUri}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  color: copiedUri ? '#10b981' : 'var(--text-muted)',
                  borderRadius: 4,
                  padding: '3px 6px',
                  cursor: 'pointer',
                }}
              >
                {copiedUri ? <RiCheckLine /> : <RiFileCopyLine />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── STEP 2: API Credentials & Authorization ──────────────────────────── */}
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
              background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
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
            Step 2: API Credentials & OAuth Authorization
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RiKey2Line style={{ color: '#10b981' }} />
              Client ID
            </label>
            <input
              type="text"
              className="form-input"
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              placeholder="32-character hexadecimal Client ID"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>

          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RiShieldUserLine style={{ color: '#06b6d4' }} />
              Client Secret
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showSecret ? 'text' : 'password'}
                className="form-input"
                value={form.clientSecret}
                onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                placeholder="Client Secret key from Spotify App Settings"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
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
                {showSecret ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RiGlobalLine style={{ color: '#f59e0b' }} />
            OAuth Redirect Callback URI
          </label>
          <input
            type="text"
            className="form-input"
            value={form.redirectUri}
            onChange={(e) => setForm({ ...form, redirectUri: e.target.value })}
            placeholder="http://localhost:8080/api/v1/hermes/spotify/callback"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Spotify Account Connection
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {form.isConnected
                ? 'Your account is linked. Click below to re-authorize or refresh tokens.'
                : 'Click connect to open Spotify OAuth consent popup and link your account.'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {form.isConnected && (
              <button
                type="button"
                onClick={handleDisconnect}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  cursor: 'pointer',
                }}
              >
                Disconnect
              </button>
            )}

            <button
              type="button"
              onClick={handleConnectSpotify}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #1DB954, #10b981)',
                color: '#000',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 14px rgba(29, 185, 84, 0.3)',
              }}
            >
              <RiMusic2Line />
              {form.isConnected ? 'Re-authorize Spotify' : 'Connect Spotify Account'}
            </button>
          </div>
        </div>
      </div>

      {/* ── STEP 3: Playback Defaults & Device Target Scanner ──────────────── */}
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
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
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
            Step 3: Playback Defaults & Target Device
          </h3>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label className="form-label" style={{ margin: 0 }}>Target Spotify Connect Device</label>
            <button
              type="button"
              onClick={handleScanDevices}
              disabled={scanningDevices || !form.isConnected}
              className="btn-secondary"
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                opacity: form.isConnected ? 1 : 0.5,
              }}
            >
              {scanningDevices ? <RiRefreshLine className="spin" /> : <RiSpeakerLine />}
              {scanningDevices ? 'Scanning...' : 'Scan Active Devices'}
            </button>
          </div>

          {devices.length > 0 ? (
            <select
              className="form-input"
              value={form.defaultDeviceId}
              onChange={(e) => setForm({ ...form, defaultDeviceId: e.target.value })}
            >
              <option value="">-- Select Target Active Device --</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.type}) {d.is_active ? '• Active' : ''} (Volume: {d.volume_percent}%)
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className="form-input"
              value={form.defaultDeviceId}
              onChange={(e) => setForm({ ...form, defaultDeviceId: e.target.value })}
              placeholder="Target Device ID (or click Scan Active Devices above)"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          )}

          {devices.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {devices.map((d) => (
                <div
                  key={d.id}
                  onClick={() => setForm({ ...form, defaultDeviceId: d.id })}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 11,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: form.defaultDeviceId === d.id ? 'rgba(29, 185, 84, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                    border: `1px solid ${form.defaultDeviceId === d.id ? 'rgba(29, 185, 84, 0.4)' : 'var(--border)'}`,
                    cursor: 'pointer',
                  }}
                >
                  {getDeviceIcon(d.type)}
                  <span style={{ fontWeight: 600 }}>{d.name}</span>
                  {d.is_active && <span style={{ color: '#10b981', fontSize: 10 }}>● Active</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RiVolumeUpLine style={{ color: '#06b6d4' }} />
                Default Playback Volume
              </span>
              <span style={{ color: '#06b6d4', fontWeight: 700 }}>{form.defaultVolume}%</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="range"
                min="0"
                max="100"
                value={form.defaultVolume}
                onChange={(e) => setForm({ ...form, defaultVolume: Number(e.target.value) })}
                style={{ flex: 1, accentColor: '#1DB954' }}
              />
              <input
                type="number"
                min="0"
                max="100"
                className="form-input"
                value={form.defaultVolume}
                onChange={(e) => setForm({ ...form, defaultVolume: Math.min(100, Math.max(0, Number(e.target.value))) })}
                style={{ width: 64, textAlign: 'center' }}
                autoComplete="off"
              />
            </div>
          </div>

          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RiGlobalLine style={{ color: '#f59e0b' }} />
              Market / Country ISO Filter
            </label>
            <input
              type="text"
              className="form-input"
              value={form.market}
              onChange={(e) => setForm({ ...form, market: e.target.value.toUpperCase() })}
              placeholder="US, FR, DE, GB"
              maxLength={2}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Auto-Transfer Playback
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Automatically transfer stream to target default device when receiving playback commands.
            </div>
          </div>

          <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.autoTransfer}
              onChange={(e) => setForm({ ...form, autoTransfer: e.target.checked })}
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
                background: form.autoTransfer ? '#1DB954' : 'rgba(255,255,255,0.1)',
                transition: '0.2s ease',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  content: '""',
                  height: 18,
                  width: 18,
                  left: form.autoTransfer ? 22 : 3,
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

      {/* ── STEP 4: Test & Diagnostics Panel ────────────────────────────────── */}
      {testResult && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: testResult.success ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: testResult.success ? '#10b981' : '#ef4444', marginBottom: 4 }}>
            {testResult.success ? '✅ Spotify Connection Validated' : '❌ Spotify Test Failed'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{testResult.message}</div>
          {testResult.user && (
            <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-primary)' }}>
              <div>User: <strong>{testResult.user.displayName}</strong> ({testResult.user.id})</div>
              <div>Plan: <strong style={{ color: '#10b981', textTransform: 'uppercase' }}>{testResult.user.product}</strong></div>
              <div>Country: <strong>{testResult.user.country}</strong></div>
            </div>
          )}
        </div>
      )}

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
          {saving ? 'Saving Spotify Config...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
};
