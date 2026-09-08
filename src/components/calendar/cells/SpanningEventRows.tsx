'use client';

import { isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { contrastText } from '@/lib/utils/color';
import type { CalendarEvent } from '@/types/calendar';
import { useTimeFormat } from '@/components/providers';
import {
  eventOccursOnDisplayDay,
  eventStartsOnDisplayDay,
  formatDisplayTime,
  isCalendarEventPast,
} from '@/lib/utils/timeFormat';

export type SpanningEventRowsProps = {
  date: Date;
  rowDates: Date[];
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  compact?: boolean;
  /**
   * Whether the day cells are drawing events as cards.
   *
   * A multi-day event is not a different species from a single-day one, so in
   * cards mode it takes the same surface: card background, hairline border,
   * shadow, and the event's colour on the leading edge. It stays shorter than a
   * full card, which is what still says "this one runs across days".
   */
  cards?: boolean;
};

/**
 * Renders the slice of each multi-day event that crosses this day cell.
 * A continuing slice covers only the gap after its own cell. Adjacent slices
 * therefore meet without overlapping, which keeps translucent/muted bars from
 * producing darker seams at day boundaries.
 */

/**
 * How this row's multi-day events are packed into lanes, for one day.
 *
 * Exported because a day cell needs the same answer the bars do: how many blank
 * lanes sit above its first bar, so it can put the day's own events there
 * instead of leaving the space empty. Both callers derive it from the same
 * inputs, so they cannot disagree.
 */
export function spanningLaneInfo(
  events: CalendarEvent[],
  rowDates: Date[],
  date: Date,
  displayTimezone: string,
): { firstActiveLane: number; lastActiveLane: number } {
  const occurs = (event: CalendarEvent, target: Date) =>
    eventOccursOnDisplayDay(event.startTime, event.endTime, event.allDay, target, displayTimezone);

  const ordered = [...events].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime() || a.id.localeCompare(b.id),
  );
  const occupancy: boolean[][] = [];
  const laneOf = new Map<string, number>();
  for (const event of ordered) {
    const covers = rowDates.map((rowDate) => occurs(event, rowDate));
    let lane = 0;
    for (;; lane += 1) {
      if (!occupancy[lane]) occupancy[lane] = rowDates.map(() => false);
      if (!covers.some((covered, i) => covered && occupancy[lane]![i])) break;
    }
    covers.forEach((covered, i) => {
      if (covered) occupancy[lane]![i] = true;
    });
    laneOf.set(event.id, lane);
  }

  let firstActiveLane = -1;
  let lastActiveLane = -1;
  for (const event of ordered) {
    if (!occurs(event, date)) continue;
    const lane = laneOf.get(event.id)!;
    if (firstActiveLane < 0 || lane < firstActiveLane) firstActiveLane = lane;
    if (lane > lastActiveLane) lastActiveLane = lane;
  }
  return { firstActiveLane, lastActiveLane };
}

export function SpanningEventRows({
  date,
  rowDates,
  events,
  onEventClick,
  compact = false,
  cards = false,
}: SpanningEventRowsProps) {
  const { timeFormat, displayTimezone } = useTimeFormat();
  const column = rowDates.findIndex((candidate) => isSameDay(candidate, date));
  if (column < 0 || events.length === 0) return null;

  const occurs = (event: CalendarEvent, target: Date) =>
    eventOccursOnDisplayDay(event.startTime, event.endTime, event.allDay, target, displayTimezone);

  // Just the slices that fall on this day, in start order. No lanes.
  //
  // Lanes and their blank placeholders existed to hold a bar at the same height
  // on every day it covered, so a run read as one continuous bar. That is gone
  // by design: the day's own all-day events now sit above the bars, so a bar
  // sits wherever that day's content leaves room, and each slice is labelled
  // and contained in its own cell.
  //
  // With nothing to hold in place, a blank lane is just an empty row in a cell
  // that had something to put there.
  const active = [...events]
    .filter((event) => occurs(event, date))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime() || a.id.localeCompare(b.id));
  if (active.length === 0) return null;

  // A multi-day event is a single-day all-day event that happens to run on.
  // These are the metrics its neighbours use, read from the same custom
  // properties, so a bar and a chip are the same height with their text
  // starting at the same offset under any theme.
  const barMetrics = compact
    ? 'px-0.5 py-px text-[8px]'
    : cards
      ? 'px-1 py-0.5 text-[10px]'
      : 'px-[var(--event-padding-x,0.25rem)] py-[var(--event-padding-y,0.125rem)] text-[length:var(--event-font-size,0.75rem)] font-[var(--event-font-weight)]';

  return (
    <div
      data-spanning-events
      // px-1 matches the day's own event list, so a bar's cap lines up with the
      // left and right edge of the chips under it. A bar that continues is
      // widened past this padding below, so the slices still meet.
      className={cn(
        'relative z-20 flex shrink-0 flex-col px-1',
        // Same row gap as the day's own event list, and the same gap again
        // below the block, so a bar and the chip under it are spaced like two
        // chips rather than butting their borders together.
        compact ? 'gap-px mb-px' : cards ? 'gap-0.5 mb-0.5' : 'gap-[var(--event-gap,0.125rem)] mb-[var(--event-gap,0.125rem)]',
      )}
    >
      {active.map((event) => {
        // Both ends are always visible now that a slice never reaches past its
        // own cell, so both are always capped. Same radius as every chip.
        const roundLeft = true;
        const roundRight = true;
        const past = isCalendarEventPast(
          event.startTime,
          event.endTime,
          event.allDay,
          new Date(),
          displayTimezone
        );

        const startsToday = eventStartsOnDisplayDay(
          event.startTime,
          event.allDay,
          date,
          displayTimezone,
        );
        const label = !event.allDay && startsToday
          ? `${formatDisplayTime(event.startTime, timeFormat, {}, displayTimezone)} ${event.title}`
          : event.title;

        return (
          <button
            key={event.id}
            type="button"
            title={label}
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              onEventClick(event);
            }}
            className={cn(
              'relative z-20 block w-full truncate text-left font-medium leading-tight',
              // Hover matches whatever the day's own events do in this mode.
              cards ? 'hover:bg-card transition-colors' : 'hover:brightness-95',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seasonal-accent',
              barMetrics,
              // One end treatment everywhere. An edge is rounded whenever it
              // is actually visible: the only edges that are not are the ones
              // a neighbouring slice bridges over inside the same week row.
              // A bar that carries into the next row therefore ends in a cap
              // like everything else, rather than a chevron.
              //
              // Radius comes from --radius, so a square-cornered theme squares
              // these off along with every other chip.
              roundLeft && 'rounded-l-md',
              roundRight && 'rounded-r-md',
              cards && 'bg-card/85 backdrop-blur-sm border-y border-border/40 shadow-sm text-foreground',
              cards && roundLeft && 'border-l',
              cards && roundRight && 'border-r border-border/40',
              past && 'opacity-55 saturate-[0.65]'
            )}
            style={{
              // In cards mode the colour moves to the leading edge, the way a
              // single-day card carries it, so the two read as one family. The
              // border is dropped on any edge a neighbouring slice bridges
              // over, so a run of days stays one object rather than a row of
              // separate cards.
              backgroundColor: cards ? undefined : event.color,
              color: cards ? undefined : past ? contrastText(event.color) : '#fff',
              ...(cards && roundLeft
                ? { borderLeftColor: event.color, borderLeftWidth: 3, borderLeftStyle: 'solid' as const }
                : {}),
              // Every slice stays inside its own cell.
              //
              // Bridging into the neighbour existed to make a run of days read
              // as one bar. That only worked while a bar held the same height
              // across the row; now that a day's own all-day events sit above
              // the bars, a bar sits at a different height on each day and
              // there is nothing left to join. All the bridge did was push the
              // slice out past the grid line.
              width: '100%',
            }}
          >
            {/*
              Every day says what it is.
              //
              Withholding the title on continuation days made sense while the
              slices joined into one continuous bar carrying a single label.
              They no longer join, so an unlabelled slice is just a coloured
              strip with nothing to explain it.
            */}
            {label}
          </button>
        );
      })}
    </div>
  );
}
