/**
 * B22: `reconcileJob` against a real BullMQ queue on real Redis — the
 * three ways owed work can be lost (no job, a failed job, a job that keeps
 * failing) and what reconciliation does about each.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { redisConnectionFromUrl } from '@atlas/config';
import { MAX_AUTO_RETRIES, reconcileJob } from './job-reconcile.js';

const connection = redisConnectionFromUrl(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
const name = `b22-reconcile-${randomUUID()}`;
const queue = new Queue<{ n: number; autoRetries?: number }>(name, { connection });
const events = new QueueEvents(name, { connection });

afterAll(async () => {
  await queue.obliterate({ force: true }).catch(() => undefined);
  await Promise.all([queue.close(), events.close()]);
});

const add = (jobId: string) => () =>
  queue
    .add('work', { n: 1 }, { jobId, attempts: 1, removeOnComplete: true, removeOnFail: false })
    .then(() => undefined);

async function failOnce(jobId: string): Promise<void> {
  const failed = new Promise<void>((resolve) =>
    events.on('failed', ({ jobId: id }) => {
      if (id === jobId) resolve();
    }),
  );
  const worker = new Worker(
    name,
    () => {
      throw new Error('simulated failure');
    },
    { connection },
  );
  await failed;
  await worker.close();
}

describe('reconcileJob (B22)', () => {
  it('adds a job whose enqueue was lost', async () => {
    const jobId = `lost-${randomUUID()}`;
    expect(await reconcileJob(queue, jobId, add(jobId))).toBe('enqueued');
    expect(await (await queue.getJob(jobId))?.getState()).toBe('waiting');
    // Already queued: nothing more to do.
    expect(await reconcileJob(queue, jobId, add(jobId))).toBe('pending');
  });

  it('retries a failed job with a fresh attempt budget, a bounded number of times', async () => {
    const jobId = `failed-${randomUUID()}`;
    await events.waitUntilReady();
    await add(jobId)();
    for (let i = 1; i <= MAX_AUTO_RETRIES; i += 1) {
      await failOnce(jobId);
      expect(await reconcileJob(queue, jobId, add(jobId))).toBe('retried');
      const job = await queue.getJob(jobId);
      expect(await job?.getState()).toBe('waiting');
      expect(job?.data.autoRetries).toBe(i);
      expect(job?.attemptsMade).toBe(0);
    }
    // A job that keeps failing is a defect, not an outage: left for an
    // operator rather than retried forever.
    await failOnce(jobId);
    expect(await reconcileJob(queue, jobId, add(jobId))).toBe('exhausted');
    expect(await (await queue.getJob(jobId))?.getState()).toBe('failed');
  });
});
