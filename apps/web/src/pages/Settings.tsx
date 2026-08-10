import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, Github, Shield, Database, User as UserIcon, Check, ExternalLink, HardDrive, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../store';
import { useThemeStore } from '../store/themeStore';
import { api, openGithubOAuthPopup } from '../api/client';

export default function Settings() {
  const { user, setUser, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
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
        {/* ─── 1. Appearance / Theme Switcher ─────────────────────────────── */}
        <section className="glass-card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-accent)'
            }}>
              {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>Appearance & Theme</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Choose your preferred color theme</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {/* Dark Theme Card */}
            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setTheme('dark')}
              style={{
                padding: 20,
                borderRadius: 'var(--radius-lg)',
                background: '#0d1117',
                border: theme === 'dark' ? '2px solid var(--accent-1)' : '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                position: 'relative',
                boxShadow: theme === 'dark' ? '0 0 20px rgba(124,58,237,0.25)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f0f4ff', fontWeight: 600 }}>
                  <Moon size={18} style={{ color: '#a78bfa' }} />
                  Dark Theme
                </div>
                {theme === 'dark' && (
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                  }}>
                    <Check size={14} />
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: '#8b95b0', marginBottom: 16 }}>
                Deep dark mode with electric purple and cyan accents. Perfect for night coding.
              </p>
              {/* Preview bar */}
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ width: 24, height: 16, borderRadius: 4, background: '#080b14', border: '1px solid #1e2535' }} />
                <div style={{ width: 24, height: 16, borderRadius: 4, background: '#161b27' }} />
                <div style={{ width: 24, height: 16, borderRadius: 4, background: '#7c3aed' }} />
                <div style={{ width: 24, height: 16, borderRadius: 4, background: '#06b6d4' }} />
              </div>
            </motion.div>

            {/* Light Theme Card */}
            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setTheme('light')}
              style={{
                padding: 20,
                borderRadius: 'var(--radius-lg)',
                background: '#ffffff',
                border: theme === 'light' ? '2px solid var(--accent-1)' : '1px solid #e2e8f0',
                cursor: 'pointer',
                position: 'relative',
                boxShadow: theme === 'light' ? '0 0 20px rgba(109,40,217,0.2)' : '0 2px 8px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#0f172a', fontWeight: 600 }}>
                  <Sun size={18} style={{ color: '#d97706' }} />
                  Light Theme
                </div>
                {theme === 'light' && (
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                  }}>
                    <Check size={14} />
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: '#475569', marginBottom: 16 }}>
                Clean, high-contrast light theme with rich typography and crisp borders.
              </p>
              {/* Preview bar */}
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ width: 24, height: 16, borderRadius: 4, background: '#f8fafc', border: '1px solid #cbd5e1' }} />
                <div style={{ width: 24, height: 16, borderRadius: 4, background: '#f1f5f9' }} />
                <div style={{ width: 24, height: 16, borderRadius: 4, background: '#6d28d9' }} />
                <div style={{ width: 24, height: 16, borderRadius: 4, background: '#0891b2' }} />
              </div>
            </motion.div>
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
