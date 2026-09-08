'use client';

import { addDays, isSameDay } from 'date-fns';
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

/**
 * Horizontal padding on a day cell's event list, in px (`px-1`).
 *
 * Bars are inset by the same amount so their caps line up with the single-day
 * chips beneath them, and a continuing bar adds it back twice to cross into the
 * next cell's content box.
 */
const CELL_PADDING_X = 4;

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
  /**
   * How many of the blank lanes above this day's first bar the caller has
   * already filled with the day's own events.
   *
   * A blank lane holds a bar's position steady across the days it spans. That
   * job is done just as well by a single-day event of the same height sitting
   * there, and a cell with space to spare should be using it: nothing about a
   * multi-day event entitles it to the top of the cell.
   */
  omitLeadingBlanks?: number;
  /**
   * The column gap this row's cells are laid out with, as a CSS length.
   *
   * A continuing slice widens by exactly this much so it meets the next day's
   * slice across the gap. Required, not defaulted: a default silently
   * disagreed with MonthView's `gap-px` for as long as it existed, widening
   * every continuing bar by 3px more than the gap it was bridging, so bars
   * bled into the neighbouring day. A caller that knows its grid should have
   * to say so.
   */
  gap: string;
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
  omitLeadingBlanks = 0,
  gap,
}: SpanningEventRowsProps) {
  const { timeFormat, displayTimezone } = useTimeFormat();
  const column = rowDates.findIndex((candidate) => isSameDay(candidate, date));
  if (column < 0 || events.length === 0) return null;

  const occurs = (event: CalendarEvent, target: Date) =>
    eventOccursOnDisplayDay(event.startTime, event.endTime, event.allDay, target, displayTimezone);

  // Which lane each span sits in, packed rather than taken from its position
  // in the row's list.
  //
  // A span has to keep one lane for every day it covers, so its slices line up
  // across the week. But a span may reuse a lane that an earlier span has
  // already finished with. Using list position instead means a span starting
  // on Monday sits in lane 3 all week merely because three others began before
  // it and ended before it started, leaving three blank rows above it on every
  // day it covers.
  //
  // Greedy over spans in start order, lowest free lane each time, which is the
  // standard packing for intervals and is optimal in lane count. Every cell in
  // the row computes the same assignment from the same inputs, so the lanes
  // agree across days without the cells having to share state.
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

  // What this day draws, by lane. A blank lane still holds a bar's position
  // steady, but only when a bar is drawn BELOW it here, so trailing blanks go
  // and a day the row's spans all miss renders nothing at all.
  const byLane: Array<CalendarEvent | null> = Array.from({ length: occupancy.length }, () => null);
  for (const event of ordered) {
    if (occurs(event, date)) byLane[laneOf.get(event.id)!] = event;
  }
  let lastActiveLane = -1;
  byLane.forEach((event, lane) => {
    if (event) lastActiveLane = lane;
  });
  if (lastActiveLane < 0) return null;

  // Never skip past a lane that holds a bar; only blanks the caller has filled.
  const firstActiveLane = byLane.findIndex((laneEvent) => laneEvent !== null);
  const startLane = Math.min(omitLeadingBlanks, Math.max(firstActiveLane, 0));

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
      {byLane.slice(startLane, lastActiveLane + 1).map((laneEvent, laneOffset) => {
        const lane = startLane + laneOffset;
        // An empty lane below an occupied one: holds the lane open so the bar
        // under it keeps the same height on every day it spans. It is an
        // invisible copy of a bar rather than a fixed height, so it matches
        // whatever height the theme's font and padding actually produce.
        if (!laneEvent) {
          return (
            <div key={`lane-${lane}`} aria-hidden className={cn(barMetrics, 'invisible')}>
              &nbsp;
            </div>
          );
        }

        const event = laneEvent;
        const continuesFromPrevious = occurs(event, addDays(date, -1));
        const continuesToNext = occurs(event, addDays(date, 1));
        const continuesWithinRow = continuesToNext && column < rowDates.length - 1;
        // Visible edges: the left one is hidden only when yesterday's slice
        // bridges across it, the right one only when this slice bridges into
        // tomorrow's.
        const roundLeft = !(continuesFromPrevious && column > 0);
        const roundRight = !continuesWithinRow;
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
              // Reaching the next day's slice now means covering this cell's
              // right padding, the grid gap, and the next cell's left padding.
              width: continuesWithinRow ? `calc(100% + ${gap} + ${CELL_PADDING_X * 2}px)` : '100%',
            }}
          >
            {(!continuesFromPrevious || column === 0) && label}
          </button>
        );
      })}
    </div>
  );
}
