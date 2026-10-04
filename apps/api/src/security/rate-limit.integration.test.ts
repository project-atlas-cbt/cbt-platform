/**
 * B0 "global rate-limit scaffolding" — proves ThrottlerGuard, bound
 * globally with the Redis-backed storage, actually rejects a caller who
 * exceeds the configured limit, and that the rejection comes back as the
 * ADR-0033 envelope (this project's HttpExceptionFilter has to recognise
 * @nestjs/throttler's ThrottlerException correctly for that to happen —
 * verified here rather than assumed).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ThrottlerGuard, ThrottlerModule, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import type { ErrorEnvelope } from '@atlas/validation';
import { AppConfigModule } from '../config/app-config.module.js';
import { HttpExceptionFilter } from '../common/http-exception.filter.js';
import { RedisModule, REDIS_CLIENT } from '../redis/redis.module.js';
import {
  InMemoryThrottlerFallback,
  RedisThrottlerStorage,
} from './redis-throttler-storage.service.js';

@Controller()
class RateLimitProbeController {
  @Get('rate-limit-probe')
  get() {
    return { ok: true };
  }
}

@Module({
  imports: [
    AppConfigModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis): ThrottlerModuleOptions => ({
        throttlers: [{ name: 'default', limit: 2, ttl: 60_000 }],
        storage: new RedisThrottlerStorage(redis, new InMemoryThrottlerFallback(1)),
      }),
    }),
  ],
  controllers: [RateLimitProbeController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class RateLimitProbeModule {}

let app: NestFastifyApplication;

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(
    RateLimitProbeModule,
    new FastifyAdapter(),
    { logger: false },
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
});

describe('Global rate limiting (B0 scaffolding)', () => {
  it('allows requests up to the configured limit, then rejects with a 429 ADR-0033 envelope', async () => {
    // A fixed/default remoteAddress means every run of this file shares one
    // Redis-backed counter key (ThrottlerGuard's default tracker is req.ip)
    // against the same long-lived local Redis (docker compose, not a
    // fresh-per-run CI container) — re-running the suite twice within the
    // 60s window fails the *first* request instead of the third, as a
    // leftover count from the previous run. Randomised per test process so
    // repeated local runs never collide — see identity.integration.test.ts's
    // identical fix for the same class of issue.
    const remoteAddress = `10.99.${Math.floor(Math.random() * 200) + 1}.1`;

    const first = await app.inject({ method: 'GET', url: '/rate-limit-probe', remoteAddress });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: 'GET', url: '/rate-limit-probe', remoteAddress });
    expect(second.statusCode).toBe(200);

    const third = await app.inject({ method: 'GET', url: '/rate-limit-probe', remoteAddress });
    expect(third.statusCode).toBe(429);
    const body = third.json<ErrorEnvelope>();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.retryable).toBe(true);
  });
});
