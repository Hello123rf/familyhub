/**
 * Shared "capture a recipe URL into the Inbox" logic, used by both:
 *   - POST /api/recipe-capture (LAN Shortcut, API-token authenticated)
 *   - POST /recipe-capture's page action (laptop bookmarklet flow, session authenticated)
 *
 * Deliberately thin: it reuses parseRecipeFromUrl (the same parser
 * /api/recipes/import-url uses) and validatePublicUrl (the same SSRF guard) —
 * no second parser, no second validation logic.
 */

import { db } from '@/lib/db/client';
import { recipes } from '@/lib/db/schema';
import { validatePublicUrl, UnsafeUrlError } from '@/lib/utils/safeFetch';
import { parseRecipeFromUrl } from '@/lib/utils/recipeParser';
import { invalidateEntity } from '@/lib/cache/cacheKeys';

type RecipeRow = typeof recipes.$inferSelect;

export type CaptureResult =
  | { ok: true; recipe: RecipeRow }
  | { ok: false; status: number; error: string };

async function insertInboxRecipe(
  parsed: Awaited<ReturnType<typeof parseRecipeFromUrl>>,
  createdBy: string | null,
) {
  if (!parsed) throw new Error('parsed recipe is null');
  const [newRecipe] = await db
    .insert(recipes)
    .values({
      name: parsed.name,
      description: parsed.description || null,
      url: parsed.url,
      sourceType: 'lan_capture',
      reviewStatus: 'inbox',
      ingredients: parsed.ingredients,
      instructions: parsed.instructions || null,
      prepTime: parsed.prepTime || null,
      cookTime: parsed.cookTime || null,
      servings: parsed.servings || null,
      cuisine: parsed.cuisine || null,
      category: parsed.category || null,
      imageUrl: parsed.imageUrl || null,
      tags: [],
      createdBy,
    })
    .returning();

  return newRecipe;
}

/**
 * Validates the URL, parses it, and inserts it into the Inbox.
 * `createdBy` is null for bearer-token captures (no session exists);
 * pass the real userId for session-authenticated captures.
 */
export async function captureRecipeFromUrl(
  url: unknown,
  createdBy: string | null,
): Promise<CaptureResult> {
  if (!url || typeof url !== 'string') {
    return { ok: false, status: 400, error: 'URL is required' };
  }

  try {
    validatePublicUrl(url, { isProduction: true });
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return { ok: false, status: 400, error: err.message };
    }
    throw err;
  }

  let parsed;
  try {
    parsed = await parseRecipeFromUrl(url);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Invalid URL') {
        return { ok: false, status: 400, error: 'Invalid URL format' };
      }
      if (error.message === 'Only HTTP/HTTPS URLs are supported') {
        return { ok: false, status: 400, error: error.message };
      }
      if (error.message.includes('403')) {
        return {
          ok: false, status: 502,
          error: 'This site blocks automated requests. Try a different recipe site, or add the recipe manually.',
        };
      }
      if (error.message.startsWith('Failed to fetch URL:')) {
        return { ok: false, status: 502, error: error.message };
      }
    }
    throw error;
  }

  if (!parsed) {
    return {
      ok: false, status: 422,
      error: 'Could not find recipe data on this page. The site may not use schema.org markup, or may be blocking automated access.',
    };
  }

  const newRecipe = await insertInboxRecipe(parsed, createdBy);
  if (!newRecipe) {
    return { ok: false, status: 500, error: 'Failed to save captured recipe' };
  }

  await invalidateEntity('recipes');

  return { ok: true, recipe: newRecipe };
}
