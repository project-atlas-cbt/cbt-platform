/**
 * ADR-0031 technology validation spike. "A thin vertical spike exercising
 * the risky combination end to end: NestJS + Fastify + Prisma + PostgreSQL
 * + BullMQ + Redis, committing one transaction with row-level locking and
 * processing one queued job."
 *
 * Run with `pnpm spike` (requires `docker compose up -d`). Exits non-zero
 * on any failure — this is meant to be a hard gate, not advisory output.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Module } from '@nestjs/common';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { loadEnv, loadRootEnv } from '@atlas/config';
import { createPrismaClient } from '@atlas/db';

loadRootEnv();

@Module({})
class SpikeModule {}

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  process.stdout.write(`[spike] ${label} ... `);
  try {
    const result = await fn();
    console.log('OK');
    return result;
  } catch (err) {
    console.log('FAILED');
    throw err;
  }
}

async function main() {
  const env = loadEnv();
  console.log(`[spike] validating technology baseline for ${env.PRODUCT_NAME} (ADR-0031)`);

  // 1. NestJS 11 + Fastify adapter boots.
  const app = await step('NestJS + Fastify adapter boots', async () => {
    const nestApp = await NestFactory.create<NestFastifyApplication>(
      SpikeModule,
      new FastifyAdapter(),
      { logger: false },
    );
    await nestApp.init();
    return nestApp;
  });

  // 2. Prisma + PostgreSQL 18: a transaction that takes a row lock
  //    (SELECT ... FOR UPDATE) and commits — the pattern ADR-0031 reserves
  //    for a small set of hand-written exam-engine repository methods.
  const prisma = createPrismaClient();
  const probeSubdomain = `spike-${randomUUID().slice(0, 8)}`;

  await step('Prisma + PostgreSQL: transaction with row-level lock commits', async () => {
    await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: { name: 'ADR-0031 spike school', subdomain: probeSubdomain },
      });

      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM schools WHERE id = ${school.id}::uuid FOR UPDATE
      `;
      if (locked.length !== 1) {
        throw new Error('row-level lock did not return the expected row');
      }

      await tx.school.update({
        where: { id: school.id },
        data: { name: 'ADR-0031 spike school (locked + updated)' },
      });
    });
  });

  await step('cleanup: remove the spike school row', async () => {
    await prisma.school.deleteMany({ where: { subdomain: probeSubdomain } });
  });

  // 3. BullMQ + Redis: enqueue and process one job end to end.
  const redisUrl = new URL(env.REDIS_URL);
  const connection = { host: redisUrl.hostname, port: Number(redisUrl.port) || 6379 };
  const queueName = `atlas-spike-${randomUUID().slice(0, 8)}`;

  await step('BullMQ + Redis: enqueue → process → complete', async () => {
    const queue = new Queue<{ hello: string }>(queueName, { connection });
    const worker = new Worker<{ hello: string }>(
      queueName,
      // Not `async` — the body is synchronous, see probe.queue.ts for why.
      (job) => Promise.resolve({ receivedAt: new Date().toISOString(), input: job.data }),
      { connection },
    );
    try {
      const job = await queue.add('spike-job', { hello: 'atlas' });
      const result = (await job.waitUntilFinished(new QueueEvents(queueName, { connection }))) as
        { receivedAt: string; input: unknown } | undefined;
      if (!result || typeof result !== 'object' || !('receivedAt' in result)) {
        throw new Error('job did not return the expected shape');
      }
    } finally {
      await worker.close();
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
  });

  await prisma.$disconnect();
  await app.close();

  console.log(
    '[spike] all checks passed — see docs/decisions/ADR-0031-technology-version-baseline.md appendix for the recorded compatibility matrix.',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('[spike] FAILED:', err);
  process.exit(1);
});
