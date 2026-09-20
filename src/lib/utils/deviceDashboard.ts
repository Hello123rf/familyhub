/**
 * Per-device dashboard memory: visiting /d/[slug] once remembers that slug
 * in a plain (non-httpOnly) cookie on that browser, so the next visit to `/`
 * on the SAME device/browser goes straight back to it - e.g. a TV bookmarked
 * to /d/tv keeps showing the TV layout, while a laptop in the same house
 * that has never visited a named dashboard keeps seeing the family default.
 * This is per-browser, not per-user: two people signed into the same
 * browser get the same remembered dashboard.
 */

const COOKIE_NAME = 'prism_dashboard_slug';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function rememberDashboardSlug(slug: string): void {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(slug)}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}

export function getRememberedDashboardSlug(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

export function forgetDashboardSlug(): void {
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
}
