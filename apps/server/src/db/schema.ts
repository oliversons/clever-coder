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

