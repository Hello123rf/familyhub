/**
 * Server-side task source sync cron.
 *
 * Lives in its own file for the same reason as calendarSyncCron.ts: keeps
 * the edge runtime bundle of instrumentation.ts from pulling in this
 * module's node-only transitive deps.
 *
 * Why: Google/Microsoft Tasks sync was previously client-driven only (see
 * useDashboardData.ts's autoSyncTasks), which meant it also stopped
 * whenever nobody had the dashboard open in a signed-in session — the same
 * staleness problem calendar sync had before it got its own cron.
 * syncAllEnabledTaskSources() already existed for exactly this ("Used by
 * the background cron" in its own doc comment) but nothing ever called it
 * outside a request.
 */

import { syncAllEnabledTaskSources } from '@/lib/services/taskProviderSync';
import { invalidateEntity } from '@/lib/cache/cacheKeys';

const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const INITIAL_DELAY_MS = 60 * 1000;  // wait 1 min after boot

async function runOnce() {
  try {
    const result = await syncAllEnabledTaskSources();

    await invalidateEntity('tasks');
    await invalidateEntity('task-sources');

    const total = result.created + result.updated + result.deleted;
    if (result.errors.length > 0) {
      console.warn(
        `[task-sync-cron] synced ${total} tasks with ${result.errors.length} errors:`,
        result.errors.slice(0, 3),
      );
    } else {
      console.log(`[task-sync-cron] synced ${total} tasks`);
    }
  } catch (err) {
    // Never let a transient sync failure crash the cron loop.
    console.error('[task-sync-cron] tick failed:', err);
  }
}

export function startTaskSyncCron(): void {
  if (process.env.PRISM_DISABLE_TASK_CRON === 'true') {
    console.log('[task-sync-cron] disabled via PRISM_DISABLE_TASK_CRON');
    return;
  }
  if (process.env.NODE_ENV === 'test') return;

  setTimeout(() => {
    void runOnce();
    setInterval(() => void runOnce(), INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  console.log(
    `[task-sync-cron] scheduled every ${INTERVAL_MS / 1000}s (first run in ${INITIAL_DELAY_MS / 1000}s)`,
  );
}
