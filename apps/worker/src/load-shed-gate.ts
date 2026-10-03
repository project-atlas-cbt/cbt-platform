import type { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { LOAD_SHED_SIGNAL_KEY } from '@atlas/domain';

/**
 * B21 (R-12, roadmap "background work never starves the interactive
 * path"): while any API process reports saturation (the cluster-wide
 * LOAD_SHED_SIGNAL_KEY), the worker pauses its NON-critical consumers —
 * analytics refresh, digests, reports, retention, adjustments — and resumes
 * them when the signal expires. Marking, the auto-submit sweeper, the
 * Control Center refresh and the Exam Health Monitor are never paused.
 *
 * `pause(true)` stops taking new jobs without waiting for the one in
 * progress (which finishes normally); jobs stay queued, nothing is lost.
 */
export interface LoadShedGate {
  stop(): void;
  readonly paused: boolean;
}

export function startLoadShedGate(
  redis: Pick<Redis, 'exists'>,
  deferrable: Worker[],
  logger: { warn: (obj: object, msg: string) => void },
  intervalMs = 5_000,
): LoadShedGate {
  let paused = false;
  const check = async () => {
    const signal = (await redis.exists(LOAD_SHED_SIGNAL_KEY).catch(() => 0)) > 0;
    if (signal && !paused) {
      paused = true;
      await Promise.all(deferrable.map((w) => w.pause(true)));
      logger.warn(
        { queues: deferrable.map((w) => w.name) },
        'Load shedding: non-critical queues paused',
      );
    } else if (!signal && paused) {
      paused = false;
      for (const w of deferrable) void w.resume();
      logger.warn(
        { queues: deferrable.map((w) => w.name) },
        'Load shedding ended: non-critical queues resumed',
      );
    }
  };
  const timer = setInterval(() => void check(), intervalMs);
  timer.unref();
  return {
    stop: () => clearInterval(timer),
    get paused() {
      return paused;
    },
  };
}
