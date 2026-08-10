import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sun, Moon, Github, Shield, User as UserIcon, Check, HardDrive,
  Palette as PaletteIcon, Snowflake, Flame, Zap, Droplets, Trees, Heart, Sparkles,
  type LucideIcon
} from 'lucide-react';
import { useAuthStore } from '../store';
import { useThemeStore, type Palette } from '../store/themeStore';
import { api, openGithubOAuthPopup } from '../api/client';

interface PaletteOption {
  id: Palette;
  name: string;
  category: 'cold' | 'warm' | 'orange' | 'default';
  description: string;
  icon: LucideIcon;
  colorsDark: string[];
  colorsLight: string[];
}

const PALETTES: PaletteOption[] = [
  {
    id: 'default',
    name: 'Electric Violet & Cyan',
    category: 'default',
    description: 'Classic cyberpunk coding palette with electric violet, cyan, and neon glow.',
    icon: Sparkles,
    colorsDark: ['#0d1117', '#7c3aed', '#06b6d4'],
    colorsLight: ['#ffffff', '#6d28d9', '#0891b2'],
  },
  // ─── Cold Palettes ───
  {
    id: 'ocean',
    name: 'Ocean Sapphire',
    category: 'cold',
    description: 'Deep abyss navy with royal sapphire blue and crystalline sky accents.',
    icon: Droplets,
    colorsDark: ['#091322', '#2563eb', '#38bdf8'],
    colorsLight: ['#ffffff', '#1d4ed8', '#0284c7'],
  },
  {
    id: 'nordic',
    name: 'Nordic Ice',
    category: 'cold',
    description: 'Arctic frost slate with crisp glacial cyan and polar teal gradients.',
    icon: Snowflake,
    colorsDark: ['#0b161f', '#06b6d4', '#14b8a6'],
    colorsLight: ['#ffffff', '#0891b2', '#0d9488'],
  },
  {
    id: 'emerald',
    name: 'Emerald Forest',
    category: 'cold',
    description: 'Deep pine greens with vivid emerald gemstones and refreshing mint highlights.',
    icon: Trees,
    colorsDark: ['#081a10', '#10b981', '#34d399'],
    colorsLight: ['#ffffff', '#059669', '#0891b2'],
  },
  // ─── Warm Palettes ───
  {
    id: 'rose',
    name: 'Crimson Sunset',
    category: 'warm',
    description: 'Midnight berry with intense ruby rose and warm coral pink tones.',
    icon: Heart,
    colorsDark: ['#1c0a13', '#f43f5e', '#fb7185'],
    colorsLight: ['#ffffff', '#e11d48', '#f43f5e'],
  },
  {
    id: 'amber',
    name: 'Amber Gold',
    category: 'warm',
    description: 'Dark bronze with rich golden amber and radiant honey highlights.',
    icon: Sun,
    colorsDark: ['#1c1507', '#f59e0b', '#fbbf24'],
    colorsLight: ['#ffffff', '#d97706', '#f59e0b'],
  },
  {
    id: 'volcanic',
    name: 'Volcanic Clay',
    category: 'warm',
    description: 'Obsidian earth with burnt terracotta, magma orange, and fiery red accents.',
    icon: Flame,
    colorsDark: ['#1c0c08', '#ea580c', '#f97316'],
    colorsLight: ['#ffffff', '#c2410c', '#ea580c'],
  },
  // ─── Special Orange Palette ───
  {
    id: 'orange',
    name: 'Solar Orange',
    category: 'orange',
    description: 'High-energy cyberpunk carbon with blazing solar orange and tangerine neon.',
    icon: Zap,
    colorsDark: ['#180f06', '#ff6b00', '#ff9e00'],
    colorsLight: ['#ffffff', '#e65100', '#ff6b00'],
  },
];

export default function Settings() {
  const { user, setUser, logout } = useAuthStore();
  const { theme, palette, setTheme, setPalette } = useThemeStore();
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleConnectGithub = () => {
    setConnecting(true);
    setMessage(null);
    openGithubOAuthPopup(async () => {
      try {
        const u = await api.auth.me();
        setUser(u);
        setMessage({ type: 'success', text: 'GitHub account connected successfully!' });
      } catch (err) {
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to connect GitHub' });
      } finally {
        setConnecting(false);
      }
    });
  };

  const initial = user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div>
          <h1 className="page-title">Platform Settings</h1>
          <p className="page-subtitle">Configure theme, GitHub integration, and account preferences</p>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type} mb-6`}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* ─── 1. Appearance / Multi-Palette Theme Studio ───────────────── */}
        <section className="glass-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-accent)'
              }}>
                <PaletteIcon size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700 }}>Appearance & Theme Studio</h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Choose from 8 curated palettes in both Dark and Light modes
                </p>
              </div>
            </div>

            {/* Mode Switcher Buttons */}
            <div style={{
              display: 'flex', background: 'var(--bg-elevated)', padding: 4,
              borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', gap: 4
            }}>
              <button
                type="button"
                className={`btn btn-sm ${theme === 'dark' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setTheme('dark')}
                style={{ padding: '6px 14px' }}
              >
                <Moon size={14} />
                Dark Mode
              </button>
              <button
                type="button"
                className={`btn btn-sm ${theme === 'light' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setTheme('light')}
                style={{ padding: '6px 14px' }}
              >
                <Sun size={14} />
                Light Mode
              </button>
            </div>
          </div>

          {/* ── Cold Palettes ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Snowflake size={13} style={{ color: '#38bdf8' }} /> Cold Color Palettes
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              {PALETTES.filter(p => p.category === 'cold').map(p => (
                <PaletteCard
                  key={p.id}
                  palette={p}
                  active={palette === p.id}
                  theme={theme}
                  onSelect={() => setPalette(p.id)}
                />
              ))}
            </div>
          </div>

          {/* ── Warm Palettes ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Flame size={13} style={{ color: '#f43f5e' }} /> Warm Color Palettes
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              {PALETTES.filter(p => p.category === 'warm').map(p => (
                <PaletteCard
                  key={p.id}
                  palette={p}
                  active={palette === p.id}
                  theme={theme}
                  onSelect={() => setPalette(p.id)}
                />
              ))}
            </div>
          </div>

          {/* ── Special & Default ── */}
          <div>
            <div style={{
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Zap size={13} style={{ color: '#ff6b00' }} /> Special & Classic Palettes
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              {PALETTES.filter(p => p.category === 'orange' || p.category === 'default').map(p => (
                <PaletteCard
                  key={p.id}
                  palette={p}
                  active={palette === p.id}
                  theme={theme}
                  onSelect={() => setPalette(p.id)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ─── 2. User Profile & GitHub Integration ───────────────────────── */}
        <section className="glass-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-accent)'
            }}>
              <UserIcon size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>Account & Integrations</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Manage your user profile and GitHub connection</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* User Profile Info */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)'
            }}>
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name || user.email}
                  style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid var(--accent-1)' }}
                />
              ) : (
                <div className="avatar" style={{ width: 48, height: 48, fontSize: 18 }}>
                  {initial}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{user?.name || 'User'}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{user?.email}</div>
              </div>
            </div>

            {/* GitHub Integration Item */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 20, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-overlay)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: user?.hasGithubToken ? 'var(--success)' : 'var(--text-secondary)'
                }}>
                  <Github size={22} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    GitHub Account
                    {user?.hasGithubToken ? (
                      <span className="badge badge-ready">Connected</span>
                    ) : (
                      <span className="badge badge-error">Not Connected</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {user?.hasGithubToken
                      ? 'Access granted for public & private repositories via OAuth'
                      : 'Connect your GitHub account via Popup to clone private repos'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={`btn ${user?.hasGithubToken ? 'btn-secondary' : 'btn-primary'}`}
                onClick={handleConnectGithub}
                disabled={connecting}
              >
                {connecting ? <span className="spinner" /> : <Github size={14} />}
                {connecting ? 'Connecting...' : user?.hasGithubToken ? 'Reconnect' : 'Connect via Popup'}
              </button>
            </div>
          </div>
        </section>

        {/* ─── 3. Cloud Workspace Storage & Infrastructure ────────────────── */}
        <section className="glass-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-accent)'
            }}>
              <HardDrive size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>Workspace Storage & Cloud Sync</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Permanent persistence via rclone bisync & S3 Cellar</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>LOCAL PATH</div>
              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>/workspaces</div>
            </div>
            <div style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>OBJECT STORAGE</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Clever Cloud Cellar (S3)</div>
            </div>
            <div style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>SYNC ENGINE</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="status-dot ready" /> rclone bisync
              </div>
            </div>
          </div>
        </section>

        {/* ─── 4. Session & Security ──────────────────────────────────────── */}
        <section className="glass-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--danger)'
              }}>
                <Shield size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>Session Control</h2>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Sign out of your account on this browser session</p>
              </div>
            </div>
            <button className="btn btn-danger" onClick={logout}>
              Sign Out
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function PaletteCard({
  palette,
  active,
  theme,
  onSelect,
}: {
  palette: PaletteOption;
  active: boolean;
  theme: 'dark' | 'light';
  onSelect: () => void;
}) {
  const Icon = palette.icon;
  const colors = theme === 'dark' ? palette.colorsDark : palette.colorsLight;
  const accentColor = colors[1];

  return (
    <motion.div
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      style={{
        padding: 16,
        borderRadius: 'var(--radius-lg)',
        background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        border: active ? `2px solid ${accentColor}` : '1px solid var(--border)',
        cursor: 'pointer',
        position: 'relative',
        boxShadow: active ? `0 0 20px ${accentColor}33` : 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 'var(--radius-sm)',
            background: `${accentColor}20`, color: accentColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Icon size={16} />
          </span>
          <span>{palette.name}</span>
        </div>
        {active && (
          <span style={{
            width: 20, height: 20, borderRadius: '50%', background: accentColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
          }}>
            <Check size={13} />
          </span>
        )}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.4 }}>
        {palette.description}
      </p>

      {/* Swatch Preview Chips */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {colors.map((c, i) => (
          <div
            key={i}
            style={{
              flex: i === 0 ? 2 : 1,
              height: 18,
              borderRadius: 4,
              background: c,
              border: '1px solid rgba(0,0,0,0.1)',
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
