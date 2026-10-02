/**
 * Severe weather alerts API route (MeteoAlarm — EU national warnings).
 *
 * ENDPOINT: /api/weather/alerts
 *   GET — current in-force alerts for the configured country.
 *
 * Country comes from the `weatherAlerts` DB setting (Settings -> Display)
 * if set, else the WEATHER_ALERT_COUNTRY env var (e.g. "denmark"), matching
 * MeteoAlarm's own feed slugs — see lib/integrations/meteoalarm.ts. Neither
 * set means the feature is simply off: `configured: false`, no error.
 */

import { NextResponse } from 'next/server';
import { optionalAuth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { fetchSevereWeatherAlerts } from '@/lib/integrations/meteoalarm';
import { getCached } from '@/lib/cache/redis';
import { logError } from '@/lib/utils/logError';

// Official warnings don't change second-to-second; 15 minutes keeps this
// fresh without hammering MeteoAlarm on every dashboard poll.
const ALERTS_CACHE_TTL = 15 * 60;

async function resolveAlertCountry(): Promise<string | null> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, 'weatherAlerts'));
    const stored = (row?.value as { country?: string } | undefined)?.country?.trim().toLowerCase();
    if (stored) return stored;
  } catch { /* fall through to env */ }
  return process.env.WEATHER_ALERT_COUNTRY?.trim().toLowerCase() || null;
}

export async function GET() {
  const _auth = await optionalAuth();

  const country = await resolveAlertCountry();
  if (!country) {
    return NextResponse.json({ alerts: [], configured: false });
  }

  try {
    const alerts = await getCached(
      `weather-alerts:${country}`,
      () => fetchSevereWeatherAlerts(country),
      ALERTS_CACHE_TTL,
    );
    return NextResponse.json({ alerts, configured: true });
  } catch (error) {
    logError('Weather alerts fetch failed:', error);
    // A transient feed hiccup shouldn't surface as a page-level error — the
    // rest of the weather page is unaffected, so degrade quietly.
    return NextResponse.json({ alerts: [], configured: true, error: 'Failed to fetch alerts' });
  }
}
