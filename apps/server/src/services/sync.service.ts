import chokidar, { FSWatcher } from 'chokidar';
import { join } from 'path';
import { config } from '../config.js';
import { restoreWorkspace, syncWorkspace } from '../utils/rclone.js';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

interface WatcherEntry {
  watcher: FSWatcher;
  debounceTimer?: ReturnType<typeof setTimeout>;
  intervalTimer?: ReturnType<typeof setInterval>;
}

const watchers = new Map<string, WatcherEntry>();

export async function initWorkspaceFromCellar(projectId: string): Promise<void> {
  const db = getDb();
  const syncState = await db.query.syncStates.findFirst({
    where: eq(schema.syncStates.projectId, projectId),
  });
  const isFirst = !syncState || syncState.isFirstSync === 'true';

  console.log(`[sync] Restoring workspace ${projectId} (first=${isFirst})`);
  const result = await restoreWorkspace(projectId, isFirst);

  if (result.success) {
    await db.insert(schema.syncStates).values({
      projectId,
      isFirstSync: 'false',
      lastOkAt: new Date(),
    }).onConflictDoUpdate({
      target: schema.syncStates.projectId,
      set: { isFirstSync: 'false', lastOkAt: new Date(), lastError: null },
    });
  } else {
    await db.insert(schema.syncStates).values({
      projectId,
      lastError: result.error,
    }).onConflictDoUpdate({
      target: schema.syncStates.projectId,
      set: { lastError: result.error, updatedAt: new Date() },
    });
    throw new Error(`Restore failed: ${result.error}`);
  }
}

export function startWatcher(projectId: string): void {
  if (watchers.has(projectId)) return;

  const workspacePath = join(config.WORKSPACES_ROOT, projectId);
  const watcher = chokidar.watch(workspacePath, {
    ignoreInitial: true,
    ignored: [
      /node_modules/,
      /\.git\/objects/,
      /\.log$/,
      /\.sock$/,
    ],
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  const entry: WatcherEntry = { watcher };

  const triggerSync = () => {
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.debounceTimer = setTimeout(async () => {
      const result = await syncWorkspace(projectId);
      updateSyncState(projectId, result.success, result.error);
    }, config.SYNC_DEBOUNCE_MS);
  };

  watcher.on('add', triggerSync);
  watcher.on('change', triggerSync);
  watcher.on('unlink', triggerSync);
  watcher.on('addDir', triggerSync);
  watcher.on('unlinkDir', triggerSync);

  // Periodic safety-net sync
  entry.intervalTimer = setInterval(async () => {
    const result = await syncWorkspace(projectId);
    updateSyncState(projectId, result.success, result.error);
  }, config.SYNC_INTERVAL_MS);

  watchers.set(projectId, entry);
  console.log(`[sync] Watcher started for ${projectId}`);
}

export function stopWatcher(projectId: string): void {
  const entry = watchers.get(projectId);
  if (!entry) return;
  if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
  if (entry.intervalTimer) clearInterval(entry.intervalTimer);
  entry.watcher.close().catch(() => {});
  watchers.delete(projectId);
  console.log(`[sync] Watcher stopped for ${projectId}`);
}

export async function flushAllSyncs(): Promise<void> {
  console.log('[sync] Flushing all active workspaces before shutdown...');
  const projectIds = Array.from(watchers.keys());
  await Promise.allSettled(
    projectIds.map(async (id) => {
      stopWatcher(id);
      const result = await syncWorkspace(id);
      console.log(`[sync] Final flush for ${id}: ${result.success ? 'OK' : result.error}`);
    }),
  );
}

async function updateSyncState(
  projectId: string,
  success: boolean,
  error?: string,
): Promise<void> {
  const db = getDb();
  await db.update(schema.syncStates).set({
    lastOkAt: success ? new Date() : undefined,
    lastError: success ? null : (error ?? 'Unknown error'),
    updatedAt: new Date(),
  }).where(eq(schema.syncStates.projectId, projectId));
}
