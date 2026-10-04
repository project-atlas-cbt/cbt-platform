import { Queue, type ConnectionOptions } from 'bullmq';
import {
  ATTEMPT_MARKING_QUEUE_NAME,
  EXAM_MEDIA_PRECACHE_QUEUE_NAME,
  EXPORT_EXPIRY_QUEUE_NAME,
  EXPORT_QUEUE_NAME,
  RESULT_ADJUSTMENT_QUEUE_NAME,
} from '@atlas/domain';
import { NOTIFICATION_DISPATCH_QUEUE_NAME } from '@atlas/notifications';
import {
  IMPORT_COMMIT_QUEUE_NAME,
  IMPORT_VALIDATION_QUEUE_NAME,
} from '../modules/imports/import-queue.service.js';

/**
 * B22: the queues whose jobs each carry one piece of work, and so keep
 * their failures for FAILED_JOB_RETENTION to be replayed. Scheduled sweeps
 * are not here: their next tick re-runs them.
 */
export const REPLAYABLE_QUEUES = [
  ATTEMPT_MARKING_QUEUE_NAME,
  RESULT_ADJUSTMENT_QUEUE_NAME,
  IMPORT_VALIDATION_QUEUE_NAME,
  IMPORT_COMMIT_QUEUE_NAME,
  EXPORT_QUEUE_NAME,
  EXPORT_EXPIRY_QUEUE_NAME,
  EXAM_MEDIA_PRECACHE_QUEUE_NAME,
  NOTIFICATION_DISPATCH_QUEUE_NAME,
] as const;

export interface FailedJobSummary {
  queue: string;
  jobId: string;
  name: string;
  attemptsMade: number;
  failedAt: string | null;
  /** First line only, truncated: job errors carry ids, not personal data,
   * but an operator needs the gist, not a stack. */
  reason: string;
}

/**
 * Lists — and with `apply`, retries — failed jobs. Every retried job gets
 * a fresh attempt budget; every job is idempotent by design (marking skips
 * a result that is no longer PROCESSING, adjustments resume per result,
 * imports and exports re-claim), so replaying one that already succeeded
 * some other way is a no-op.
 */
export async function replayFailedJobs(input: {
  connection: ConnectionOptions;
  queues: readonly string[];
  jobId?: string;
  apply: boolean;
  limit?: number;
}): Promise<{ jobs: FailedJobSummary[]; replayed: number }> {
  const jobs: FailedJobSummary[] = [];
  let replayed = 0;
  for (const name of input.queues) {
    const queue = new Queue(name, { connection: input.connection });
    try {
      const failed = input.jobId
        ? [await queue.getJob(input.jobId)].filter((j) => j !== undefined)
        : await queue.getFailed(0, (input.limit ?? 1000) - 1);
      for (const job of failed) {
        if (!job.id || (await job.getState()) !== 'failed') continue;
        jobs.push({
          queue: name,
          jobId: job.id,
          name: job.name,
          attemptsMade: job.attemptsMade,
          failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
          reason: (job.failedReason ?? '').split('\n')[0]!.slice(0, 200),
        });
        if (input.apply) {
          await job.retry('failed', { resetAttemptsMade: true, resetAttemptsStarted: true });
          replayed += 1;
        }
      }
    } finally {
      await queue.close();
    }
  }
  return { jobs, replayed };
}
