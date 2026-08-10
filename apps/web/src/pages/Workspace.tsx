import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Download, X } from 'lucide-react';
import { api } from '../api/client';
import { useHermesStore } from '../store/hermesStore';
import HermesIcon from '../components/hermes/HermesIcon';

export default function Workspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [workspaceUrl, setWorkspaceUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { attachWorkspace, detachWorkspace } = useHermesStore();

  useEffect(() => {
    if (!id) return;
    api.projects.openWorkspace(id)
      .then(({ url }) => {
        setWorkspaceUrl(url);
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to start workspace');
        setLoading(false);
      });
  }, [id]);

  // Bind Hermes workspace context when workspace is active
  useEffect(() => {
    if (!id) return;
    attachWorkspace({
      projectId: id,
      workspaceRoot: `/workspaces/${id}`,
    });
    return () => detachWorkspace(); // detach on unmount / navigation
  }, [id]);

  return (
    <div className="workspace-page">
      <div className="workspace-toolbar">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate(`/projects/${id}`)}
          title="Back to project"
        >
          <ArrowLeft size={14} />
        </button>

        <div style={{
          flex: 1, fontSize: 13, color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>
          ⚡ CleverCoder IDE — {id}
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => iframeRef.current?.contentWindow?.location.reload()}
          title="Reload IDE"
        >
          <RefreshCw size={13} />
        </button>

        <a
          className="btn btn-secondary btn-sm"
          href={id ? api.projects.archiveUrl(id) : '#'}
          download
          title="Download project"
        >
          <Download size={13} />
        </a>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.2))',
            border: '1px solid rgba(124,58,237,0.4)',
            color: 'var(--text-primary)', fontWeight: 600, fontSize: 12,
          }}
          onClick={async () => {
            try {
              const res = await api.hermes.launchWebUI(id);
              if (res?.url) {
                window.open(res.url, '_blank', 'noopener,noreferrer');
              }
            } catch (err) {
              console.error('[Hermes] Failed to launch WebUI:', err);
            }
          }}
          title="Open standalone Hermes WebUI pre-bound to this workspace"
        >
          <span>🤖</span>
          <span>Hermes WebUI</span>
          <span>↗</span>
        </button>

        {/* Hermes AI Trigger */}
        <HermesIcon /></div>

      {loading && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          color: 'var(--text-secondary)',
        }}>
          <span className="spinner spinner-lg" />
          <p>Starting workspace...</p>
        </div>
      )}

      {error && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="alert alert-error" style={{ maxWidth: 400 }}>
            <X size={16} />
            {error}
          </div>
        </div>
      )}

      {workspaceUrl && !loading && (
        <iframe
          ref={iframeRef}
          id="workspace-iframe"
          src={workspaceUrl}
          className="workspace-iframe"
          allow="clipboard-read; clipboard-write"
          title="CleverCoder IDE"
        />
      )}
    </div>
  );
}
