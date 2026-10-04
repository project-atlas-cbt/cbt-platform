import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type ConnectionOptions } from 'bullmq';
import { redisConnectionFromUrl, type Env } from '@atlas/config';
import { FAILED_JOB_RETENTION } from '@atlas/domain';
import { withTimeout } from '../../common/dependency-health.js';

export const IMPORT_VALIDATION_QUEUE_NAME = 'atlas-import-validation';
export const IMPORT_COMMIT_QUEUE_NAME = 'atlas-import-commit';

export interface ImportJobPayload {
  schoolId: string;
  importJobId: string;
}

export function importRedisConnectionOptions(redisUrl: string): ConnectionOptions {
  // B20: full URL (credentials + TLS) — see @atlas/config's redis-connection.ts.
  return redisConnectionFromUrl(redisUrl);
}

/**
 * Owns only the two `Queue` handles (enqueue side) — deliberately **not**
 * the `Worker` consumers (processing side). Queues are harmless to have
 * open in every process that boots `AppModule`, including every
 * integration test (the same shape as `RedisModule`'s own always-open
 * connection) — a test can assert a real `.add()` call happened without
 * anything ever consuming it. A live `Worker`, by contrast, actively pulls
 * jobs off Redis the moment it exists; auto-starting one via Nest's
 * `OnModuleInit` would mean *every* integration test that boots `AppModule`
 * directly (this codebase's established pattern) also starts consuming
 * import jobs against the same long-lived local Redis B1's own
 * `rate-limit.integration.test.ts` flakiness note already documents — a
 * real risk of cross-test interference, not a hypothetical one. So the
 * `Worker`s are constructed imperatively, only from `main.ts`'s real
 * `bootstrap()` (see `import-worker-bootstrap.ts`) — mirroring, in the
 * opposite direction, exactly why `HttpExceptionFilter`/`ValidationPipe`
 * had to move *out* of `bootstrap()` and into `AppModule` itself: some
 * things must run for every test that boots the module graph, and some —
 * like this — must run for *none* of them, only the real server. Import
 * integration tests call `ImportValidationService.validate()`/
 * `ImportCommitService.commit()` directly instead of waiting on a live
 * consumer, matching this codebase's established pattern for background
 * jobs elsewhere (B3's subscription-expiry sweep test calls
 * `runSubscriptionExpirySweep()` directly, not "start the queue and poll").
 */
@Injectable()
export class ImportQueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ImportQueueService.name);
  private validationQueue?: Queue<ImportJobPayload>;
  private commitQueue?: Queue<ImportJobPayload>;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const connection = importRedisConnectionOptions(this.config.get('REDIS_URL', { infer: true }));
    this.validationQueue = new Queue<ImportJobPayload>(IMPORT_VALIDATION_QUEUE_NAME, {
      connection,
    });
    this.commitQueue = new Queue<ImportJobPayload>(IMPORT_COMMIT_QUEUE_NAME, { connection });

    // Queue (unlike Worker) doesn't actively pull jobs, but it still holds a
    // live Redis connection and still emits 'error' for connection-level
    // failures — an unhandled 'error' event on a Node EventEmitter throws
    // and crashes the process. Log-and-continue, matching
    // `import-worker-bootstrap.ts`'s own handler for the same reason.
    for (const queue of [this.validationQueue, this.commitQueue]) {
      queue.on('error', (err) => {
        this.logger.error(`Queue "${queue.name}" connection error: ${err.message}`, err.stack);
      });
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.validationQueue?.close(), this.commitQueue?.close()]);
  }

  /** `jobId: importJobId` — BullMQ's own dedup by jobId is the queue-layer
   * half of the concurrency DoD; the API-layer half is the conditional
   * `VALIDATED -> IMPORTING` update in `imports.service.ts`'s `confirm()`.
   *
   * Throws (rather than the previous silent `?.` no-op) if called before
   * `onModuleInit` has run — Nest always calls it before any provider can
   * receive a request, so this should be unreachable in practice; it exists
   * so a future lifecycle change fails loudly instead of leaving a job
   * stuck in PENDING_VALIDATION/VALIDATED forever with no error anywhere. */
  async enqueueValidation(schoolId: string, importJobId: string): Promise<void> {
    await withTimeout(
      this.requireQueue(this.validationQueue, 'validationQueue').add(
        'validate',
        { schoolId, importJobId },
        { jobId: importJobId, removeOnComplete: true, removeOnFail: FAILED_JOB_RETENTION },
      ),
      this.config.get('QUEUE_ENQUEUE_TIMEOUT_MS', { infer: true }),
      'queue enqueue',
    );
  }

  async enqueueCommit(schoolId: string, importJobId: string): Promise<void> {
    await withTimeout(
      this.requireQueue(this.commitQueue, 'commitQueue').add(
        'commit',
        { schoolId, importJobId },
        { jobId: importJobId, removeOnComplete: true, removeOnFail: FAILED_JOB_RETENTION },
      ),
      this.config.get('QUEUE_ENQUEUE_TIMEOUT_MS', { infer: true }),
      'queue enqueue',
    );
  }

  private requireQueue(
    queue: Queue<ImportJobPayload> | undefined,
    name: string,
  ): Queue<ImportJobPayload> {
    if (!queue) {
      throw new Error(`ImportQueueService.${name} used before onModuleInit ran.`);
    }
    return queue;
  }
}
