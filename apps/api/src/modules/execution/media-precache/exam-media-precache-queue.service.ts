import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { redisConnectionFromUrl, type Env } from '@atlas/config';
import { EXAM_MEDIA_PRECACHE_QUEUE_NAME, type ExamMediaPrecacheJobPayload } from '@atlas/domain';

/** F20 — producer handle for the encrypted media pre-cache job. */
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
    await this.queue.add('encrypt', payload, {
      // One job per exam at a time — a lab of 40 manifests polling while
      // encryption runs collapses into the single job already queued.
      jobId: `precache-${payload.schoolId}-${payload.examId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 20,
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }
}
