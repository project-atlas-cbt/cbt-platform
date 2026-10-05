/**
 * F21 (DoD 5): when a new service worker may take over.
 *
 * A deployment installs a new worker, which then *waits*. Activating it
 * deletes the previous build's precached files, and a page still running
 * that build may need them (a lazily loaded chunk). For an exam in progress
 * that would break the page mid-attempt, so the new worker activates only
 * when no open window is running an exam. A page asks
 * (`components/pwa/service-worker-updates.tsx`); the worker itself checks
 * before agreeing (`app/sw.ts`), so a teacher's tab in the same browser
 * cannot activate it under a student's exam.
 *
 * How the worker knows: an exam page keeps a heartbeat mark in Cache
 * Storage while it is open. Window URLs cannot tell it: the app moves into
 * and out of the exam by client-side navigation, and a service worker sees
 * each window's URL as it was when the document loaded, so a reloaded exam
 * looks open forever and one reached from the preview never looks open
 * (both found by e2e/deployment.spec.ts). A mark left by a crashed tab
 * goes stale on its own, so it never blocks an update for long.
 *
 * Pure and dependency-free apart from the Cache Storage global: imported
 * by both the page bundle and the service-worker bundle.
 */

/** Message a page posts to the waiting worker to ask it to take over. */
export const ACTIVATE_UPDATE_MESSAGE = 'ATLAS_ACTIVATE_UPDATE';

/** Cache Storage holding one mark per open exam tab. Never precached or served. */
export const RUNTIME_STATE_CACHE = 'atlas-runtime-state';
const MARK_PATH = '/__atlas/open-attempt/';
/** How often an open exam page renews its mark. */
export const HEARTBEAT_MS = 10_000;
/** A mark older than this is from a tab that has gone (crash, power cut). */
export const MARK_FRESH_MS = 60_000;

/** `/student/exam/<attemptId>` — the running exam. Its `/submitted` page is not. */
const ATTEMPT_PATH = /^\/student\/exam\/[^/]+\/?$/;

export function isAttemptPath(pathname: string): boolean {
  return ATTEMPT_PATH.test(pathname);
}

/** True when any mark time is recent enough to be a live exam tab. */
export function anyFreshMark(markTimes: readonly number[], now: number): boolean {
  return markTimes.some((t) => Number.isFinite(t) && now - t < MARK_FRESH_MS);
}

function markUrl(tabId: string): string {
  return `${MARK_PATH}${encodeURIComponent(tabId)}`;
}

/** Page side: this tab is running an exam (call every HEARTBEAT_MS). */
export async function markAttemptOpen(tabId: string, now = Date.now()): Promise<void> {
  const cache = await caches.open(RUNTIME_STATE_CACHE);
  await cache.put(markUrl(tabId), new Response(String(now)));
}

/** Page side: this tab has left the exam. */
export async function clearAttemptMark(tabId: string): Promise<void> {
  const cache = await caches.open(RUNTIME_STATE_CACHE);
  await cache.delete(markUrl(tabId));
}

/** Worker side: is any tab running an exam right now? */
export async function hasOpenAttempt(now = Date.now()): Promise<boolean> {
  if (!(await caches.has(RUNTIME_STATE_CACHE))) return false;
  const cache = await caches.open(RUNTIME_STATE_CACHE);
  const times: number[] = [];
  for (const request of await cache.keys()) {
    if (!new URL(request.url).pathname.startsWith(MARK_PATH)) continue;
    const response = await cache.match(request);
    times.push(Number(await response?.text()));
  }
  return anyFreshMark(times, now);
}
