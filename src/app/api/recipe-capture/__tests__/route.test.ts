/**
 * Tests for POST /api/recipe-capture.
 *
 * Covers the LAN-first security model:
 * - missing/invalid token/session -> 401/403
 * - a request that transited Cloudflare is rejected even with a valid token
 * - a narrowly-scoped 'recipe:capture' token succeeds
 * - a session with canManageRecipes succeeds (the laptop bookmarklet path)
 */

import { NextRequest, NextResponse } from 'next/server';

const mockRequireAuth = jest.fn();
const mockRequireRole = jest.fn();

jest.mock('@/lib/auth', () => ({
  requireAuth: () => mockRequireAuth(),
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

jest.mock('@/lib/cache/rateLimit', () => ({
  rateLimitGuard: jest.fn().mockResolvedValue(null),
}));

const mockCapture = jest.fn();
jest.mock('@/lib/services/recipeCapture', () => ({
  captureRecipeFromUrl: (...args: unknown[]) => mockCapture(...args),
}));

import { POST } from '../route';

function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/recipe-capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/recipe-capture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when there is no session and no valid token', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    );
    const res = await POST(makeRequest({ url: 'https://example.com/recipe' }));
    expect(res.status).toBe(401);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('rejects a token missing the recipe:capture scope', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'parent', scopes: ['voice'] });
    const res = await POST(makeRequest({ url: 'https://example.com/recipe' }));
    expect(res.status).toBe(403);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('rejects any request bearing Cloudflare headers, even with a valid token', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'parent', scopes: ['recipe:capture'] });
    const res = await POST(
      makeRequest({ url: 'https://example.com/recipe' }, { 'cf-ray': '839f1234abcd-EWR' }),
    );
    expect(res.status).toBe(403);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('rejects Cloudflare-tunneled requests identified via cf-connecting-ip too', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'parent', scopes: ['recipe:capture'] });
    const res = await POST(
      makeRequest({ url: 'https://example.com/recipe' }, { 'cf-connecting-ip': '203.0.113.9' }),
    );
    expect(res.status).toBe(403);
  });

  it('succeeds for a token carrying the recipe:capture scope, over the LAN', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'parent', scopes: ['recipe:capture'] });
    mockCapture.mockResolvedValue({
      ok: true,
      recipe: { id: 'r1', name: 'Pancakes', imageUrl: null, reviewStatus: 'inbox' },
    });

    const res = await POST(makeRequest({ url: 'https://example.com/pancakes' }));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.name).toBe('Pancakes');
    expect(mockCapture).toHaveBeenCalledWith('https://example.com/pancakes', 'u1');
  });

  it('succeeds for a session with canManageRecipes (the laptop bookmarklet path)', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'parent-1', role: 'parent' }); // no `scopes` => session auth
    mockRequireRole.mockReturnValue(null); // allowed
    mockCapture.mockResolvedValue({
      ok: true,
      recipe: { id: 'r2', name: 'Soup', imageUrl: null, reviewStatus: 'inbox' },
    });

    const res = await POST(makeRequest({ url: 'https://example.com/soup' }));
    expect(res.status).toBe(201);
    expect(mockRequireRole).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'parent-1' }),
      'canManageRecipes',
    );
  });

  it('rejects a session without canManageRecipes', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'child-1', role: 'child' });
    mockRequireRole.mockReturnValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const res = await POST(makeRequest({ url: 'https://example.com/soup' }));
    expect(res.status).toBe(403);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('propagates a malformed-URL error from the capture service as-is', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'parent', scopes: ['recipe:capture'] });
    mockCapture.mockResolvedValue({ ok: false, status: 400, error: 'URL is required' });

    const res = await POST(makeRequest({}));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('URL is required');
  });
});
