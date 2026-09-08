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
 * How far a continuation slice reaches back over the seam between two cells.
 *
 * The seam is this cell's left padding, plus the gap between cells, plus the
 * previous cell's right padding — and it differs per view. Measured: 8px in the
 * month grid, 12.5px in the two-week view, whose cells carry a 1px border its
 * `gap-1` class does not account for. A per-view constant would have to be
 * re-derived every time a caller's chrome changed, and would fail silently as a
 * hairline when it drifted.
 *
 * One generous value works instead, because **overshooting cannot show**. A
 * slice only reaches back when the same event holds the same lane on the
 * previous day, so the overshoot lands on that event's own slice: same colour,
 * same height, and square-edged, since a slice that continues is not capped on
 * that side. Undershooting leaves a visible gap; overshooting leaves nothing.
 *
 * Sized with real headroom, not to the measured seam. 1rem was set from a
 * 12.5px measurement and then fell 2px short the moment the band's padding
 * changed, because the seam grows with the caller's padding and borders. The
 * only cost of reaching further is more overlap onto the same event's own
 * slice, which shows nothing; the cost of reaching too little is a hairline
 * that lets whatever is underneath through. Measured seams so far: 8px in the
 * month grid, 16px in the two-week view.
 */
const SEAM_REACH = '1.5rem';

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
   * The horizontal padding the day's own event list uses, as a Tailwind class.
   *
   * The band has to sit in the same content box as the chips beneath it, and
   * each view pads its list differently: `px-1` in the month grid, `px-1.5` in
   * the two-week view. Hardcoding one of them here made all-day cards 1.75px
   * wider on each side than the timed cards under them, in every view but the
   * one the constant came from.
   *
   * Stated by the caller, next to the list it has to match, so the two cannot
   * drift apart unnoticed.
   */
  padX?: string;
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
  padX = 'px-1',
  omitLeadingBlanks = 0,
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
      // padX matches the day's own event list, so a bar's cap lines up with the
      // left and right edge of the chips under it. A bar that continues is
      // widened past this padding below, so the slices still meet.
      className={cn(
        'relative z-20 flex shrink-0 flex-col',
        padX,
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
            <div
              key={`lane-${lane}`}
              aria-hidden
              // Same box as a real slice, borders included. In cards mode a
              // slice carries a 1px border top and bottom; a placeholder
              // without one is 2px shorter, so a bar sitting under a lane that
              // is blank on one day and filled on the next rides up by 2px and
              // the run looks broken. `invisible` hides it without changing
              // what it occupies.
              className={cn(barMetrics, cards && 'border', 'invisible')}
            >
              &nbsp;
            </div>
          );
        }

        const event = laneEvent;
        const continuesFromPrevious = occurs(event, addDays(date, -1));
        const continuesToNext = occurs(event, addDays(date, 1));
        const continuesWithinRow = continuesToNext && column < rowDates.length - 1;
        // A run is joined by the LATER slice reaching back, not the earlier one
        // reaching forward.
        //
        // Day cells are positioned siblings, so a later cell paints on top of
        // an earlier one. A slice overflowing to the right disappeared behind
        // the next cell's own background, leaving the grid gap and a cell's
        // padding showing as a break — invisible against a pale background,
        // obvious with grid lines on. Reaching backwards puts the overflow in
        // the cell that paints last, so it covers the seam instead.
        const reachesBack = continuesFromPrevious && column > 0;
        const roundLeft = !reachesBack;
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
              // Opaque, unlike the single-day cards beside it, which are 85%.
              //
              // A spanning pill is the one card that crosses a cell boundary,
              // so whatever sits under the seam shows through it. The Today
              // column's accent ring did exactly that: measured at the seam,
              // the pill was the topmost element and the ring was still
              // visible through it, drawing a coloured line across a join that
              // is meant to be invisible.
              cards && 'bg-card border shadow-sm text-foreground',
              // Mid-pill edges carry no border, so a run of days reads as one
              // outlined object rather than a row of cards butted together.
              cards && reachesBack && 'border-l-0',
              cards && continuesWithinRow && 'border-r-0',
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
              // Outlined in the event's own colour, all the way round, so a
              // multi-day event is recognisable as one thing across the days it
              // covers without relying on the cards touching.
              // The 3px colour edge marks where the event STARTS, so a
              // continuation must not draw one: an inline width beats the
              // border-l-0 class, and it painted as a bar across the seam it
              // was supposed to be hiding.
              ...(cards
                ? {
                    // A washed version of the event colour round the perimeter,
                    // and the solid band on the leading edge that every other
                    // card in this view already uses.
                    //
                    // The full-strength outline did the border's job with the
                    // colour's saturation, so an all-day event shouted where a
                    // timed card murmured, and a cell full of them read as a
                    // stack of frames rather than as text.
                    //
                    // BLENDED toward the card, not made translucent, for two
                    // reasons. A see-through border would let whatever sits
                    // under the seam show through, which is the bug that drew a
                    // coloured line across every join. And blending toward
                    // `--card` follows the theme: it lightens on a pale theme
                    // and darkens in dark mode, with no second value to keep in
                    // step. Where color-mix is unavailable the declaration is
                    // dropped and the neutral `border` colour applies.
                    borderColor: `color-mix(in srgb, ${event.color} 35%, hsl(var(--card)))`,
                    ...(reachesBack
                      ? { borderLeftWidth: 0 }
                      : { borderLeftWidth: 3, borderLeftColor: event.color }),
                    ...(continuesWithinRow ? { borderRightWidth: 0 } : {}),
                  }
                : {}),
              // Reaching back across this cell's left padding, the grid gap,
              // and the previous cell's right padding.
              marginLeft: reachesBack ? `calc(-1 * ${SEAM_REACH})` : undefined,
              width: reachesBack ? `calc(100% + ${SEAM_REACH})` : '100%',
            }}
          >
            {/*
              A continuation slice carries no title: the label is printed on the
              day the event starts and again after a week wrap, so it is not
              repeated across every day it covers.

              It still needs a line box. Without one its height collapses to the
              padding alone, and since the height is now the theme's rather than
              a fixed h-5, the bar became a ~4px sliver on every continuation
              day — present, aligned, and invisible.
            */}
            {!continuesFromPrevious || column === 0 ? label : '\u00A0'}
          </button>
        );
      })}
    </div>
  );
}
