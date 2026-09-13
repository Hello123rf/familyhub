/**
 * Shared SSRF guard: rejects URLs pointing at private/internal network
 * addresses. Used by every route that fetches a user-supplied URL server-side
 * (recipe URL import, LAN recipe capture) so there is exactly one copy of
 * this check rather than one per route.
 */
export function isPrivateUrl(urlString: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return true; // Invalid URLs are rejected
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block non-HTTP protocols
  if (!['http:', 'https:'].includes(parsed.protocol)) return true;

  // Block localhost variants
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') return true;

  // Block private IPv4 ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 172 && b! >= 16 && b! <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;             // 192.168.0.0/16
    if (a === 169 && b === 254) return true;             // 169.254.0.0/16 (link-local)
    if (a === 0) return true;                            // 0.0.0.0/8
    if (a! >= 224) return true;                          // multicast + reserved
  }

  // Block common internal hostnames
  if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.lan')) return true;

  return false;
}
