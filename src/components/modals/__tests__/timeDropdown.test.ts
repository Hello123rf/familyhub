/**
 * The event form's time picker used to hardcode AM/PM, so a German household
 * on a 24-hour clock still saw "2:30 PM" while the rest of the form was
 * German. It now takes the household's Settings -> General choice.
 */
import { formatPickerTime } from '@/components/modals/TimeDropdown';

describe('formatPickerTime', () => {
  it('renders 24-hour time zero-padded, with no meridiem', () => {
    expect(formatPickerTime('14:30', '24h')).toBe('14:30');
    expect(formatPickerTime('09:00', '24h')).toBe('09:00');
    expect(formatPickerTime('00:00', '24h')).toBe('00:00');
    expect(formatPickerTime('23:30', '24h')).toBe('23:30');
  });

  it('keeps every 12-hour slot the same shape, including on the hour', () => {
    // Unlike calendar/cells' formatTimeOfDay, ":00" is NOT dropped here: a
    // column of half-hour slots has to line up.
    expect(formatPickerTime('09:00', '12h')).toBe('9:00 AM');
    expect(formatPickerTime('09:30', '12h')).toBe('9:30 AM');
    expect(formatPickerTime('14:30', '12h')).toBe('2:30 PM');
  });

  it('gets midnight and noon right, where `h % 12` alone gives 0', () => {
    expect(formatPickerTime('00:00', '12h')).toBe('12:00 AM');
    expect(formatPickerTime('00:30', '12h')).toBe('12:30 AM');
    expect(formatPickerTime('12:00', '12h')).toBe('12:00 PM');
  });

  it('defaults to 12-hour when no preference is passed', () => {
    expect(formatPickerTime('14:30')).toBe('2:30 PM');
  });
});
