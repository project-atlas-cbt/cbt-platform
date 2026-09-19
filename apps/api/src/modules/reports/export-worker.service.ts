import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { Env } from '@atlas/config';
import { EXPORT_EXPIRY_QUEUE_NAME, EXPORT_QUEUE_NAME, type ExportJobPayload } from '@atlas/domain';
import { ExportService } from './export.service.js';

/** A real BullMQ consumer; S3 access stays behind B4's API-owned abstraction. */
@Injectable()
export class ExportWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ExportWorkerService.name);
  private worker?: Worker<ExportJobPayload>;
  private expiryWorker?: Worker<ExportJobPayload>;
  private sweepTimer?: NodeJS.Timeout;
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly exports: ExportService,
  ) {}
  onModuleInit(): void {
    if (process.env.ATLAS_OPENAPI_EMIT === 'true') return;
    const url = new URL(this.config.get('REDIS_URL', { infer: true }));
    this.worker = new Worker<ExportJobPayload>(
      EXPORT_QUEUE_NAME,
      async (job) => this.exports.generate(job.data.schoolId, job.data.exportJobId),
      { connection: { host: url.hostname, port: Number(url.port) || 6379 } },
    );
    this.worker.on('error', (error) => this.logger.error(error.message, error.stack));
    this.expiryWorker = new Worker<ExportJobPayload>(
      EXPORT_EXPIRY_QUEUE_NAME,
      async (job) => this.exports.expire(job.data.schoolId, job.data.exportJobId),
      { connection: { host: url.hostname, port: Number(url.port) || 6379 } },
    );
    this.expiryWorker.on('error', (error) => this.logger.error(error.message, error.stack));
    // Delayed jobs are the fast path; this bounded, tenant-safe sweep repairs
    // jobs stranded by Redis downtime or a deployment during their delay.
    this.sweepTimer = setInterval(
      () =>
        void this.exports
          .sweepExpired()
          .catch((error: Error) => this.logger.error(error.message, error.stack)),
      15 * 60 * 1000,
    );
    this.sweepTimer.unref();
    void this.exports
      .sweepExpired()
      .catch((error: Error) => this.logger.error(error.message, error.stack));
  }
  async onApplicationShutdown(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    await this.worker?.close();
    await this.expiryWorker?.close();
  }
}
