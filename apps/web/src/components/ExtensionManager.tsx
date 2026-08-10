import { useEffect, useState } from 'react';
import { Package, Plus, Trash2, Search, Loader2 } from 'lucide-react';
import { api, type Extension } from '../api/client';

interface ExtensionManagerProps {
  projectId: string;
}

export default function ExtensionManager({ projectId }: ExtensionManagerProps) {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [extId, setExtId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchExtensions = async () => {
    setLoading(true);
    try {
      const list = await api.projects.extensions.list(projectId);
      setExtensions(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list extensions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchExtensions(); }, [projectId]);

  const handleInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extId.trim()) return;
    setInstalling(true); setError(''); setSuccess('');
    try {
      await api.projects.extensions.install(projectId, extId.trim());
      setSuccess(`Extension ${extId} installed successfully`);
      setExtId('');
      await fetchExtensions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async (id: string) => {
    try {
      await api.projects.extensions.uninstall(projectId, id);
      setExtensions(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uninstall failed');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Install form */}
      <div className="glass-card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
          <Plus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Install Extension
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Enter an Open VSX or VS Code marketplace extension ID (e.g. <code>esbenp.prettier-vscode</code>)
        </p>

        {error && <div className="alert alert-error mb-4">{error}</div>}
        {success && <div className="alert alert-success mb-4">{success}</div>}

        <form onSubmit={handleInstall} style={{ display: 'flex', gap: 12 }}>
          <input
            id="extension-id-input"
            type="text"
            className="input"
            placeholder="publisher.extension-name"
            value={extId}
            onChange={e => setExtId(e.target.value)}
            disabled={installing}
            style={{ flex: 1 }}
          />
          <button
            id="install-ext-btn"
            type="submit"
            className="btn btn-primary"
            disabled={installing || !extId.trim()}
          >
            {installing ? <Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Plus size={14} />}
            {installing ? 'Installing...' : 'Install'}
          </button>
        </form>
      </div>

      {/* Installed extensions */}
      <div className="glass-card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
          <Package size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Installed Extensions ({extensions.length})
        </h3>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <span className="spinner" />
          </div>
        ) : extensions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
            No extensions installed yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {extensions.map(ext => (
              <div
                key={ext.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', background: 'var(--bg-overlay)',
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Package size={14} style={{ color: 'var(--text-accent)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{ext.id}</span>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleUninstall(ext.id)}
                  title="Uninstall"
                >
                  <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
