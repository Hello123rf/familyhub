/** A family member and every name/alias that should match them in event text. */
export interface PersonMatcher {
  id: string;
  names: string[];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Scans event text for exactly one matching family member, using
 * whole-word matching so short aliases (e.g. "mor") don't match inside
 * unrelated words (e.g. "tomorrow"). An event whose text matches two or
 * more different people is left unresolved (null) rather than guessed at —
 * same reasoning as the mass-delete guard elsewhere in sync: prefer no
 * answer over a confidently wrong one.
 */
export function detectEventPerson(text: string, people: PersonMatcher[]): string | null {
  if (!text) return null;

  const matched = new Set<string>();
  for (const person of people) {
    for (const name of person.names) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const re = new RegExp(`\\b${escapeRegex(trimmed)}\\b`, 'i');
      if (re.test(text)) {
        matched.add(person.id);
        break;
      }
    }
  }

  return matched.size === 1 ? [...matched][0]! : null;
}
