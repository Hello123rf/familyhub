/**
 * ENDPOINT: /api/kiosk/[slug]/complete/[choreId]
 *
 * POST - Mark a chore complete from the Kindle kiosk.
 *        Authenticated by the kiosk slug (token), not a session cookie.
 *        Redirects back to /kiosk/[slug] after completion so the e-ink
 *        Kindle's form submission refreshes the page without JS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { settings, chores, choreCompletions, users } from '@/lib/db/schema';
import { eq, and, isNull, like } from 'drizzle-orm';
import { invalidateEntity } from '@/lib/cache/cacheKeys';
import { calculateNextDue } from '@/lib/utils/calculateNextDue';
import { logError } from '@/lib/utils/logError';

const KIOSK_KEY_PREFIX = 'kiosk:';
type KioskTokenValue = { userId: string; userName: string; userColor: string; createdAt: string };

interface RouteParams {
  params: Promise<{ slug: string; choreId: string }>;
}

async function resolveKioskToken(slug: string): Promise<{ userId: string; userName: string } | null> {
  const key = `${KIOSK_KEY_PREFIX}${slug}`;
  const rows = await db.select().from(settings).where(eq(settings.key, key));
  if (!rows[0]) return null;
  const val = rows[0].value as KioskTokenValue;
  return { userId: val.userId, userName: val.userName };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { slug, choreId } = await params;
  const redirectBase = `/kiosk/${slug}`;

  try {
    const identity = await resolveKioskToken(slug);
    if (!identity) {
      return NextResponse.redirect(new URL('/kiosk/invalid', request.url));
    }

    const { userId } = identity;

    const [chore] = await db
      .select({
        id: chores.id,
        title: chores.title,
        pointValue: chores.pointValue,
        requiresApproval: chores.requiresApproval,
        enabled: chores.enabled,
        assignedTo: chores.assignedTo,
        frequency: chores.frequency,
        customIntervalDays: chores.customIntervalDays,
        startDay: chores.startDay,
      })
      .from(chores)
      .where(eq(chores.id, choreId));

    if (!chore || !chore.enabled) {
      return NextResponse.redirect(new URL(redirectBase, request.url));
    }

    // Only allow completing chores assigned to this child
    if (chore.assignedTo && chore.assignedTo !== userId) {
      return NextResponse.redirect(new URL(redirectBase, request.url));
    }

    // Skip if already pending approval
    const [pending] = await db
      .select({ id: choreCompletions.id })
      .from(choreCompletions)
      .where(and(eq(choreCompletions.choreId, choreId), isNull(choreCompletions.approvedBy)));

    if (pending) {
      return NextResponse.redirect(new URL(redirectBase, request.url));
    }

    // Children always create a pending completion (parent approves)
    await db.transaction(async (tx) => {
      await tx.insert(choreCompletions).values({
        choreId,
        completedBy: userId,
        completedAt: new Date(),
        pointsAwarded: chore.pointValue,
        approvedBy: null,
        approvedAt: null,
      });
    });

    await invalidateEntity('chores');

    return NextResponse.redirect(new URL(redirectBase, request.url));
  } catch (error) {
    logError('Kiosk chore completion error:', error);
    return NextResponse.redirect(new URL(redirectBase, request.url));
  }
}
