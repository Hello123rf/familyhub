import { detectEventPerson } from '../detectEventPerson';

const becca = { id: 'becca-id', names: ['Rebecca', 'Becca', 'Mom', 'mor'] };
const alex = { id: 'alex-id', names: ['Alex', 'Dad'] };
const people = [becca, alex];

describe('detectEventPerson', () => {
  it('matches a full name', () => {
    expect(detectEventPerson('Lunch with Rebecca', people)).toBe('becca-id');
  });

  it('matches a short alias as a whole word', () => {
    expect(detectEventPerson('Pick up with Mom', people)).toBe('becca-id');
  });

  it('does not match a short alias inside an unrelated word', () => {
    expect(detectEventPerson('See you tomorrow', people)).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(detectEventPerson('dinner with REBECCA', people)).toBe('becca-id');
  });

  it('returns null when no one matches', () => {
    expect(detectEventPerson('Dentist appointment', people)).toBeNull();
  });

  it('returns null when two different people match (ambiguous)', () => {
    expect(detectEventPerson('Mom and Dad anniversary', people)).toBeNull();
  });

  it('matches once even if two aliases for the same person both appear', () => {
    expect(detectEventPerson('Becca (aka Rebecca) pickup', people)).toBe('becca-id');
  });

  it('returns null for empty text', () => {
    expect(detectEventPerson('', people)).toBeNull();
  });
});
