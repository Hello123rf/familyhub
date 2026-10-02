/**
 * Radar frame list API route (RainViewer).
 *
 * ENDPOINT: /api/weather/radar
 *   GET — past-2-hours radar frame list (tile URL template per frame).
 *
 * Proxied + cached server-side rather than hit from every client directly:
 * RainViewer's free tier caps at 100 req/min/IP, and a houseful of kiosk
 * displays polling it individually would burn through that fast.
 */

import { NextResponse } from 'next/server';
import { optionalAuth } from '@/lib/auth';
import { fetchRadarFrames } from '@/lib/integrations/rainviewer';
import { getCached } from '@/lib/cache/redis';
import { logError } from '@/lib/utils/logError';

// New frames land every 10 minutes; 5 minutes keeps this reasonably fresh
// without re-fetching on every poll.
const RADAR_CACHE_TTL = 5 * 60;

export async function GET() {
  const _auth = await optionalAuth();

  try {
    const frames = await getCached('weather-radar-frames', fetchRadarFrames, RADAR_CACHE_TTL);
    return NextResponse.json({ frames });
  } catch (error) {
    logError('Radar frames fetch failed:', error);
    return NextResponse.json({ frames: [], error: 'Failed to fetch radar frames' });
  }
}
