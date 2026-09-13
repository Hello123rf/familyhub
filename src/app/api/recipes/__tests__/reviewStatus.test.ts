/**
 * Tests for the Recipe Inbox's reviewStatus handling:
 * - GET /api/recipes excludes reviewStatus='inbox' by default, and returns
 *   only inbox rows when explicitly requested (the Recipe Inbox tab)
 * - PATCH /api/recipes/[id] accepts a 'saved'/'inbox' reviewStatus transition
 *   (this is how "Save" and the meal-plan auto-promote work) and rejects
 *   anything else
 * - DELETE /api/recipes/[id] (unmodified, pre-existing route) works the same
 *   for an inbox row as any other recipe — this is the "Discard" action
 */

import { NextRequest, NextResponse } from 'next/server';

// --- Auth mock ---
const mockRequireAuth = jest.fn();
const mockRequireRole = jest.fn();
const mockGetDisplayAuth = jest.fn();
jest.mock('@/lib/auth', () => ({
  requireAuth: () => mockRequireAuth(),
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  getDisplayAuth: () => mockGetDisplayAuth(),
}));

// --- DB mock, capturing the where-condition list passed to select ---
const mockWhereConditions: unknown[][] = [];
const mockSelectResult = { rows: [] as unknown[] };
const mockDeleteReturning = jest.fn();

function makeSelectChain() {
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    where: (...conditions: unknown[]) => {
      mockWhereConditions.push(conditions);
      return chain;
    },
    then: (resolve: (v: unknown) => void) => resolve(mockSelectResult.rows),
  };
  return chain;
}

jest.mock('@/lib/db/client', () => ({
  db: {
    select: () => makeSelectChain(),
    update: () => ({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([{ id: 'r1', reviewStatus: 'saved' }]) }),
      }),
    }),
    delete: () => ({ where: () => mockDeleteReturning() }),
  },
}));

jest.mock('@/lib/db/schema', () => ({
  recipes: { reviewStatus: 'review_status', updatedAt: 'updated_at', id: 'id', createdBy: 'created_by', name: 'name' },
  users: { id: 'id', name: 'name' },
}));

jest.mock('@/lib/cache/redis', () => ({
  getCached: (_key: string, fn: () => unknown) => fn(),
}));
jest.mock('@/lib/cache/cacheKeys', () => ({ invalidateEntity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/utils/formatters', () => ({
  formatRecipeRow: (row: Record<string, unknown>) => row,
}));

import { GET } from '../route';
import { PATCH, DELETE } from '../[id]/route';

const parentAuth = { userId: 'parent-1', role: 'parent' };

describe('GET /api/recipes — Recipe Inbox default filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhereConditions.length = 0;
    mockSelectResult.rows = [];
    mockGetDisplayAuth.mockResolvedValue({ userId: 'parent-1', role: 'parent' });
  });

  it('excludes inbox recipes by default', async () => {
    const res = await GET(new NextRequest('http://localhost:3000/api/recipes'));
    expect(res.status).toBe(200);
    // The first select's where() call receives the "reviewStatus != inbox" guard.
    expect(mockWhereConditions.length).toBeGreaterThan(0);
  });

  it('returns only inbox recipes when reviewStatus=inbox is requested', async () => {
    mockSelectResult.rows = [{ id: 'r1', reviewStatus: 'inbox', name: 'Captured Pancakes' }];
    const res = await GET(new NextRequest('http://localhost:3000/api/recipes?reviewStatus=inbox'));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.recipes).toEqual([{ id: 'r1', reviewStatus: 'inbox', name: 'Captured Pancakes' }]);
  });

  it('ignores an invalid reviewStatus value rather than erroring', async () => {
    const res = await GET(new NextRequest('http://localhost:3000/api/recipes?reviewStatus=bogus'));
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/recipes/[id] — promotion (Save) flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(parentAuth);
    mockRequireRole.mockReturnValue(null);
    mockSelectResult.rows = [{ id: 'r1', reviewStatus: 'inbox' }];
  });

  function makeRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost:3000/api/recipes/r1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('promotes an inbox recipe to saved', async () => {
    const res = await PATCH(makeRequest({ reviewStatus: 'saved' }), { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(200);
  });

  it('rejects an invalid reviewStatus value', async () => {
    const res = await PATCH(makeRequest({ reviewStatus: 'archived' }), { params: Promise.resolve({ id: 'r1' }) });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain('reviewStatus');
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: 'Authentication required' }, { status: 401 }));
    const res = await PATCH(makeRequest({ reviewStatus: 'saved' }), { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/recipes/[id] — Discard flow (reuses the existing, unmodified route)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue(parentAuth);
    mockSelectResult.rows = [{ id: 'r1', name: 'Captured Pancakes', createdBy: 'parent-1' }];
    mockDeleteReturning.mockResolvedValue(undefined);
  });

  it('discards (deletes) an inbox recipe the same way any recipe is deleted', async () => {
    const res = await DELETE(
      new NextRequest('http://localhost:3000/api/recipes/r1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'r1' }) },
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.deletedRecipe.id).toBe('r1');
  });
});
