import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Code2, Terminal, Download, RefreshCw, GitBranch,
  GitCommit, Package, RotateCcw
} from 'lucide-react';
import { api, type Project, type GitStatus } from '../api/client';
import { formatDistanceToNow } from 'date-fns';
import TerminalPanel from '../components/TerminalPanel';
import ExtensionManager from '../components/ExtensionManager';

type Tab = 'overview' | 'terminal' | 'extensions';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.projects.get(id), api.projects.status(id)])
      .then(([p, s]) => { setProject(p); setStatus(s); })
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSync = async () => {
    if (!id) return;
    setSyncing(true);
    try { await api.projects.sync(id); } finally { setSyncing(false); }
  };

  const handlePull = async () => {
    if (!id) return;
    setPulling(true);
    try {
      await api.projects.pull(id);
      const s = await api.projects.status(id);
      setStatus(s);
    } finally { setPulling(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center" style={{ justifyContent: 'center', padding: 80 }}>
        <span className="spinner spinner-lg" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-4">
          <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="page-title">{project.name}</h1>
            <p className="page-subtitle" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {project.repoUrl}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={handlePull} disabled={pulling}>
            {pulling ? <span className="spinner" /> : <RotateCcw size={13} />}
            Pull
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleSync} disabled={syncing}>
            {syncing ? <span className="spinner" /> : <RefreshCw size={13} />}
            Sync
          </button>
          <a
            className="btn btn-secondary btn-sm"
            href={api.projects.archiveUrl(project.id)}
            download
          >
            <Download size={13} />
            Download
          </a>
          {project.status === 'ready' && (
            <button
              id="open-ide-btn"
              className="btn btn-primary"
              onClick={() => window.open(`/workspace/${project.id}`, '_blank')}
            >
              <Code2 size={14} />
              Open IDE
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {(['overview', 'terminal', 'extensions'] as Tab[]).map(t => (
          <button
            key={t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'overview' && <GitBranch size={13} style={{ marginRight: 4, display: 'inline' }} />}
            {t === 'terminal' && <Terminal size={13} style={{ marginRight: 4, display: 'inline' }} />}
            {t === 'extensions' && <Package size={13} style={{ marginRight: 4, display: 'inline' }} />}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && status && (
        <div className="flex gap-6 flex-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Git Status */}
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>
              <GitBranch size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Git Status
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Branch</span>
                <code style={{ color: 'var(--text-accent)' }}>{status.branch ?? 'main'}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)' }}>Modified</span>
                <span>{status.modified.length + status.not_added.length} files</span>
              </div>
            </div>
            {status.modified.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {status.modified.slice(0, 5).map(f => (
                  <div key={f} style={{ fontSize: 12, color: 'var(--warning)', fontFamily: 'var(--font-mono)', padding: '2px 0' }}>
                    M {f}
                  </div>
                ))}
                {status.modified.length > 5 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    +{status.modified.length - 5} more...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sync Status */}
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>
              <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Sync Status
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Last synced</span>
                <span>{status.sync.lastOkAt
                  ? formatDistanceToNow(new Date(status.sync.lastOkAt), { addSuffix: true })
                  : 'Never'}</span>
              </div>
              {status.sync.lastError && (
                <div className="alert alert-error" style={{ fontSize: 12, marginTop: 8 }}>
                  {status.sync.lastError}
                </div>
              )}
            </div>
          </div>

          {/* Recent Commits */}
          {status.recentCommits.length > 0 && (
            <div className="glass-card" style={{ padding: 24, gridColumn: '1 / -1' }}>
              <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>
                <GitCommit size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Recent Commits
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {status.recentCommits.map(c => (
                  <div key={c.hash} style={{ display: 'flex', gap: 12, fontSize: 13, alignItems: 'center' }}>
                    <code style={{ fontSize: 11, opacity: 0.6, width: 60, flexShrink: 0 }}>
                      {c.hash.slice(0, 7)}
                    </code>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.message}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
                      {c.author_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'terminal' && id && <TerminalPanel projectId={id} />}
      {tab === 'extensions' && id && <ExtensionManager projectId={id} />}
    </motion.div>
  );
}
