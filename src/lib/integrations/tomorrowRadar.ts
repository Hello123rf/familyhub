/**
 * Tomorrow.io forecast precipitation tiles.
 *
 * Needs TOMORROW_IO_API_KEY (free signup, no credit card, no commitment
 * required). The free plan is tightly rate-limited — 25 req/hour, 500/day
 * (https://support.tomorrow.io/hc/en-us/articles/20273728362644) — and
 * nothing in their docs suggests map tiles are metered more generously than
 * any other call. Kept to 3 forecast frames (now, +1h, +2h) and proxied
 * through our own Redis-backed tile cache (see the API route) so every
 * household viewer/kiosk shares ONE real upstream fetch per unique tile per
 * hour instead of each consuming their own budget — without that, a single
 * page load across a couple of devices could burn the entire hourly quota.
 */

/** Hours-ahead for each frame. Kept short and few: the free quota doesn't
 *  comfortably support more, even with the cache above. */
export const TOMORROW_FORECAST_HOURS = [0, 1, 2] as const;
export type TomorrowForecastHour = (typeof TOMORROW_FORECAST_HOURS)[number];

const TILE_BASE = 'https://api.tomorrow.io/v4/map/tile';
const FIELD = 'precipitationIntensity';

export interface TomorrowTile {
  buffer: Buffer;
  contentType: string;
}

/**
 * Hour-rounded ISO timestamp for a frame. Rounding to the hour (rather than
 * using the exact request instant) keeps the timestamp — and so the cache
 * key every client's request resolves to — stable for up to an hour, instead
 * of each request computing a slightly different "now" and missing the cache.
 */
export function frameTimestamp(hoursAhead: number): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + hoursAhead);
  return d.toISOString();
}

export async function fetchTomorrowTile(
  apiKey: string,
  z: number,
  x: number,
  y: number,
  isoTime: string,
): Promise<TomorrowTile> {
  const url = `${TILE_BASE}/${z}/${x}/${y}/${FIELD}/${isoTime}.png?apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Tomorrow.io tile request failed: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType: res.headers.get('content-type') || 'image/png' };
}
