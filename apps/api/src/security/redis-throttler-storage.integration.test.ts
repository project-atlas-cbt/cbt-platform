/**
 * B0 "global rate-limit scaffolding" — proves the atomic Lua increment
 * against a real Redis, not a mock: the exact thing a fake `eval` couldn't
 * verify (correct PEXPIRE-on-first-hit behaviour, and the block key
 * actually taking effect once the limit is exceeded).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import {
  InMemoryThrottlerFallback,
  RedisThrottlerStorage,
} from './redis-throttler-storage.service.js';

let redis: Redis;
let storage: RedisThrottlerStorage;

beforeAll(() => {
  redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  storage = new RedisThrottlerStorage(redis, new InMemoryThrottlerFallback(1));
});

afterAll(async () => {
  await redis.quit();
});

describe('RedisThrottlerStorage', () => {
  it('counts hits and reports an expiry window on the first hit', async () => {
    const key = `probe-${randomUUID()}`;
    const first = await storage.increment(key, 5000, 3, 0, 'default');
    expect(first.totalHits).toBe(1);
    expect(first.timeToExpire).toBeGreaterThan(0);
    expect(first.timeToExpire).toBeLessThanOrEqual(5000);
    expect(first.isBlocked).toBe(false);
  });

  it('increments across calls for the same key within the window', async () => {
    const key = `probe-${randomUUID()}`;
    await storage.increment(key, 5000, 10, 0, 'default');
    const second = await storage.increment(key, 5000, 10, 0, 'default');
    expect(second.totalHits).toBe(2);
  });

  it('keeps separate counters for different throttler names on the same key', async () => {
    const key = `probe-${randomUUID()}`;
    await storage.increment(key, 5000, 10, 0, 'short');
    const long = await storage.increment(key, 5000, 10, 0, 'long');
    expect(long.totalHits).toBe(1);
  });

  it('blocks once the limit is exceeded, given a blockDuration', async () => {
    const key = `probe-${randomUUID()}`;
    await storage.increment(key, 5000, 1, 5000, 'default'); // hit 1: at limit, not yet over
    const over = await storage.increment(key, 5000, 1, 5000, 'default'); // hit 2: exceeds limit
    expect(over.isBlocked).toBe(true);
    expect(over.timeToBlockExpire).toBeGreaterThan(0);

    // While blocked, further increments must not keep incrementing the
    // underlying counter — they should report the block, not new hits.
    const stillBlocked = await storage.increment(key, 5000, 1, 5000, 'default');
    expect(stillBlocked.isBlocked).toBe(true);
    expect(stillBlocked.totalHits).toBe(over.totalHits);
  });

  it('does not block when blockDuration is 0, however many hits accrue', async () => {
    const key = `probe-${randomUUID()}`;
    await storage.increment(key, 5000, 1, 0, 'default');
    const over = await storage.increment(key, 5000, 1, 0, 'default');
    expect(over.isBlocked).toBe(false);
    expect(over.totalHits).toBe(2);
  });
});
