/**
 * Shared task-provider sync logic, extracted from
 * src/app/api/task-sources/[id]/sync/route.ts so it can be called directly
 * (no HTTP round-trip, no session cookie) from the background sync cron —
 * the same reason src/lib/services/calendar-sync.ts exists separately from
 * its route handlers. The route continues to own auth/response formatting
 * and calls syncOneTaskSource for the actual work, so there is exactly one
 * copy of the sync algorithm.
 */

import { db } from '@/lib/db/client';
import { taskSources, tasks, dismissedTasks } from '@/lib/db/schema';
import { eq, and, or, isNull, isNotNull, inArray } from 'drizzle-orm';
import { getTaskProvider } from '@/lib/integrations/tasks';
import { decideDeletionReview } from '@/lib/services/taskDeletionReview';
import { decrypt, encrypt } from '@/lib/utils/crypto';
import type { TaskProviderTokens, SyncResult } from '@/lib/integrations/tasks/types';

/**
 * How long a task must have been absent from the provider before it is flagged.
 * Covers the provider listing a just-created task late, and means one missed
 * response cannot flag anything on its own. Slightly over the 5-minute
 * auto-sync interval, so it takes two runs.
 */
const MISSING_GRACE_MS = 6 * 60 * 1000;

/**
 * Core sync logic for one task source (unchanged from the original route
 * implementation — see git history for src/app/api/task-sources/[id]/sync/route.ts
 * prior to this extraction).
 */
export async function performSync(
  sourceId: string,
  externalListId: string,
  taskListId: string,
  tokens: TaskProviderTokens,
  provider: ReturnType<typeof getTaskProvider>
): Promise<SyncResult> {
  if (!provider) {
    throw new Error('Provider not found');
  }

  const result: SyncResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    flagged: 0,
    errors: [],
  };

  try {
    // Fetch remote tasks
    const remoteTasks = await provider.fetchTasks(tokens, externalListId);

    // Fetch local tasks linked to this source OR belonging to this list (for new tasks)
    const localTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          // Kept after a remote deletion, or detached when a source was removed
          // (task_source_id is ON DELETE SET NULL). Either way the row is
          // Prism's now: it must not be matched, pushed or flagged.
          eq(tasks.syncExempt, false),
          or(
            eq(tasks.taskSourceId, sourceId),
            and(eq(tasks.listId, taskListId), isNull(tasks.taskSourceId))
          )
        )
      );

    // Tasks deleted in Prism. The delete is pushed to the provider at delete
    // time, so normally the remote no longer lists them; this covers the cases
    // where that could not be relied on (failed or unsupported upstream
    // delete, or a lagging remote). Without it the loop below sees a remote
    // task with no local match and re-creates it.
    const tombstoned = new Set(
      (
        await db
          .select({ externalTaskId: dismissedTasks.externalTaskId })
          .from(dismissedTasks)
          .where(eq(dismissedTasks.taskSourceId, sourceId))
      ).map((row) => row.externalTaskId),
    );

    // Create maps for quick lookup
    const remoteById = new Map(remoteTasks.map(t => [t.id, t]));

    // Anything the remote is listing again is not missing. Clearing this first
    // is what makes one bad response self-healing rather than leaving a pile of
    // flags to work through by hand. Calendar clears the same way before it
    // re-scans, on all three of its provider paths.
    if (remoteById.size > 0) {
      await db
        .update(tasks)
        .set({ pendingDeletion: null })
        .where(
          and(
            eq(tasks.taskSourceId, sourceId),
            inArray(tasks.externalId, [...remoteById.keys()]),
            isNotNull(tasks.pendingDeletion),
          ),
        );
    }
    const localByExternalId = new Map(
      localTasks
        .filter(t => t.externalId)
        .map(t => [t.externalId!, t])
    );

    // Process remote tasks
    for (const remoteTask of remoteTasks) {
      const localTask = localByExternalId.get(remoteTask.id);

      if (tombstoned.has(remoteTask.id)) {
        // Deleted in Prism and still coming back from the remote. Leave it
        // alone rather than re-adding it; the tombstone is cleared below once
        // the remote stops listing it.
        continue;
      }

      if (!localTask) {
        // Remote task doesn't exist locally - create it
        try {
          await db.insert(tasks).values({
            title: remoteTask.title,
            description: remoteTask.description || null,
            listId: taskListId,
            dueDate: remoteTask.dueDate || null,
            priority: remoteTask.priority || null,
            completed: remoteTask.completed,
            completedAt: remoteTask.completedAt || null,
            taskSourceId: sourceId,
            externalId: remoteTask.id,
            externalUpdatedAt: remoteTask.updatedAt,
            lastSynced: new Date(),
          });
          result.created++;
        } catch (err) {
          result.errors.push(`Failed to create local task: ${remoteTask.title}`);
        }
      } else {
        // Task exists in both - compare timestamps
        const remoteUpdated = remoteTask.updatedAt;
        const localUpdated = localTask.updatedAt;

        if (remoteUpdated > localUpdated) {
          // Remote is newer - update local
          try {
            await db
              .update(tasks)
              .set({
                title: remoteTask.title,
                description: remoteTask.description || null,
                dueDate: remoteTask.dueDate || null,
                priority: remoteTask.priority || null,
                completed: remoteTask.completed,
                completedAt: remoteTask.completedAt || null,
                externalUpdatedAt: remoteTask.updatedAt,
                lastSynced: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(tasks.id, localTask.id));
            result.updated++;
          } catch (err) {
            result.errors.push(`Failed to update local task: ${localTask.title}`);
          }
        } else if (localUpdated > remoteUpdated) {
          // Local is newer - update remote
          try {
            // For MS To-Do, taskId needs format "listId:taskId"
            const taskIdForProvider = `${externalListId}:${remoteTask.id}`;
            await provider.updateTask(tokens, taskIdForProvider, {
              title: localTask.title,
              description: localTask.description,
              dueDate: localTask.dueDate,
              completed: localTask.completed,
              priority: localTask.priority,
            });

            // Update local sync timestamp
            await db
              .update(tasks)
              .set({
                lastSynced: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(tasks.id, localTask.id));
            result.updated++;
          } catch (err) {
            result.errors.push(`Failed to update remote task: ${localTask.title}`);
          }
        } else {
          // Same timestamp - just update lastSynced
          await db
            .update(tasks)
            .set({ lastSynced: new Date() })
            .where(eq(tasks.id, localTask.id));
        }
      }
    }

    // Find local tasks that don't exist remotely (created locally or deleted remotely)
    const missingLocally: typeof localTasks = [];
    for (const localTask of localTasks) {
      if (!localTask.externalId) {
        // Local task without externalId - push to remote
        try {
          const created = await provider.createTask(tokens, {
            listId: externalListId,
            title: localTask.title,
            description: localTask.description,
            dueDate: localTask.dueDate,
            priority: localTask.priority,
          });

          // Update local task with external ID and link to this source
          await db
            .update(tasks)
            .set({
              taskSourceId: sourceId,
              externalId: created.id,
              externalUpdatedAt: created.updatedAt,
              lastSynced: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, localTask.id));
          result.created++;
        } catch (err) {
          result.errors.push(`Failed to push task to remote: ${localTask.title}`);
        }
      } else if (localTask.taskSourceId === sourceId && !remoteById.has(localTask.externalId)) {
        // Gone from this provider. Previously deleted outright — silent and
        // unrecoverable — now collected so the whole run is judged at once.
        //
        // The taskSourceId check matters: the query above also picks up rows
        // with no source at all (CalDAV task rows, and orphans left behind by
        // ON DELETE SET NULL). Those carry an external id this provider has
        // never heard of, so without it one provider deletes another's tasks.
        missingLocally.push(localTask);
      }
    }

    // Decide what to do about the tasks the remote stopped listing. The
    // decision is per-run, not per-task: one task going missing is someone
    // ticking it off, all of them going missing is a broken provider, and
    // telling those apart needs the whole set.
    const now = new Date();
    const flaggable = missingLocally.filter((t) => {
      // A task pushed upstream moments ago may not be in the provider's list
      // yet. Flagging it would tell the user their own new task was deleted.
      // Requiring it to have been absent for longer than one sync interval
      // also means a single missed response never flags anything.
      if (!t.lastSynced) return false;
      return now.getTime() - t.lastSynced.getTime() > MISSING_GRACE_MS;
    });

    const review = decideDeletionReview({
      syncedCount: localTasks.filter((t) => t.externalId && t.taskSourceId === sourceId).length,
      missingCount: flaggable.length,
    });

    if (review.guardTripped) {
      // Deliberately NOT flagged. Burying the user in hundreds of entries
      // invites a bulk confirm, which destroys exactly what the review exists
      // to protect. Said out loud rather than withheld silently.
      result.errors.push(
        `${review.withheld} tasks are missing from the provider — too many at once to be a normal ` +
        `change, so none were touched. Check the connection, then sync again.`,
      );
    } else if (review.flag) {
      for (const localTask of flaggable) {
        // Only when not already flagged, so the original time survives and the
        // count does not climb every five minutes.
        if (localTask.pendingDeletion) continue;
        try {
          await db.update(tasks).set({ pendingDeletion: now }).where(eq(tasks.id, localTask.id));
          result.flagged++;
        } catch (err) {
          result.errors.push(`Failed to flag deleted task: ${localTask.title}`);
        }
      }
    }

    // Drop tombstones the remote has caught up on. Once a task is gone from
    // the provider there is nothing left to suppress, and keeping the row
    // would grow this table without bound.
    const stale = [...tombstoned].filter((externalId) => !remoteById.has(externalId));
    if (stale.length > 0) {
      await db
        .delete(dismissedTasks)
        .where(
          and(
            eq(dismissedTasks.taskSourceId, sourceId),
            inArray(dismissedTasks.externalTaskId, stale),
          ),
        );
    }

    return result;
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'Unknown sync error');
    return result;
  }
}

/**
 * One task source, end to end: refresh tokens if needed, run performSync,
 * persist lastSyncAt/lastSyncError. Shared by the on-demand route handler
 * (POST /api/task-sources/[id]/sync) and the background cron, so a source
 * behaves identically whether a parent clicks "Sync now" or the cron ticks.
 */
export async function syncOneTaskSource(
  source: typeof taskSources.$inferSelect,
): Promise<SyncResult> {
  const provider = getTaskProvider(source.provider);
  if (!provider) {
    return { created: 0, updated: 0, deleted: 0, flagged: 0, errors: [`Unknown provider: ${source.provider}`] };
  }

  if (!source.accessToken) {
    return { created: 0, updated: 0, deleted: 0, flagged: 0, errors: ['No access token configured. Please reconnect the provider.'] };
  }

  let tokens: TaskProviderTokens = {
    accessToken: decrypt(source.accessToken),
    refreshToken: source.refreshToken ? decrypt(source.refreshToken) : undefined,
    expiresAt: source.tokenExpiresAt || undefined,
  };

  if (tokens.expiresAt && new Date(tokens.expiresAt) < new Date()) {
    if (provider.refreshTokens && tokens.refreshToken) {
      const newTokens = await provider.refreshTokens(tokens);
      if (newTokens) {
        tokens = newTokens;
        await db
          .update(taskSources)
          .set({
            accessToken: encrypt(newTokens.accessToken),
            refreshToken: newTokens.refreshToken ? encrypt(newTokens.refreshToken) : source.refreshToken,
            tokenExpiresAt: newTokens.expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(taskSources.id, source.id));
      } else {
        await db
          .update(taskSources)
          .set({ lastSyncError: 'Token refresh failed. Please reconnect.', updatedAt: new Date() })
          .where(eq(taskSources.id, source.id));
        return { created: 0, updated: 0, deleted: 0, flagged: 0, errors: ['Token refresh failed. Please reconnect the provider.'] };
      }
    } else {
      return { created: 0, updated: 0, deleted: 0, flagged: 0, errors: ['Access token expired. Please reconnect the provider.'] };
    }
  }

  const result = await performSync(source.id, source.externalListId, source.taskListId, tokens, provider);

  await db
    .update(taskSources)
    .set({
      lastSyncAt: new Date(),
      lastSyncError: result.errors.length > 0 ? result.errors.join('; ') : null,
      updatedAt: new Date(),
    })
    .where(eq(taskSources.id, source.id));

  return result;
}

/** Syncs every enabled task source. Used by the background cron. */
export async function syncAllEnabledTaskSources(): Promise<SyncResult> {
  const sources = await db.select().from(taskSources).where(eq(taskSources.syncEnabled, true));

  const total: SyncResult = { created: 0, updated: 0, deleted: 0, flagged: 0, errors: [] };
  for (const source of sources) {
    const result = await syncOneTaskSource(source);
    total.created += result.created;
    total.updated += result.updated;
    total.deleted += result.deleted;
    total.flagged += result.flagged;
    total.errors.push(...result.errors);
  }
  return total;
}
