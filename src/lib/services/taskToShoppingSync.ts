/**
 * Copies a task's title into a shopping list item, guessing a grocery
 * category so common items don't need a manual tap every time. Used by:
 *   - POST /api/tasks/[id]/move-to-shopping (manual, one task, one tap)
 *   - autoShoppingSyncCron.ts (automatic, all qualifying tasks, every tick)
 */

import { db } from '@/lib/db/client';
import { tasks, shoppingItems, shoppingLists } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { resolveShoppingCategory } from '@/lib/services/resolveShoppingCategory';
import { invalidateEntity } from '@/lib/cache/cacheKeys';

export interface MoveResult {
  id: string;
  listId: string;
  listName: string;
  name: string;
  category: string | null;
}

/**
 * Moves one task into a shopping list. Does not touch the source task —
 * callers decide whether/how to mark it done (the manual route reuses the
 * toggle endpoint from the client; the cron marks it done directly).
 */
export async function moveTaskToShoppingItem(
  task: typeof tasks.$inferSelect,
  addedBy: string | null,
  targetListId?: string,
): Promise<MoveResult | null> {
  const targetList = targetListId
    ? (await db.select().from(shoppingLists).where(eq(shoppingLists.id, targetListId)))[0]
    : (await db.select().from(shoppingLists).orderBy(asc(shoppingLists.sortOrder)).limit(1))[0];

  if (!targetList) return null;

  const category = await resolveShoppingCategory(task.title);

  const [newItem] = await db
    .insert(shoppingItems)
    .values({
      listId: targetList.id,
      name: task.title,
      category: category || null,
      addedBy,
    })
    .returning();

  if (!newItem) return null;

  await invalidateEntity('shopping-lists');

  return {
    id: newItem.id,
    listId: newItem.listId,
    listName: targetList.name,
    name: newItem.name,
    category: newItem.category,
  };
}
