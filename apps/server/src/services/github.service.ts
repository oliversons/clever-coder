import { getDb, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { config } from '../config.js';
import { simpleGit } from 'simple-git';
import { syncWorkspace, restoreWorkspace } from '../utils/rclone.js';
import { decrypt } from '../utils/crypto.js';

export interface CreateProjectInput {
  userId: string;
  name: string;
  repoUrl: string;
  description?: string;
  githubToken?: string;
}

export type CloneProgressCallback = (pct: number, stage: string) => void;

export async function listProjects(userId: string) {
  const db = getDb();
  return db.query.projects.findMany({
    where: eq(schema.projects.userId, userId),
    orderBy: (p, { desc }) => desc(p.updatedAt),
  });
}

export async function getProject(projectId: string, userId: string) {
  const db = getDb();
  const project = await db.query.projects.findFirst({
    where: and(
      eq(schema.projects.id, projectId),
      eq(schema.projects.userId, userId),
    ),
  });
  if (!project) throw new Error('Project not found');
  return project;
}

export async function createProject(
  input: CreateProjectInput,
  onProgress?: CloneProgressCallback,
): Promise<typeof schema.projects.$inferSelect> {
  const db = getDb();

  // Normalise repo URL
  const repoUrl = normaliseRepoUrl(input.repoUrl, input.githubToken);

  // Create DB record
  const [project] = await db.insert(schema.projects).values({
    userId: input.userId,
    name: input.name,
    repoUrl: input.repoUrl, // store clean URL (no token)
    description: input.description,
    workspacePath: 'pending',
    cellarPrefix: 'pending',
    status: 'cloning',
  }).returning();

  const workspacePath = join(config.WORKSPACES_ROOT, project.id);
  const cellarPrefix = `ws/${project.id}`;

  mkdirSync(workspacePath, { recursive: true });

  // Update paths
  await db.update(schema.projects).set({
    workspacePath,
    cellarPrefix,
  }).where(eq(schema.projects.id, project.id));

  try {
    // Clone
    const git = simpleGit();
    await git.clone(repoUrl, workspacePath);

    // Get default branch
    const localGit = simpleGit(workspacePath);
    const branch = (await localGit.revparse(['--abbrev-ref', 'HEAD'])).trim();

    // Initial sync to Cellar
    onProgress?.(95, 'syncing to storage');
    await restoreWorkspace(project.id, true); // first sync = resync

    // Create sync state
    await db.insert(schema.syncStates).values({
      projectId: project.id,
      isFirstSync: 'false',
      lastOkAt: new Date(),
    }).onConflictDoNothing();

    const [updated] = await db.update(schema.projects).set({
      status: 'ready',
      defaultBranch: branch,
      updatedAt: new Date(),
    }).where(eq(schema.projects.id, project.id)).returning();

    onProgress?.(100, 'ready');
    return updated;
  } catch (err) {
    await db.update(schema.projects).set({ status: 'error' }).where(
      eq(schema.projects.id, project.id),
    );
    throw err;
  }
}

export async function updateProject(
  projectId: string,
  userId: string,
  data: { name?: string; description?: string },
) {
  const db = getDb();
  const [updated] = await db.update(schema.projects).set({
    ...data,
    updatedAt: new Date(),
  }).where(
    and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)),
  ).returning();
  if (!updated) throw new Error('Project not found');
  return updated;
}

export async function deleteProject(projectId: string, userId: string) {
  const db = getDb();
  const project = await getProject(projectId, userId);

  // Remove local workspace
  if (existsSync(project.workspacePath)) {
    rmSync(project.workspacePath, { recursive: true, force: true });
  }

  // Note: Cellar cleanup is async/best-effort (can be done via scheduled job)
  await db.delete(schema.projects).where(
    and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)),
  );
}

export async function gitPull(projectId: string, userId: string) {
  const project = await getProject(projectId, userId);
  const git = simpleGit(project.workspacePath);
  const result = await git.pull();
  // Sync changes up to Cellar
  await syncWorkspace(projectId);
  return result;
}

export async function getGitStatus(projectId: string, userId: string) {
  const project = await getProject(projectId, userId);
  const db = getDb();
  const git = simpleGit(project.workspacePath);
  const [status, log, syncState] = await Promise.all([
    git.status(),
    git.log({ maxCount: 5 }),
    db.query.syncStates.findFirst({ where: eq(schema.syncStates.projectId, projectId) }),
  ]);
  return {
    branch: status.current,
    modified: status.modified,
    not_added: status.not_added,
    created: status.created,
    deleted: status.deleted,
    recentCommits: log.all,
    sync: {
      lastOkAt: syncState?.lastOkAt,
      lastError: syncState?.lastError,
    },
  };
}

function normaliseRepoUrl(repoUrl: string, token?: string): string {
  if (!token) return repoUrl;
  // Inject token into HTTPS URL: https://TOKEN@github.com/owner/repo.git
  const url = new URL(repoUrl.endsWith('.git') ? repoUrl : repoUrl + '.git');
  url.username = 'oauth2';
  url.password = token;
  return url.toString();
}
