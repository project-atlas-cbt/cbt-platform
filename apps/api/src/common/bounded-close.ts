import type { Logger } from '@nestjs/common';
import { withTimeout } from './dependency-health.js';

/** Long enough for a normal job to finish; well inside SHUTDOWN_TIMEOUT_MS. */
export const WORKER_CLOSE_TIMEOUT_MS = 10_000;

/**
 * B22: closes a BullMQ worker without letting it hold shutdown hostage.
 *
 * Found by the Redis-outage test: a worker whose Redis connection was cut
 * and restored while it was blocked waiting for a job can fail to close
 * (BullMQ 6.3 waits for its blocking connection's `end` event, which does
 * not always arrive). Unbounded, that stalled the whole shutdown until the
 * process-level timeout killed it — skipping the telemetry flush and the
 * rest of the ordered close. Past this bound the worker is abandoned: any
 * job it still held is redelivered by BullMQ's stalled-job check on
 * another process, so nothing is lost.
 */
export async function closeWorkerBounded(
  worker: { name: string; close(): Promise<void> },
  logger: Pick<Logger, 'warn'>,
  timeoutMs = WORKER_CLOSE_TIMEOUT_MS,
): Promise<void> {
  try {
    await withTimeout(worker.close(), timeoutMs, `closing worker ${worker.name}`);
  } catch (err) {
    logger.warn({
      msg: 'Worker did not close in time; abandoning it (held jobs are redelivered)',
      worker: worker.name,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
