/**
 * Tests for POST /api/recipes/[id]/ratings.
 *
 * Covers:
 * - 403 when the caller isn't opted into meal ratings (admin-gated, not self-service)
 * - setting a rating upserts it and recomputes recipes.rating as the average
 * - clearing a rating (rating: null) deletes the row instead of upserting
 * - 400 on an out-of-range rating
 */

import { NextRequest, NextResponse } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/auth', () => ({
  requireAuth: () => mockRequireAuth(),
}));

jest.mock('@/lib/cache/cacheKeys', () => ({ invalidateEntity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/utils/logError', () => ({ logError: jest.fn() }));

// --- DB mock ---
// Each db.select(...) call in the route is routed by the table passed to
// .from(), rather than by call order, so the test stays correct if the
// route's internal call sequence shifts.
const mockRecipeRow = { id: 'recipe-1' };
let mockIncludeInMealRatings = true;
const mockAverage = { avgRating: '4' };
const mockRatingRows = [
  { userId: 'kid-1', userName: 'Alice', userColor: '#111111', rating: 4 },
];

const mockDeleteWhere = jest.fn().mockResolvedValue(undefined);
const mockUpdateSet = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
const mockOnConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
const mockInsertValues = jest.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });

jest.mock('@/lib/db/client', () => ({
  db: {
    select: (fields: Record<string, unknown>) => ({
      from: (table: Record<string, unknown>) => {
        if ('reviewStatus' in table) return { where: () => Promise.resolve([mockRecipeRow]) };
        if ('includeInMealRatings' in table) {
          return { where: () => Promise.resolve([{ includeInMealRatings: mockIncludeInMealRatings }]) };
        }
        // recipeRatings table: either the avg query (fields has avgRating)
        // or the final per-person list query (joins users, no avgRating).
        if ('avgRating' in fields) return { where: () => Promise.resolve([mockAverage]) };
        return { innerJoin: () => ({ where: () => Promise.resolve(mockRatingRows) }) };
      },
    }),
    insert: () => ({ values: mockInsertValues }),
    update: () => ({ set: mockUpdateSet }),
    delete: () => ({ where: mockDeleteWhere }),
  },
}));

jest.mock('@/lib/db/schema', () => ({
  recipes: { id: 'id', reviewStatus: 'review_status' },
  users: { id: 'id', includeInMealRatings: 'include_in_meal_ratings', name: 'name', color: 'color' },
  recipeRatings: { recipeId: 'recipe_id', userId: 'user_id', rating: 'rating' },
}));

import { POST } from '../route';

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/recipes/recipe-1/ratings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/recipes/[id]/ratings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'kid-1', role: 'child' });
    mockIncludeInMealRatings = true;
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: 'Authentication required' }, { status: 401 }));
    const res = await POST(makeRequest({ rating: 4 }), { params: Promise.resolve({ id: 'recipe-1' }) });
    expect(res.status).toBe(401);
  });

  it('rejects an out-of-range rating', async () => {
    const res = await POST(makeRequest({ rating: 6 }), { params: Promise.resolve({ id: 'recipe-1' }) });
    expect(res.status).toBe(400);
  });

  it('rejects a caller not opted into meal ratings', async () => {
    mockIncludeInMealRatings = false;
    const res = await POST(makeRequest({ rating: 4 }), { params: Promise.resolve({ id: 'recipe-1' }) });
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toContain('not enabled');
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('upserts a rating, recomputes the average, and returns the per-person list', async () => {
    const res = await POST(makeRequest({ rating: 4 }), { params: Promise.resolve({ id: 'recipe-1' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'recipe-1', userId: 'kid-1', rating: 4 }),
    );
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ rating: 4 }));
    expect(data.averageRating).toBe(4);
    expect(data.ratings).toEqual(mockRatingRows);
  });

  it('clears a rating by deleting the row instead of upserting', async () => {
    const res = await POST(makeRequest({ rating: null }), { params: Promise.resolve({ id: 'recipe-1' }) });

    expect(res.status).toBe(200);
    expect(mockDeleteWhere).toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});
