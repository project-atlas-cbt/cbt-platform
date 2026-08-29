import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import type { INestApplicationContext } from '@nestjs/common';
import type { Env } from '@atlas/config';
import {
  IMPORT_COMMIT_QUEUE_NAME,
  IMPORT_VALIDATION_QUEUE_NAME,
  importRedisConnectionOptions,
  type ImportJobPayload,
} from './import-queue.service.js';
import { ImportValidationService } from './import-validation.service.js';
import { ImportCommitService } from './import-commit.service.js';

export interface ImportWorkers {
  close: () => Promise<void>;
}

/**
 * The processing half of `ImportQueueService`'s own doc comment — called
 * once, only from `main.ts`'s real `bootstrap()`, never from Nest's module
 * lifecycle (see that class's doc comment for the full reasoning). Pulls
 * the real, already-DI-resolved `ImportValidationService`/
 * `ImportCommitService` instances out of the booted app via `app.get(...)`
 * — the standard technique for reusing a Nest app's DI graph outside the
 * normal request-handling path.
 */
export function startImportWorkers(app: INestApplicationContext): ImportWorkers {
  const config = app.get(ConfigService<Env, true>);
  const validation = app.get(ImportValidationService);
  const commit = app.get(ImportCommitService);
  const connection = importRedisConnectionOptions(config.get('REDIS_URL', { infer: true }));

  const validationWorker = new Worker<ImportJobPayload>(
    IMPORT_VALIDATION_QUEUE_NAME,
    async (job: Job<ImportJobPayload>) => {
      await validation.validate(job.data.schoolId, job.data.importJobId);
    },
    { connection },
  );
  const commitWorker = new Worker<ImportJobPayload>(
    IMPORT_COMMIT_QUEUE_NAME,
    async (job: Job<ImportJobPayload>) => {
      await commit.commit(job.data.schoolId, job.data.importJobId);
    },
    { connection },
  );

  for (const worker of [validationWorker, commitWorker]) {
    worker.on('failed', (job, err) => {
      console.error(`[api] import job ${job?.id} on queue "${worker.name}" failed:`, err.message);
    });
    // These are this codebase's first BullMQ Worker instances living inside
    // apps/api itself (every prior worker lives in the separate apps/worker
    // process). Worker extends EventEmitter and emits 'error' for
    // connection-level failures (e.g. a dropped/failed Redis connection) —
    // an unhandled 'error' event throws synchronously and would crash the
    // whole API process, not just import processing. Log-and-continue.
    worker.on('error', (err) => {
      console.error(`[api] import worker "${worker.name}" connection error:`, err.message);
    });
  }

  return {
    close: async () => {
      await Promise.all([validationWorker.close(), commitWorker.close()]);
    },
  };
}
