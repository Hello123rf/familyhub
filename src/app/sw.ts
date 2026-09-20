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
  navigationPreload: true,
  runtimeCaching: [],
});

serwist.addEventListeners();
