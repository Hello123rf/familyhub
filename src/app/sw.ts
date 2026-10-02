/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

/**
 * Service worker source, compiled by @serwist/next (see next.config.js)
 * into public/sw.js. Replaces next-pwa (unmaintained since 2022, and the
 * source of a build-time RCE advisory via its serialize-javascript/
 * workbox-build dependency chain — see npm audit).
 *
 * Deliberately no runtime caching (runtimeCaching: []), matching the prior
 * next-pwa config exactly:
 *   - No caching of /api responses: the previous NetworkFirst rule matching
 *     any https URL containing "/api/" persisted every authenticated API GET
 *     (messages, family, tokens, mapboxToken, audit-logs, …) into Cache
 *     Storage on disk, with no cacheableResponse filter and no clearing on
 *     logout — on a shared kiosk that data outlived the session.
 *   - Static assets are served from the precache manifest only; nothing
 *     else is runtime-cached, so this does not import Serwist's
 *     `defaultCache` (which would add image/font/script runtime caching
 *     rules that were never part of this app's design).
 *
 * navigationPreload is off for the same reason: it only pays for itself when
 * a fetch handler actually consumes `event.preloadResponse` to answer a
 * navigation faster, which requires a registered runtime-caching strategy —
 * and this worker has none. Left on, the browser starts the preload fetch
 * for every navigation regardless, and since nothing here ever awaits or
 * responds with it, the navigation proceeds via its own separate fetch too —
 * two real requests reaching the server for what looks like one navigation.
 * Invisible for ordinary idempotent GETs, but it silently double-fires
 * anything that consumes a single-use value on the way through — e.g. an
 * OAuth callback exchanging a one-time authorization code, which is exactly
 * the shape of bug that produced an inexplicable `invalid_grant` on a
 * reconnect that, from the user's side, was a single deliberate click.
 */

import { Serwist } from 'serwist';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [],
});

serwist.addEventListeners();
