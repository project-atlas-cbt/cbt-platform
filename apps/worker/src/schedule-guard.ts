import type { Queue } from 'bullmq';

/**
 * B22: Redis that loses its data (a failover without persistence, a
 * FLUSHALL) takes every BullMQ job scheduler with it, and a lost scheduler
 * never comes back by itself — the auto-submit sweep, and with it the
 * reconciliation pass that repairs exactly that outage, would stop until
 * the worker restarted. Every `everyMs`, if the sentinel scheduler is gone,
 * `reassert` registers all of them again (each is an idempotent upsert).
 * A Redis that is unreachable just fails this tick; the next one retries.
 */
export function startScheduleGuard(opts: {
  sentinel: Queue;
  sentinelId: string;
  reassert: () => Promise<void>;
  onRestored: () => void;
  everyMs: number;
}): { stop: () => void; check: () => Promise<boolean> } {
  const check = async (): Promise<boolean> => {
    if (await opts.sentinel.getJobScheduler(opts.sentinelId)) return false;
    await opts.reassert();
    opts.onRestored();
    return true;
  };
  const timer = setInterval(() => {
    check().catch(() => undefined);
  }, opts.everyMs);
  timer.unref();
  return { stop: () => clearInterval(timer), check };
}
