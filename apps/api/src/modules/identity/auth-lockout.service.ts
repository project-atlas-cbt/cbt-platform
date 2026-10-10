import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { Env } from '@atlas/config';
import { recordHealthCounter } from '@atlas/observability';
import { DependencyHealth } from '../../common/dependency-health.js';
import { REDIS_CLIENT } from '../../redis/redis.module.js';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service.js';

const KEY_PREFIX = 'atlas:auth:lockout:';

/**
 * Per-(school, login_identifier) failed-attempt lockout (B1's "rate limiting
 * per identifier", distinct from ThrottlerGuard's per-IP/route limiting —
 * see security.module.ts's own comment on the two layers). Redis-backed,
 * same REDIS_CLIENT token RedisThrottlerStorage already uses
 * (apps/api/src/security/redis-throttler-storage.service.ts) — no new
 * connection, one Redis client for the process.
 *
 * B22 (decision 3, 2026-10-04): while Redis is unreachable the lockout
 * fails OPEN to a per-process counter rather than failing every sign-in —
 * a student whose browser crashed mid-exam must be able to sign back in.
 * It is never looser than the shared lockout: each process locks after
 * `floor(max / RATE_LIMIT_FALLBACK_PROCESSES)` failures (at least 1), so
 * failures spread across every process still cannot exceed `max`.
 */
@Injectable()
export class AuthLockoutService {
  private readonly memory = new Map<string, { count: number; expiresAt: number }>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
    private readonly health: DependencyHealth,
    private readonly settings: PlatformSettingsService,
  ) {}

  private key(schoolId: string, loginIdentifier: string): string {
    return `${KEY_PREFIX}${schoolId}:${loginIdentifier.toLowerCase()}`;
  }

  /** ADR-0036: editable in System Configuration. */
  private async max(): Promise<number> {
    return (await this.settings.current()).authLockoutMaxAttempts;
  }

  /** The per-process threshold used only while Redis is down. */
  async fallbackMax(): Promise<number> {
    const processes = this.config.get('RATE_LIMIT_FALLBACK_PROCESSES', { infer: true });
    return Math.max(1, Math.floor((await this.max()) / processes));
  }

  async isLocked(schoolId: string, loginIdentifier: string): Promise<boolean> {
    const key = this.key(schoolId, loginIdentifier);
    if (!this.health.shouldTry('redis')) {
      this.health.skipped('redis', 'auth-lockout');
      return this.memoryCount(key) >= (await this.fallbackMax());
    }
    let count: string | null;
    try {
      count = await this.redis.get(key);
    } catch (err) {
      this.health.fellBack('redis', 'auth-lockout', err);
      return this.memoryCount(key) >= (await this.fallbackMax());
    }
    this.health.succeeded('redis');
    return (
      (count !== null && Number(count) >= (await this.max())) ||
      this.memoryCount(key) >= (await this.fallbackMax())
    );
  }

  /** Lower-cased login identifiers of one school that are locked right now,
   * for the staff "locked out" list. Scans only this school's keys; a Redis
   * outage degrades to this process's own in-memory counters. */
  async lockedIdentifiers(schoolId: string): Promise<string[]> {
    const prefix = `${KEY_PREFIX}${schoolId}:`;
    const locked = new Set<string>();
    const max = await this.max();
    const fallbackMax = await this.fallbackMax();

    const now = Date.now();
    for (const [key, entry] of this.memory) {
      if (key.startsWith(prefix) && entry.expiresAt > now && entry.count >= fallbackMax) {
        locked.add(key.slice(prefix.length));
      }
    }

    if (this.health.shouldTry('redis')) {
      try {
        let cursor = '0';
        do {
          const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 500);
          cursor = next;
          if (keys.length === 0) continue;
          const counts = await this.redis.mget(...keys);
          keys.forEach((key, i) => {
            if (Number(counts[i] ?? 0) >= max) locked.add(key.slice(prefix.length));
          });
        } while (cursor !== '0');
        this.health.succeeded('redis');
      } catch (err) {
        this.health.fellBack('redis', 'auth-lockout', err);
      }
    } else {
      this.health.skipped('redis', 'auth-lockout');
    }
    return [...locked];
  }

  /** Increments the failure counter, starting its window on the first
   * failure. B20: returns `lockedNow` on the exact failure that crosses the
   * threshold (so the caller audits a lockout once, not on every further
   * attempt), and feeds the Exam Health Monitor's platform-wide
   * auth-failure counter (AUTH_FAILURE_SPIKE — credential stuffing). */
  async recordFailure(schoolId: string, loginIdentifier: string): Promise<{ lockedNow: boolean }> {
    const key = this.key(schoolId, loginIdentifier);
    const windowSeconds = (await this.settings.current()).authLockoutWindowSeconds;
    if (!this.health.shouldTry('redis')) {
      this.health.skipped('redis', 'auth-lockout');
      const n = this.memoryIncrement(key, windowSeconds * 1000);
      return { lockedNow: n === (await this.fallbackMax()) };
    }
    let count: number;
    try {
      // B22: INCR and the window's expiry in one transaction — two round
      // trips could leave a counter with no TTL (locked forever) if the
      // connection dropped between them.
      const res = await this.redis.multi().incr(key).expire(key, windowSeconds, 'NX').exec();
      const incr = res?.[0];
      if (!incr || incr[0]) throw incr?.[0] ?? new Error('lockout MULTI returned no result');
      count = Number(incr[1]);
    } catch (err) {
      this.health.fellBack('redis', 'auth-lockout', err);
      const n = this.memoryIncrement(key, windowSeconds * 1000);
      return { lockedNow: n === (await this.fallbackMax()) };
    }
    this.health.succeeded('redis');
    await recordHealthCounter(this.redis, 'auth_failure').catch(() => undefined);
    return { lockedNow: count === (await this.max()) };
  }

  async recordSuccess(schoolId: string, loginIdentifier: string): Promise<void> {
    const key = this.key(schoolId, loginIdentifier);
    this.memory.delete(key);
    if (!this.health.shouldTry('redis')) {
      this.health.skipped('redis', 'auth-lockout');
      return;
    }
    try {
      await this.redis.del(key);
    } catch (err) {
      // The Redis counter (if any) still expires with its window.
      this.health.fellBack('redis', 'auth-lockout', err);
    }
  }

  /** P1-4: a credential reset, a password change or a staff "Unlock
   * sign-in" ends the lockout at once. Without this a student locked out
   * mid-exam (five wrong guesses at a guessable student ID) waits out the
   * whole window while their attempt timer runs. */
  async clear(schoolId: string, loginIdentifier: string): Promise<void> {
    await this.recordSuccess(schoolId, loginIdentifier);
  }

  private memoryCount(key: string): number {
    const entry = this.memory.get(key);
    if (!entry) return 0;
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return 0;
    }
    return entry.count;
  }

  private memoryIncrement(key: string, windowMs: number): number {
    const now = Date.now();
    if (this.memory.size > 50_000) {
      for (const [k, v] of this.memory) if (v.expiresAt <= now) this.memory.delete(k);
    }
    const live = this.memoryCount(key) > 0 ? this.memory.get(key) : undefined;
    const entry = live ?? { count: 0, expiresAt: now + windowMs };
    entry.count += 1;
    this.memory.set(key, entry);
    return entry.count;
  }
}
