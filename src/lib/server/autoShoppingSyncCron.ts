/**
 * Server-side task sync + auto-shopping-move cron.
 *
 * Two things every tick:
 *   1. Sync all enabled task sources (Google Tasks, MS To-Do) — without this,
 *      new voice-added items ("Hey Google, add milk") only appear once
 *      someone happens to open the Tasks page, which client-triggers sync.
 *   2. Move any incomplete task sitting in a list that looks like a shopping
 *      list (see isShoppingListName) into the real Shopping page, guessing a
 *      grocery category the same way the manual "move to Shopping" button
 *      does, then mark the source task complete.
 *
 * Lives in its own file for the same reason calendarSyncCron.ts does: keep
 * node-only deps (db client, crypto) out of the edge runtime bundle that
 * instrumentation.ts also loads.
 */

import { db } from '@/lib/db/client';
import { tasks, taskLists } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { syncAllEnabledTaskSources } from '@/lib/services/taskProviderSync';
import { moveTaskToShoppingItem } from '@/lib/services/taskToShoppingSync';
import { isShoppingListName } from '@/lib/constants/shoppingTaskSync';
import { invalidateEntity } from '@/lib/cache/cacheKeys';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — matches performSync's own assumption (MISSING_GRACE_MS)
const INITIAL_DELAY_MS = 90 * 1000; // stagger after calendar-cron's 60s delay

async function runOnce() {
  try {
    const taskSyncResult = await syncAllEnabledTaskSources();
    if (taskSyncResult.created + taskSyncResult.updated > 0) {
      await invalidateEntity('tasks');
    }

    const lists = await db.select().from(taskLists);
    const shoppingListIds = lists.filter((l) => isShoppingListName(l.name)).map((l) => l.id);

    let moved = 0;
    const errors = [...taskSyncResult.errors];

    if (shoppingListIds.length > 0) {
      const candidates = await db
        .select()
        .from(tasks)
        .where(and(inArray(tasks.listId, shoppingListIds), eq(tasks.completed, false)));

      for (const task of candidates) {
        try {
          const result = await moveTaskToShoppingItem(task, null);
          if (result) {
            await db
              .update(tasks)
              .set({ completed: true, completedAt: new Date(), updatedAt: new Date() })
              .where(eq(tasks.id, task.id));
            moved++;
          }
        } catch (err) {
          errors.push(`Failed to auto-move task "${task.title}" to shopping: ${err instanceof Error ? err.message : 'unknown error'}`);
        }
      }

      if (moved > 0) {
        await invalidateEntity('tasks');
        await invalidateEntity('shopping-lists');
      }
    }

    if (errors.length > 0) {
      console.warn(
        `[shopping-sync-cron] synced ${taskSyncResult.created + taskSyncResult.updated} tasks, moved ${moved} to shopping, with ${errors.length} errors:`,
        errors.slice(0, 3),
      );
    } else {
      console.log(`[shopping-sync-cron] synced ${taskSyncResult.created + taskSyncResult.updated} tasks, moved ${moved} to shopping`);
    }
  } catch (err) {
    // Never let a transient sync failure crash the cron loop.
    console.error('[shopping-sync-cron] tick failed:', err);
  }
}

export function startAutoShoppingSyncCron(): void {
  if (process.env.PRISM_DISABLE_SHOPPING_SYNC_CRON === 'true') {
    console.log('[shopping-sync-cron] disabled via PRISM_DISABLE_SHOPPING_SYNC_CRON');
    return;
  }
  if (process.env.NODE_ENV === 'test') return;

  setTimeout(() => {
    void runOnce();
    setInterval(() => void runOnce(), INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  console.log(
    `[shopping-sync-cron] scheduled every ${INTERVAL_MS / 1000}s (first run in ${INITIAL_DELAY_MS / 1000}s)`,
  );
}
