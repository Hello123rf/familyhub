import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { taskSources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, requireRole } from '@/lib/auth';
import { invalidateEntity } from '@/lib/cache/cacheKeys';
import { syncOneTaskSource } from '@/lib/services/taskProviderSync';
import { logActivity } from '@/lib/services/auditLog';
import { logError } from '@/lib/utils/logError';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/task-sources/[id]/sync
 *
 * Performs bidirectional sync between Prism tasks and the external provider.
 * The actual sync algorithm lives in src/lib/services/taskProviderSync.ts,
 * shared with the background sync cron so a source behaves identically
 * whether a parent clicks "Sync now" here or the cron ticks.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const forbidden = requireRole(auth, 'canManageIntegrations');
  if (forbidden) return forbidden;

  const { id: sourceId } = await params;

  try {
    const [source] = await db
      .select()
      .from(taskSources)
      .where(eq(taskSources.id, sourceId));

    if (!source) {
      return NextResponse.json(
        { error: 'Task source not found' },
        { status: 404 }
      );
    }

    if (!source.syncEnabled) {
      return NextResponse.json(
        { error: 'Sync is disabled for this source' },
        { status: 400 }
      );
    }

    const result = await syncOneTaskSource(source);

    await invalidateEntity('tasks');
    await invalidateEntity('task-sources');

    logActivity({
      userId: auth.userId,
      action: 'sync',
      entityType: 'integration',
      entityId: sourceId,
      summary:
        `Synced task source: ${source.provider} (${source.externalListName || source.externalListId}) - ` +
        `${result.created} created, ${result.updated} updated` +
        (result.flagged > 0 ? `, ${result.flagged} removals held for review` : ''),
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logError('Sync error:', error);

    await db
      .update(taskSources)
      .set({
        lastSyncError: error instanceof Error ? error.message : 'Unknown sync error',
        updatedAt: new Date(),
      })
      .where(eq(taskSources.id, sourceId));

    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
