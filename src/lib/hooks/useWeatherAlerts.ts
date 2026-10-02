'use client';

import { useFetch } from './useFetch';
import type { WeatherAlert } from '@/lib/integrations/meteoalarm';

interface AlertsResponse {
  alerts: WeatherAlert[];
  configured: boolean;
}

function transform(json: unknown): AlertsResponse {
  const raw = json as { alerts: Array<Record<string, unknown>>; configured: boolean };
  return {
    configured: raw.configured,
    alerts: (raw.alerts || []).map((a) => ({
      ...a,
      onset: a.onset ? new Date(a.onset as string) : null,
      expires: a.expires ? new Date(a.expires as string) : null,
    })) as WeatherAlert[],
  };
}

/** Current severe weather alerts for the household's configured country (see
 *  WEATHER_ALERT_COUNTRY). `configured: false` means the feature is simply
 *  off, not an error — most installs won't set this env var. */
export function useWeatherAlerts(options: { refreshInterval?: number; enabled?: boolean } = {}) {
  const { refreshInterval = 15 * 60 * 1000, enabled } = options;

  const { data, loading, error } = useFetch<AlertsResponse>({
    url: '/api/weather/alerts',
    initialData: { alerts: [], configured: false },
    transform,
    refreshInterval,
    label: 'weather-alerts',
    enabled,
  });

  return { alerts: data.alerts, configured: data.configured, loading, error };
}
