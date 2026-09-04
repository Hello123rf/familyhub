/**
 * Shared by every calendar view's item labels, and previously untested. The
 * ":00" drop below is deliberate (compact event labels) and is why the event
 * form's time picker keeps its own formatter instead: a column of half-hour
 * slots reading "9 AM / 9:30 AM / 10 AM" is ragged.
 */
import { formatTimeOfDay } from '@/components/calendar/cells';

describe('formatTimeOfDay', () => {
  it('renders 24-hour time zero-padded, with no meridiem', () => {
    expect(formatTimeOfDay('14:30', '24h')).toBe('14:30');
    expect(formatTimeOfDay('09:00', '24h')).toBe('09:00');
    expect(formatTimeOfDay('00:00', '24h')).toBe('00:00');
    expect(formatTimeOfDay('23:59', '24h')).toBe('23:59');
  });

  it('renders 12-hour time with the right meridiem at the boundaries', () => {
    expect(formatTimeOfDay('14:30', '12h')).toBe('2:30 PM');
    // On-the-hour drops ":00" in 12h mode, but never in 24h mode above.
    expect(formatTimeOfDay('09:00', '12h')).toBe('9 AM');
    // Midnight and noon are where a naive `h % 12` produces "0".
    expect(formatTimeOfDay('00:00', '12h')).toBe('12 AM');
    expect(formatTimeOfDay('12:00', '12h')).toBe('12 PM');
    expect(formatTimeOfDay('12:30', '12h')).toBe('12:30 PM');
  });

  it('defaults to 12-hour when no format is given', () => {
    expect(formatTimeOfDay('14:30')).toBe('2:30 PM');
  });

  it('passes through anything that is not HH:MM', () => {
    expect(formatTimeOfDay('')).toBe('');
    expect(formatTimeOfDay(null)).toBe('');
    expect(formatTimeOfDay(undefined)).toBe('');
    expect(formatTimeOfDay('not a time')).toBe('not a time');
  });
});
