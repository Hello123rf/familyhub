/**
 * Forecast radar tile proxy (Tomorrow.io).
 *
 * ENDPOINT: /api/weather/radar/forecast/tile?z=&x=&y=&frame=
 *   GET — one map tile (PNG bytes), cached server-side per (z,x,y,hour).
 *
 * This proxy exists specifically because of Tomorrow.io's free-tier rate
 * limit (25 req/hour) — see tomorrowRadar.ts. Every household viewer/kiosk
 * hitting this route shares ONE real upstream fetch per unique tile per
 * hour; without it, each client loading the map would consume its own share
 * of the budget directly against Tomorrow.io.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchTomorrowTile,
  frameTimestamp,
  TOMORROW_FORECAST_HOURS,
  type TomorrowForecastHour,
} from '@/lib/integrations/tomorrowRadar';
import { getCached } from '@/lib/cache/redis';
import { logError } from '@/lib/utils/logError';

// Just under an hour — frames are hour-rounded, so this naturally rotates
// forward in step with them rather than needing explicit invalidation.
const TILE_CACHE_TTL = 50 * 60;

export async function GET(request: NextRequest) {
  const apiKey = process.env.TOMORROW_IO_API_KEY;
  if (!apiKey) {
    return new NextResponse('Not configured', { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const z = Number(searchParams.get('z'));
  const x = Number(searchParams.get('x'));
  const y = Number(searchParams.get('y'));
  const frame = Number(searchParams.get('frame'));

  if (
    !Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y) ||
    !TOMORROW_FORECAST_HOURS.includes(frame as TomorrowForecastHour)
  ) {
    return new NextResponse('Invalid tile request', { status: 400 });
  }

  try {
    const isoTime = frameTimestamp(frame);
    const cacheKey = `tomorrow-radar-tile:${z}:${x}:${y}:${isoTime}`;
    const cached = await getCached(cacheKey, async () => {
      const tile = await fetchTomorrowTile(apiKey, z, x, y, isoTime);
      return { base64: tile.buffer.toString('base64'), contentType: tile.contentType };
    }, TILE_CACHE_TTL);

    return new NextResponse(Buffer.from(cached.base64, 'base64'), {
      headers: {
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=1800',
      },
    });
  } catch (error) {
    logError('Tomorrow.io tile fetch failed:', error);
    return new NextResponse('Failed to fetch tile', { status: 502 });
  }
}
