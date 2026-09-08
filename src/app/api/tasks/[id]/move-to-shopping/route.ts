/**
 * POST /api/tasks/[id]/move-to-shopping
 *
 * Manual, one-tap version of what autoShoppingSyncCron.ts does automatically
 * every few minutes. Kept even though the cron exists: it acts immediately
 * (no waiting for the next tick) and still works for a task whose list name
 * doesn't happen to match the cron's shopping-list detection.
 *
 * The source task is left untouched — the client marks it complete via the
 * existing toggle endpoint, reusing that tested code path instead of adding
 * a second way to remove a task.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { moveTaskToShoppingItem } from '@/lib/services/taskToShoppingSync';
import { logActivity } from '@/lib/services/auditLog';
import { logError } from '@/lib/utils/logError';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const listId: string | undefined = body?.listId;

    const result = await moveTaskToShoppingItem(task, auth.userId, listId);
    if (!result) {
      return NextResponse.json({ error: 'No shopping list found' }, { status: 404 });
    }

    logActivity({
      userId: auth.userId,
      action: 'create',
      entityType: 'shopping_item',
      entityId: result.id,
      summary: `Moved task to shopping: ${result.name}`,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    logError('Error moving task to shopping:', error);
    return NextResponse.json({ error: 'Failed to move task to shopping' }, { status: 500 });
  }
}
