/**
 * B0 Background jobs scope: "BullMQ wired with one no-op queue proving
 * enqueue → process → complete, retry, and failure handling." Runs against
 * the real Redis instance from docker-compose.
 */
import { Queue, QueueEvents, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const redisUrl = process.env.REDIS_URL;
const parsedConnection = redisUrl ? new URL(redisUrl) : undefined;
const maybeConnectionOptions: ConnectionOptions | undefined = parsedConnection
  ? { host: parsedConnection.hostname, port: Number(parsedConnection.port) || 6379 }
  : undefined;

// describe.skipIf(!maybeConnectionOptions) guarantees this is defined by the
// time any test body below runs — TS can't see across that boundary, so we
// assert it once here rather than `!` at every call site.
function connectionOptions(): ConnectionOptions {
  if (!maybeConnectionOptions) {
    throw new Error('REDIS_URL is required for this suite (should have been skipped).');
  }
  return maybeConnectionOptions;
}

describe.skipIf(!maybeConnectionOptions)('BullMQ round trip (B0 no-op queue)', () => {
  const queueName = `atlas-b0-probe-${Date.now()}`;
  let queue: Queue;

  beforeAll(() => {
    queue = new Queue(queueName, { connection: connectionOptions() });
  });

  afterAll(async () => {
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
  });

  it('enqueues, processes, and completes a job', async () => {
    const worker = new Worker(
      queueName,
      // Not `async` — see apps/worker/src/queues/probe.queue.ts for why.
      (job: Job<{ n: number }>) => Promise.resolve({ doubled: job.data.n * 2 }),
      { connection: connectionOptions() },
    );

    try {
      const job = await queue.add('double', { n: 21 });
      const result = (await job.waitUntilFinished(makeQueueEvents(queueName))) as {
        doubled: number;
      };
      expect(result).toEqual({ doubled: 42 });
    } finally {
      await worker.close();
    }
  });

  it('retries a failing job and eventually succeeds', async () => {
    let attempts = 0;
    const worker = new Worker(
      queueName,
      () => {
        attempts += 1;
        if (attempts < 3) {
          return Promise.reject(new Error(`deliberate failure #${attempts}`));
        }
        return Promise.resolve({ attempts });
      },
      { connection: connectionOptions() },
    );

    try {
      const job = await queue.add(
        'flaky',
        {},
        { attempts: 5, backoff: { type: 'fixed', delay: 50 } },
      );
      const result = (await job.waitUntilFinished(makeQueueEvents(queueName))) as {
        attempts: number;
      };
      expect(result).toEqual({ attempts: 3 });
    } finally {
      await worker.close();
    }
  });
});

function makeQueueEvents(queueName: string) {
  return new QueueEvents(queueName, { connection: connectionOptions() });
}
