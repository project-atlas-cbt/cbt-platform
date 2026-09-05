import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Env } from '@atlas/config';
import { ATTEMPT_MARKING_QUEUE_NAME, type AttemptMarkingJobPayload } from '@atlas/domain';

/** A small, deliberate duplicate of `NotificationDispatchQueueService`'s own
 * identical helper — a generic "parse a redis:// URL into BullMQ connection
 * options" utility with no real shared-module boundary to cross for,
 * matching this codebase's established "convention reuse, not literal code
 * sharing" precedent. */
function redisConnectionOptions(redisUrl: string): { host: string; port: number } {
  const url = new URL(redisUrl);
  return { host: url.hostname, port: Number(url.port) || 6379 };
}

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
    await this.queue.add('mark', payload, {
      jobId: jobId ?? `mark-${payload.attemptId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: 10,
    });
  }
}
