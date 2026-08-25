import { loadEnv, loadRootEnv } from '@atlas/config';
import { prisma } from '@atlas/db';
import { createProbeWorker } from './queues/probe.queue.js';

async function main() {
  loadRootEnv();
  const env = loadEnv();

  // Proves the worker process shares the tenancy-aware Prisma client with
  // the API (ADR-0023: "Background workers and exports inherit the same
  // guarantee as request handlers").
  await prisma.$queryRaw`SELECT 1`;

  const redisUrl = new URL(env.REDIS_URL);
  const worker = createProbeWorker({
    host: redisUrl.hostname,
    port: Number(redisUrl.port) || 6379,
  });

  worker.on('completed', (job) => {
    console.log(`[worker] job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });

  console.log(`[worker] ${env.PRODUCT_NAME} worker listening on queue "${worker.name}"`);

  const shutdown = async () => {
    console.log('[worker] shutting down...');
    await worker.close();
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
