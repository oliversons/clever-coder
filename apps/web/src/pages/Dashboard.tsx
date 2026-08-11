import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RiAddLine,
  RiRefreshLine,
  RiGithubLine,
  RiCodeSSlashLine,
  RiDownload2Line,
  RiDeleteBin6Line,
  RiCloseLine,
  RiAlertLine,
  RiFolder3Line,
  RiFlashlightLine,
  RiExternalLinkLine
} from 'react-icons/ri';
import { useProjectStore, useAuthStore } from '../store';
import { api, type Project, type GithubRepo, openGithubOAuthPopup, createProjectSSE } from '../api/client';
import { formatDistanceToNow } from 'date-fns';

export default function Dashboard() {
  const { projects, isLoading, fetchProjects, addProject, removeProject } = useProjectStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { fetchProjects(); }, []);

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    try {
      await api.projects.delete(projectToDelete.id);
      removeProject(projectToDelete.id);
      setProjectToDelete(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
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
          <p className="page-subtitle">Manage your public &amp; private GitHub projects and cloud IDEs</p>
        </div>
        <div className="flex gap-3">
          <button className="btn btn-secondary" onClick={fetchProjects} disabled={isLoading}>
            <RiRefreshLine size={16} className={isLoading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button id="add-project-btn" className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <RiAddLine size={18} />
            <span>Add Project</span>
          </button>
        </div>
      </div>

      {isLoading && projects.length === 0 ? (
        <div className="flex items-center" style={{ justifyContent: 'center', padding: 80 }}>
          <span className="spinner spinner-lg" />
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <RiFlashlightLine size={32} style={{ color: 'var(--accent-1)' }} />
          </div>
          <h3>No projects yet</h3>
          <p>Add your first public or private GitHub project to get started with your cloud coding workspace.</p>
          <button className="btn btn-primary btn-lg" onClick={() => setShowAddModal(true)}>
            <RiAddLine size={18} />
            <span>Add Your First Project</span>
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
                  className="project-card-main"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <div className="project-card-header">
                    <div>
                      <div className="project-card-title">{project.name}</div>
                      <div className="project-card-repo">
                        <RiGithubLine size={14} />
                        <span>{project.repoUrl.replace('https://github.com/', '')}</span>
                      </div>
                    </div>
                    {statusBadge(project.status)}
                  </div>

                  {project.description && (
                    <p className="project-card-desc">{project.description}</p>
                  )}
                </div>

                <div className="project-card-footer">
                  <span className="project-card-meta">
                    {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                  </span>
                  <div className="project-card-actions">
                    {project.status === 'ready' && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open(`/workspace/${project.id}`, '_blank');
                        }}
                        title="Open IDE in new tab"
                      >
                        <RiCodeSSlashLine size={14} />
                        <span>Open IDE</span>
                        <RiExternalLinkLine size={12} />
                      </button>
                    )}
                    <a
                      href={api.projects.archiveUrl(project.id)}
                      download={`${project.name}.zip`}
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => e.stopPropagation()}
                      title="Download zip"
                    >
                      <RiDownload2Line size={14} />
                    </a>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setProjectToDelete(project);
                      }}
                      title="Delete project"
                    >
                      <RiDeleteBin6Line size={14} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>
        {projectToDelete && (
          <div className="modal-overlay" onClick={() => !isDeleting && setProjectToDelete(null)}>
            <motion.div
              className="modal"
              style={{ maxWidth: 460 }}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                    background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)'
                  }}>
                    <RiDeleteBin6Line size={18} />
                  </div>
                  <h2 className="modal-title" style={{ fontSize: 18, fontWeight: 700 }}>Delete Project</h2>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => !isDeleting && setProjectToDelete(null)}
                  disabled={isDeleting}
                >
                  <RiCloseLine size={18} />
                </button>
              </div>

              <div style={{ marginBottom: 20 }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
                  Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{projectToDelete.name}</strong>?
                </p>
                <div style={{
                  padding: '12px 14px', borderRadius: 'var(--radius-md)',
                  background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
                  fontSize: 13, color: 'var(--danger)', display: 'flex', alignItems: 'flex-start', gap: 8
                }}>
                  <RiAlertLine size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    This will permanently delete the project workspace, code-server data, and remove all backups from Cellar object storage. This action cannot be undone.
                  </span>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setProjectToDelete(null)}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={isDeleting}
                  onClick={handleDeleteConfirm}
                >
                  {isDeleting ? <span className="spinner" /> : <RiDeleteBin6Line size={14} />}
                  <span>{isDeleting ? 'Deleting...' : 'Delete Project'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
  const [repoError, setRepoError] = useState('');
  const [progress, setProgress] = useState<{ pct: number; stage: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchUserRepos = async () => {
    if (!user?.hasGithubToken) return;
    setLoadingRepos(true);
    setRepoError('');
    try {
      const repos = await api.projects.listGithubRepos();
      setUserRepos(repos);
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : 'Failed to fetch repositories');
    } finally {
      setLoadingRepos(false);
    }
  };

  useEffect(() => {
    if (user?.hasGithubToken) {
      fetchUserRepos();
    }
  }, [user?.hasGithubToken]);

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
            <RiGithubLine size={20} style={{ color: user?.hasGithubToken ? 'var(--success)' : 'var(--text-secondary)' }} />
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

        {/* Select Connected Repository (always rendered when connected) */}
        {user?.hasGithubToken && (
          <div className="input-group" style={{ marginBottom: 20 }}>
            <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Select Connected Repository</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {loadingRepos ? 'Loading...' : `${userRepos.length} repos found`}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={fetchUserRepos}
                  disabled={loadingRepos}
                  title="Refresh Repositories"
                  style={{ padding: '2px 6px', fontSize: 11 }}
                >
                  <RiRefreshLine size={14} className={loadingRepos ? 'spin' : ''} />
                </button>
              </div>
            </label>

            {repoError ? (
              <div style={{ fontSize: 12, color: 'var(--danger)', padding: '6px 0' }}>
                ⚠️ {repoError}. Please click Reconnect above.
              </div>
            ) : (
              <select
                className="input"
                onChange={handleSelectRepo}
                disabled={loading || loadingRepos}
                value={userRepos.find(r => r.htmlUrl === repoUrl || r.cloneUrl === repoUrl)?.htmlUrl || ''}
                style={{
                  background: 'var(--bg-elevated)',
                  borderColor: repoUrl ? 'var(--accent)' : 'var(--border)',
                  fontWeight: 500
                }}
              >
                <option value="">
                  {loadingRepos ? '⏳ Loading your repositories...' : userRepos.length > 0 ? '-- Select a Repository from your GitHub Account --' : '-- No Repositories Found --'}
                </option>
                {userRepos.map(r => (
                  <option key={r.id} value={r.htmlUrl}>
                    {r.isPrivate ? '🔒 ' : '🌐 '} {r.fullName} {r.isPrivate ? '(Private)' : '(Public)'}
                  </option>
                ))}
              </select>
            )}
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
              {loading ? <span className="spinner" /> : <RiGithubLine size={16} />}
              <span>{loading ? 'Cloning...' : 'Clone Workspace'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
