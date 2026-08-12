// API client — typed fetch wrappers

const BASE = '/api/v1';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

export type Palette =
  | 'default'
  | 'gold_elegance'
  | 'fiery_ocean'
  | 'crimson_twilight'
  | 'oceanic_wave'
  | 'forest_sage'
  | 'espresso_silk'
  | 'blood_water'
  | 'dusk_mauve'
  | 'sunset_velvet'
  | 'lavender_dream'
  | 'deep_azure_jade'
  | 'sapphire_quicksand'
  | 'midnight_violet_seashell'
  | 'coral_turquoise'
  | 'blush_pink'
  | 'teal_harmony'
  | 'ocean'
  | 'nordic'
  | 'emerald'
  | 'rose'
  | 'amber'
  | 'volcanic'
  | 'orange';
export type ThemeMode = 'dark' | 'light';
export type ThemeStyle =
  | 'mui_material'
  | 'material_clean'
  | 'glassmorphism'
  | 'neo_brutalism'
  | 'soft_pill'
  | 'minimal_flat';

export interface UserSettings {
  theme?: ThemeMode;
  palette?: Palette;
  themeStyle?: ThemeStyle;
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
    saveGithubToken: (token: string) =>
      request<{ ok: boolean; hasGithubToken: boolean }>('/auth/github/token', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
    disconnectGithub: () =>
      request<{ ok: boolean; hasGithubToken: boolean }>('/auth/github/token', {
        method: 'DELETE',
      }),
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

  hermes: {
    launchWebUI: (projectId?: string) =>
      request<{ success: boolean; url: string; port: number; message: string }>(
        `/hermes/webui/launch${projectId ? `?projectId=${projectId}` : ''}`,
      ),
    getWebUIStatus: () =>
      request<{ running: boolean; port: number }>('/hermes/webui/status'),
    getGatewayStatus: () =>
      request<GatewayStatus>('/hermes/gateway/status'),
    startGateway: () =>
      request<{ success: boolean; message: string; pid?: number }>('/hermes/gateway/start', { method: 'POST' }),
    stopGateway: () =>
      request<{ success: boolean; message: string }>('/hermes/gateway/stop', { method: 'POST' }),
    restartGateway: () =>
      request<{ success: boolean; message: string; pid?: number }>('/hermes/gateway/restart', { method: 'POST' }),
    getGatewayLogs: () =>
      request<{ logs: string[]; logPath: string; active: boolean }>('/hermes/gateway/logs'),
    listCronJobs: () =>
      request<{ jobs: CronJobItem[] }>('/hermes/cron/jobs'),
    createCronJob: (job: Partial<CronJobItem>) =>
      request<{ success: boolean; job: CronJobItem }>('/hermes/cron/jobs', {
        method: 'POST',
        body: JSON.stringify(job),
      }),
    toggleCronJob: (id: string, enabled: boolean) =>
      request<{ success: boolean; job: CronJobItem }>(`/hermes/cron/jobs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    deleteCronJob: (id: string) =>
      request<{ success: boolean }>(`/hermes/cron/jobs/${id}`, {
        method: 'DELETE',
      }),
    runCronJob: (id: string) =>
      request<{ success: boolean; message: string; output?: string }>(`/hermes/cron/jobs/${id}/run`, {
        method: 'POST',
      }),
    // ── Dynamic Models Discovery & Search ──
    getAvailableModels: (params?: { provider?: string; baseUrl?: string; apiKey?: string; search?: string }) => {
      const qs = new URLSearchParams();
      if (params?.provider) qs.set('provider', params.provider);
      if (params?.baseUrl) qs.set('baseUrl', params.baseUrl);
      if (params?.apiKey) qs.set('apiKey', params.apiKey);
      if (params?.search) qs.set('search', params.search);
      const str = qs.toString();
      return request<{ success: boolean; count: number; models: HermesModelItem[]; error?: string }>(
        `/hermes/models${str ? `?${str}` : ''}`
      );
    },
    testLlmPrompt: (data: { provider?: string; baseUrl?: string; apiKey?: string; model?: string; prompt?: string; temperature?: number }) =>
      request<{
        ok: boolean;
        output?: string;
        latencyMs?: number;
        promptTokens?: number;
        completionTokens?: number;
        tokensPerSec?: number;
        model?: string;
        message?: string;
      }>('/hermes/settings/test-prompt', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    // ── Vision & Image Generation ──
    getVisionImageSettings: () =>
      request<HermesVisionImageSettings>('/hermes/vision-image'),
    saveVisionImageSettings: (data: Partial<HermesVisionImageSettings>) =>
      request<{ success: boolean; settings: HermesVisionImageSettings }>('/hermes/vision-image', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    discoverSatModels: (baseUrl?: string, apiKey?: string) => {
      const params = new URLSearchParams();
      if (baseUrl) params.set('baseUrl', baseUrl);
      if (apiKey) params.set('apiKey', apiKey);
      const qs = params.toString();
      return request<SatModelDiscoveryResult>(`/hermes/sat-models${qs ? `?${qs}` : ''}`);
    },
    testVision: (prompt: string, image: string, settings?: Partial<HermesVisionImageSettings>) =>
      request<{
        success: boolean;
        model: string;
        latencyMs: number;
        analysis?: string;
        error?: string;
      }>('/hermes/vision/test', {
        method: 'POST',
        body: JSON.stringify({ prompt, image, settings }),
      }),
    testImageGen: (prompt: string, settings?: Partial<HermesVisionImageSettings>) =>
      request<{
        success: boolean;
        model: string;
        latencyMs: number;
        imageUrl?: string;
        prompt?: string;
        error?: string;
      }>('/hermes/image-gen/test', {
        method: 'POST',
        body: JSON.stringify({ prompt, settings }),
      }),
    // ── Web Search & Extract ──
    getWebSearchSettings: () =>
      request<HermesWebSearchSettings>('/hermes/web-search'),
    saveWebSearchSettings: (data: Partial<HermesWebSearchSettings>) =>
      request<{ success: boolean; settings: HermesWebSearchSettings }>('/hermes/web-search', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    testWebSearch: (query: string, settings?: Partial<HermesWebSearchSettings>) =>
      request<{
        success: boolean;
        backend: string;
        latencyMs: number;
        count?: number;
        results?: Array<{ title: string; url: string; snippet: string; engine: string }>;
        rawOutput?: string;
        error?: string;
      }>('/hermes/web-search/test', {
        method: 'POST',
        body: JSON.stringify({ query, settings }),
      }),
    // ── Browser Automation ──
    getBrowserSettings: () =>
      request<HermesBrowserSettings>('/hermes/browser'),
    saveBrowserSettings: (data: Partial<HermesBrowserSettings>) =>
      request<HermesBrowserSettings>('/hermes/browser', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    testBrowserConnection: (data: Partial<HermesBrowserSettings>) =>
      request<{ ok: boolean; message: string; latencyMs?: number; details?: any }>('/hermes/browser/test', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getBrowserSyncStatus: () =>
      request<HermesSyncStatus>('/hermes/browser/sync-status'),
    forceResyncBrowserConfig: () =>
      request<{ success: boolean; status: HermesSyncStatus }>('/hermes/browser/sync-now', {
        method: 'POST',
      }),
    // ── Messaging Gateway ──
    getMessagingSettings: () =>
      request<HermesMessagingSettings>('/hermes/messaging'),
    saveMessagingSettings: (data: Partial<HermesMessagingSettings>) =>
      request<{ success: boolean; message: string; settings: HermesMessagingSettings }>('/hermes/messaging', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    testTelegramToken: (token: string) =>
      request<{ ok: boolean; botUsername?: string; botName?: string; botId?: number; message: string; latencyMs?: number }>(
        '/hermes/messaging/test-telegram',
        { method: 'POST', body: JSON.stringify({ token }) },
      ),
    testWhatsAppCredentials: (accessToken: string, phoneNumberId: string) =>
      request<{ ok: boolean; message: string; latencyMs?: number; displayPhoneNumber?: string }>(
        '/hermes/messaging/test-whatsapp',
        { method: 'POST', body: JSON.stringify({ accessToken, phoneNumberId }) },
      ),
    testEmailConnection: (imapHost: string, imapPort: number) =>
      request<{ ok: boolean; message: string; latencyMs?: number }>(
        '/hermes/messaging/test-email',
        { method: 'POST', body: JSON.stringify({ imapHost, imapPort }) },
      ),
    getMessagingStatus: () =>
      request<{ configured: { telegram: boolean; whatsapp: boolean; email: boolean; webhooks: boolean } }>(
        '/hermes/messaging/status',
      ),
  },
};

export interface HermesModelItem {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  provider?: string;
  category?: 'reasoning' | 'vision' | 'code' | 'general';
  isReasoning?: boolean;
  isVision?: boolean;
  isCode?: boolean;
  pricing?: { prompt?: string; completion?: string };
  raw?: any;
}

export interface SatDiscoveredModel {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  isVision: boolean;
  isImageGen: boolean;
  raw?: any;
}

export interface SatModelDiscoveryResult {
  success: boolean;
  count: number;
  baseUrl: string;
  models: SatDiscoveredModel[];
  visionModels: SatDiscoveredModel[];
  imageGenModels: SatDiscoveredModel[];
  error?: string;
}

export interface HermesVisionImageSettings {
  id?: string;
  satApiKey?: string;
  satBaseUrl: string;

  visionProvider: string;
  defaultVisionModel: string;
  visionBaseUrl?: string;
  visionApiKey?: string;

  imageGenProvider: string;
  defaultImageGenModel: string;
  imageGenBaseUrl?: string;
  imageGenApiKey?: string;
  falApiKey?: string;
  openaiImageApiKey?: string;
  maxParallelRequests: number;
  autoUpscale: boolean;
  useGateway: boolean;
}

export interface HermesWebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  engine: string;
}

export interface HermesWebSearchSettings {
  id?: string;
  splitProviders: boolean;
  searchBackend: string;
  extractBackend: string;
  extractCharLimit: number;

  firecrawlApiKey?: string;
  firecrawlApiUrl?: string;
  searxngUrl?: string;
  braveSearchApiKey?: string;
  tavilyApiKey?: string;
  exaApiKey?: string;
  parallelApiKey?: string;
  xaiApiKey?: string;
  xaiModel?: string;
  xaiTimeout?: number;
  xaiAllowedDomains?: string;
  xaiExcludedDomains?: string;
}

export interface HermesSyncFileStatus {
  name: string;
  path: string;
  category: string;
  exists: boolean;
  mtime: string | null;
  sizeBytes: number;
}

export interface HermesSyncStatus {
  synced: boolean;
  hermesHome: string;
  defaultProfileHome: string;
  fileStatuses: HermesSyncFileStatus[];
  rawConfigYaml: string;
  rawMcpJson: string;
  browserSettings: HermesBrowserSettings;
  lastCheckAt: string;
}

export interface HermesBrowserSettings {
  id?: string;
  provider: string;
  backend: string;
  headless: boolean;
  headed: boolean;
  cdpUrl: string;
  visionEnabled: boolean;
  timeoutSeconds: number;
  inactivityTimeout: number;
  recordSessions: boolean;
  proxyUrl?: string;
  autoLocalForPrivateUrls: boolean;
  allowPrivateUrls: boolean;
  restrictEvaluate: boolean;
  dialogPolicy: string;
  dialogTimeoutS: number;
  agentBrowserArgs?: string;

  kitesurfMcpEnabled: boolean;
  kitesurfAccountToken?: string;
  kitesurfAccountTokenSet?: boolean;

  browserbaseApiKey?: string;
  browserbaseApiKeySet?: boolean;
  browserbaseProjectId?: string;
  browserbaseProxies: boolean;
  browserbaseAdvancedStealth: boolean;
  browserbaseKeepAlive: boolean;
  browserbaseSessionTimeout: number;

  browserUseApiKey?: string;
  browserUseApiKeySet?: boolean;

  firecrawlApiKey?: string;
  firecrawlApiKeySet?: boolean;
  firecrawlApiUrl?: string;
  firecrawlBrowserTtl: number;

  camofoxUrl?: string;
  camofoxRewriteLoopbackUrls: boolean;
  camofoxLoopbackHostAlias?: string;
  camofoxManagedPersistence: boolean;
  camofoxUserId?: string;
  camofoxSessionKey?: string;
  camofoxAdoptExistingTab: boolean;
}

export interface GatewayStatus {
  active: boolean;
  pid?: number;
  status: 'running' | 'stopped' | 'error' | 'not_installed';
  info: string;
  uptime?: string;
  configured: boolean;
  lastTick?: string;
  jobsCount: number;
  activeJobsCount: number;
  logPath: string;
  recentLogs: string[];
}

export interface CronJobItem {
  id: string;
  name: string;
  schedule: string | { expression: string; tz?: string };
  schedule_display?: string;
  prompt?: string;
  script?: string;
  workdir?: string;
  enabled: boolean;
  state?: 'active' | 'paused' | 'completed' | 'error';
  no_agent?: boolean;
  deliver?: string;
  skills?: string[];
  model?: string;
  provider?: string;
  next_run_at?: string;
  last_run_at?: string;
  last_status?: string;
  last_error?: string;
  created_at?: string;
  updated_at?: string;
}

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

export interface HermesMessagingSettings {
  id?: string;
  // Telegram
  telegramEnabled: boolean;
  telegramBotToken?: string;
  telegramBotTokenSet?: boolean;
  telegramAllowedUsers?: string;
  telegramAllowedChats?: string;
  telegramGroupAllowedChats?: string;
  telegramRequireMention: boolean;
  telegramStatusIndicator: boolean;
  telegramStatusOnline?: string;
  telegramStatusOffline?: string;
  telegramCommandMenuMax?: number;
  telegramCommandMenuPriorityMode?: string;
  telegramObserveUnmentioned: boolean;
  telegramWebhookUrl?: string;
  telegramWebhookSecret?: string;
  telegramWebhookSecretSet?: boolean;
  telegramWebhookPort?: number;
  // WhatsApp Cloud API
  whatsappEnabled: boolean;
  whatsappAccessToken?: string;
  whatsappAccessTokenSet?: boolean;
  whatsappPhoneNumberId?: string;
  whatsappWabaId?: string;
  whatsappVerifyToken?: string;
  whatsappAllowedUsers?: string;
  whatsappTextBatchDelay?: number;
  // Email
  emailEnabled: boolean;
  emailAddress?: string;
  emailPassword?: string;
  emailPasswordSet?: boolean;
  emailImapHost?: string;
  emailSmtpHost?: string;
  emailImapPort?: number;
  emailSmtpPort?: number;
  emailPollInterval?: number;
  emailAllowedUsers?: string;
  // Webhooks
  webhookEnabled: boolean;
  webhookPort?: number;
  webhookSecret?: string;
  webhookSecretSet?: boolean;
  webhookRoutes?: Array<{ name: string; events: string[]; secret?: string; profile?: string }>;
  // Computed
  configured?: {
    telegram: boolean;
    whatsapp: boolean;
    email: boolean;
    webhooks: boolean;
  };
}
