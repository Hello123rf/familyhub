/**
 * Tests for resolveShoppingCategory — the shared category-guessing logic
 * used by POST /api/shopping-items (notably "Add ingredients to shopping
 * list" from a recipe) and taskToShoppingSync.ts (Google Tasks auto-move).
 *
 * Regression coverage: adding recipe ingredients to the shopping list was
 * landing everything in "Other" because the API route never guessed a
 * category when the caller omitted one — this file exercises the fix.
 */

const mockSelectResult: { rows: Array<{ category: string | null }> } = { rows: [] };

jest.mock('@/lib/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve(mockSelectResult.rows),
          }),
        }),
      }),
    }),
  },
}));

jest.mock('@/lib/db/schema', () => ({ shoppingItems: { name: 'name', category: 'category', updatedAt: 'updated_at' } }));

import { resolveShoppingCategory } from '../resolveShoppingCategory';

describe('resolveShoppingCategory', () => {
  beforeEach(() => {
    mockSelectResult.rows = [];
  });

  it('returns the explicit category unchanged when one is given', async () => {
    const result = await resolveShoppingCategory('milk', 'dairy');
    expect(result).toBe('dairy');
  });

  it('reuses this household\'s own most recent category for the same item name', async () => {
    mockSelectResult.rows = [{ category: 'pantry' }];
    const result = await resolveShoppingCategory('kale');
    expect(result).toBe('pantry'); // history wins even if it disagrees with the keyword guess
  });

  it('falls back to the keyword dictionary when there is no purchase history', async () => {
    mockSelectResult.rows = [];
    const result = await resolveShoppingCategory('Italian sausage');
    expect(result).toBe('meat');
  });

  it('returns null when neither history nor keywords match', async () => {
    mockSelectResult.rows = [];
    const result = await resolveShoppingCategory('xyzzy-widget');
    expect(result).toBeNull();
  });
});
