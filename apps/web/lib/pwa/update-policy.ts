/**
 * F21 (DoD 5): when a new service worker may take over.
 *
 * A deployment installs a new worker, which then *waits*. Activating it
 * deletes the previous build's precached files, and a page still running
 * that build may need them (a lazily loaded chunk). For an exam in progress
 * that would break the page mid-attempt, so the new worker activates only
 * when no open window is on an attempt page. The page asks (see
 * `components/pwa/service-worker-updates.tsx`); the worker itself checks
 * every open window before agreeing (`app/sw.ts`), so a teacher's tab in
 * the same browser cannot activate it under a student's exam.
 *
 * Pure and dependency-free: imported by both the page bundle and the
 * service-worker bundle.
 */

/** Message a page posts to the waiting worker to ask it to take over. */
export const ACTIVATE_UPDATE_MESSAGE = 'ATLAS_ACTIVATE_UPDATE';

/** `/student/exam/<attemptId>` — the running exam. Its `/submitted` page is not. */
const ATTEMPT_PATH = /^\/student\/exam\/[^/]+\/?$/;

export function isAttemptPath(pathname: string): boolean {
  return ATTEMPT_PATH.test(pathname);
}

/** True when none of these open window URLs is a running exam. */
export function mayActivateUpdate(windowUrls: readonly string[]): boolean {
  return !windowUrls.some((url) => {
    try {
      return isAttemptPath(new URL(url).pathname);
    } catch {
      // An unparseable URL is not ours to judge; err on the side of the exam.
      return true;
    }
  });
}
