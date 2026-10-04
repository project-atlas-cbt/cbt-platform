import type { Queue } from 'bullmq';

/** What a reconciliation found for one piece of owed work, and did. */
export type JobReconcileOutcome =
  /** A job is waiting, delayed or running — nothing to do. */
  | 'pending'
  /** No job existed (its enqueue was lost); one was added. */
  | 'enqueued'
  /** The job had failed (every retry, or stalled too often); retried. */
  | 'retried'
  /** The job failed and has used its automatic retries — left for an
   * operator (`ops:replay-jobs`), and alerted on. */
  | 'exhausted';

/** Automatic retries of a job that already failed every attempt. Each one
 * restarts its full attempts/backoff budget, so a transient cause (an
 * outage, two worker restarts) clears; a job that keeps failing is a real
 * defect and stops after this many so it does not loop forever. */
export const MAX_AUTO_RETRIES = 3;

/**
 * B22: makes sure the job with `jobId` exists and can still run. The job
 * id is the work's stable identity (`mark-${attemptId}`), so the database
 * says what work is owed and this only reconciles BullMQ with it.
 */
export async function reconcileJob<T extends { autoRetries?: number }>(
  queue: Queue<T>,
  jobId: string,
  add: () => Promise<void>,
): Promise<JobReconcileOutcome> {
  const job = await queue.getJob(jobId);
  if (!job) {
    await add();
    return 'enqueued';
  }
  const state = await job.getState();
  if (state === 'failed') {
    const autoRetries = job.data.autoRetries ?? 0;
    if (autoRetries >= MAX_AUTO_RETRIES) return 'exhausted';
    await job.updateData({ ...job.data, autoRetries: autoRetries + 1 } as T);
    await job.retry('failed', { resetAttemptsMade: true, resetAttemptsStarted: true });
    return 'retried';
  }
  if (state === 'completed' || state === 'unknown') {
    // Completed yet the work is still owed (it ran as a no-op before the
    // state it needed existed), or gone between the two reads: run it again.
    await job.remove().catch(() => undefined);
    await add();
    return 'enqueued';
  }
  return 'pending';
}
