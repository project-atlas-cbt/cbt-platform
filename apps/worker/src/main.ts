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
import {
  ORPHAN_MEDIA_REPORT_QUEUE_NAME,
  createOrphanMediaReportWorker,
  scheduleOrphanMediaReport,
} from './queues/orphan-media-report.queue.js';
import {
  IMPORT_EXPIRY_QUEUE_NAME,
  createImportExpiryWorker,
  scheduleImportExpirySweep,
} from './queues/import-expiry.queue.js';
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

  // B4: orphan-media reporting — report only, never deletes (see this
  // job's own doc comment).
  const orphanMediaReportWorker = createOrphanMediaReportWorker(connection, { redis });
  const orphanMediaReportQueue = new Queue(ORPHAN_MEDIA_REPORT_QUEUE_NAME, { connection });
  await scheduleOrphanMediaReport(orphanMediaReportQueue, env.MEDIA_ORPHAN_SWEEP_INTERVAL_MS);

  // B7: import staging-expiry sweep (A-17) — report/transition only, same
  // shape as orphan-media reporting above.
  const importExpiryWorker = createImportExpiryWorker(connection, {});
  const importExpiryQueue = new Queue(IMPORT_EXPIRY_QUEUE_NAME, { connection });
  await scheduleImportExpirySweep(importExpiryQueue, env.IMPORT_EXPIRY_SWEEP_INTERVAL_MS);

  // Same 'error'-event risk as the Workers below, for the Queue (enqueue)
  // side of each connection.
  for (const queue of [subscriptionExpiryQueue, orphanMediaReportQueue, importExpiryQueue]) {
    queue.on('error', (err) => {
      console.error(`[worker] queue "${queue.name}" connection error:`, err.message);
    });
  }

  for (const worker of [
    probeWorker,
    subscriptionExpiryWorker,
    orphanMediaReportWorker,
    importExpiryWorker,
  ]) {
    worker.on('completed', (job) => {
      console.log(`[worker] job ${job.id} on queue "${worker.name}" completed`);
    });
    worker.on('failed', (job, err) => {
      console.error(`[worker] job ${job?.id} on queue "${worker.name}" failed:`, err.message);
    });
    // Worker extends EventEmitter and emits 'error' for connection-level
    // failures (e.g. a dropped/failed Redis connection) — an unhandled
    // 'error' event throws synchronously and crashes this process. Found
    // during B7's review of its own new import-expiry worker; applied to
    // every worker in this shared loop since none of them had one either.
    worker.on('error', (err) => {
      console.error(`[worker] worker "${worker.name}" connection error:`, err.message);
    });
  }

  console.log(
    `[worker] ${env.PRODUCT_NAME} worker listening on queues "${probeWorker.name}", "${subscriptionExpiryWorker.name}" (sweep every ${env.SUBSCRIPTION_SWEEP_INTERVAL_MS}ms), "${orphanMediaReportWorker.name}" (sweep every ${env.MEDIA_ORPHAN_SWEEP_INTERVAL_MS}ms), "${importExpiryWorker.name}" (sweep every ${env.IMPORT_EXPIRY_SWEEP_INTERVAL_MS}ms)`,
  );

  const shutdown = async () => {
    console.log('[worker] shutting down...');
    await Promise.all([
      probeWorker.close(),
      subscriptionExpiryWorker.close(),
      orphanMediaReportWorker.close(),
      importExpiryWorker.close(),
    ]);
    await subscriptionExpiryQueue.close();
    await orphanMediaReportQueue.close();
    await importExpiryQueue.close();
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
