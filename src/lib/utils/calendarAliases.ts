const MAX_ALIASES = 10;
const MAX_ALIAS_LENGTH = 50;

/**
 * Validates and normalizes a member's calendar-name-matching aliases list
 * (trims entries, drops empties, caps count/length). Returns undefined for
 * genuinely invalid input (not an array, or an array of non-strings) so the
 * caller can tell "nothing sent" apart from "sent something malformed."
 */
export function parseCalendarAliases(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  if (!input.every((v) => typeof v === 'string')) return undefined;

  const cleaned = input
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= MAX_ALIAS_LENGTH)
    .slice(0, MAX_ALIASES);

  return cleaned;
}
