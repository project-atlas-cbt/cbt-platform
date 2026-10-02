import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { Env } from '@atlas/config';
import { recordHealthCounter } from '@atlas/observability';
import { REDIS_CLIENT } from '../../redis/redis.module.js';

const KEY_PREFIX = 'atlas:auth:lockout:';

/**
 * Per-(school, login_identifier) failed-attempt lockout (B1's "rate limiting
 * per identifier", distinct from ThrottlerGuard's per-IP/route limiting —
 * see security.module.ts's own comment on the two layers). Redis-backed,
 * same REDIS_CLIENT token RedisThrottlerStorage already uses
 * (apps/api/src/security/redis-throttler-storage.service.ts) — no new
 * connection, one Redis client for the process.
 */
@Injectable()
export class AuthLockoutService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private key(schoolId: string, loginIdentifier: string): string {
    return `${KEY_PREFIX}${schoolId}:${loginIdentifier.toLowerCase()}`;
  }

  async isLocked(schoolId: string, loginIdentifier: string): Promise<boolean> {
    const count = await this.redis.get(this.key(schoolId, loginIdentifier));
    const max = this.config.get('AUTH_LOCKOUT_MAX_ATTEMPTS', { infer: true });
    return count !== null && Number(count) >= max;
  }

  /** Increments the failure counter, starting its window on the first
   * failure. B20: returns `lockedNow` on the exact failure that crosses the
   * threshold (so the caller audits a lockout once, not on every further
   * attempt), and feeds the Exam Health Monitor's platform-wide
   * auth-failure counter (AUTH_FAILURE_SPIKE — credential stuffing). */
  async recordFailure(schoolId: string, loginIdentifier: string): Promise<{ lockedNow: boolean }> {
    const key = this.key(schoolId, loginIdentifier);
    const windowSeconds = this.config.get('AUTH_LOCKOUT_WINDOW_SECONDS', { infer: true });
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    await recordHealthCounter(this.redis, 'auth_failure').catch(() => undefined);
    const max = this.config.get('AUTH_LOCKOUT_MAX_ATTEMPTS', { infer: true });
    return { lockedNow: count === max };
  }

  async recordSuccess(schoolId: string, loginIdentifier: string): Promise<void> {
    await this.redis.del(this.key(schoolId, loginIdentifier));
  }
}
