/**
 * B22: `ops:replay-jobs` against a real queue — a job that failed every
 * attempt is listed on a dry run, untouched, and retried with a fresh
 * attempt budget on --apply.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { redisConnectionFromUrl } from '@atlas/config';
import { replayFailedJobs } from './job-replay.js';

const connection = redisConnectionFromUrl(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
const name = `b22-replay-${randomUUID()}`;
const queue = new Queue(name, { connection });
const events = new QueueEvents(name, { connection });

afterAll(async () => {
  await queue.obliterate({ force: true }).catch(() => undefined);
  await Promise.all([queue.close(), events.close()]);
});

describe('replayFailedJobs (B22)', () => {
  it('lists failed jobs on a dry run and retries them on apply', async () => {
    await events.waitUntilReady();
    const jobId = `job-${randomUUID()}`;
    const failed = new Promise<void>((resolve) =>
      events.on('failed', ({ jobId: id }) => {
        if (id === jobId) resolve();
      }),
    );
    await queue.add('work', { n: 1 }, { jobId, attempts: 2, removeOnFail: false });
    const worker = new Worker(
      name,
      () => {
        throw new Error('simulated outage\nstack line');
      },
      { connection },
    );
    await failed;
    await worker.close();

    const dry = await replayFailedJobs({ connection, queues: [name], apply: false });
    expect(dry.replayed).toBe(0);
    expect(dry.jobs).toEqual([
      expect.objectContaining({ queue: name, jobId, attemptsMade: 2, reason: 'simulated outage' }),
    ]);
    expect(await (await queue.getJob(jobId))?.getState()).toBe('failed');

    const applied = await replayFailedJobs({ connection, queues: [name], jobId, apply: true });
    expect(applied.replayed).toBe(1);
    const job = await queue.getJob(jobId);
    expect(await job?.getState()).toBe('waiting');
    expect(job?.attemptsMade).toBe(0);
  });
});
