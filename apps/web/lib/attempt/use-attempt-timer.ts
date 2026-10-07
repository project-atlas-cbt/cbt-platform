'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { sendHeartbeat } from './events';
import { serverNow } from './server-clock';

const FIVE_MINUTES_MS = 5 * 60_000;
const ONE_MINUTE_MS = 60_000;
/** While the tab is backgrounded, `requestAnimationFrame` is throttled or
 * paused entirely by the browser — by design, not a bug to work around (the
 * display doesn't need to tick while hidden). This low-frequency interval
 * keeps checking for expiry so the proactive submit (DoD 15) still fires
 * even if the student never returns to the tab. */
const BACKGROUND_CHECK_INTERVAL_MS = 5_000;
/** F20: a 4 Hz recompute is exact to the displayed second (it recomputes
 * from the deadline, never decrements) at a fraction of rAF's CPU cost. */
const VISIBLE_TICK_MS = 250;

export interface AttemptTimerState {
  remainingMs: number;
  fiveMinuteWarningShown: boolean;
  oneMinuteWarningShown: boolean;
  expired: boolean;
}

/**
 * F13 — the exam countdown (DoD 12/13/15). `remainingMs` is always
 * **recomputed fresh** from `expiresAt - serverNow()`, never accumulated
 * from a tick counter.
 *
 * Audit P1-5: "now" is `server-clock.ts`'s monotonic server clock, not
 * `Date.now() + clockSkewMs`. The PC's wall clock jumps when a lab machine
 * resyncs its time, and the countdown used to jump with it (a forward jump
 * ended the exam early, and the server accepted the submit). The server
 * clock is anchored at start/resume and on every heartbeat and counted on
 * `performance.now()` in between, so a wall-clock change moves nothing
 * (DoD 12). `clockSkewMs` (stored with the attempt at the last server
 * contact) only seeds that clock after a reload with no server contact yet.
 *
 * Ticks at 4 Hz while the tab is visible (always exact, since it
 * recomputes rather than decrements — F20 replaced the original
 * `requestAnimationFrame` loop, see `recompute`); a slower interval keeps
 * checking for expiry while hidden. On `visibilitychange`/`focus`, the very
 * next tick already recomputes from the stored truth — there is no
 * accumulated counter to resync, so no special-case handling is needed
 * there beyond letting the loops run.
 *
 * `onExpire` is called exactly once (ref-guarded) the first time
 * `remainingMs <= 0` is observed — the caller (`exam-runtime.tsx`) uses this
 * to proactively call `submit()` (ADR-0004: *requesting* finalization
 * promptly, never *deciding* it — the server remains authoritative either
 * way).
 */
export function useAttemptTimer(
  attemptId: string | undefined,
  expiresAt: string | undefined,
  clockSkewMs: number,
  onExpire: () => void,
): AttemptTimerState {
  const [state, setState] = useState<AttemptTimerState>({
    remainingMs: Number.POSITIVE_INFINITY,
    fiveMinuteWarningShown: false,
    oneMinuteWarningShown: false,
    expired: false,
  });
  const expiredFiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const computeRemaining = useCallback((): number => {
    if (!expiresAt) return Number.POSITIVE_INFINITY;
    return Date.parse(expiresAt) - serverNow(clockSkewMs);
  }, [expiresAt, clockSkewMs]);

  useEffect(() => {
    expiredFiredRef.current = false;
  }, [attemptId]);

  useEffect(() => {
    if (!expiresAt) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let lastSecond: number | null = null;

    const recompute = () => {
      const remainingMs = computeRemaining();
      const second = Math.floor(remainingMs / 1000);
      // F20 (DoD 5, low-end hardware): only commit state when what the
      // student can see changes — the displayed second, a warning
      // threshold, or expiry. Before F20 this set state on every animation
      // frame, re-rendering the whole runtime (DOMPurify included) ~60×/s.
      if (second !== lastSecond || remainingMs <= 0) {
        lastSecond = second;
        setState((prev) => {
          const next = {
            remainingMs,
            fiveMinuteWarningShown: prev.fiveMinuteWarningShown || remainingMs <= FIVE_MINUTES_MS,
            oneMinuteWarningShown: prev.oneMinuteWarningShown || remainingMs <= ONE_MINUTE_MS,
            expired: remainingMs <= 0,
          };
          return prev.expired && next.expired ? prev : next;
        });
      }
      if (remainingMs <= 0 && !expiredFiredRef.current) {
        expiredFiredRef.current = true;
        onExpireRef.current();
      }
    };

    const schedule = () => {
      if (intervalId !== null) clearInterval(intervalId);
      intervalId = setInterval(
        recompute,
        document.hidden ? BACKGROUND_CHECK_INTERVAL_MS : VISIBLE_TICK_MS,
      );
    };

    const onVisibilityChange = () => {
      recompute();
      schedule();
    };

    recompute();
    schedule();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onVisibilityChange);

    return () => {
      if (intervalId !== null) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onVisibilityChange);
    };
  }, [expiresAt, computeRemaining]);

  return state;
}

/** ADR-0004: if the proactive `submit()` call itself fails offline right at
 * expiry, retry on the same connectivity cadence as the sync engine's
 * heartbeat (a UX nicety — the server's own sweeper is the backstop either
 * way) rather than a separate exponential-backoff timer. */
export function useExpirySubmitRetry(
  attemptId: string | undefined,
  expired: boolean,
  submit: () => Promise<void>,
): void {
  const attemptedRef = useRef(false);
  useEffect(() => {
    if (!attemptId || !expired) return;
    let cancelled = false;
    const attempt = async () => {
      if (cancelled || attemptedRef.current) return;
      try {
        await submit();
        attemptedRef.current = true;
      } catch {
        // Retried on the next interval tick — see below.
      }
    };
    void attempt();
    const interval = setInterval(() => void attempt(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- submit is stable per mount; re-subscribing on every render would duplicate retry timers
  }, [attemptId, expired]);
}

/** Exposed for `exam-runtime.tsx`'s reconnect handling — a manual heartbeat
 * kick, distinct from the sync engine's own periodic one, used right after
 * the connectivity banner reports a fresh reconnect. */
export function pingHeartbeat(attemptId: string): void {
  void sendHeartbeat(attemptId);
}
