import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Named import, not the default — ioredis's CJS/ESM interop makes the
// default import resolve to the whole module namespace under this
// project's NodeNext module resolution rather than the Redis class itself.
import { Redis } from 'ioredis';
import type { Env } from '@atlas/config';
import { DependencyHealth } from '../common/dependency-health.js';

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

const logger = new Logger('Redis');

/**
 * B22 (08 §25 "cache outage: fall back to authoritative storage", 09 §33):
 * with ioredis's defaults a command issued while Redis is down waited in the
 * offline queue for ~73 s (20 reconnect attempts) before failing, and every
 * API request waited with it inside the global rate limiter. Now each
 * command fails after REDIS_COMMAND_TIMEOUT_MS — queued or sent — and after
 * a single retry, so callers reach their fallback at once. Reconnection
 * itself keeps ioredis's default back-off and never gives up.
 */
function createClient(url: string, commandTimeout: number): Redis {
  const client = new Redis(url, { commandTimeout, maxRetriesPerRequest: 1 });
  // Without a listener ioredis prints "Unhandled error event" on every
  // reconnect attempt; DependencyHealth carries the operational signal.
  let lastLogged = 0;
  client.on('error', (err: Error) => {
    const now = Date.now();
    if (now - lastLogged < 30_000) return;
    lastLogged = now;
    logger.warn({ msg: 'Redis connection error', err: `${err.name}: ${err.message}` });
  });
  return client;
}

@Global()
@Module({
  providers: [
    DependencyHealth,
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createClient(
          config.get('REDIS_URL', { infer: true }),
          config.get('REDIS_COMMAND_TIMEOUT_MS', { infer: true }),
        ),
    },
    {
      provide: REDIS_SUBSCRIBER_CLIENT,
      inject: [REDIS_CLIENT],
      useFactory: (client: Redis) => client.duplicate(),
    },
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER_CLIENT, DependencyHealth],
})
export class RedisModule {}
