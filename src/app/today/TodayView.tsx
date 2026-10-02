'use client';

import { useMemo } from 'react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { useAuth } from '@/components/providers';
import { WIDGET_REGISTRY } from '@/components/widgets/widgetRegistry';
import { WidgetErrorBoundary } from '@/components/dashboard/WidgetErrorBoundary';
import { useDashboardData } from '@/components/dashboard/useDashboardData';
import { buildWidgetProps } from '@/components/dashboard/useWidgetProps';

/** "Today" is a glance-only briefing: weather, calendar, chores, tasks — no
 *  photos or bus tracking, which belong to the full dashboard/screensaver. */
const BRIEFING_WIDGETS = ['weather', 'calendar', 'chores', 'tasks'] as const;
const VISIBLE_WIDGET_SET = new Set<string>(BRIEFING_WIDGETS);

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function TodayView() {
  const { requireAuth } = useAuth();
  const data = useDashboardData(VISIBLE_WIDGET_SET, { deferRest: false });

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    [],
  );

  // No-op modal setters: this is a glance screen, not an editor — tapping a
  // widget's own "complete" affordance still works (that's wired through the
  // widget props below), there's just nowhere to open an "Add" form from here.
  const widgetProps = useMemo(
    () => buildWidgetProps(
      data,
      requireAuth,
      { setShowAddTask: () => {}, setShowAddMessage: () => {}, setShowAddChore: () => {}, setShowAddShopping: () => {} },
    ),
    [data, requireAuth],
  );

  return (
    <PageWrapper>
      <div className="flex flex-col gap-1 mb-6">
        <h1 className="text-2xl font-bold">{greeting()}</h1>
        <p className="text-muted-foreground">{todayLabel}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 auto-rows-[minmax(280px,auto)]">
        {BRIEFING_WIDGETS.map((id) => {
          const reg = WIDGET_REGISTRY[id];
          if (!reg) return null;
          const Component = reg.component;
          return (
            <div key={id} className={id === 'calendar' ? 'lg:col-span-2 lg:row-span-2' : ''}>
              <WidgetErrorBoundary>
                <Component
                  {...(widgetProps[id] || {})}
                  gridW={reg.defaultW}
                  gridH={reg.defaultH}
                />
              </WidgetErrorBoundary>
            </div>
          );
        })}
      </div>
    </PageWrapper>
  );
}
