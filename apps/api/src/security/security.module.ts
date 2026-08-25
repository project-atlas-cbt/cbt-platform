import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import type { Env } from '@atlas/config';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { RedisThrottlerStorage } from './redis-throttler-storage.service.js';
import { CsrfGuard } from './csrf.guard.js';

/**
 * B0 security/authorization scope: "Baseline security headers [helmet,
 * main.ts] and global rate-limit scaffolding" + ADR-0022's CSRF
 * protection. Both are bound as global guards (APP_GUARD) — see
 * CsrfGuard's own doc comment for why CSRF specifically has to be a
 * guard, not middleware, under this Nest+Fastify combination.
 *
 * ThrottlerGuard is bound globally with a generous baseline
 * (RATE_LIMIT_MAX per RATE_LIMIT_WINDOW_SECONDS — env-configurable, see
 * env.schema.ts) so every route gets *some* protection for free. B1
 * layers tighter, endpoint-specific limits on top via `@Throttle()` on
 * the authentication routes — that decorator-based override is exactly
 * why @nestjs/throttler (not a raw Fastify-level limiter) was chosen: it
 * gives B1 a per-route primitive without inventing one.
 *
 * Multiple APP_GUARD providers run in registration order — Throttler
 * first (reject an over-limit caller before doing any CSRF work), then
 * Csrf.
 */
@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT, ConfigService],
      useFactory: (redis: Redis, config: ConfigService<Env, true>): ThrottlerModuleOptions => ({
        throttlers: [
          {
            name: 'default',
            limit: config.get('RATE_LIMIT_MAX', { infer: true }),
            ttl: config.get('RATE_LIMIT_WINDOW_SECONDS', { infer: true }) * 1000,
          },
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class SecurityModule {}
