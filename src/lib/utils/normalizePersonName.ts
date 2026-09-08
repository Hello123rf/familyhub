/**
 * The comparison form of a person or couple's name.
 *
 * Used to decide whether two life-event rows are the same one. It lived in two
 * files with a comment asking them to stay in step, which is the arrangement
 * that produced the bug it now guards against.
 *
 * The trailing possessive comes off BEFORE punctuation is stripped. Order
 * matters: removing punctuation on its own turns "Ana & Bo's" into "ana bos",
 * which is neither equal to "ana bo" nor a token prefix of it, so the two names
 * never match and the same anniversary is stored twice.
 *
 * That happened. The title parser used to leave the possessive on the name and
 * now removes it, so one anniversary imported under both spellings and showed
 * up twice on the milestones list.
 */
export function normalizePersonName(s: string): string {
  return s
    .replace(/['’]s?\s*$/, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
