/**
 * B22: the worker's schedule guard against real Redis — a scheduler lost
 * with Redis's data (here removed directly, the same state a FLUSHALL
 * leaves) is registered again on the next check; one still present is
 * left alone.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';
import { redisConnectionFromUrl } from '@atlas/config';
import { startScheduleGuard } from './schedule-guard.js';

const connection = redisConnectionFromUrl(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
const queue = new Queue(`b22-guard-${randomUUID()}`, { connection });
const schedule = () =>
  queue
    .upsertJobScheduler('sweep', { every: 60_000 }, { opts: { removeOnComplete: true } })
    .then(() => undefined);

afterAll(async () => {
  await queue.obliterate({ force: true }).catch(() => undefined);
  await queue.close();
});

describe('B22 schedule guard', () => {
  it('re-registers schedulers Redis lost, and only then', async () => {
    await schedule();
    let restored = 0;
    const guard = startScheduleGuard({
      sentinel: queue,
      sentinelId: 'sweep',
      reassert: schedule,
      onRestored: () => (restored += 1),
      everyMs: 3_600_000,
    });
    try {
      expect(await guard.check()).toBe(false);
      expect(restored).toBe(0);

      await queue.removeJobScheduler('sweep');
      expect(await queue.getJobScheduler('sweep')).toBeFalsy();

      expect(await guard.check()).toBe(true);
      expect(restored).toBe(1);
      expect(await queue.getJobScheduler('sweep')).toBeTruthy();
    } finally {
      guard.stop();
    }
  });
});
