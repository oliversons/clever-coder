// API client — typed fetch wrappers

const BASE = '/api/v1';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

export type Palette = 'default' | 'ocean' | 'nordic' | 'emerald' | 'rose' | 'amber' | 'volcanic' | 'orange';
export type ThemeMode = 'dark' | 'light';

export interface UserSettings {
  theme?: ThemeMode;
  palette?: Palette;
  [key: string]: unknown;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  hasGithubToken?: boolean;
  settings?: UserSettings;
}

export const api = {
  auth: {
    register: (email: string, password: string, name: string) =>
      request<{ accessToken: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
      }),
    login: (email: string, password: string) =>
      request<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => request<UserProfile>('/auth/me'),
    updateSettings: (settings: Partial<UserSettings>) =>
      request<{ settings: UserSettings }>('/auth/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    githubStartUrl: () => '/api/v1/auth/github/start',
  },

  projects: {
    list: () => request<Project[]>('/projects'),
    listGithubRepos: () => request<GithubRepo[]>('/projects/github/repos'),
    get: (id: string) => request<Project>(`/projects/${id}`),
    update: (id: string, data: Partial<Project>) =>
      request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/projects/${id}`, { method: 'DELETE' }),
    pull: (id: string) => request(`/projects/${id}/pull`, { method: 'POST' }),
    sync: (id: string) => request(`/projects/${id}/sync`, { method: 'POST' }),
    status: (id: string) => request<GitStatus>(`/projects/${id}/status`),
    openWorkspace: (id: string) =>
      request<{ projectId: string; port: number; url: string }>(`/projects/${id}/open`),
    runCommand: (id: string, command: string) =>
      request<{ exitCode: number; output: string; duration: number }>(
        `/projects/${id}/command`,
        { method: 'POST', body: JSON.stringify({ command }) },
      ),
    extensions: {
      list: (id: string) => request<Extension[]>(`/projects/${id}/extensions`),
      install: (id: string, extensionId: string) =>
        request(`/projects/${id}/extensions`, { method: 'POST', body: JSON.stringify({ extensionId }) }),
      uninstall: (id: string, extId: string) =>
        request(`/projects/${id}/extensions/${extId}`, { method: 'DELETE' }),
    },
    archiveUrl: (id: string) => `/api/v1/projects/${id}/archive`,
  },
};

// Types
export interface Project {
  id: string;
  userId: string;
  name: string;
  repoUrl: string;
  description?: string;
  defaultBranch?: string;
  status: 'creating' | 'cloning' | 'ready' | 'error' | 'archived';
  sizeBytes?: number;
  lastSyncedAt?: string;
  codeServerPort?: number;
  createdAt: string;
  updatedAt: string;
}

export interface GithubRepo {
  id: number;
  name: string;
  fullName: string;
  isPrivate: boolean;
  htmlUrl: string;
  cloneUrl: string;
  description: string | null;
  updatedAt: string;
}

export interface GitStatus {
  branch?: string;
  modified: string[];
  not_added: string[];
  created: string[];
  deleted: string[];
  recentCommits: Array<{ hash: string; message: string; date: string; author_name: string }>;
  sync: { lastOkAt?: string; lastError?: string };
}

export interface Extension {
  id: string;
  path: string;
}

// OAuth Popup helper
export function openGithubOAuthPopup(onSuccess?: () => void) {
  const width = 600;
  const height = 700;
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;

  window.open(
    api.auth.githubStartUrl(),
    'github_oauth_popup',
    `width=${width},height=${height},top=${top},left=${left},status=no,menubar=no,toolbar=no`,
  );

  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type === 'GITHUB_AUTH_SUCCESS') {
      window.removeEventListener('message', handleMessage);
      onSuccess?.();
    }
  };

  window.addEventListener('message', handleMessage);
}

// SSE helper for project creation
export function createProjectSSE(
  name: string,
  repoUrl: string,
  description?: string,
  githubToken?: string,
  onProgress?: (pct: number, stage: string) => void,
): Promise<Project> {
  return new Promise(async (resolve, reject) => {
    const res = await fetch('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, repoUrl, description, githubToken }),
    });

    if (!res.ok || !res.body) {
      reject(new Error('Failed to start clone'));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        const data = JSON.parse(line.slice(6));
        if (data.error) { reject(new Error(data.error)); return; }
        if (data.done) { resolve(data.project); return; }
        if (data.pct !== undefined) onProgress?.(data.pct, data.stage);
      }
    }

    reject(new Error('Stream ended unexpectedly'));
  });
}
