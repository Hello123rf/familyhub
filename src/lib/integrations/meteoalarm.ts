/**
 * MeteoAlarm severe weather alerts (official EU national warnings).
 *
 * MeteoAlarm aggregates official severe-weather warnings for ~30 European
 * countries from their national meteorological services (DMI for Denmark,
 * Met Office for the UK, etc.) via CAP (Common Alerting Protocol), publishing
 * one public Atom feed per country at a predictable URL — no API key, no
 * auth required. The legacy RSS variant of these feeds was sunset in January
 * 2026; Atom is the actively maintained replacement, confirmed against the
 * live feed index at https://feeds.meteoalarm.org/.
 *
 * No npm XML library is pulled in for this — the feed's entries are a flat,
 * predictable set of `<tag>value</tag>` pairs, so a small regex extractor is
 * enough and avoids a dependency for one feed shape.
 */

export interface WeatherAlert {
  /** cap:identifier, falling back to the entry's own id/title if absent. */
  id: string;
  /** Raw hazard type, e.g. "Gale", "Rain", "Snow/Ice". */
  event: string;
  severity: 'Minor' | 'Moderate' | 'Severe' | 'Extreme' | string;
  /** MeteoAlarm's own awareness color, parsed from the title it assigns. */
  color: 'yellow' | 'orange' | 'red' | null;
  areaDesc: string;
  onset: Date | null;
  expires: Date | null;
  /** e.g. "Yellow Wind Warning issued for Denmark - Copenhagen". */
  title: string;
}

const FEED_BASE = 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-';

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeEntities(m[1]!.trim()) : null;
}

function parseColor(title: string): WeatherAlert['color'] {
  const m = title.match(/^(Yellow|Orange|Red)\b/i);
  return m ? (m[1]!.toLowerCase() as 'yellow' | 'orange' | 'red') : null;
}

/**
 * Fetch and parse the currently-in-force severe weather alerts for one
 * country. Scoped to the whole country, not a specific region within it —
 * area-level filtering would need a geocoding step this doesn't attempt, and
 * for a country Denmark's size a national warning is already relevant.
 *
 * @param countrySlug - lowercase, hyphenated, matching MeteoAlarm's feed
 *   naming exactly (e.g. "denmark", "united-kingdom").
 */
export async function fetchSevereWeatherAlerts(countrySlug: string): Promise<WeatherAlert[]> {
  const res = await fetch(`${FEED_BASE}${countrySlug}`, {
    headers: { Accept: 'application/atom+xml' },
  });
  if (!res.ok) {
    throw new Error(`MeteoAlarm feed request failed: ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();

  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const now = Date.now();

  return entries
    .map((block): WeatherAlert | null => {
      // Skip Test/Exercise/Draft messages — only real, in-force warnings.
      const status = extractTag(block, 'cap:status');
      if (status && status !== 'Actual') return null;

      const title = extractTag(block, 'title') ?? '';
      const id = extractTag(block, 'cap:identifier') ?? extractTag(block, 'id') ?? title;

      const expiresStr = extractTag(block, 'cap:expires');
      const expires = expiresStr ? new Date(expiresStr) : null;
      if (expires && !Number.isNaN(expires.getTime()) && expires.getTime() < now) return null;

      const onsetStr = extractTag(block, 'cap:onset');

      return {
        id,
        event: extractTag(block, 'cap:event') ?? 'Weather warning',
        severity: (extractTag(block, 'cap:severity') ?? 'Moderate') as WeatherAlert['severity'],
        color: parseColor(title),
        areaDesc: extractTag(block, 'cap:areaDesc') ?? '',
        onset: onsetStr ? new Date(onsetStr) : null,
        expires,
        title,
      };
    })
    .filter((a): a is WeatherAlert => a !== null);
}
