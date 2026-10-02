'use client';

import { useFetch } from './useFetch';

export interface ForecastRadarFrame {
  hoursAhead: number;
  label: string;
}

interface ForecastRadarResponse {
  configured: boolean;
  frames: ForecastRadarFrame[];
}

/** Tomorrow.io forecast radar config + fixed frame list (now, +1h, +2h).
 *  `configured: false` means the feature is simply off — no API key set. */
export function useForecastRadarFrames() {
  const { data, loading, error } = useFetch<ForecastRadarResponse>({
    url: '/api/weather/radar/forecast',
    initialData: { configured: false, frames: [] },
    refreshInterval: 60 * 60 * 1000,
    label: 'weather-radar-forecast',
  });

  return { configured: data.configured, frames: data.frames, loading, error };
}
