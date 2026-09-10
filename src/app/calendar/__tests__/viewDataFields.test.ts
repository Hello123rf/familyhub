/**
 * The calendar view rebuilds each event field by field. Anything missing from
 * that list is silently dropped, which is how a synced event reached the edit
 * modal with empty notes while Google, the row, the API and useCalendarEvents
 * all carried them.
 *
 * This asserts the mapping keeps what the UI later reads, so a field added
 * upstream cannot quietly fail to arrive.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(process.cwd(), 'src/app/calendar/useCalendarViewData.ts'), 'utf8');
const mapping = source.slice(
  source.indexOf('const events: CalendarEvent[]'),
  source.indexOf('return deduplicateEvents'),
);

describe('useCalendarViewData event mapping', () => {
  it.each([
    'id', 'title', 'startTime', 'endTime', 'allDay', 'color',
    'description', 'location', 'recurring', 'recurrenceRule',
    'reminderMinutes', 'calendarName', 'calendarId',
  ])('carries %s through to the view', (field) => {
    expect(mapping).toContain(`${field}: event.${field}`);
  });
});
