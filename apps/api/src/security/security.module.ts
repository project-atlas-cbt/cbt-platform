import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import type { Env } from '@atlas/config';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { DependencyHealth } from '../common/dependency-health.js';
import {
  InMemoryThrottlerFallback,
  RedisThrottlerStorage,
} from './redis-throttler-storage.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { buildThrottlers } from './rate-limit.js';

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
      inject: [REDIS_CLIENT, ConfigService, DependencyHealth],
      // B20: per-class throttlers keyed by session (authenticated) or
      // IP + account (sign-in) — see rate-limit.ts for why per-IP keys
      // would throttle a whole school lab behind one NAT address.
      useFactory: (
        redis: Redis,
        config: ConfigService<Env, true>,
        health: DependencyHealth,
      ): ThrottlerModuleOptions => ({
        throttlers: buildThrottlers({
          defaultMax: config.get('RATE_LIMIT_MAX', { infer: true }),
          defaultWindowSeconds: config.get('RATE_LIMIT_WINDOW_SECONDS', { infer: true }),
          answerMax: config.get('RATE_LIMIT_ANSWER_MAX', { infer: true }),
          heavyMax: config.get('RATE_LIMIT_HEAVY_MAX', { infer: true }),
          authIdentifierMax: config.get('RATE_LIMIT_AUTH_IDENTIFIER_MAX', { infer: true }),
          authIpMax: config.get('RATE_LIMIT_AUTH_IP_MAX', { infer: true }),
          signingSecret: config.get('SESSION_COOKIE_SECRET', { infer: true }),
        }),
        // B22: fails open to per-process limits while Redis is down.
        storage: new RedisThrottlerStorage(
          redis,
          new InMemoryThrottlerFallback(
            config.get('RATE_LIMIT_FALLBACK_PROCESSES', { infer: true }),
          ),
          health,
        ),
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class SecurityModule {}
