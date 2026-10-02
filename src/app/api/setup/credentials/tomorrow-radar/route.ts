/**
 * POST /api/setup/credentials/tomorrow-radar
 * Saves a Tomorrow.io API key to the DB (encrypted) — the forecast-radar
 * tab on the Weather page picks it up via getTomorrowRadarApiKey(), which
 * checks here first and falls back to TOMORROW_IO_API_KEY in .env.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { encrypt } from '@/lib/utils/crypto';
import { requireAuth, requireRole } from '@/lib/auth';
import { logError } from '@/lib/utils/logError';

const SETTINGS_KEY = 'credentials.tomorrowRadar';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const forbidden = requireRole(auth, 'canModifySettings');
  if (forbidden) return forbidden;

  try {
    const body = await request.json() as { apiKey?: string };
    const { apiKey } = body;
    if (!apiKey?.trim()) {
      return NextResponse.json({ error: 'apiKey is required' }, { status: 400 });
    }

    const value = { apiKey: encrypt(apiKey.trim()) };

    const existing = await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY));
    if (existing.length > 0) {
      await db.update(settings).set({ value }).where(eq(settings.key, SETTINGS_KEY));
    } else {
      await db.insert(settings).values({ key: SETTINGS_KEY, value });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError('[setup/credentials/tomorrow-radar]', error);
    return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 });
  }
}

export async function DELETE() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const forbidden = requireRole(auth, 'canModifySettings');
  if (forbidden) return forbidden;

  try {
    await db.delete(settings).where(eq(settings.key, SETTINGS_KEY));
    return NextResponse.json({ ok: true });
  } catch (error) {
    logError('[setup/credentials/tomorrow-radar]', error);
    return NextResponse.json({ error: 'Failed to remove API key' }, { status: 500 });
  }
}
