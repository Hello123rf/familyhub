/**
 * Forecast radar config/frame-list route.
 *
 * ENDPOINT: /api/weather/radar/forecast
 *   GET — whether Tomorrow.io forecast radar is configured, and the (fixed,
 *   short) list of forecast frames available. Absent key means the feature
 *   is simply off, not an error.
 */

import { NextResponse } from 'next/server';
import { TOMORROW_FORECAST_HOURS } from '@/lib/integrations/tomorrowRadar';

export async function GET() {
  const configured = !!process.env.TOMORROW_IO_API_KEY;

  return NextResponse.json({
    configured,
    frames: configured
      ? TOMORROW_FORECAST_HOURS.map((h) => ({ hoursAhead: h, label: h === 0 ? 'Now' : `+${h}h` }))
      : [],
  });
}
