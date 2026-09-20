import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { recipes } from '@/lib/db/schema';
import { requireAuth, requireRole } from '@/lib/auth';
import { invalidateEntity } from '@/lib/cache/cacheKeys';
import { parseRecipeFromUrl } from '@/lib/utils/recipeParser';
import { validatePublicUrl, UnsafeUrlError } from '@/lib/utils/safeFetch';
import { logError } from '@/lib/utils/logError';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const forbidden = requireRole(auth, 'canManageRecipes');
  if (forbidden) return forbidden;

  const { rateLimitGuard } = await import('@/lib/cache/rateLimit');
  const limited = await rateLimitGuard(auth.userId, 'recipe-import', 10, 60);
  if (limited) return limited;

  try {
    const body = await request.json();

    if (!body.url || typeof body.url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // SSRF protection: block private/internal URLs
    try {
      validatePublicUrl(body.url, { isProduction: true });
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    // Parse recipe from URL
    const parsedRecipe = await parseRecipeFromUrl(body.url);

    if (!parsedRecipe) {
      return NextResponse.json(
        { error: 'Could not find recipe data on this page. The site may not use schema.org markup, or may be blocking automated access.' },
        { status: 422 }
      );
    }

    // Option to just preview without saving
    if (body.preview) {
      return NextResponse.json({
        preview: true,
        recipe: parsedRecipe,
      });
    }

    // Save to database
    const [newRecipe] = await db
      .insert(recipes)
      .values({
        name: parsedRecipe.name,
        description: parsedRecipe.description || null,
        url: parsedRecipe.url,
        sourceType: 'url_import',
        ingredients: parsedRecipe.ingredients,
        instructions: parsedRecipe.instructions || null,
        prepTime: parsedRecipe.prepTime || null,
        cookTime: parsedRecipe.cookTime || null,
        servings: parsedRecipe.servings || null,
        cuisine: parsedRecipe.cuisine || null,
        category: parsedRecipe.category || null,
        imageUrl: parsedRecipe.imageUrl || null,
        tags: [],
        createdBy: auth.userId,
      })
      .returning();

    await invalidateEntity('recipes');

    return NextResponse.json(newRecipe, { status: 201 });
  } catch (error) {
    logError('Error importing recipe from URL:', error);

    if (error instanceof Error) {
      if (error.message === 'Invalid URL') {
        return NextResponse.json(
          { error: 'Invalid URL format' },
          { status: 400 }
        );
      }
      if (error.message === 'Only HTTP/HTTPS URLs are supported') {
        return NextResponse.json(
          { error: 'Only HTTP/HTTPS URLs are supported' },
          { status: 400 }
        );
      }
      if (error.message.includes('403')) {
        return NextResponse.json(
          { error: 'This site blocks automated requests (Cloudflare). The headless browser fallback could not load the page. Try a different recipe site, or add the recipe manually.' },
          { status: 502 }
        );
      }
      if (error.message.startsWith('Failed to fetch URL:')) {
        return NextResponse.json(
          { error: error.message },
          { status: 502 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to import recipe from URL' },
      { status: 500 }
    );
  }
}
