/**
 * @jest-environment jsdom
 */

import * as React from 'react';
import { render } from '@testing-library/react';
import { SpanningEventRows } from '../SpanningEventRows';
import { InlineCalendarEvent } from '../InlineCalendarEvent';
import type { CalendarEvent } from '@/types/calendar';

jest.mock('@/components/providers', () => ({
  useTimeFormat: () => ({
    timeFormat: '24h',
    displayTimezone: 'Europe/Warsaw',
  }),
}));

const event: CalendarEvent = {
  id: 'multi-day',
  title: 'Family trip',
  startTime: new Date('2026-08-10T00:00:00.000Z'),
  endTime: new Date('2026-08-13T00:00:00.000Z'),
  allDay: true,
  color: '#5b7fea',
  calendarName: 'Family',
  calendarId: 'family',
};

describe('SpanningEventRows', () => {
  it('reserves no lanes on a day that every span in the row misses', () => {
    // The bug this guards: a week carrying three multi-day events reserved a
    // blank lane for each of them on EVERY day of the row, so a day none of
    // them touched started three rows down and its own events appeared to
    // begin halfway down the cell.
    const rowDates = [new Date(2026, 8, 20), new Date(2026, 8, 21), new Date(2026, 8, 22), new Date(2026, 8, 23)];
    const spans: CalendarEvent[] = [23, 24, 25].map((day, i) => ({
      ...event,
      id: `span-${i}`,
      startTime: new Date(`2026-09-${day}T00:00:00.000Z`),
      endTime: new Date('2026-09-29T00:00:00.000Z'),
    }));

    const { container } = render(
      <SpanningEventRows
        date={new Date(2026, 8, 21)}
        rowDates={rowDates}
        events={spans}
        onEventClick={() => {}}
      />,
    );

    expect(container.querySelector('[data-spanning-events]')).toBeNull();
  });

  it('reuses a lane an earlier span has finished with', () => {
    // The bug: lane came from position in the row's list, so a span beginning
    // after two others had ended still sat in lane 2 and stacked two blank rows
    // above itself on every day it covered.
    const rowDates = [new Date(2026, 8, 20), new Date(2026, 8, 21), new Date(2026, 8, 22)];
    const done: CalendarEvent[] = ['x', 'y'].map((id) => ({
      ...event,
      id,
      startTime: new Date('2026-09-20T00:00:00.000Z'),
      endTime: new Date('2026-09-21T00:00:00.000Z'),
    }));
    const later: CalendarEvent = {
      ...event,
      id: 'z',
      startTime: new Date('2026-09-22T00:00:00.000Z'),
      endTime: new Date('2026-09-24T00:00:00.000Z'),
    };

    const { container } = render(
      <SpanningEventRows
        date={new Date(2026, 8, 22)}
        rowDates={rowDates}
        events={[...done, later]}
        onEventClick={() => {}}
      />,
    );

    const wrapper = container.querySelector('[data-spanning-events]');
    expect(wrapper!.children).toHaveLength(1);
    expect(wrapper!.children[0]!.getAttribute('aria-hidden')).toBeNull();
  });

  it('keeps every slice inside its own cell', () => {
    const rowDates = [new Date(2026, 7, 10), new Date(2026, 7, 11), new Date(2026, 7, 12)];

    const { container } = render(
      <div>
        {rowDates.map((date) => (
          <SpanningEventRows
            key={date.toISOString()}
            date={date}
            rowDates={rowDates}
            events={[event]}
            onEventClick={() => {}}
          />
        ))}
      </div>
    );

    const rows = container.querySelectorAll('[data-spanning-events]');
    const buttons = container.querySelectorAll('button');

    expect(rows).toHaveLength(3);
    expect(buttons).toHaveLength(3);
    expect(buttons[0]!.style.marginLeft).toBe('');
    expect(buttons[1]!.style.marginLeft).toBe('');
    expect(buttons[2]!.style.marginLeft).toBe('');
    // No slice reaches past its own cell. Bridging into the neighbour existed
    // to join a run into one bar; the day's own all-day events now sit above
    // the bars, so a bar sits at a different height each day and there is
    // nothing to join.
    expect(buttons[0]!.style.width).toBe('100%');
    expect(buttons[1]!.style.width).toBe('100%');
    expect(buttons[2]!.style.width).toBe('100%');
  });

  it('sizes a bar from the same variables a day event uses', () => {
    const rowDates = [new Date(2026, 7, 10), new Date(2026, 7, 11)];

    const { container } = render(
      <SpanningEventRows
        date={new Date(2026, 7, 10)}
        rowDates={rowDates}
        events={[event]}
        onEventClick={() => {}}
      />,
    );

    const bar = container.querySelector('button')!;
    // No fixed height, and padding/type read from the event custom properties,
    // so a bar and an all-day chip are the same object at any theme density.
    expect(bar.className).not.toMatch(/\bh-5\b/);
    expect(bar.className).toContain('px-[var(--event-padding-x,0.25rem)]');
    expect(bar.className).toContain('text-[length:var(--event-font-size,0.75rem)]');
  });

  it('labels every day of a multi-day event', () => {
    // The regression this guards: a continuation slice prints no label, so once
    // the height came from content rather than a fixed h-5 it collapsed to the
    // padding alone — a few pixels tall, effectively invisible, on every day of
    // a multi-day event after the first.
    const rowDates = Array.from({ length: 7 }, (_, i) => new Date(2026, 8, 27 + i));
    const trip: CalendarEvent = {
      ...event,
      id: 'trip',
      title: 'Trip away',
      startTime: new Date('2026-09-28T00:00:00.000Z'),
      endTime: new Date('2026-10-01T00:00:00.000Z'),
    };

    const onDay = (index: number) => {
      const { container } = render(
        <SpanningEventRows
          date={rowDates[index]!}
          rowDates={rowDates}
          events={[trip]}
          onEventClick={() => {}}
        />,
      );
      return container.querySelector('button')!;
    };

    // Every day it covers says what it is. Withholding the title made sense
    // while slices joined into one bar carrying a single label; they no longer
    // join, so an unlabelled slice is a coloured strip explaining nothing.
    for (const index of [1, 2, 3]) {
      expect(onDay(index).textContent).toBe('Trip away');
    }
  });

  it('wears the card surface in cards mode, with the colour on the leading edge', () => {
    const rowDates = [new Date(2026, 7, 10), new Date(2026, 7, 11)];

    const { container } = render(
      <SpanningEventRows
        date={new Date(2026, 7, 10)}
        rowDates={rowDates}
        events={[event]}
        onEventClick={() => {}}
        cards
      />,
    );

    const bar = container.querySelector('button')!;
    expect(bar.className).toContain('bg-card/85');
    expect(bar.className).toContain('shadow-sm');
    // The event colour moves to the leading edge instead of filling the bar.
    expect(bar.style.backgroundColor).toBe('');
    expect(bar.style.borderLeftWidth).toBe('3px');
  });

  it('keeps filling with the event colour when cards mode is off', () => {
    const rowDates = [new Date(2026, 7, 10), new Date(2026, 7, 11)];

    const { container } = render(
      <SpanningEventRows
        date={new Date(2026, 7, 10)}
        rowDates={rowDates}
        events={[event]}
        onEventClick={() => {}}
      />,
    );

    const bar = container.querySelector('button')!;
    expect(bar.style.backgroundColor).not.toBe('');
    expect(bar.className).not.toContain('bg-card/85');
  });

  it('caps every slice at both ends, on every day it covers', () => {
    const wrappingEvent: CalendarEvent = {
      ...event,
      startTime: new Date('2026-08-09T00:00:00.000Z'),
      endTime: new Date('2026-08-18T00:00:00.000Z'),
    };
    const rowDates = Array.from({ length: 7 }, (_, index) => new Date(2026, 7, 10 + index));

    const { container } = render(
      <div>
        {rowDates.map((date) => (
          <SpanningEventRows
            key={date.toISOString()}
            date={date}
            rowDates={rowDates}
            events={[wrappingEvent]}
            onEventClick={() => {}}
          />
        ))}
      </div>
    );

    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(7);
    expect(buttons[0]!.textContent).toBe('Family trip');
    // Every slice is a self-contained chip: both ends capped, on every day,
    // with the radius following --radius like every other event.
    for (const bar of buttons) {
      expect(bar.className).toContain('rounded-l-md');
      expect(bar.className).toContain('rounded-r-md');
      expect(bar.style.clipPath).toBe('');
      expect(bar.style.width).toBe('100%');
    }
  });

  it('uses white text for a future spanning event', () => {
    const futureEvent: CalendarEvent = {
      ...event,
      startTime: new Date('2099-08-10T00:00:00.000Z'),
      endTime: new Date('2099-08-13T00:00:00.000Z'),
    };

    const { getByRole } = render(
      <SpanningEventRows
        date={new Date(2099, 7, 10)}
        rowDates={[new Date(2099, 7, 10)]}
        events={[futureEvent]}
        onEventClick={() => {}}
      />
    );

    expect(getByRole('button').style.color).toBe('rgb(255, 255, 255)');
  });

  it('does not repeat a timed event start time on continuation days', () => {
    const timedEvent: CalendarEvent = {
      ...event,
      title: 'Weekend trip',
      allDay: false,
      startTime: new Date('2026-08-21T16:00:00.000Z'),
      endTime: new Date('2026-08-23T17:00:00.000Z'),
    };

    const startDay = new Date(2026, 7, 21);
    const continuationDay = new Date(2026, 7, 22);
    const rowDates = [startDay, continuationDay];
    const { container } = render(
      <div>
        <SpanningEventRows
          date={startDay}
          rowDates={rowDates}
          events={[timedEvent]}
          onEventClick={() => {}}
      />
        <SpanningEventRows
          date={continuationDay}
          rowDates={rowDates}
          events={[timedEvent]}
          onEventClick={() => {}}
      />
      </div>
    );

    const buttons = container.querySelectorAll('button');
    // The start time belongs to the day the event starts. The title still
    // appears on the days after it; only the time is not repeated.
    expect(buttons[0]!.textContent).toBe('18:00 Weekend trip');
    expect(buttons[1]!.textContent).toBe('Weekend trip');
    expect(buttons[1]!.title).toBe('Weekend trip');
  });
});

describe('InlineCalendarEvent', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses a neutral timed-event label and event-colour dot', () => {
    const timedEvent: CalendarEvent = {
      ...event,
      allDay: false,
      startTime: new Date('2026-08-20T14:00:00.000Z'),
      endTime: new Date('2026-08-20T15:00:00.000Z'),
    };

    const { getByRole } = render(<InlineCalendarEvent event={timedEvent} onClick={() => {}} />);
    const button = getByRole('button');
    const dot = button.querySelector('[aria-hidden]') as HTMLElement;

    expect(button.className).toContain('text-left');
    expect(button.style.backgroundColor).toBe('');
    expect(dot.style.backgroundColor).toBe('rgb(91, 127, 234)');
  });

  it('subdues a completed event without striking it through', () => {
    const { getByRole } = render(<InlineCalendarEvent event={event} onClick={() => {}} />);
    const button = getByRole('button');

    expect(button.className).toContain('opacity-55');
    expect(button.className).not.toContain('line-through');
  });

  it('uses white text for a current or future filled event', () => {
    const futureEvent: CalendarEvent = {
      ...event,
      startTime: new Date('2026-08-21T00:00:00.000Z'),
      endTime: new Date('2026-08-22T00:00:00.000Z'),
    };

    const { getByRole } = render(<InlineCalendarEvent event={futureEvent} onClick={() => {}} />);

    expect(getByRole('button').style.color).toBe('rgb(255, 255, 255)');
  });
});
