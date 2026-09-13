/**
 * Single source of truth for "what category should this shopping item be
 * filed under, if the caller didn't say." Used by:
 *   - POST /api/shopping-items (any caller that omits category — notably
 *     "Add ingredients to shopping list" from a recipe)
 *   - taskToShoppingSync.ts (the Google Tasks -> Shopping auto-move flow)
 *
 * Was previously duplicated inline in taskToShoppingSync.ts only, which is
 * why recipe-sourced ingredients weren't getting categorized: that flow
 * calls the shopping-items API directly and never passed a category, and
 * nothing on the API side filled one in.
 */

import { db } from '@/lib/db/client';
import { shoppingItems } from '@/lib/db/schema';
import { ilike, desc } from 'drizzle-orm';
import { guessShoppingCategory } from '@/lib/utils/guessShoppingCategory';

/**
 * Returns `explicitCategory` unchanged if given. Otherwise:
 *   1. Looks up this household's own most recent shopping item with the same
 *      name (case-insensitive) and reuses its category — reflects how this
 *      family actually categorizes things, and self-corrects over time.
 *   2. Falls back to a built-in keyword dictionary for common groceries.
 *   3. Returns null if neither matches (still addable, just uncategorized).
 */
export async function resolveShoppingCategory(
  itemName: string,
  explicitCategory?: string | null,
): Promise<string | null> {
  if (explicitCategory) return explicitCategory;

  const [historyMatch] = await db
    .select({ category: shoppingItems.category })
    .from(shoppingItems)
    .where(ilike(shoppingItems.name, itemName))
    .orderBy(desc(shoppingItems.updatedAt))
    .limit(1);

  return historyMatch?.category ?? guessShoppingCategory(itemName) ?? null;
}
