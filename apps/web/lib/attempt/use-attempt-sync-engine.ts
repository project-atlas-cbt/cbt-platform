'use client';

import { useEffect, useMemo } from 'react';
import { AttemptSyncEngine } from './sync-engine';
import { sendHeartbeat, flushEventOutbox } from './events';
import { watchBrowserConnectivityHints } from './connectivity-store';

/**
 * F13 — the heartbeat interval used both as the ADR-0020 liveness signal
 * and (see `connectivity-store.ts`) as this app's own connectivity probe.
 * `ADR-0020`/`backend-roadmap.md`'s B13 section explicitly defer sizing this
 * interval to `B21`'s load-testing results — 30s is a reasonable engineering
 * default in the meantime, not a final, load-tested value.
 */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Wires one `AttemptSyncEngine` instance to React's lifecycle for the
 * leader tab only (the caller — `exam-runtime.tsx` — never mounts this for
 * a non-leader tab). Owns the heartbeat/connectivity-probe interval and the
 * integrity-event outbox flush, alongside the answer sync engine, since all
 * three share the same "talk to the server periodically" cadence.
 *
 * `onAttemptNotWritable` is called when a flush discovers the attempt itself
 * has left `IN_PROGRESS` server-side (submitted elsewhere, invalidated,
 * etc.) — the caller re-runs `resume.ts`'s reconciliation to pick up the
 * real state rather than this hook trying to interpret it.
 */
export function useAttemptSyncEngine(
  attemptId: string | undefined,
  onAttemptNotWritable: () => void,
): {
  recordAnswer: (examQuestionId: string, selectedOptionId: string | null) => void;
  flushNow: () => Promise<void>;
} {
  const engine = useMemo(() => (attemptId ? new AttemptSyncEngine(attemptId) : null), [attemptId]);

  useEffect(() => {
    engine?.setOnNotWritable(onAttemptNotWritable);
  }, [engine, onAttemptNotWritable]);

  useEffect(() => {
    if (!attemptId || !engine) return;

    const tick = () => {
      void sendHeartbeat(attemptId);
      void flushEventOutbox(attemptId);
      engine.scheduleFlush();
    };

    const interval = setInterval(tick, HEARTBEAT_INTERVAL_MS);
    // An immediate tick on mount/reconnect, rather than waiting a full
    // interval for the first heartbeat.
    tick();

    const stopWatchingHints = watchBrowserConnectivityHints(tick);

    return () => {
      clearInterval(interval);
      stopWatchingHints();
    };
  }, [attemptId, engine]);

  return {
    recordAnswer: (examQuestionId: string, selectedOptionId: string | null) => {
      void engine?.recordAnswer(examQuestionId, selectedOptionId);
    },
    flushNow: async () => {
      await engine?.flushNow();
    },
  };
}
