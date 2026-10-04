import { ApiError, isRetryable } from './error';

/**
 * F20 (B21 → F20, capacity plan §6/§13) — one retry policy for every
 * server-state read. Two rules the load tests made non-negotiable:
 *
 * 1. Never retry sooner than the server's `Retry-After`. Under load the API
 *    sheds reporting with `503` + `Retry-After`; a client that retries at
 *    once costs CPU per refusal (~2,000 refusals/s held answer-save p95 at
 *    295 ms in B21's first shed round).
 * 2. Always add jitter. A lab's screens were loaded together; without
 *    jitter their retries arrive together too.
 *
 * Non-retryable errors (a 403, a validation error) are never retried —
 * resending a request the server said not to repeat only adds load.
 */

/** Read retries after the first failure. Bounded: the UI then shows a calm,
 * manually retryable state rather than looping (ErrorState). */
export const MAX_QUERY_RETRIES = 2;

const BASE_DELAY_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/** TanStack Query `retry` predicate. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && isRetryable(error);
}

/**
 * Delay before retry number `attemptIndex` (0-based). With a `Retry-After`,
 * waits at least that long plus 0–30 % jitter; otherwise exponential
 * backoff with full jitter, capped.
 */
export function retryDelayFor(
  attemptIndex: number,
  error: unknown,
  random: () => number = Math.random,
): number {
  if (error instanceof ApiError && error.retryAfterMs !== undefined) {
    return Math.round(error.retryAfterMs * (1 + 0.3 * random()));
  }
  const ceiling = Math.min(MAX_BACKOFF_MS, BASE_DELAY_MS * 2 ** attemptIndex);
  return Math.round(ceiling / 2 + (ceiling / 2) * random());
}
