import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { redisConnectionFromUrl, type Env } from '@atlas/config';
import { ATTEMPT_MARKING_QUEUE_NAME, type AttemptMarkingJobPayload } from '@atlas/domain';
import { injectTraceContext } from '@atlas/observability';

/** B20: the hand-rolled `{ host, port }` parser this used to carry dropped
 * the Redis password and TLS; @atlas/config now owns the one full parser. */
const redisConnectionOptions = redisConnectionFromUrl;

/**
 * B14's producer side of the marking queue — mirrors
 * `NotificationDispatchQueueService`'s exact established split (B7/B10):
 * this class owns only the `Queue` handle (enqueue side, `.add()`-only,
 * safe under every `AppModule`-booting integration test); the `Worker`
 * consumer lives in `apps/worker` (`attempt-marking.queue.ts`), not started
 * imperatively from this app at all — unlike B7/B10's own consumers, which
 * had to be bootstrap-only specifically because THEY reuse Nest-DI-resolved
 * singletons `apps/worker` cannot reach. Marking has no such dependency, so
 * its consumer lives where background jobs default to living in this
 * codebase.
 *
 * Three producers share this one queue name across two processes:
 * `AttemptLifecycleService.submit()`/`.end()` (this app) and the ADR-0004
 * auto-submission sweeper (`apps/worker`, a cross-process producer onto the
 * same Redis — BullMQ's producer/consumer split is exactly this).
 */
@Injectable()
export class AttemptMarkingQueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AttemptMarkingQueueService.name);
  private queue?: Queue<AttemptMarkingJobPayload>;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const connection = redisConnectionOptions(this.config.get('REDIS_URL', { infer: true }));
    this.queue = new Queue<AttemptMarkingJobPayload>(ATTEMPT_MARKING_QUEUE_NAME, { connection });
    this.queue.on('error', (err) => {
      this.logger.error(`Queue "${this.queue?.name}" connection error: ${err.message}`, err.stack);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }

  /** `attempts`/`backoff`: real BullMQ retry — DoD item 10's "a marking
   * worker crash leaves the attempt finalised and marking resumable"
   * requirement. `jobId` defaults to a stable `mark-${attemptId}` — every
   * caller (submit/end/finalizeIfExpired/the sweeper) uses this same
   * default, giving a second, cheap layer of race protection on top of the
   * DB-level exactly-once transition that already guarantees only one
   * caller ever reaches this enqueue for a given finalisation: a stable
   * jobId collapses concurrent enqueue attempts against one still-pending
   * job rather than creating a duplicate. */
  async enqueue(payload: AttemptMarkingJobPayload, jobId?: string): Promise<void> {
    if (!this.queue) {
      throw new Error('AttemptMarkingQueueService.enqueue used before onModuleInit ran.');
    }
    await this.queue.add(
      'mark',
      { ...payload, trace: injectTraceContext() },
      {
        jobId: jobId ?? `mark-${payload.attemptId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: 10,
      },
    );
  }
}
