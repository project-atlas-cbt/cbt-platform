import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { redisConnectionFromUrl, type Env } from '@atlas/config';
import { EXAM_MEDIA_PRECACHE_QUEUE_NAME, type ExamMediaPrecacheJobPayload } from '@atlas/domain';
import { ExamMediaPrecacheService } from './exam-media-precache.service.js';
import { closeWorkerBounded } from '../../../common/bounded-close.js';

/**
 * F20 — the pre-cache consumer. Hosted in the API process (object storage
 * stays behind the API's abstraction — B18's export worker precedent) and,
 * unlike exports, never paused by B21 load shedding: a lab cannot Start
 * until its paper's media is cached, so this is exam preparation, not
 * reporting.
 */
@Injectable()
export class ExamMediaPrecacheWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ExamMediaPrecacheWorkerService.name);
  private worker?: Worker<ExamMediaPrecacheJobPayload>;
  private purgeTimer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly precache: ExamMediaPrecacheService,
  ) {}

  onModuleInit(): void {
    if (process.env.ATLAS_OPENAPI_EMIT === 'true') return;
    const redis = new URL(this.config.get('REDIS_URL', { infer: true }));
    this.worker = new Worker<ExamMediaPrecacheJobPayload>(
      EXAM_MEDIA_PRECACHE_QUEUE_NAME,
      async (job) => this.precache.encryptExam(job.data.schoolId, job.data.examId),
      { connection: redisConnectionFromUrl(redis.toString()), concurrency: 2 },
    );
    this.worker.on('error', (error) => this.logger.error(error.message, error.stack));
    // Hourly purge of ciphertext for exams that can no longer admit an
    // attempt (operational data — see purgeFinishedExams).
    this.purgeTimer = setInterval(
      () =>
        void this.precache
          .purgeFinishedExams()
          .catch((error: Error) => this.logger.error(error.message, error.stack)),
      60 * 60 * 1000,
    );
    this.purgeTimer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
    if (this.worker) await closeWorkerBounded(this.worker, this.logger);
  }
}
