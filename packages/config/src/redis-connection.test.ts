import { describe, expect, it } from 'vitest';
import { redisConnectionFromUrl } from './redis-connection.js';

describe('redisConnectionFromUrl (B20)', () => {
  it('keeps host and default port for a plain local URL', () => {
    expect(redisConnectionFromUrl('redis://localhost:6379')).toEqual({
      host: 'localhost',
      port: 6379,
    });
  });

  it('carries credentials, db and TLS for a production rediss URL', () => {
    expect(redisConnectionFromUrl('rediss://app:s%40cret@cache.internal:6380/2')).toEqual({
      host: 'cache.internal',
      port: 6380,
      username: 'app',
      password: 's@cret',
      db: 2,
      tls: {},
    });
  });
});
