import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import { Logger, type INestApplicationContext } from '@nestjs/common';
import { redisConnectionFromUrl, type Env } from '@atlas/config';
import {
  NOTIFICATION_DISPATCH_QUEUE_NAME,
  type NotificationChannel,
  type NotificationDispatchJobPayload,
} from '@atlas/notifications';
import { NOTIFICATION_CHANNEL } from '../../notifications/notifications.module.js';
import { closeWorkerBounded } from '../../common/bounded-close.js';

const logger = new Logger('NotificationDispatchWorker');

export interface NotificationDispatchWorker {
  close: () => Promise<void>;
}

/**
 * The processing half of `NotificationDispatchQueueService`'s own doc
 * comment — called once, only from `main.ts`'s real `bootstrap()`, never
 * from Nest's module lifecycle (mirroring `import-worker-bootstrap.ts`'s
 * exact precedent and reasoning). Pulls the real, already-DI-resolved
 * `NOTIFICATION_CHANNEL` singleton out of the booted app via `app.get(...)`
 * — the one every module in this process already registers its templates
 * against, so no second, hand-duplicated registry is needed here.
 */
export function startNotificationDispatchWorker(
  app: INestApplicationContext,
): NotificationDispatchWorker {
  const config = app.get(ConfigService<Env, true>);
  const channel = app.get<NotificationChannel>(NOTIFICATION_CHANNEL);
  const url = new URL(config.get('REDIS_URL', { infer: true }));
  const connection = redisConnectionFromUrl(url.toString());

  const worker = new Worker<NotificationDispatchJobPayload>(
    NOTIFICATION_DISPATCH_QUEUE_NAME,
    async (job: Job<NotificationDispatchJobPayload>) => {
      await channel.send(job.data);
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    console.error(
      `[api] notification-dispatch job ${job?.id} failed after ${job?.attemptsMade} attempt(s):`,
      err.message,
    );
  });
  // This codebase's second BullMQ Worker living inside apps/api itself
  // (the first being the two import workers, B7) — same reasoning as
  // that file's own comment: Worker extends EventEmitter and emits
  // 'error' for connection-level failures; an unhandled 'error' event
  // throws synchronously and would crash the whole API process.
  worker.on('error', (err) => {
    console.error('[api] notification-dispatch worker connection error:', err.message);
  });

  return {
    close: async () => {
      await closeWorkerBounded(worker, logger);
    },
  };
}
