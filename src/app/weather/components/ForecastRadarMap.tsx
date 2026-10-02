'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Play, Pause } from 'lucide-react';
import { useForecastRadarFrames } from '@/lib/hooks';

// See TravelGlobe.tsx / RadarMap.tsx for why this is needed.
maplibregl.config.WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const SOURCE_ID = 'tomorrow-forecast-radar';
const LAYER_ID = 'tomorrow-forecast-radar-layer';
// Tomorrow.io's documented tile zoom range.
const MAX_RADAR_ZOOM = 12;

function tileUrlTemplate(hoursAhead: number): string {
  return `/api/weather/radar/forecast/tile?z={z}&x={x}&y={y}&frame=${hoursAhead}`;
}

/**
 * A short (now / +1h / +2h) forecast precipitation map — see
 * tomorrowRadar.ts for why it's capped at 3 frames (Tomorrow.io's free-tier
 * rate limit). Renders nothing if TOMORROW_IO_API_KEY isn't configured.
 */
export function ForecastRadarMap({ lat, lon, className }: { lat: number; lon: number; className?: string }) {
  const { configured, frames, loading } = useForecastRadarFrames();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || frames.length === 0) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [lon, lat],
      zoom: 6,
      maxZoom: MAX_RADAR_ZOOM,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Forecast: Tomorrow.io' }), 'bottom-left');
    map.on('load', () => setMapReady(true));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames.length > 0]);

  useEffect(() => {
    mapRef.current?.setCenter([lon, lat]);
  }, [lat, lon]);

  const activeFrame = frames[index];
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !activeFrame) return;
    const tiles = [tileUrlTemplate(activeFrame.hoursAhead)];

    const existing = map.getSource(SOURCE_ID) as maplibregl.RasterTileSource | undefined;
    if (existing) {
      existing.setTiles(tiles);
      return;
    }

    map.addSource(SOURCE_ID, { type: 'raster', tiles, tileSize: 256, maxzoom: MAX_RADAR_ZOOM });
    map.addLayer({ id: LAYER_ID, type: 'raster', source: SOURCE_ID, paint: { 'raster-opacity': 0.75 } });
  }, [mapReady, activeFrame]);

  useEffect(() => {
    if (!playing || frames.length <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % frames.length), 1200);
    return () => clearInterval(timer);
  }, [playing, frames.length]);

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);

  if (!loading && !configured) return null;

  return (
    <div className={className}>
      <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden" />
      {frames.length > 1 && (
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
          <span className="text-xs tabular-nums text-muted-foreground w-10 text-right shrink-0">
            {activeFrame?.label}
          </span>
        </div>
      )}
    </div>
  );
}
