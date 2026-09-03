import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Env } from '@atlas/config';
import {
  NOTIFICATION_DISPATCH_QUEUE_NAME,
  type NotificationDispatchJobPayload,
} from '@atlas/notifications';

/** A small, deliberate duplicate of `ImportQueueService`'s own identical
 * helper (`imports/import-queue.service.ts`) — a generic "parse a redis://
 * URL into BullMQ connection options" utility with no real shared-module
 * boundary to cross for, matching this codebase's established "convention
 * reuse, not literal code sharing" precedent (e.g. apps/worker's own
 * duplicated notification-template content) rather than an odd dependency
 * from this module onto ImportsModule for unrelated plumbing. */
function redisConnectionOptions(redisUrl: string): { host: string; port: number } {
  const url = new URL(redisUrl);
  return { host: url.hostname, port: Number(url.port) || 6379 };
}

/**
 * B10's retry mechanism for out-of-band (email) notification dispatch —
 * ADR-0019's own "B10: notification dispatch with retry" requirement.
 * Reuses `ImportQueueService`'s exact established split (B7): this class
 * owns only the `Queue` handle (enqueue side, `.add()`-only, safe under
 * every `AppModule`-booting integration test); the `Worker` consumer is
 * constructed imperatively, only from `main.ts`'s real `bootstrap()` (see
 * `notification-dispatch-worker-bootstrap.ts`) — never via Nest's
 * `OnModuleInit`, for the identical reason `ImportQueueService`'s own doc
 * comment already documents (a live `Worker` would otherwise start
 * consuming in every integration test that boots `AppModule` directly).
 *
 * `apps/worker`'s subscription-expiry sweep is a second, cross-process
 * *producer* onto this same queue name/connection (see
 * `apps/worker/src/queues/subscription-expiry.queue.ts`) — both processes
 * connect to the same Redis, and BullMQ's producer/consumer split is
 * exactly this: any process holding a `Queue` for a given name can
 * produce, any process holding a `Worker` for the same name can consume.
 */
@Injectable()
export class NotificationDispatchQueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationDispatchQueueService.name);
  private queue?: Queue<NotificationDispatchJobPayload>;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const connection = redisConnectionOptions(this.config.get('REDIS_URL', { infer: true }));
    this.queue = new Queue<NotificationDispatchJobPayload>(NOTIFICATION_DISPATCH_QUEUE_NAME, {
      connection,
    });
    this.queue.on('error', (err) => {
      this.logger.error(`Queue "${this.queue?.name}" connection error: ${err.message}`, err.stack);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }

  /** `attempts`/`backoff`: real BullMQ retry, not a hand-rolled scheme —
   * DoD item 7's "with retry" requirement, applied uniformly to every
   * out-of-band notification, not just the ones B10 itself introduces
   * (the subscription-expiry sweep's own previously-synchronous,
   * unretried send is retooled to enqueue here too — see that file's own
   * doc comment). `jobId` left to the caller so a caller that wants
   * dedup (e.g. "one warning per threshold crossing") can supply one; a
   * caller with no natural dedup key (e.g. a fresh notification) can omit
   * it and let BullMQ generate one. */
  async enqueue(payload: NotificationDispatchJobPayload, jobId?: string): Promise<void> {
    if (!this.queue) {
      throw new Error('NotificationDispatchQueueService.enqueue used before onModuleInit ran.');
    }
    await this.queue.add('dispatch', payload, {
      ...(jobId !== undefined && { jobId }),
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: 10,
    });
  }
}
