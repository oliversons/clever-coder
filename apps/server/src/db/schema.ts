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
