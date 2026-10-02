'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { cn } from '@/lib/utils';
import { useWeather, useWeatherAlerts, useForecastRadarFrames } from '@/lib/hooks';
import { WeatherWidget } from '@/components/widgets/WeatherWidget';
import { RadarMap } from './components/RadarMap';
import { ForecastRadarMap } from './components/ForecastRadarMap';
import type { WeatherAlert } from '@/lib/integrations/meteoalarm';

const COLOR_CLASSES: Record<'yellow' | 'orange' | 'red', string> = {
  yellow: 'border-l-amber-400 bg-amber-400/10 text-amber-900 dark:text-amber-200',
  orange: 'border-l-orange-500 bg-orange-500/10 text-orange-900 dark:text-orange-200',
  red: 'border-l-red-600 bg-red-600/10 text-red-900 dark:text-red-200',
};

function AlertCard({ alert }: { alert: WeatherAlert }) {
  const colorClass = alert.color ? COLOR_CLASSES[alert.color] : COLOR_CLASSES.yellow;
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border-l-4 p-3', colorClass)}>
      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="font-semibold">{alert.title}</div>
        <div className="text-sm opacity-80">
          {alert.areaDesc}
          {alert.expires && ` · until ${alert.expires.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`}
        </div>
      </div>
    </div>
  );
}

export function WeatherView() {
  const { data, loading, error } = useWeather();
  const { alerts, configured } = useWeatherAlerts();
  const { configured: forecastRadarConfigured } = useForecastRadarFrames();
  const [radarTab, setRadarTab] = useState<'past' | 'forecast'>('past');

  return (
    <PageWrapper>
      <div className="flex flex-col gap-1 mb-6">
        <h1 className="text-2xl font-bold">Weather</h1>
        <p className="text-muted-foreground">
          {configured
            ? 'Current conditions, forecast, and official severe weather alerts.'
            : 'Current conditions and forecast.'}
        </p>
      </div>

      {alerts.length > 0 && (
        <div className="flex flex-col gap-2 mb-6">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="max-w-2xl">
          <WeatherWidget data={data || undefined} loading={loading} error={error} gridW={24} gridH={28} forecastDays={7} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Rain Radar
            </h2>
            {forecastRadarConfigured && (
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                {(['past', 'forecast'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setRadarTab(tab)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                      radarTab === tab ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {tab === 'past' ? 'Last 2 Hours' : 'Forecast'}
                  </button>
                ))}
              </div>
            )}
          </div>
          {data?.lat != null && data?.lon != null ? (
            radarTab === 'forecast' && forecastRadarConfigured ? (
              <ForecastRadarMap lat={data.lat} lon={data.lon} className="h-80" />
            ) : (
              <RadarMap lat={data.lat} lon={data.lon} className="h-80" />
            )
          ) : (
            <div className="h-80 flex items-center justify-center text-sm text-muted-foreground bg-muted/30 rounded-lg">
              {loading ? 'Loading…' : 'Set a location in Settings to see radar.'}
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
