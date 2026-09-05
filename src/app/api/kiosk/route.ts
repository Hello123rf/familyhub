/**
 * ENDPOINT: /api/kiosk
 * Manages per-child kiosk tokens for the e-ink Kindle morning checklist.
 *
 * GET  - List all active kiosk tokens (parent only)
 * POST - Generate a token for a child (parent only)
 * DELETE - Revoke a token for a child (parent only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { settings, users } from '@/lib/db/schema';
import { eq, like } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { logError } from '@/lib/utils/logError';

const KIOSK_KEY_PREFIX = 'kiosk:';

type KioskTokenValue = { userId: string; userName: string; userColor: string; createdAt: string };

export async function GET(_request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const forbidden = requireRole(auth, 'canManageChores');
  if (forbidden) return forbidden;

  try {
    const rows = await db
      .select()
      .from(settings)
      .where(like(settings.key, `${KIOSK_KEY_PREFIX}%`));

    const tokens = rows.map((row) => {
      const token = row.key.slice(KIOSK_KEY_PREFIX.length);
      const val = row.value as KioskTokenValue;
      return { token, userId: val.userId, userName: val.userName, userColor: val.userColor, createdAt: val.createdAt };
    });

    return NextResponse.json({ tokens });
  } catch (error) {
    logError('Error listing kiosk tokens:', error);
    return NextResponse.json({ error: 'Failed to list kiosk tokens' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const forbidden = requireRole(auth, 'canManageChores');
  if (forbidden) return forbidden;

  try {
    const { userId } = await request.json() as { userId: string };
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const [user] = await db.select({ id: users.id, name: users.name, color: users.color, role: users.role })
      .from(users).where(eq(users.id, userId));

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (user.role !== 'child') return NextResponse.json({ error: 'Kiosk links are for child accounts only' }, { status: 400 });

    // Revoke any existing token for this child
    const existing = await db.select().from(settings).where(like(settings.key, `${KIOSK_KEY_PREFIX}%`));
    for (const row of existing) {
      const val = row.value as KioskTokenValue;
      if (val.userId === userId) {
        await db.delete(settings).where(eq(settings.key, row.key));
      }
    }

    const token = randomBytes(24).toString('hex');
    const key = `${KIOSK_KEY_PREFIX}${token}`;
    const value: KioskTokenValue = {
      userId: user.id,
      userName: user.name,
      userColor: user.color,
      createdAt: new Date().toISOString(),
    };

    await db.insert(settings).values({ key, value });

    return NextResponse.json({ token, userId: user.id, userName: user.name });
  } catch (error) {
    logError('Error creating kiosk token:', error);
    return NextResponse.json({ error: 'Failed to create kiosk token' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const forbidden = requireRole(auth, 'canManageChores');
  if (forbidden) return forbidden;

  try {
    const { userId } = await request.json() as { userId: string };
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const existing = await db.select().from(settings).where(like(settings.key, `${KIOSK_KEY_PREFIX}%`));
    let revoked = 0;
    for (const row of existing) {
      const val = row.value as KioskTokenValue;
      if (val.userId === userId) {
        await db.delete(settings).where(eq(settings.key, row.key));
        revoked++;
      }
    }

    return NextResponse.json({ revoked });
  } catch (error) {
    logError('Error revoking kiosk token:', error);
    return NextResponse.json({ error: 'Failed to revoke kiosk token' }, { status: 500 });
  }
}
