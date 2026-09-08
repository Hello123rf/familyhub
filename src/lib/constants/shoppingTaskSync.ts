/**
 * Shared between the client (TaskRow's manual "move to Shopping" button) and
 * the server (autoShoppingSync cron): which task lists are treated as
 * shopping lists, purely by name. Kept in one place so the button and the
 * background cron agree on exactly the same lists.
 */
export const SHOPPING_LIST_KEYWORDS = ['shopping', 'grocery', 'groceries'];

export function isShoppingListName(name: string): boolean {
  const lower = name.toLowerCase();
  return SHOPPING_LIST_KEYWORDS.some((kw) => lower.includes(kw));
}
