/**
 * POST /api/tasks/[id]/move-to-shopping
 *
 * Copies a task's title into a shopping list item, guessing a grocery
 * category so common items don't need a manual tap every time:
 *   1. Match against this household's own shopping history (most recent
 *      item with the same name wins — reflects how *this* family actually
 *      categorizes things).
 *   2. Fall back to a built-in keyword dictionary for common groceries.
 *   3. Otherwise leave uncategorized.
 *
 * The source task is left untouched — the client marks it complete via the
 * existing toggle endpoint, reusing that tested code path instead of adding
 * a second way to remove a task.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { tasks, shoppingItems, shoppingLists } from '@/lib/db/schema';
import { eq, ilike, asc, desc } from 'drizzle-orm';
import { guessShoppingCategory } from '@/lib/utils/guessShoppingCategory';
import { invalidateEntity } from '@/lib/cache/cacheKeys';
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

    const targetList = listId
      ? (await db.select().from(shoppingLists).where(eq(shoppingLists.id, listId)))[0]
      : (await db.select().from(shoppingLists).orderBy(asc(shoppingLists.sortOrder)).limit(1))[0];

    if (!targetList) {
      return NextResponse.json({ error: 'No shopping list found' }, { status: 404 });
    }

    // 1. History: most recent past item with the same name, any list.
    const [historyMatch] = await db
      .select({ category: shoppingItems.category })
      .from(shoppingItems)
      .where(ilike(shoppingItems.name, task.title))
      .orderBy(desc(shoppingItems.updatedAt))
      .limit(1);

    // 2. Keyword fallback.
    const category = historyMatch?.category ?? guessShoppingCategory(task.title);

    const [newItem] = await db
      .insert(shoppingItems)
      .values({
        listId: targetList.id,
        name: task.title,
        category: category || null,
        addedBy: auth.userId,
      })
      .returning();

    if (!newItem) {
      return NextResponse.json({ error: 'Failed to create shopping item' }, { status: 500 });
    }

    await invalidateEntity('shopping-lists');

    logActivity({
      userId: auth.userId,
      action: 'create',
      entityType: 'shopping_item',
      entityId: newItem.id,
      summary: `Moved task to shopping: ${newItem.name}`,
    });

    return NextResponse.json({
      id: newItem.id,
      listId: newItem.listId,
      listName: targetList.name,
      name: newItem.name,
      category: newItem.category,
    }, { status: 201 });
  } catch (error) {
    logError('Error moving task to shopping:', error);
    return NextResponse.json({ error: 'Failed to move task to shopping' }, { status: 500 });
  }
}
