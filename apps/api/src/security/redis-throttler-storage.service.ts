import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { DependencyHealth } from '../common/dependency-health.js';
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

/**
 * B22 (decision 3, 2026-10-04): while Redis is unreachable the limiter
 * fails OPEN to this per-process counter instead of failing every request.
 * It is never looser than the shared limit: each process allows
 * `floor(limit / processes)` (at least 1), so the cluster as a whole admits
 * at most `limit` even if an attacker spreads requests across every
 * process. Windows and blocks behave as in the Lua script above.
 */
export class InMemoryThrottlerFallback {
  private readonly counters = new Map<string, { hits: number; expiresAt: number }>();
  private readonly blocks = new Map<string, number>();
  private lastSweep = 0;

  constructor(private readonly processes: number) {}

  effectiveLimit(limit: number): number {
    return Math.max(1, Math.floor(limit / this.processes));
  }

  increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): ThrottlerStorageRecord {
    const now = Date.now();
    this.sweep(now);
    const max = this.effectiveLimit(limit);
    const blockedUntil = this.blocks.get(key);
    const existing = this.counters.get(key);
    const live = existing && existing.expiresAt > now ? existing : undefined;
    if (blockedUntil !== undefined && blockedUntil > now) {
      return {
        totalHits: live?.hits ?? 0,
        timeToExpire: live ? live.expiresAt - now : 0,
        isBlocked: true,
        timeToBlockExpire: blockedUntil - now,
      };
    }
    const counter = live ?? { hits: 0, expiresAt: now + ttl };
    counter.hits += 1;
    this.counters.set(key, counter);
    // Same rule as the Lua script: over the (reduced) limit sets a block.
    // The guard's own blockDuration defaults to the window, so it is set.
    const blocked = counter.hits > max && blockDuration > 0;
    if (blocked) this.blocks.set(key, now + blockDuration);
    return {
      totalHits: counter.hits,
      timeToExpire: counter.expiresAt - now,
      isBlocked: blocked,
      timeToBlockExpire: blocked ? blockDuration : 0,
    };
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < 10_000) return;
    this.lastSweep = now;
    for (const [k, v] of this.counters) if (v.expiresAt <= now) this.counters.delete(k);
    for (const [k, until] of this.blocks) if (until <= now) this.blocks.delete(k);
  }
}

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly fallback: InMemoryThrottlerFallback,
    private readonly health?: DependencyHealth,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const counterKey = `${NAMESPACE}${throttlerName}:${key}`;
    const blockKey = `${counterKey}:blocked`;

    if (this.health && !this.health.shouldTry('redis')) {
      this.health.skipped('redis', `throttler:${throttlerName}`);
      return this.fallback.increment(counterKey, ttl, limit, blockDuration);
    }
    let result: [number, number, number, number];
    try {
      result = (await this.redis.eval(
        INCREMENT_SCRIPT,
        2,
        counterKey,
        blockKey,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];
    } catch (err) {
      this.health?.fellBack('redis', `throttler:${throttlerName}`, err);
      return this.fallback.increment(counterKey, ttl, limit, blockDuration);
    }
    this.health?.succeeded('redis');
    const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] = result;

    return {
      totalHits,
      timeToExpire,
      isBlocked: isBlocked === 1,
      timeToBlockExpire,
    };
  }
}
