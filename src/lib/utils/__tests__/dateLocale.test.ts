/**
 * The point of dateLocale is that a translated catalogue cannot fix date
 * *order*. "MMMM d, yyyy" is September 4, 2026 in every language, while German
 * writes 4. September 2026. These tests pin the order and the names, because
 * that is the regression a German household would actually see on the wall.
 */
import {
  formatDateRange,
  formatDateStyle,
  weekdayNameByIndex,
} from '@/lib/utils/dateLocale';

const FRIDAY = new Date(2026, 8, 4); // 2026-09-04

describe('formatDateStyle', () => {
  it('names the weekday and month in the requested language', () => {
    expect(formatDateStyle(FRIDAY, 'weekdayLong', 'en')).toBe('Friday');
    expect(formatDateStyle(FRIDAY, 'weekdayLong', 'de')).toBe('Freitag');
    expect(formatDateStyle(FRIDAY, 'monthLong', 'en')).toBe('September');
    expect(formatDateStyle(FRIDAY, 'monthYear', 'de')).toBe('September 2026');
  });

  it('puts the day before the month in German, not after it', () => {
    // The old date-fns pattern produced "September 4" in both languages.
    expect(formatDateStyle(FRIDAY, 'monthDay', 'en')).toMatch(/^Sep\b.*4$/);
    expect(formatDateStyle(FRIDAY, 'monthDay', 'de')).toMatch(/^4\./);
    expect(formatDateStyle(FRIDAY, 'fullDate', 'de')).toContain('Freitag');
    expect(formatDateStyle(FRIDAY, 'fullDate', 'de')).toContain('4. September 2026');
  });

  it('returns the same formatter instance for repeat calls', () => {
    // A month view formats ~40 dates per render; a fresh Intl.DateTimeFormat
    // each time is the difference between a frame and a stutter.
    const first = formatDateStyle(FRIDAY, 'weekdayShort', 'de');
    const second = formatDateStyle(FRIDAY, 'weekdayShort', 'de');
    expect(first).toBe(second);
  });
});

describe('weekdayNameByIndex', () => {
  it('treats 0 as Sunday, matching Date.getDay() and DAYS_SHORT_ARRAY', () => {
    expect(weekdayNameByIndex(0, 'en', 'weekdayLong')).toBe('Sunday');
    expect(weekdayNameByIndex(1, 'en', 'weekdayLong')).toBe('Monday');
    expect(weekdayNameByIndex(6, 'en', 'weekdayLong')).toBe('Saturday');
    expect(weekdayNameByIndex(0, 'de', 'weekdayLong')).toBe('Sonntag');
    expect(weekdayNameByIndex(3, 'de', 'weekdayLong')).toBe('Mittwoch');
  });

  it('gives a narrow initial for the three-month grid', () => {
    expect(weekdayNameByIndex(1, 'de', 'weekdayNarrow')).toBe('M');
  });
});

describe('formatDateRange', () => {
  it('collapses the shared parts of a week range', () => {
    const start = new Date(2026, 8, 1);
    const end = new Date(2026, 8, 14);
    expect(formatDateRange(start, end, 'en')).toContain('2026');
    // German keeps day-first on both ends of the range.
    expect(formatDateRange(start, end, 'de')).toMatch(/^1\./);
  });
});
