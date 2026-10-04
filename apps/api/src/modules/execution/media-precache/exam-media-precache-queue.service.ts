import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { redisConnectionFromUrl, type Env } from '@atlas/config';
import {
  FAILED_JOB_RETENTION,
  EXAM_MEDIA_PRECACHE_QUEUE_NAME,
  type ExamMediaPrecacheJobPayload,
} from '@atlas/domain';
import { withTimeout } from '../../../common/dependency-health.js';

/** F20 — producer handle for the encrypted media pre-cache job. */
/** B22: how soon a failed pre-cache job may be retried by a manifest poll. */
const RETRY_FAILED_AFTER_MS = 30_000;

@Injectable()
export class ExamMediaPrecacheQueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ExamMediaPrecacheQueueService.name);
  private queue?: Queue<ExamMediaPrecacheJobPayload>;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    if (process.env.ATLAS_OPENAPI_EMIT === 'true') return;
    const redis = new URL(this.config.get('REDIS_URL', { infer: true }));
    this.queue = new Queue<ExamMediaPrecacheJobPayload>(EXAM_MEDIA_PRECACHE_QUEUE_NAME, {
      connection: redisConnectionFromUrl(redis.toString()),
    });
    this.queue.on('error', (error: Error) => this.logger.error(error.message, error.stack));
  }

  async enqueue(payload: ExamMediaPrecacheJobPayload): Promise<void> {
    if (!this.queue) throw new Error('Media pre-cache queue used before initialization.');
    const queue = this.queue;
    // One job per exam at a time — a lab of 40 manifests polling while
    // encryption runs collapses into the single job already queued.
    const jobId = `precache-${payload.schoolId}-${payload.examId}`;
    const timeoutMs = this.config.get('QUEUE_ENQUEUE_TIMEOUT_MS', { infer: true });
    await withTimeout(
      (async () => {
        // B22: a job that failed every attempt (storage was down) is kept for
        // replay, and BullMQ silently ignores an add() with its id — so the
        // exam would never be pre-cached. Retry it instead, at most once per
        // RETRY_FAILED_AFTER_MS however many manifests are polling.
        const existing = await queue.getJob(jobId);
        if (existing && (await existing.getState()) === 'failed') {
          if (Date.now() - (existing.finishedOn ?? 0) >= RETRY_FAILED_AFTER_MS) {
            await existing.retry('failed', { resetAttemptsMade: true, resetAttemptsStarted: true });
          }
          return;
        }
        await queue.add('encrypt', payload, {
          jobId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: FAILED_JOB_RETENTION,
        });
      })(),
      timeoutMs,
      'encrypt enqueue',
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }
}
