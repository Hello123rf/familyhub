import { normalizePersonName } from '../normalizePersonName';

describe('normalizePersonName', () => {
  it('treats a possessive and a plain name as the same person', () => {
    expect(normalizePersonName("Ana & Bo's")).toBe(normalizePersonName('Ana & Bo'));
  });

  it('handles the curly apostrophe calendars actually emit', () => {
    expect(normalizePersonName('Ana & Bo’s')).toBe(normalizePersonName('Ana & Bo'));
  });

  it('strips the possessive before punctuation, not after', () => {
    // The order is the whole point: strip punctuation first and this is
    // "ana bos", which never matches "ana bo".
    expect(normalizePersonName("Ana & Bo's")).toBe('ana bo');
  });

  it('leaves a name that merely ends in s alone', () => {
    expect(normalizePersonName('Chris')).toBe('chris');
    expect(normalizePersonName('The Rogers')).toBe('the rogers');
  });

  it('collapses whitespace and lowercases', () => {
    expect(normalizePersonName('  Ana   BO  ')).toBe('ana bo');
  });

  it('drops punctuation so ampersands and plus signs compare equal', () => {
    expect(normalizePersonName('Ana & Bo')).toBe(normalizePersonName('Ana  Bo'));
  });
});
