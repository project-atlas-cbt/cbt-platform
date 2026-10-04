import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { redisConnectionFromUrl, type Env } from '@atlas/config';
import {
  FAILED_JOB_RETENTION,
  EXPORT_EXPIRY_QUEUE_NAME,
  EXPORT_QUEUE_NAME,
  type ExportJobPayload,
} from '@atlas/domain';
import { withTimeout } from '../../common/dependency-health.js';

@Injectable()
export class ExportQueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ExportQueueService.name);
  private queue?: Queue<ExportJobPayload>;
  private expiryQueue?: Queue<ExportJobPayload>;
  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const redis = new URL(this.config.get('REDIS_URL', { infer: true }));
    this.queue = new Queue<ExportJobPayload>(EXPORT_QUEUE_NAME, {
      connection: redisConnectionFromUrl(redis.toString()),
    });
    this.expiryQueue = new Queue<ExportJobPayload>(EXPORT_EXPIRY_QUEUE_NAME, {
      connection: redisConnectionFromUrl(redis.toString()),
    });
    this.queue.on('error', (error: Error) => this.logger.error(error.message, error.stack));
  }

  async enqueue(payload: ExportJobPayload): Promise<void> {
    if (!this.queue) throw new Error('Export queue used before initialization.');
    await withTimeout(
      this.queue.add('generate', payload, {
        jobId: `export-${payload.exportJobId}`,
        attempts: 5,
        // B22: 1, 2, 4, 8 min — the retries outlast EXPORT_CLAIM_STALE_MS,
        // so a redelivery after a killed worker can take the export over.
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: FAILED_JOB_RETENTION,
      }),
      this.config.get('QUEUE_ENQUEUE_TIMEOUT_MS', { infer: true }),
      'generate enqueue',
    );
  }
  async enqueueExpiry(payload: ExportJobPayload, expiresAt: Date): Promise<void> {
    if (!this.expiryQueue) throw new Error('Export expiry queue used before initialization.');
    await withTimeout(
      this.expiryQueue.add('expire', payload, {
        jobId: `expire-export-${payload.exportJobId}`,
        // The retention contract starts at request creation, not after a
        // potentially long generation run.
        delay: Math.max(0, expiresAt.getTime() - Date.now()),
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: FAILED_JOB_RETENTION,
      }),
      this.config.get('QUEUE_ENQUEUE_TIMEOUT_MS', { infer: true }),
      'expire enqueue',
    );
  }
  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
    await this.expiryQueue?.close();
  }
}
