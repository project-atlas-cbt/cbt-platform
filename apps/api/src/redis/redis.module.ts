import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Named import, not the default — ioredis's CJS/ESM interop makes the
// default import resolve to the whole module namespace under this
// project's NodeNext module resolution rather than the Redis class itself.
import { Redis } from 'ioredis';
import type { Env } from '@atlas/config';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
/** B12: a dedicated Redis connection for pub/sub `SUBSCRIBE` — a client in
 * subscribe mode can't issue ordinary commands, so the Exam Control
 * Center's SSE fan-out (`exam-control-stream.service.ts`) needs its own
 * connection, never the shared `REDIS_CLIENT`. One connection per API
 * process, not one per SSE client (R-04's own connection-count concern) —
 * every active exam-control channel's `SUBSCRIBE`/`UNSUBSCRIBE` shares this
 * single client. `.duplicate()` reuses the same connection options rather
 * than re-reading config. */
export const REDIS_SUBSCRIBER_CLIENT = Symbol('REDIS_SUBSCRIBER_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Redis(config.get('REDIS_URL', { infer: true })),
    },
    {
      provide: REDIS_SUBSCRIBER_CLIENT,
      inject: [REDIS_CLIENT],
      useFactory: (client: Redis) => client.duplicate(),
    },
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER_CLIENT],
})
export class RedisModule {}
