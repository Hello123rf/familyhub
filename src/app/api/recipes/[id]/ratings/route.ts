/**
 * POST /api/recipes/[id]/ratings
 *
 * Sets or clears the CALLING user's own rating for a recipe - never
 * someone else's, there is no userId in the body. A person can only rate
 * if a parent has opted them into meal ratings (users.includeInMealRatings);
 * this is "admin picks who rates", not self-service opt-in.
 *
 * recipes.rating is kept as the computed average across every rating row
 * for the recipe, recalculated here after every write. It's what sorting
 * and the recipe card's single star number read - there's no longer a
 * direct way to set it other than through a per-person rating.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { recipes, recipeRatings, users } from '@/lib/db/schema';
import { eq, and, avg } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { invalidateEntity } from '@/lib/cache/cacheKeys';
import { logError } from '@/lib/utils/logError';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function recalculateAverage(recipeId: string) {
  const [result] = await db
    .select({ avgRating: avg(recipeRatings.rating) })
    .from(recipeRatings)
    .where(eq(recipeRatings.recipeId, recipeId));

  const average = result?.avgRating ? Math.round(Number(result.avgRating)) : null;
  await db.update(recipes).set({ rating: average, updatedAt: new Date() }).where(eq(recipes.id, recipeId));
  return average;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id: recipeId } = await params;
    const body = await request.json();

    if (body.rating !== null && (typeof body.rating !== 'number' || !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)) {
      return NextResponse.json({ error: 'rating must be an integer 1-5, or null to clear it' }, { status: 400 });
    }

    const [recipe] = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.id, recipeId));
    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 });
    }

    const [me] = await db.select({ includeInMealRatings: users.includeInMealRatings }).from(users).where(eq(users.id, auth.userId));
    if (!me?.includeInMealRatings) {
      return NextResponse.json({ error: 'Meal ratings are not enabled for your profile. Ask a parent to turn it on in Settings.' }, { status: 403 });
    }

    if (body.rating === null) {
      await db.delete(recipeRatings).where(and(eq(recipeRatings.recipeId, recipeId), eq(recipeRatings.userId, auth.userId)));
    } else {
      await db
        .insert(recipeRatings)
        .values({ recipeId, userId: auth.userId, rating: body.rating })
        .onConflictDoUpdate({
          target: [recipeRatings.recipeId, recipeRatings.userId],
          set: { rating: body.rating, updatedAt: new Date() },
        });
    }

    const averageRating = await recalculateAverage(recipeId);
    await invalidateEntity('recipes');

    const ratingRows = await db
      .select({
        userId: recipeRatings.userId,
        userName: users.name,
        userColor: users.color,
        rating: recipeRatings.rating,
      })
      .from(recipeRatings)
      .innerJoin(users, eq(recipeRatings.userId, users.id))
      .where(eq(recipeRatings.recipeId, recipeId));

    return NextResponse.json({ ratings: ratingRows, averageRating });
  } catch (error) {
    logError('Error rating recipe:', error);
    return NextResponse.json({ error: 'Failed to save rating' }, { status: 500 });
  }
}
