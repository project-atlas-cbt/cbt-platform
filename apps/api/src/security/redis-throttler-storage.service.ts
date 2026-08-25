import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { REDIS_CLIENT } from '../redis/redis.module.js';

// @nestjs/throttler@6.5.0 declares ThrottlerStorageRecord in its own
// throttler-storage-record.interface.ts but its public barrel
// (index.d.ts) never re-exports it — only ThrottlerStorage itself. This
// is the same shape, declared locally rather than reaching into the
// package's internal dist path to import an unexported type; structural
// typing means `implements ThrottlerStorage` still checks correctly.
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

const NAMESPACE = 'throttle:';

/**
 * B0's "global rate-limit scaffolding": a Redis-backed ThrottlerStorage so
 * @nestjs/throttler's counters survive across API instances instead of
 * living in one process's memory (the package's own default). Built
 * directly against the REDIS_CLIENT this project already provides
 * (idempotency.interceptor.ts uses the same connection) rather than
 * pulling in a third-party community storage adapter of uncertain
 * maintenance status for what's fundamentally a small, well-specified
 * atomic counter.
 *
 * The increment-and-maybe-block operation runs as a single Lua script so
 * it's atomic under concurrent requests hitting the same key — a
 * check-then-increment done as two round trips would race.
 */
const INCREMENT_SCRIPT = `
local counterKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  local current = tonumber(redis.call('GET', counterKey) or '0')
  local remaining = redis.call('PTTL', counterKey)
  if remaining < 0 then remaining = 0 end
  return {current, remaining, 1, blockTtl}
end

local totalHits = redis.call('INCR', counterKey)
if totalHits == 1 then
  redis.call('PEXPIRE', counterKey, ttl)
end
local remaining = redis.call('PTTL', counterKey)
if remaining < 0 then remaining = ttl end

local isBlocked = 0
local timeToBlockExpire = 0
if totalHits > limit and blockDuration > 0 then
  redis.call('SET', blockKey, '1', 'PX', blockDuration)
  isBlocked = 1
  timeToBlockExpire = blockDuration
end

return {totalHits, remaining, isBlocked, timeToBlockExpire}
`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const counterKey = `${NAMESPACE}${throttlerName}:${key}`;
    const blockKey = `${counterKey}:blocked`;

    const result = (await this.redis.eval(
      INCREMENT_SCRIPT,
      2,
      counterKey,
      blockKey,
      ttl,
      limit,
      blockDuration,
    )) as [number, number, number, number];
    const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] = result;

    return {
      totalHits,
      timeToExpire,
      isBlocked: isBlocked === 1,
      timeToBlockExpire,
    };
  }
}
