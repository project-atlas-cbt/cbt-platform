import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { redisConnectionFromUrl, type Env } from '@atlas/config';
import {
  FAILED_JOB_RETENTION,
  RESULT_ADJUSTMENT_QUEUE_NAME,
  type ResultAdjustmentJobPayload,
} from '@atlas/domain';
import { withTimeout } from '../../common/dependency-health.js';

/** B20: the hand-rolled `{ host, port }` parser this used to carry dropped
 * the Redis password and TLS; @atlas/config now owns the one full parser. */
const redisConnectionOptions = redisConnectionFromUrl;

/**
 * Producer side of B15's bulk-adjustment queue, mirroring
 * `AttemptMarkingQueueService`'s split exactly: this class owns only the
 * `Queue` handle (`.add()` only, so it is safe in every integration test
 * that boots `AppModule`), while the `Worker` consumer lives in
 * `apps/worker` — where the adjustment's arithmetic has no Nest-DI
 * dependency to reach for, unlike B7's import processor.
 */
@Injectable()
export class ResultAdjustmentQueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ResultAdjustmentQueueService.name);
  private queue?: Queue<ResultAdjustmentJobPayload>;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const connection = redisConnectionOptions(this.config.get('REDIS_URL', { infer: true }));
    this.queue = new Queue<ResultAdjustmentJobPayload>(RESULT_ADJUSTMENT_QUEUE_NAME, {
      connection,
    });
    this.queue.on('error', (err) => {
      this.logger.error(`Queue "${this.queue?.name}" connection error: ${err.message}`, err.stack);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }

  /**
   * A stable `adjust-${operationId}` jobId collapses a duplicate enqueue for
   * the same operation onto one pending job. Retries are generous and
   * slow-backed-off because the consumer is resumable by design: a retry
   * picks up where the previous run's last committed chunk left off rather
   * than restarting the cohort.
   */
  async enqueue(payload: ResultAdjustmentJobPayload): Promise<void> {
    if (!this.queue) {
      throw new Error('ResultAdjustmentQueueService.enqueue used before onModuleInit ran.');
    }
    await withTimeout(
      this.queue.add('adjust', payload, {
        jobId: `adjust-${payload.operationId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: FAILED_JOB_RETENTION,
      }),
      this.config.get('QUEUE_ENQUEUE_TIMEOUT_MS', { infer: true }),
      'adjust enqueue',
    );
  }
}
