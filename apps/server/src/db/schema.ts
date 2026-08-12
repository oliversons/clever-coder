import { pgTable, uuid, text, timestamp, integer, bigint, jsonb } from 'drizzle-orm/pg-core';

export interface UserSettings {
  theme?: 'dark' | 'light';
  palette?: 'default' | 'ocean' | 'nordic' | 'emerald' | 'rose' | 'amber' | 'volcanic' | 'orange';
  [key: string]: unknown;
}

// ── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  name: text('name').notNull(),
  githubId: text('github_id').unique(),
  githubTokenEnc: text('github_token_enc'), // AES-GCM encrypted
  avatarUrl: text('avatar_url'),
  settings: jsonb('settings').$type<UserSettings>().default({ theme: 'dark', palette: 'default' }),
  tokenVersion: integer('token_version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Sessions ─────────────────────────────────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),                 // random token
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Projects ─────────────────────────────────────────────────────────────────
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  repoUrl: text('repo_url').notNull(),
  description: text('description'),
  defaultBranch: text('default_branch').default('main'),
  workspacePath: text('workspace_path').notNull(),  // /workspaces/<id>
  cellarPrefix: text('cellar_prefix').notNull(),    // ws/<id>
  codeServerPort: integer('code_server_port'),
  status: text('status').notNull().default('creating'),
  // creating | cloning | ready | syncing | error | archived
  sizeBytes: bigint('size_bytes', { mode: 'number' }).default(0),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Sync States ───────────────────────────────────────────────────────────────
export const syncStates = pgTable('sync_states', {
  projectId: uuid('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  lastOkAt: timestamp('last_ok_at'),
  lastError: text('last_error'),
  isFirstSync: text('is_first_sync').notNull().default('true'), // string bool
  state: jsonb('state'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Command Audit Log ─────────────────────────────────────────────────────────
export const commands = pgTable('commands', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  command: text('command').notNull(),
  exitCode: integer('exit_code'),
  durationMs: integer('duration_ms'),
  outputS3Key: text('output_s3_key'),
  ranAt: timestamp('ran_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type SyncState = typeof syncStates.$inferSelect;
export type Command = typeof commands.$inferSelect;

// ── Hermes AI Agent Tables ────────────────────────────────────────────────────

import { boolean } from 'drizzle-orm/pg-core';

/** Per-user Hermes configuration */
export const hermesSettings = pgTable('hermes_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),

  // LLM Provider
  provider: text('provider').notNull().default('openrouter'), // openrouter | openai | nous_portal | ollama | custom_openai
  baseUrl: text('base_url'),                                  // Custom OpenAI-compatible endpoint URL (e.g. https://api.your-provider.com/v1)
  apiKeyEncrypted: text('api_key_encrypted'),                 // AES-256-GCM encrypted
  model: text('model').notNull().default('nousresearch/hermes-3-llama-3.1-405b'),
  temperature: integer('temperature').notNull().default(70),  // stored as 0-100, divide by 100
  contextWindow: integer('context_window').notNull().default(128000),

  // Execution & Sandbox
  executionBackend: text('execution_backend').notNull().default('docker'), // local | docker | ssh
  containerCpu: integer('container_cpu').notNull().default(0), // 0 = Auto-detect all host cores
  containerMemoryMb: integer('container_memory_mb').notNull().default(4096),
  timeoutSeconds: integer('timeout_seconds').notNull().default(300),
  commandApprovalMode: text('command_approval_mode').notNull().default('ask_destructive'), // always_ask | ask_destructive | auto_approve

  // Memory & Skills
  persistentMemory: boolean('persistent_memory').notNull().default(true),
  autoSkillCreation: boolean('auto_skill_creation').notNull().default(false),
  systemPrompt: text('system_prompt'),

  // Tools
  enabledTools: jsonb('enabled_tools')
    .$type<string[]>()
    .default(['shell', 'web_search', 'code_runner']),

  // S3 Archiving
  s3ArchivingEnabled: boolean('s3_archiving_enabled').notNull().default(true),

  // Hermes WebUI Server
  webuiEnabled: boolean('webui_enabled').notNull().default(true),
  webuiPort: integer('webui_port').notNull().default(8787),
  webuiPassword: text('webui_password'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** Hermes Browser Automation Settings */
export const hermesBrowserSettings = pgTable('hermes_browser_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Provider: local_chromium | kitesurf_cdp | cdp | browserbase | browser_use | firecrawl | camofox | nous_portal
  provider: text('provider').notNull().default('local_chromium'),
  // Driver backend: auto | browser-use | builtin (off)
  backend: text('backend').notNull().default('auto'),
  headless: boolean('headless').notNull().default(true),
  headed: boolean('headed').notNull().default(false),
  cdpUrl: text('cdp_url').default('wss://kitesurf.cloudflare.app/devtools/browser'),
  visionEnabled: boolean('vision_enabled').notNull().default(true),
  timeoutSeconds: integer('timeout_seconds').notNull().default(300),
  inactivityTimeout: integer('inactivity_timeout').notNull().default(120),
  recordSessions: boolean('record_sessions').notNull().default(false),
  proxyUrl: text('proxy_url'),
  autoLocalForPrivateUrls: boolean('auto_local_for_private_urls').notNull().default(true),
  allowPrivateUrls: boolean('allow_private_urls').notNull().default(false),
  restrictEvaluate: boolean('restrict_evaluate').notNull().default(false),
  dialogPolicy: text('dialog_policy').notNull().default('must_respond'), // must_respond | auto_dismiss | auto_accept
  dialogTimeoutS: integer('dialog_timeout_s').notNull().default(30),
  agentBrowserArgs: text('agent_browser_args').default('--no-sandbox,--disable-dev-shm-usage'),

  // Cloudflare Kitesurf
  kitesurfMcpEnabled: boolean('kitesurf_mcp_enabled').notNull().default(true),
  kitesurfAccountToken: text('kitesurf_account_token'),

  // Browserbase Cloud
  browserbaseApiKey: text('browserbase_api_key'),
  browserbaseProjectId: text('browserbase_project_id'),
  browserbaseProxies: boolean('browserbase_proxies').notNull().default(true),
  browserbaseAdvancedStealth: boolean('browserbase_advanced_stealth').notNull().default(false),
  browserbaseKeepAlive: boolean('browserbase_keep_alive').notNull().default(true),
  browserbaseSessionTimeout: integer('browserbase_session_timeout').notNull().default(1800),

  // Browser Use Cloud
  browserUseApiKey: text('browser_use_api_key'),

  // Firecrawl Cloud & Self-Hosted
  firecrawlApiKey: text('firecrawl_api_key'),
  firecrawlApiUrl: text('firecrawl_api_url').default('https://api.firecrawl.dev'),
  firecrawlBrowserTtl: integer('firecrawl_browser_ttl').notNull().default(300),

  // Camofox Anti-Detection & Persistent Sessions
  camofoxUrl: text('camofox_url').default('http://localhost:9377'),
  camofoxRewriteLoopbackUrls: boolean('camofox_rewrite_loopback_urls').notNull().default(true),
  camofoxLoopbackHostAlias: text('camofox_loopback_host_alias').default('host.docker.internal'),
  camofoxManagedPersistence: boolean('camofox_managed_persistence').notNull().default(true),
  camofoxUserId: text('camofox_user_id'),
  camofoxSessionKey: text('camofox_session_key'),
  camofoxAdoptExistingTab: boolean('camofox_adopt_existing_tab').notNull().default(true),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** Conversation sessions — global (projectId=NULL) or workspace-bound */
export const hermesSessions = pgTable('hermes_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id'), // NULL = Global Session
  title: text('title').notNull().default('New Conversation'),
  status: text('status').notNull().default('active'), // active | archived
  contextSnapshot: jsonb('context_snapshot').$type<{
    activeFilePath?: string;
    gitBranch?: string;
    workspaceRoot?: string;
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** Individual messages within a session */
export const hermesMessages = pgTable('hermes_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => hermesSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // user | assistant | system | tool
  content: text('content').notNull(),
  toolCalls: jsonb('tool_calls').$type<Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
    status: 'pending' | 'approved' | 'rejected' | 'completed' | 'error';
    output?: string;
  }>>(),
  s3ArtifactKey: text('s3_artifact_key'), // set when content was offloaded to S3
  tokenUsage: jsonb('token_usage').$type<{ prompt: number; completion: number }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type HermesSettings = typeof hermesSettings.$inferSelect;
export type NewHermesSettings = typeof hermesSettings.$inferInsert;
export type HermesSession = typeof hermesSessions.$inferSelect;
export type NewHermesSession = typeof hermesSessions.$inferInsert;
export type HermesMessage = typeof hermesMessages.$inferSelect;
export type NewHermesMessage = typeof hermesMessages.$inferInsert;

/**
 * Hermes Web Search & Extract Settings Table
 * Manages search & extraction backends (Firecrawl, SearXNG, Brave, DDGS, Tavily, Exa, Parallel, xAI)
 */
export const hermesWebSearchSettings = pgTable('hermes_web_search_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),

  splitProviders: boolean('split_providers').notNull().default(false),
  searchBackend: text('search_backend').notNull().default('duckduckgo'), // firecrawl | searxng | ddgs | duckduckgo | brave | tavily | exa | parallel | xai
  extractBackend: text('extract_backend').notNull().default('firecrawl'), // firecrawl | tavily | exa | parallel | browser | trafilatura
  extractCharLimit: integer('extract_char_limit').notNull().default(15000),

  // Firecrawl
  firecrawlApiKey: text('firecrawl_api_key'),
  firecrawlApiUrl: text('firecrawl_api_url').default('https://api.firecrawl.dev'),

  // SearXNG
  searxngUrl: text('searxng_url'),

  // Brave Search
  braveSearchApiKey: text('brave_search_api_key'),

  // Tavily
  tavilyApiKey: text('tavily_api_key'),

  // Exa
  exaApiKey: text('exa_api_key'),

  // Parallel
  parallelApiKey: text('parallel_api_key'),

  // xAI Grok
  xaiApiKey: text('xai_api_key'),
  xaiModel: text('xai_model').default('grok-build-0.1'),
  xaiTimeout: integer('xai_timeout').default(90),
  xaiAllowedDomains: text('xai_allowed_domains'),
  xaiExcludedDomains: text('xai_excluded_domains'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type HermesWebSearchSettings = typeof hermesWebSearchSettings.$inferSelect;
export type NewHermesWebSearchSettings = typeof hermesWebSearchSettings.$inferInsert;

/**
 * Hermes Vision & Image Generation Settings Table
 * Manages SAT AI API credentials, auxiliary multimodal vision routing,
 * and text-to-image/image-to-image generation models (FAL.ai, OpenAI, SAT, Nous Gateway).
 */
export const hermesVisionImageSettings = pgTable('hermes_vision_image_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),

  // SAT AI API Credentials
  satApiKey: text('sat_api_key'),
  satBaseUrl: text('sat_base_url').notNull().default('https://api.sat.ai/v1'),

  // Auxiliary Multimodal Vision Settings
  visionProvider: text('vision_provider').notNull().default('sat'), // sat | openai | openrouter | fal | custom
  defaultVisionModel: text('default_vision_model').notNull().default('sat-vision-v1'),
  visionBaseUrl: text('vision_base_url'),
  visionApiKey: text('vision_api_key'),

  // Image Generation Settings (image_generate)
  imageGenProvider: text('image_gen_provider').notNull().default('sat'), // sat | fal | openai | nous_subscription | custom
  defaultImageGenModel: text('default_image_gen_model').notNull().default('sat-flux-1-schnell'),
  imageGenBaseUrl: text('image_gen_base_url'),
  imageGenApiKey: text('image_gen_api_key'),
  falApiKey: text('fal_api_key'),
  openaiImageApiKey: text('openai_image_api_key'),
  maxParallelRequests: integer('max_parallel_requests').notNull().default(4),
  autoUpscale: boolean('auto_upscale').notNull().default(true),
  useGateway: boolean('use_gateway').notNull().default(false),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type HermesVisionImageSettings = typeof hermesVisionImageSettings.$inferSelect;
export type NewHermesVisionImageSettings = typeof hermesVisionImageSettings.$inferInsert;

/**
 * Hermes Messaging Gateway Settings Table
 * Manages credentials and behavior configuration for Telegram, WhatsApp Cloud API,
 * Email (IMAP/SMTP), and Webhooks gateways. Data is synced to ~/.hermes/.env
 * and ~/.hermes/config.yaml by the messaging service on save.
 */
export const hermesMessagingSettings = pgTable('hermes_messaging_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),

  // ── Telegram ──────────────────────────────────────────────────────────────
  telegramEnabled: boolean('telegram_enabled').notNull().default(false),
  telegramBotToken: text('telegram_bot_token'),
  telegramAllowedUsers: text('telegram_allowed_users'),       // comma-separated user IDs
  telegramAllowedChats: text('telegram_allowed_chats'),       // comma-separated chat IDs
  telegramGroupAllowedChats: text('telegram_group_allowed_chats'),
  telegramRequireMention: boolean('telegram_require_mention').notNull().default(true),
  telegramStatusIndicator: boolean('telegram_status_indicator').notNull().default(true),
  telegramStatusOnline: text('telegram_status_online').default('🟢 Online'),
  telegramStatusOffline: text('telegram_status_offline').default('🔴 Offline'),
  telegramCommandMenuMax: integer('telegram_command_menu_max').default(60),
  telegramCommandMenuPriorityMode: text('telegram_command_menu_priority_mode').default('prepend'),
  telegramObserveUnmentioned: boolean('telegram_observe_unmentioned').notNull().default(false),
  // Optional webhook mode (alternative to long-polling for cloud deployments)
  telegramWebhookUrl: text('telegram_webhook_url'),
  telegramWebhookSecret: text('telegram_webhook_secret'),
  telegramWebhookPort: integer('telegram_webhook_port').default(8443),

  // ── WhatsApp Cloud API ───────────────────────────────────────────────────
  whatsappEnabled: boolean('whatsapp_enabled').notNull().default(false),
  whatsappAccessToken: text('whatsapp_access_token'),         // Permanent system user token
  whatsappPhoneNumberId: text('whatsapp_phone_number_id'),   // Numeric phone number ID
  whatsappWabaId: text('whatsapp_waba_id'),                  // WhatsApp Business Account ID
  whatsappVerifyToken: text('whatsapp_verify_token'),         // Custom webhook verify secret
  whatsappAllowedUsers: text('whatsapp_allowed_users'),       // E.164 numbers, comma-separated
  whatsappTextBatchDelay: integer('whatsapp_text_batch_delay').default(2), // seconds

  // ── Email (IMAP / SMTP) ──────────────────────────────────────────────────
  emailEnabled: boolean('email_enabled').notNull().default(false),
  emailAddress: text('email_address'),
  emailPassword: text('email_password'),                      // App password (not account password)
  emailImapHost: text('email_imap_host').default('imap.gmail.com'),
  emailSmtpHost: text('email_smtp_host').default('smtp.gmail.com'),
  emailImapPort: integer('email_imap_port').default(993),
  emailSmtpPort: integer('email_smtp_port').default(587),
  emailPollInterval: integer('email_poll_interval').default(15), // seconds
  emailAllowedUsers: text('email_allowed_users'),             // comma-separated sender emails

  // ── Webhooks ─────────────────────────────────────────────────────────────
  webhookEnabled: boolean('webhook_enabled').notNull().default(false),
  webhookPort: integer('webhook_port').default(8644),
  webhookSecret: text('webhook_secret'),                      // Global HMAC secret
  webhookRoutes: jsonb('webhook_routes')
    .$type<Array<{ name: string; events: string[]; secret?: string; profile?: string }>>()
    .default([]),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type HermesMessagingSettings = typeof hermesMessagingSettings.$inferSelect;
export type NewHermesMessagingSettings = typeof hermesMessagingSettings.$inferInsert;

