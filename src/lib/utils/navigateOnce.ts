/**
 * Guards against a navigation-triggering click firing twice — a double-click,
 * or a touchscreen double-tap on a wall-mounted kiosk display, where a second
 * request races the first.
 *
 * This specifically matters for `/api/auth/*` OAuth-initiating links: Google
 * (and most providers) issue a single-use authorization code, so a replayed
 * request gets rejected with `invalid_grant` even though the first request
 * would have succeeded — and the CSRF state-nonce check only ever accepts
 * the first of two nonces created for one click, flagging the second as a
 * mismatch. Two confirmed real-world cases of exactly this in one session
 * (Google Calendar reconnect, Google Tasks reconnect) are what this exists
 * to close off at the source instead of patching each call site's symptom.
 *
 * The flag is never reset: once tripped, the current page is navigating away
 * anyway, so there's nothing to recover into — a fresh page load gets a
 * fresh module instance regardless.
 */
let navigating = false;

export function navigateOnce(href: string): void {
  if (navigating) return;
  navigating = true;
  window.location.href = href;
}
