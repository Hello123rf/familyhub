'use client';

import { useFetch } from './useFetch';
import type { RadarFrame } from '@/lib/integrations/rainviewer';

function transform(json: unknown): RadarFrame[] {
  const raw = json as { frames: RadarFrame[] };
  return raw.frames || [];
}

/** Past-2-hours radar frame list (see rainviewer.ts — free tier has no
 *  forecast frames as of RainViewer's January 2026 API transition). */
export function useRadarFrames(options: { enabled?: boolean } = {}) {
  const { data, loading, error } = useFetch<RadarFrame[]>({
    url: '/api/weather/radar',
    initialData: [],
    transform,
    refreshInterval: 5 * 60 * 1000,
    label: 'weather-radar',
    enabled: options.enabled,
  });

  return { frames: data, loading, error };
}
