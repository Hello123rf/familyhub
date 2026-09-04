'use client';

/**
 * Date labels bound to the interface language.
 *
 * Every calendar surface needs the same handful of human-readable date shapes,
 * and every one of them has to follow Settings → Appearance → Language rather
 * than the code's English patterns. This binds the shared formatters in
 * lib/utils/dateLocale to the active locale so a component can write
 * `d.weekdayShort(date)` instead of threading a locale through its props.
 *
 * Machine keys (`format(date, 'yyyy-MM-dd')` for bucket lookups) stay on
 * date-fns. They are identifiers, not copy.
 */
import * as React from 'react';
import { useLocale } from 'next-intl';
import {
  formatDateRange,
  formatDateStyle,
  weekdayNameByIndex,
  type DateStyle,
} from '@/lib/utils/dateLocale';

export interface DateLabels {
  /** "Thu" */
  weekdayShort: (date: Date) => string;
  /** "Thursday" */
  weekdayLong: (date: Date) => string;
  /** "Sep" */
  monthShort: (date: Date) => string;
  /** "September" */
  monthLong: (date: Date) => string;
  /** "September 2026" */
  monthYear: (date: Date) => string;
  /** "Sep 4" */
  monthDay: (date: Date) => string;
  /** "Thu, Sep 4" */
  weekdayMonthDay: (date: Date) => string;
  /** "Thursday, September 4" */
  weekdayLongMonthDay: (date: Date) => string;
  /** "Thursday, September 4, 2026" */
  fullDate: (date: Date) => string;
  /** "Sep 1 – 14, 2026" */
  range: (start: Date, end: Date) => string;
  /** Weekday name for a column header with no date. 0 = Sunday. */
  weekdayByIndex: (index: number, style?: 'weekdayShort' | 'weekdayLong' | 'weekdayNarrow') => string;
  /** The active locale, for the rare caller that needs it directly. */
  locale: string;
}

export function useDateLabels(): DateLabels {
  const locale = useLocale();

  return React.useMemo(() => {
    const styled = (style: DateStyle) => (date: Date) => formatDateStyle(date, style, locale);
    return {
      weekdayShort: styled('weekdayShort'),
      weekdayLong: styled('weekdayLong'),
      monthShort: styled('monthShort'),
      monthLong: styled('monthLong'),
      monthYear: styled('monthYear'),
      monthDay: styled('monthDay'),
      weekdayMonthDay: styled('weekdayMonthDay'),
      weekdayLongMonthDay: styled('weekdayLongMonthDay'),
      fullDate: styled('fullDate'),
      range: (start: Date, end: Date) => formatDateRange(start, end, locale),
      weekdayByIndex: (index, style) => weekdayNameByIndex(index, locale, style),
      locale,
    };
  }, [locale]);
}
