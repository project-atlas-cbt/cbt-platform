'use client';

import { useEffect, useRef, useState } from 'react';

export type AttemptLockRole = 'pending' | 'leader' | 'blocked';

/** Confirmed decision (2026-09-05): a waiting tab that gets no cooperative
 * response within this window gets a "Force switch anyway" escape hatch,
 * rather than waiting indefinitely — an abandoned tab (device asleep/
 * closed) must never lock a student out of their own exam. */
const FORCE_SWITCH_TIMEOUT_MS = 20_000;

function lockName(attemptId: string): string {
  return `atlas-exam-attempt-${attemptId}`;
}

interface YieldMessage {
  type: 'yield-requested';
}

/**
 * F13 — DoD 20 ("two tabs on one attempt do not corrupt state"). Uses the
 * Web Locks API for leader election: `navigator.locks.request(..., {
 * ifAvailable: true })` resolves immediately with `null` if another tab
 * already holds the lock, rather than queuing — exactly what's needed to
 * *detect* contention rather than wait for it.
 *
 * The leader tab holds the lock for its entire lifetime (a never-resolving
 * promise inside the lock callback, released only on unmount/tab-close).
 * Only the leader instantiates the sync engine, the ticking/submitting half
 * of the timer, and the media-cache pipeline (`exam-runtime.tsx` gates all
 * three on `role === 'leader'`).
 *
 * Handoff is cooperative, never a silent preemption: the non-leader posts a
 * `BroadcastChannel` yield request and queues a normal (non-`ifAvailable`)
 * lock request; the current leader, on receiving that message, flushes
 * pending answers one last time and releases the lock deliberately — control
 * only ever changes hands after a clean flush, never mid-write. If the
 * leader doesn't respond within `FORCE_SWITCH_TIMEOUT_MS` (device asleep or
 * closed, not just slow), the waiting tab is offered a "force switch"
 * action that acquires the lock without waiting for cooperation.
 */
export function useAttemptLock(
  attemptId: string | undefined,
  onYieldRequested: () => Promise<void>,
): {
  role: AttemptLockRole;
  canForceSwitch: boolean;
  requestTakeover: () => void;
  forceSwitch: () => void;
} {
  const hasLocksApi = typeof navigator !== 'undefined' && 'locks' in navigator;
  const [lockRole, setLockRole] = useState<AttemptLockRole>('pending');
  // No Web Locks API (older browser): fail open as sole leader rather than
  // blocking the student outright — DoD 20's guarantee degrades to "best
  // effort" in that case, which this codebase's low-end-hardware posture
  // treats as acceptable versus refusing to run at all. Derived directly
  // (never a `setState` call) so there is nothing to reconcile against the
  // real Web-Locks-driven state machine below.
  const role: AttemptLockRole = hasLocksApi ? lockRole : attemptId ? 'leader' : 'pending';
  const [canForceSwitch, setCanForceSwitch] = useState(false);
  const releaseRef = useRef<(() => void) | null>(null);
  const takeoverAbortRef = useRef<AbortController | null>(null);
  const forceSwitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onYieldRequestedRef = useRef(onYieldRequested);
  useEffect(() => {
    onYieldRequestedRef.current = onYieldRequested;
  }, [onYieldRequested]);

  useEffect(() => {
    if (!attemptId || !hasLocksApi) return;

    let cancelled = false;
    const channel = new BroadcastChannel(lockName(attemptId));

    const holdAsLeader = () =>
      new Promise<void>((resolveHold) => {
        releaseRef.current = resolveHold;
      });

    const onChannelMessage = (event: MessageEvent<YieldMessage>) => {
      if (event.data?.type !== 'yield-requested') return;
      // Every open instance for this attempt (leader, blocked, or the
      // requester's own persistent listener) shares this channel name and
      // receives the broadcast — only the instance actually holding the
      // lock (a live `releaseRef`) has anything to yield. Without this
      // guard, a blocked tab's own effect-owned channel would try to "yield"
      // a lock it never held.
      const release = releaseRef.current;
      if (!release) return;
      // Normalised via Promise.resolve(): defensive against any caller
      // whose yield handler doesn't return a genuine Promise.
      void Promise.resolve(onYieldRequestedRef.current()).finally(() => {
        release();
        releaseRef.current = null;
      });
    };
    channel.addEventListener('message', onChannelMessage);

    void navigator.locks
      .request(lockName(attemptId), { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (cancelled) return;
        if (lock === null) {
          setLockRole('blocked');
          return;
        }
        setLockRole('leader');
        await holdAsLeader();
      })
      .then(() => {
        // The lock was released (leader yielded or unmounted) — if this
        // instance is still mounted and was the leader, it becomes blocked
        // (symmetric handoff: it can request the lock back the same way).
        if (!cancelled) setLockRole((prev) => (prev === 'leader' ? 'blocked' : prev));
      });

    return () => {
      cancelled = true;
      channel.removeEventListener('message', onChannelMessage);
      channel.close();
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, [attemptId, hasLocksApi]);

  const requestTakeover = () => {
    if (!attemptId || !hasLocksApi) return;
    const channel = new BroadcastChannel(lockName(attemptId));
    channel.postMessage({ type: 'yield-requested' } satisfies YieldMessage);
    channel.close();

    const controller = new AbortController();
    takeoverAbortRef.current = controller;
    forceSwitchTimeoutRef.current = setTimeout(
      () => setCanForceSwitch(true),
      FORCE_SWITCH_TIMEOUT_MS,
    );

    navigator.locks
      .request(lockName(attemptId), { mode: 'exclusive', signal: controller.signal }, () => {
        if (forceSwitchTimeoutRef.current) clearTimeout(forceSwitchTimeoutRef.current);
        setCanForceSwitch(false);
        setLockRole('leader');
        return new Promise<void>((resolveHold) => {
          releaseRef.current = resolveHold;
        });
      })
      .catch(() => {
        // Aborted by forceSwitch() below, or the tab closed — no action
        // needed either way.
      });
  };

  /**
   * The Web Locks API has no "steal" primitive — a genuinely abandoned tab
   * (device asleep, browser left open) cannot be preempted through it.
   * Confirmed decision (2026-09-05): after `FORCE_SWITCH_TIMEOUT_MS` with no
   * cooperative response, the student may explicitly accept the narrow risk
   * of proceeding without the OS-level lock — this tab renders as leader
   * directly and abandons its still-queued lock request (cancelled via the
   * AbortController so it never surprises this tab with a lock grant later).
   * If the original tab really was still alive, both would now run
   * simultaneously; this is the accepted trade-off against the alternative
   * of indefinitely locking a student out of their own exam.
   */
  const forceSwitch = () => {
    takeoverAbortRef.current?.abort();
    takeoverAbortRef.current = null;
    if (forceSwitchTimeoutRef.current) clearTimeout(forceSwitchTimeoutRef.current);
    setCanForceSwitch(false);
    setLockRole('leader');
  };

  return { role, canForceSwitch, requestTakeover, forceSwitch };
}
