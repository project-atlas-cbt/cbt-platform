'use client';

import { useEffect, useMemo } from 'react';
import { AttemptSyncEngine } from './sync-engine';
import { sendHeartbeat, flushEventOutbox } from './events';
import { connectivityStore, watchBrowserConnectivityHints } from './connectivity-store';

/**
 * F13 — the heartbeat interval used both as the ADR-0020 liveness signal
 * and (see `connectivity-store.ts`) as this app's own connectivity probe.
 * B21 confirmed 30 s under load (ADR-0020 amendment, 2026-10-03).
 */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * F20 (B21 → F20): every heartbeat interval is jittered ±10 %, and the
 * first beat lands at a random point inside the first interval. A lab is
 * released together; with a fixed `setInterval` its 40 machines beat in
 * phase for the whole exam (B21 measured 1,000 heartbeats arriving in
 * lockstep every 30 s, heartbeat p50 33 → 257 ms, after one host stall).
 */
export function nextHeartbeatDelay(random: () => number = Math.random): number {
  return Math.round(HEARTBEAT_INTERVAL_MS * (0.9 + 0.2 * random()));
}

export function firstHeartbeatDelay(random: () => number = Math.random): number {
  return Math.round(HEARTBEAT_INTERVAL_MS * random());
}

/** A whole lab's network returning at once fires every machine's `online`
 * event together — spread the resulting probes over a few seconds. */
const RECONNECT_SPREAD_MS = 3_000;

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
  onAttemptMissing: () => void = () => undefined,
): {
  recordAnswer: (examQuestionId: string, selectedOptionId: string | null) => void;
  flushNow: () => Promise<void>;
  flushUntilSynced: (keepTrying: () => boolean) => Promise<number>;
} {
  const engine = useMemo(() => (attemptId ? new AttemptSyncEngine(attemptId) : null), [attemptId]);

  useEffect(() => {
    engine?.setOnNotWritable(onAttemptNotWritable);
  }, [engine, onAttemptNotWritable]);
  useEffect(() => {
    engine?.setOnAttemptMissing(onAttemptMissing);
  }, [engine, onAttemptMissing]);

  useEffect(() => {
    if (!attemptId || !engine) return;

    let stopped = false;
    let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
    let hintTimer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      void sendHeartbeat(attemptId);
      void flushEventOutbox(attemptId);
      engine.scheduleFlush({ force: true });
    };

    const scheduleHeartbeat = (delay: number) => {
      heartbeatTimer = setTimeout(() => {
        if (stopped) return;
        tick();
        scheduleHeartbeat(nextHeartbeatDelay());
      }, delay);
    };

    // Local work runs at once on mount/reconnect (it only sends anything if
    // answers or events are actually pending); the first heartbeat is spread.
    void flushEventOutbox(attemptId);
    engine.scheduleFlush({ force: true });
    scheduleHeartbeat(firstHeartbeatDelay());

    // B22 (decision 2c): back from an outage, check the server still holds
    // every answer it acknowledged (a database restore can roll some back)
    // before flushing. Spread like the hints below: a whole lab reconnects
    // together.
    let wasOffline = connectivityStore.getSnapshot() === 'offline';
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const stopWatchingConnectivity = connectivityStore.subscribe(() => {
      const status = connectivityStore.getSnapshot();
      if (status === 'offline') {
        wasOffline = true;
      } else if (status === 'online' && wasOffline) {
        wasOffline = false;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(
          () => engine.onReconnect(),
          Math.round(RECONNECT_SPREAD_MS * Math.random()),
        );
      }
    });

    const stopWatchingHints = watchBrowserConnectivityHints(() => {
      if (hintTimer) clearTimeout(hintTimer);
      hintTimer = setTimeout(tick, Math.round(RECONNECT_SPREAD_MS * Math.random()));
    });

    return () => {
      stopped = true;
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      if (hintTimer) clearTimeout(hintTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopWatchingHints();
      stopWatchingConnectivity();
      engine.dispose();
    };
  }, [attemptId, engine]);

  // Stable per engine, so callers can list these in hook dependencies.
  return useMemo(
    () => ({
      recordAnswer: (examQuestionId: string, selectedOptionId: string | null) => {
        void engine?.recordAnswer(examQuestionId, selectedOptionId);
      },
      flushNow: async () => {
        await engine?.flushNow();
      },
      flushUntilSynced: async (keepTrying: () => boolean) =>
        engine ? engine.flushUntilSynced(keepTrying) : 0,
    }),
    [engine],
  );
}
