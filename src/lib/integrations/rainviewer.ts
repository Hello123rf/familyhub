/**
 * RainViewer radar tiles — free, public, no API key.
 *
 * As of RainViewer's January 2026 API transition, the free tier only serves
 * the past 2 hours of radar (10-minute intervals); nowcast/forecast frames,
 * satellite IR, and every color scheme but "Universal Blue" (id 2) were
 * discontinued for free use. Max zoom is 7 and there's a 100 req/min/IP
 * limit — both reasons to proxy + cache this server-side rather than have
 * every kiosk hit RainViewer directly. See
 * https://www.rainviewer.com/api/transition-faq.html.
 */

export interface RadarFrame {
  /** Unix seconds. */
  time: number;
  /** Full tile URL template for this frame: {z}/{x}/{y} placeholders left in. */
  tileUrlTemplate: string;
}

const WEATHER_MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';

export async function fetchRadarFrames(): Promise<RadarFrame[]> {
  const res = await fetch(WEATHER_MAPS_URL);
  if (!res.ok) {
    throw new Error(`RainViewer request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json() as {
    host: string;
    radar?: { past?: Array<{ time: number; path: string }>; nowcast?: Array<{ time: number; path: string }> };
  };

  const host = json.host;
  // nowcast is included generically (currently always empty on the free
  // tier — see module doc) so this picks it back up for free if RainViewer
  // ever restores it, without a code change.
  const raw = [...(json.radar?.past ?? []), ...(json.radar?.nowcast ?? [])];

  return raw.map((f) => ({
    time: f.time,
    tileUrlTemplate: `${host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
  }));
}
