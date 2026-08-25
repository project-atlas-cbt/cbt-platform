import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Named import, not the default — ioredis's CJS/ESM interop makes the
// default import resolve to the whole module namespace under this
// project's NodeNext module resolution rather than the Redis class itself.
import { Redis } from 'ioredis';
import type { Env } from '@atlas/config';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Redis(config.get('REDIS_URL', { infer: true })),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
