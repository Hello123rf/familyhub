/**
 * POST /api/recipe-capture
 *
 * LAN-first recipe capture: an Apple Shortcut (Share Sheet -> Get Contents
 * of URL) POSTs a page URL here with a narrowly-scoped API token
 * (scope 'recipe:capture', minted in Settings -> Security -> API Tokens).
 * The recipe lands in the Recipe Inbox for review, exactly like a URL
 * pasted into the in-app "Import from URL" flow, via the same parser
 * (see src/lib/services/recipeCapture.ts).
 *
 * Also accepts a normal Prism session (for the laptop bookmarklet flow,
 * which navigates to /recipe-capture — a real page — rather than doing a
 * cross-origin fetch from the recipe site itself; see docs/features/
 * RECIPE_CAPTURE.md for why that mixed-content/CORS approach doesn't work).
 *
 * Deliberately rejects any request that arrived via the Cloudflare tunnel,
 * even with a valid token: this token is meant to work only on the home
 * LAN. See isRequestFromCloudflare below.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth';
import { captureRecipeFromUrl } from '@/lib/services/recipeCapture';
import { logError } from '@/lib/utils/logError';

/**
 * Cloudflare's edge unconditionally sets/overwrites cf-ray and
 * cf-connecting-ip on every request that actually passes through it — a
 * client cannot forge "I came through Cloudflare" by adding these headers
 * themselves when hitting Prism directly, and a request that reaches Prism
 * directly on the LAN (as this tunnel is configured — straight to the app
 * container, not through nginx) will never carry them. Presence of cf-ray is
 * therefore a reliable "this transited the public tunnel" signal.
 */
function isRequestFromCloudflare(request: NextRequest): boolean {
  return request.headers.has('cf-ray') || request.headers.has('cf-connecting-ip');
}

export async function POST(request: NextRequest) {
  if (isRequestFromCloudflare(request)) {
    return NextResponse.json(
      { error: 'This endpoint is only available on the home network' },
      { status: 403 },
    );
  }

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Token callers must carry the narrow 'recipe:capture' (or '*') scope —
  // a leaked Shortcut token can't do anything else. Session callers (the
  // laptop bookmarklet's /recipe-capture page) go through the normal
  // canManageRecipes permission, same as every other recipe-write route.
  if (auth.scopes !== undefined) {
    if (!auth.scopes.includes('*') && !auth.scopes.includes('recipe:capture')) {
      return NextResponse.json(
        { error: "Token scope must include 'recipe:capture' or '*'" },
        { status: 403 },
      );
    }
  } else {
    const forbidden = requireRole(auth, 'canManageRecipes');
    if (forbidden) return forbidden;
  }

  const { rateLimitGuard } = await import('@/lib/cache/rateLimit');
  const limited = await rateLimitGuard(auth.userId, 'recipe-capture', 10, 60);
  if (limited) return limited;

  try {
    const body = await request.json().catch(() => ({}));
    const result = await captureRecipeFromUrl(body.url, auth.userId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      id: result.recipe.id,
      name: result.recipe.name,
      imageUrl: result.recipe.imageUrl,
      reviewStatus: result.recipe.reviewStatus,
    }, { status: 201 });
  } catch (error) {
    // Never log the request body/headers here — the token must never reach logs.
    logError('Error capturing recipe:', error);
    return NextResponse.json({ error: 'Failed to capture recipe' }, { status: 500 });
  }
}
