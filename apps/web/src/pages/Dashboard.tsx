import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, RefreshCw, Github, Code2, Download, Trash2, Lock, Unlock, ExternalLink } from 'lucide-react';
import { useProjectStore, useAuthStore } from '../store';
import { api, type Project, type GithubRepo, openGithubOAuthPopup, createProjectSSE } from '../api/client';
import { formatDistanceToNow } from 'date-fns';

export default function Dashboard() {
  const { projects, isLoading, fetchProjects, addProject, removeProject } = useProjectStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { fetchProjects(); }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this project and all its files?')) return;
    try {
      await api.projects.delete(id);
      removeProject(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleDownload = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    window.open(api.projects.archiveUrl(id), '_blank');
  };

  const statusBadge = (status: Project['status']) => {
    const map: Record<string, string> = {
      ready: 'badge-ready', cloning: 'badge-cloning',
      error: 'badge-error', creating: 'badge-creating', archived: 'badge-archived',
    };
    return <span className={`badge ${map[status] ?? ''}`}>
      <span className={`status-dot ${status}`} />
      {status}
    </span>;
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Workspaces</h1>
          <p className="page-subtitle">Manage your public & private GitHub projects and cloud IDEs</p>
        </div>
        <div className="flex gap-3">
          <button className="btn btn-secondary" onClick={fetchProjects} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            Refresh
          </button>
          <button id="add-project-btn" className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={16} />
            Add Project
          </button>
        </div>
      </div>

      {isLoading && projects.length === 0 ? (
        <div className="flex items-center justify-content-center" style={{ padding: '80px', justifyContent: 'center' }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">🚀</span>
          <h3>No projects yet</h3>
          <p>Add your first public or private GitHub project to get started with your cloud coding workspace.</p>
          <button className="btn btn-primary btn-lg" onClick={() => setShowAddModal(true)}>
            <Plus size={18} />
            Add Your First Project
          </button>
        </div>
      ) : (
        <motion.div className="grid-3" layout>
          <AnimatePresence>
            {projects.map((project) => (
              <motion.div
                key={project.id}
                className="glass-card project-card"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.2 }}
              >
                <div
                  className="project-card-body-clickable"
                  onClick={() => navigate(`/projects/${project.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="project-card-header">
                    <div>
                      <div className="project-card-title">{project.name}</div>
                      <div className="project-card-repo">
                        <Github size={12} />
                        {project.repoUrl.replace('https://github.com/', '')}
                      </div>
                    </div>
                    {statusBadge(project.status)}
                  </div>

                  {project.description && (
                    <p className="project-card-desc">{project.description}</p>
                  )}
                </div>

                <div className="project-card-footer" onClick={(e) => e.stopPropagation()}>
                  <span className="project-card-meta">
                    {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                  </span>
                  <div className="project-card-actions" onClick={(e) => e.stopPropagation()}>
                    {project.status === 'ready' && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open(`/workspace/${project.id}`, '_blank');
                        }}
                      >
                        <Code2 size={12} />
                        Open IDE
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDownload(e, project.id);
                      }}
                      title="Download zip"
                    >
                      <Download size={12} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(e, project.id);
                      }}
                      title="Delete project"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {showAddModal && (
        <AddProjectModal
          onClose={() => setShowAddModal(false)}
          onAdded={(p) => { addProject(p); setShowAddModal(false); }}
        />
      )}
    </>
  );
}

function AddProjectModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (p: Project) => void;
}) {
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [description, setDescription] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [userRepos, setUserRepos] = useState<GithubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; stage: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchUserRepos = async () => {
    setLoadingRepos(true);
    try {
      const repos = await api.projects.listGithubRepos();
      setUserRepos(repos);
    } catch {
      // ignore if not connected
    } finally {
      setLoadingRepos(false);
    }
  };

  useEffect(() => {
    fetchUserRepos();
  }, []);

  const handleConnectGithubPopup = () => {
    openGithubOAuthPopup(async () => {
      try {
        const u = await api.auth.me();
        setUser(u);
        await fetchUserRepos();
      } catch {
        setError('GitHub connection failed');
      }
    });
  };

  const handleSelectRepo = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedUrl = e.target.value;
    if (!selectedUrl) return;
    const selected = userRepos.find(r => r.htmlUrl === selectedUrl || r.cloneUrl === selectedUrl);
    if (selected) {
      setRepoUrl(selected.htmlUrl);
      setName(selected.name);
      setDescription(selected.description ?? '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const project = await createProjectSSE(
        name, repoUrl, description, githubToken || undefined,
        (pct, stage) => setProgress({ pct, stage }),
      );
      onAdded(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clone failed');
    } finally {
      setLoading(false);
    }
  };

  const handleUrlChange = (url: string) => {
    setRepoUrl(url);
    if (!name) {
      const match = url.match(/github\.com\/[^/]+\/([^/]+)/);
      if (match) setName(match[1].replace('.git', ''));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 540 }}
      >
        <div className="modal-header">
          <h2 className="modal-title">Add GitHub Project</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {error && <div className="alert alert-error mb-4">{error}</div>}

        {/* GitHub Connection Banner */}
        <div style={{
          padding: '12px 16px',
          background: 'var(--bg-overlay)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Github size={18} style={{ color: user?.hasGithubToken ? 'var(--success)' : 'var(--text-secondary)' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {user?.hasGithubToken ? 'GitHub Account Connected' : 'Connect GitHub via Popup'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {user?.hasGithubToken ? 'Private repos automatically supported' : 'Grant access to private & public repositories'}
              </div>
            </div>
          </div>
          <button
            type="button"
            className={`btn ${user?.hasGithubToken ? 'btn-secondary' : 'btn-primary'} btn-sm`}
            onClick={handleConnectGithubPopup}
          >
            {user?.hasGithubToken ? 'Reconnect' : 'Connect Popup'}
          </button>
        </div>

        {/* Pick from user's GitHub Repos if connected */}
        {userRepos.length > 0 && (
          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Select from Your GitHub Repositories</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{userRepos.length} repos found</span>
            </label>
            <select
              className="input"
              onChange={handleSelectRepo}
              disabled={loading || loadingRepos}
              defaultValue=""
            >
              <option value="" disabled>-- Pick a repository (public or private) --</option>
              {userRepos.map(r => (
                <option key={r.id} value={r.htmlUrl}>
                  {r.isPrivate ? '🔒 ' : '🌐 '}{r.fullName}
                </option>
              ))}
            </select>
          </div>
        )}

        {loading && progress && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <span>{progress.stage}</span>
              <span>{progress.pct}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${progress.pct}%` }} />
            </div>
          </div>
        )}

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">GitHub Repo URL *</label>
            <input
              id="repo-url"
              type="url"
              className="input"
              placeholder="https://github.com/owner/private-repo"
              value={repoUrl}
              onChange={e => handleUrlChange(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Project Name *</label>
            <input
              id="project-name"
              type="text"
              className="input"
              placeholder="my-project"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Description</label>
            <input
              type="text"
              className="input"
              placeholder="Optional description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={loading}
            />
          </div>

          {!user?.hasGithubToken && (
            <div className="input-group">
              <label className="input-label">Personal Access Token (for Private Repos)</label>
              <input
                type="password"
                className="input"
                placeholder="ghp_... (or connect GitHub above)"
                value={githubToken}
                onChange={e => setGithubToken(e.target.value)}
                disabled={loading}
              />
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button id="clone-btn" type="submit" className="btn btn-primary" disabled={loading || !repoUrl || !name}>
              {loading ? <span className="spinner" /> : <Github size={14} />}
              {loading ? 'Cloning...' : 'Clone Workspace'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
