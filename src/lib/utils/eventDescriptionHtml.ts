import DOMPurify from 'dompurify';

/**
 * Sanitise an event description for rendering as HTML in the browser.
 *
 * Descriptions arrive from whoever sent the invite, so this is an allowlist,
 * not a denylist: only inline formatting, lists and links survive.
 *
 * Two of the tag choices are not obvious:
 *
 * - `div` stays. It carries no styling once `class` and `style` are gone, but
 *   it is block-level, and Google writes one `div` per line. Removing it keeps
 *   the text (DOMPurify hoists children) and loses every line break with it.
 * - `span` goes, for the mirror-image reason. With `class` and `style` stripped
 *   it changes nothing visually, so it is pure carrier.
 *
 * `title` is not allowed either. A title attribute holds multi-line text that
 * renders as nothing, which is the prompt-injection shape: invisible to the
 * person reading the event, still present for anything that reads the string.
 */
export const DESCRIPTION_ALLOWED_TAGS = [
  'b', 'strong', 'i', 'em', 'u', 's', 'br', 'p', 'div', 'ul', 'ol', 'li', 'a', 'code', 'pre',
];

export const DESCRIPTION_ALLOWED_ATTR = ['href'];

/**
 * Force every surviving link to open away from the dashboard, without handing
 * the opened page a reference back.
 *
 * This has to be a hook. Listing `target` and `rel` in `ADD_ATTR` does the
 * opposite of forcing them: it permits whatever the description already said,
 * so `rel="opener"` survives and re-enables `window.opener`. And a link with no
 * `target` at all navigates the current tab, which on the wall display is a
 * standalone PWA with no chrome and no way back.
 */
function hardenAnchors(node: Element) {
  if (node.nodeName !== 'A') return;
  node.setAttribute('target', '_blank');
  node.setAttribute('rel', 'noopener noreferrer nofollow');
}

/**
 * Runs only in the browser: DOMPurify needs a DOM, and every caller is a client
 * component. Server-side consumers want `eventDescriptionToText` instead.
 */
export function sanitizeEventDescription(html: string): string {
  if (typeof window === 'undefined') return '';

  // The hook is global to the DOMPurify singleton, which NoteEditor also uses,
  // so it is added and removed around this one call. sanitize() is synchronous,
  // so nothing can run between the two.
  DOMPurify.addHook('afterSanitizeAttributes', hardenAnchors);
  try {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: DESCRIPTION_ALLOWED_TAGS,
      ALLOWED_ATTR: DESCRIPTION_ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
    });
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}
