import { defaultCache } from '@serwist/next/worker';
import { CacheFirst, ExpirationPlugin, Serwist } from 'serwist';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { ACTIVATE_UPDATE_MESSAGE, hasOpenAttempt } from '@/lib/pwa/update-policy';
import {
  MEDIA_CACHE_NAME,
  SW_MEDIA_CACHE_NAME,
  SYNTHETIC_MEDIA_KEY_PREFIX,
} from '@/lib/attempt/cache-keys';

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
  location: Location;
  skipWaiting(): Promise<void>;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
  addEventListener(type: 'activate', listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'message', listener: (event: ExtendableMessageEvent) => void): void;
};
// Minimal shapes of the service-worker events used below (the `webworker`
// lib that defines them conflicts with this project's `dom` lib — see above).
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
}
interface ExtendableMessageEvent extends ExtendableEvent {
  readonly data: unknown;
}

// Read exactly once: Serwist's build-time injector textually replaces a
// single `self.__SW_MANIFEST` occurrence in the compiled SW bundle with
// the real precache manifest, and refuses to build if it finds more than
// one — so the value is captured here rather than referenced twice below.
const manifest = self.__SW_MANIFEST;

/**
 * F13 — additive only; `defaultCache` (F0's app-shell precache set) is left
 * untouched. This is a **defense-in-depth backstop**, not the primary
 * offline-media mechanism — `lib/attempt/media-cache.ts` already does its
 * own manual `fetch`+`caches.put` into a hand-managed cache, tracking
 * per-asset status in Dexie regardless of whether the SW also intercepts
 * the request. This rule mainly helps the "online, still-valid signed URL"
 * fast path (`question-media.tsx` setting `<img src>` directly) get cached
 * for free, without media-cache.ts's own code having to do anything extra.
 *
 * The matcher deliberately isn't a hardcoded object-storage origin — the
 * real host varies by environment (MinIO locally, S3/CloudFront in
 * production) and isn't available to this frontend build at all (`S3_*`
 * env vars are backend-only, never `NEXT_PUBLIC_*`). Instead it matches the
 * hallmark of a B4 presigned URL (an AWS SigV4 query-string signature),
 * which the JSON API and every precached app-shell asset never carry —
 * tight enough to never intercept `apiClient`'s own calls.
 */
const isPresignedMediaRequest = ({ url }: { url: URL }): boolean =>
  url.searchParams.has('X-Amz-Signature');

/**
 * F20 — cross-origin requests other than presigned media (in practice: the
 * API on its sibling subdomain, ADR-0022) never touch the service worker.
 *
 * `defaultCache` ends with a `NetworkFirst` "cross-origin" rule (1 h,
 * 10 s network timeout). Applied to the API it was a cross-user leak on a
 * shared lab computer: with the network slower than 10 s, student B's
 * `GET /v1/auth/me` or `/v1/student/results` could be answered from student
 * A's cached response — the cache is keyed by URL, not by session. API data
 * must come from the server or not at all; the exam's offline state lives
 * in IndexedDB, scoped per attempt (lib/attempt). Registered before
 * Serwist's listener so that listener never sees these requests (and adds
 * no per-request overhead to them).
 */
const LEAKY_CACHES = ['cross-origin'];
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin || isPresignedMediaRequest({ url })) return;
  event.stopImmediatePropagation();
});
self.addEventListener('activate', (event: ExtendableEvent) => {
  // Purge what earlier builds cached under the rule above, and (bug audit
  // P3-10) the signed-URL media entries earlier builds stored in the app's
  // own media cache, where attempt cleanup never reached them.
  event.waitUntil(
    Promise.all([
      ...LEAKY_CACHES.map((name) => caches.delete(name)),
      caches.open(MEDIA_CACHE_NAME).then(async (cache) => {
        for (const request of await cache.keys()) {
          if (!request.url.startsWith(SYNTHETIC_MEDIA_KEY_PREFIX)) await cache.delete(request);
        }
      }),
    ]),
  );
});

/**
 * F21 (DoD 5): a new build's worker waits instead of taking over at once
 * (`skipWaiting: false` below). Taking over deletes the previous build's
 * precache, which a running exam page may still load chunks from. A page
 * asks it to take over once that page is not an exam
 * (components/pwa/service-worker-updates.tsx), and it agrees only if no
 * open window is running an exam, which it learns from the exam pages'
 * heartbeat marks (lib/pwa/update-policy.ts). The browser
 * also activates it on its own once every tab of the site is closed.
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: unknown } | null;
  if (data?.type !== ACTIVATE_UPDATE_MESSAGE) return;
  event.waitUntil(hasOpenAttempt().then((examOpen) => (examOpen ? undefined : self.skipWaiting())));
});

const serwist = new Serwist({
  // exactOptionalPropertyTypes: the manifest global can genuinely be
  // undefined outside a real Next build, so this is only included when set.
  ...(manifest ? { precacheEntries: manifest } : {}),
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: isPresignedMediaRequest,
      // Bug audit P3-10: its own cache, expiring. A signed URL is good for
      // 15 minutes, so an older entry can never be requested again anyway.
      handler: new CacheFirst({
        cacheName: SW_MEDIA_CACHE_NAME,
        plugins: [
          new ExpirationPlugin({
            maxAgeSeconds: 60 * 60,
            maxEntries: 300,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
