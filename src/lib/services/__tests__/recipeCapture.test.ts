/**
 * Tests for captureRecipeFromUrl (src/lib/services/recipeCapture.ts) — the
 * shared logic behind both POST /api/recipe-capture (LAN Shortcut) and the
 * laptop bookmarklet's /recipe-capture page. Confirms it reuses the same
 * parser as /api/recipes/import-url rather than a second implementation,
 * and that captured recipes land in the Inbox (reviewStatus: 'inbox'),
 * not the normal library.
 */

// --- DB mock ---
const mockInsertReturning = jest.fn();
const mockInsertValues = jest.fn((values: unknown) => ({ returning: () => mockInsertReturning(values) }));

jest.mock('@/lib/db/client', () => ({
  db: {
    insert: () => ({ values: (v: unknown) => mockInsertValues(v) }),
  },
}));

jest.mock('@/lib/db/schema', () => ({ recipes: {} }));

jest.mock('@/lib/cache/cacheKeys', () => ({ invalidateEntity: jest.fn().mockResolvedValue(undefined) }));

const mockParseRecipeFromUrl = jest.fn();
jest.mock('@/lib/utils/recipeParser', () => ({
  parseRecipeFromUrl: (...args: unknown[]) => mockParseRecipeFromUrl(...args),
}));

import { captureRecipeFromUrl } from '../recipeCapture';

describe('captureRecipeFromUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a missing/malformed URL without touching the parser', async () => {
    const result = await captureRecipeFromUrl(undefined, 'user-1');
    expect(result).toEqual({ ok: false, status: 400, error: 'URL is required' });
    expect(mockParseRecipeFromUrl).not.toHaveBeenCalled();
  });

  it('rejects a non-string URL', async () => {
    const result = await captureRecipeFromUrl(12345, 'user-1');
    expect(result.ok).toBe(false);
    expect(mockParseRecipeFromUrl).not.toHaveBeenCalled();
  });

  it('rejects an unsupported scheme (SSRF guard, shared with import-url)', async () => {
    const result = await captureRecipeFromUrl('ftp://example.com/recipe', 'user-1');
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(mockParseRecipeFromUrl).not.toHaveBeenCalled();
  });

  it('rejects a private/LAN URL target (SSRF guard)', async () => {
    const result = await captureRecipeFromUrl('http://192.168.1.1/recipe', 'user-1');
    expect(result).toMatchObject({ ok: false, status: 400, error: expect.stringContaining('private or internal') });
    expect(mockParseRecipeFromUrl).not.toHaveBeenCalled();
  });

  it('calls the exact same parser import-url uses — no second parser', async () => {
    mockParseRecipeFromUrl.mockResolvedValue({
      name: 'Pancakes', url: 'https://example.com/pancakes', ingredients: [{ text: '2 eggs' }],
    });
    mockInsertReturning.mockResolvedValue([{ id: 'r1', name: 'Pancakes', imageUrl: null, reviewStatus: 'inbox' }]);

    await captureRecipeFromUrl('https://example.com/pancakes', 'user-1');

    expect(mockParseRecipeFromUrl).toHaveBeenCalledWith('https://example.com/pancakes');
  });

  it('persists the captured recipe directly into the main list (reviewStatus: saved, sourceType: lan_capture)', async () => {
    mockParseRecipeFromUrl.mockResolvedValue({
      name: 'Pancakes', url: 'https://example.com/pancakes', ingredients: [{ text: '2 eggs' }],
    });
    mockInsertReturning.mockResolvedValue([{ id: 'r1', name: 'Pancakes', imageUrl: null, reviewStatus: 'saved' }]);

    const result = await captureRecipeFromUrl('https://example.com/pancakes', 'user-1');

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ reviewStatus: 'saved', sourceType: 'lan_capture', createdBy: 'user-1' }),
    );
    expect(result).toEqual({ ok: true, recipe: { id: 'r1', name: 'Pancakes', imageUrl: null, reviewStatus: 'saved' } });
  });

  it('allows createdBy: null for token-authenticated captures with no session', async () => {
    mockParseRecipeFromUrl.mockResolvedValue({ name: 'Soup', url: 'https://example.com/soup', ingredients: [] });
    mockInsertReturning.mockResolvedValue([{ id: 'r2', name: 'Soup' }]);

    await captureRecipeFromUrl('https://example.com/soup', null);

    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({ createdBy: null }));
  });

  it('returns 422 when the page has no parseable recipe data', async () => {
    mockParseRecipeFromUrl.mockResolvedValue(null);
    const result = await captureRecipeFromUrl('https://example.com/no-recipe', 'user-1');
    expect(result).toMatchObject({ ok: false, status: 422 });
    expect(mockInsertReturning).not.toHaveBeenCalled();
  });

  it('surfaces a clean 502 when the parser rejects with a fetch failure', async () => {
    mockParseRecipeFromUrl.mockRejectedValue(new Error('Failed to fetch URL: 503'));
    const result = await captureRecipeFromUrl('https://example.com/down', 'user-1');
    expect(result).toMatchObject({ ok: false, status: 502 });
  });
});
