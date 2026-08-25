import { defaultCache } from '@serwist/next/worker';
import { Serwist } from 'serwist';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';

// F0 scope: app-shell precaching only (doctrine defers exam-asset runtime
// caching rules to F13's offline engine — this is deliberately the
// minimum that proves the service worker registers and precaches).
// Deliberately not typed as `ServiceWorkerGlobalScope` — that type lives in
// TS's `webworker` lib, which conflicts with the `dom` lib the rest of this
// project's tsconfig needs, and nothing here reads a
// ServiceWorkerGlobalScope-specific member directly (Serwist's own class
// operates on the real global `self` internally at runtime).
declare const self: SerwistGlobalConfig & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

// Read exactly once: Serwist's build-time injector textually replaces a
// single `self.__SW_MANIFEST` occurrence in the compiled SW bundle with
// the real precache manifest, and refuses to build if it finds more than
// one — so the value is captured here rather than referenced twice below.
const manifest = self.__SW_MANIFEST;

const serwist = new Serwist({
  // exactOptionalPropertyTypes: the manifest global can genuinely be
  // undefined outside a real Next build, so this is only included when set.
  ...(manifest ? { precacheEntries: manifest } : {}),
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
