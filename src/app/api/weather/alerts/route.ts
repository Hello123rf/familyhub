/**
 * Severe weather alerts API route (MeteoAlarm — EU national warnings).
 *
 * ENDPOINT: /api/weather/alerts
 *   GET — current in-force alerts for the configured country.
 *
 * Country is set via WEATHER_ALERT_COUNTRY (e.g. "denmark"), matching
 * MeteoAlarm's own feed slugs — see lib/integrations/meteoalarm.ts. Absent
 * means the feature is simply off: `configured: false`, no error.
 */

import { NextResponse } from 'next/server';
import { optionalAuth } from '@/lib/auth';
import { fetchSevereWeatherAlerts } from '@/lib/integrations/meteoalarm';
import { getCached } from '@/lib/cache/redis';
import { logError } from '@/lib/utils/logError';

// Official warnings don't change second-to-second; 15 minutes keeps this
// fresh without hammering MeteoAlarm on every dashboard poll.
const ALERTS_CACHE_TTL = 15 * 60;

export async function GET() {
  const _auth = await optionalAuth();

  const country = process.env.WEATHER_ALERT_COUNTRY?.trim().toLowerCase();
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
