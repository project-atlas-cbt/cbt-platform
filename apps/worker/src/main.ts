import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { loadEnv, loadRootEnv, getProductName } from '@atlas/config';
import { prisma } from '@atlas/db';
import { ConsoleNotificationChannel, TemplateRegistry } from '@atlas/notifications';
import { createProbeWorker } from './queues/probe.queue.js';
import {
  SUBSCRIPTION_EXPIRY_QUEUE_NAME,
  createSubscriptionExpiryWorker,
  scheduleSubscriptionExpirySweep,
} from './queues/subscription-expiry.queue.js';
import { registerWorkerTemplates } from './queues/templates.js';

async function main() {
  loadRootEnv();
  const env = loadEnv();

  // Proves the worker process shares the tenancy-aware Prisma client with
  // the API (ADR-0023: "Background workers and exports inherit the same
  // guarantee as request handlers").
  await prisma.$queryRaw`SELECT 1`;

  const redisUrl = new URL(env.REDIS_URL);
  const connection = { host: redisUrl.hostname, port: Number(redisUrl.port) || 6379 };

  const probeWorker = createProbeWorker(connection);

  // B3: no Nest DI in this process — construct the notification channel
  // directly, same class B0 decided on for apps/api (ConsoleNotificationChannel),
  // with this process's own TemplateRegistry instance (see
  // queues/templates.ts's own doc comment on why it isn't shared with
  // apps/api's).
  const templates = new TemplateRegistry();
  registerWorkerTemplates(templates, getProductName(env));
  const notifications = new ConsoleNotificationChannel(templates);
  const redis = new Redis(env.REDIS_URL);

  const subscriptionExpiryWorker = createSubscriptionExpiryWorker(connection, {
    notifications,
    redis,
  });
  const subscriptionExpiryQueue = new Queue(SUBSCRIPTION_EXPIRY_QUEUE_NAME, { connection });
  await scheduleSubscriptionExpirySweep(
    subscriptionExpiryQueue,
    env.SUBSCRIPTION_SWEEP_INTERVAL_MS,
  );

  for (const worker of [probeWorker, subscriptionExpiryWorker]) {
    worker.on('completed', (job) => {
      console.log(`[worker] job ${job.id} on queue "${worker.name}" completed`);
    });
    worker.on('failed', (job, err) => {
      console.error(`[worker] job ${job?.id} on queue "${worker.name}" failed:`, err.message);
    });
  }

  console.log(
    `[worker] ${env.PRODUCT_NAME} worker listening on queues "${probeWorker.name}", "${subscriptionExpiryWorker.name}" (sweep every ${env.SUBSCRIPTION_SWEEP_INTERVAL_MS}ms)`,
  );

  const shutdown = async () => {
    console.log('[worker] shutting down...');
    await Promise.all([probeWorker.close(), subscriptionExpiryWorker.close()]);
    await subscriptionExpiryQueue.close();
    redis.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  };
  // process.on expects a void-returning listener; wrapping avoids handing
  // it an async function directly (whose rejection would otherwise be
  // unhandled) — see @typescript-eslint/no-misused-promises.
  const onSignal = () => {
    void shutdown().catch((err: unknown) => {
      console.error('[worker] error during shutdown:', err);
      process.exit(1);
    });
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
}

main().catch((err) => {
  console.error('[worker] failed to start:', err);
  process.exit(1);
});
