/**
 * Regression test: POST /api/shopping-items must auto-categorize an item
 * when the caller omits `category` — this is what makes "Add ingredients
 * to shopping list" from a recipe land items in their proper category
 * lane instead of always falling into "Other".
 */

import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/auth', () => ({ requireAuth: () => mockRequireAuth() }));

jest.mock('@/lib/cache/rateLimit', () => ({ rateLimitGuard: jest.fn().mockResolvedValue(null) }));
jest.mock('@/lib/cache/cacheKeys', () => ({ invalidateEntity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/services/auditLog', () => ({ logActivity: jest.fn() }));
jest.mock('@/lib/utils/formatters', () => ({ formatShoppingItemRow: (row: unknown) => row }));

const mockResolveCategory = jest.fn();
jest.mock('@/lib/services/resolveShoppingCategory', () => ({
  resolveShoppingCategory: (...args: unknown[]) => mockResolveCategory(...args),
}));

const mockInsertReturning = jest.fn();
jest.mock('@/lib/db/client', () => ({
  db: {
    insert: () => ({ values: (v: unknown) => ({ returning: () => mockInsertReturning(v) }) }),
  },
}));
jest.mock('@/lib/db/schema', () => ({ shoppingItems: {}, users: {} }));

import { POST } from '../route';

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/shopping-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/shopping-items — auto-categorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'parent-1', role: 'parent' });
    mockInsertReturning.mockResolvedValue([{
      id: 'item-1', listId: '11111111-1111-1111-1111-111111111111', name: '1 bunch kale', quantity: null, unit: null,
      category: 'produce', checked: false, recurring: false, recurrenceInterval: null, notes: null,
      createdAt: new Date(),
    }]);
  });

  it('resolves a category when the caller omits one (the recipe-ingredient case)', async () => {
    mockResolveCategory.mockResolvedValue('produce');

    const res = await POST(makeRequest({ listId: '11111111-1111-1111-1111-111111111111', name: '1 bunch kale' }));
    const data = await res.json();

    expect(mockResolveCategory).toHaveBeenCalledWith('1 bunch kale', undefined);
    expect(mockInsertReturning).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'produce' }),
    );
    expect(data.category).toBe('produce');
  });

  it('still honors an explicit category from the caller', async () => {
    mockResolveCategory.mockResolvedValue('dairy'); // resolver would pass explicit through unchanged
    await POST(makeRequest({ listId: '11111111-1111-1111-1111-111111111111', name: 'Milk', category: 'dairy' }));
    expect(mockResolveCategory).toHaveBeenCalledWith('Milk', 'dairy');
  });
});
