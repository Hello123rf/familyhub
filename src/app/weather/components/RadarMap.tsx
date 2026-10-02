'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Play, Pause } from 'lucide-react';
import { useRadarFrames } from '@/lib/hooks';

// See TravelGlobe.tsx for why this is needed: Next's webpack build doesn't
// preserve import.meta.url, so maplibre-gl v6 can't find its worker unless
// pointed at the copy scripts/copy-maplibre-worker.mjs places in public/.
maplibregl.config.WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const RADAR_SOURCE_ID = 'rainviewer-radar';
const RADAR_LAYER_ID = 'rainviewer-radar-layer';
// RainViewer's free tier tops out at zoom 7 — tiles don't exist beyond it.
const MAX_RADAR_ZOOM = 7;

function relativeFrameLabel(frameTime: number, nowFrameTime: number): string {
  const diffMin = Math.round((frameTime - nowFrameTime) / 60);
  if (diffMin === 0) return 'Now';
  return diffMin > 0 ? `+${diffMin} min` : `${diffMin} min`;
}

export function RadarMap({ lat, lon, className }: { lat: number; lon: number; className?: string }) {
  const { frames, loading, error } = useRadarFrames();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Most-recent frame ("now") defaults the slider there once frames arrive.
  useEffect(() => {
    if (frames.length > 0) setIndex(frames.length - 1);
  }, [frames.length]);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [lon, lat],
      zoom: 6,
      maxZoom: MAX_RADAR_ZOOM,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Radar: RainViewer' }), 'bottom-left');
    map.on('load', () => setMapReady(true));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Only ever initialized once — lat/lon drift after mount just recenters
    // below rather than tearing down and rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.setCenter([lon, lat]);
  }, [lat, lon]);

  // Add (once) / update (on frame change) the radar raster layer.
  const activeFrame = frames[index];
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !activeFrame) return;

    const existing = map.getSource(RADAR_SOURCE_ID) as maplibregl.RasterTileSource | undefined;
    if (existing) {
      existing.setTiles([activeFrame.tileUrlTemplate]);
      return;
    }

    map.addSource(RADAR_SOURCE_ID, {
      type: 'raster',
      tiles: [activeFrame.tileUrlTemplate],
      tileSize: 256,
      maxzoom: MAX_RADAR_ZOOM,
    });
    map.addLayer({
      id: RADAR_LAYER_ID,
      type: 'raster',
      source: RADAR_SOURCE_ID,
      paint: { 'raster-opacity': 0.75 },
    });
  }, [mapReady, activeFrame]);

  // Playback loop through the frame list, looping back to the start.
  useEffect(() => {
    if (!playing || frames.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % frames.length);
    }, 600);
    return () => clearInterval(timer);
  }, [playing, frames.length]);

  const nowFrameTime = frames[frames.length - 1]?.time ?? 0;
  const frameLabel = useMemo(
    () => (activeFrame ? relativeFrameLabel(activeFrame.time, nowFrameTime) : ''),
    [activeFrame, nowFrameTime],
  );

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);

  return (
    <div className={className}>
      <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden" />
      {!loading && !error && frames.length > 1 && (
        <div className="flex items-center gap-3 mt-2 px-1">
          <button
            onClick={togglePlay}
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-primary text-primary-foreground"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            value={index}
            onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)); }}
            className="flex-1"
          />
          <span className="text-xs tabular-nums text-muted-foreground w-16 text-right shrink-0">
            {frameLabel}
          </span>
        </div>
      )}
      {error && (
        <p className="text-xs text-muted-foreground mt-2">Radar unavailable right now.</p>
      )}
    </div>
  );
}
