import { describe, expect, it } from 'vitest';
import { composeDatabaseUrls, composeRedisUrl } from './connection-urls.js';

describe('composeDatabaseUrls', () => {
  it('does nothing without DATABASE_HOST', () => {
    const env: NodeJS.ProcessEnv = { DATABASE_APP_PASSWORD: 'x' };
    composeDatabaseUrls(env);
    expect(env.DATABASE_APP_URL).toBeUndefined();
  });

  it('composes each role URL from its injected password, owner on its own host', () => {
    const env: NodeJS.ProcessEnv = {
      DATABASE_HOST: 'proxy.example',
      DATABASE_OWNER_HOST: 'instance.example',
      DATABASE_OWNER_PASSWORD: 'own',
      DATABASE_APP_PASSWORD: 'p@ss/w:rd',
      DATABASE_AUDIT_READER_PASSWORD: 'aud',
    };
    composeDatabaseUrls(env);
    expect(env.DATABASE_URL).toBe(
      'postgresql://atlas:own@instance.example:5432/atlas?sslmode=require',
    );
    expect(env.DATABASE_APP_URL).toBe(
      'postgresql://atlas_app:p%40ss%2Fw%3Ard@proxy.example:5432/atlas?sslmode=require',
    );
    expect(new URL(env.DATABASE_APP_URL!).password).toBe('p%40ss%2Fw%3Ard');
    expect(env.DATABASE_AUDIT_READER_URL).toContain('atlas_audit_reader:aud@proxy.example');
  });

  it('never overrides an explicit URL', () => {
    const env: NodeJS.ProcessEnv = {
      DATABASE_HOST: 'proxy.example',
      DATABASE_APP_URL: 'postgresql://explicit',
      DATABASE_APP_PASSWORD: 'x',
    };
    composeDatabaseUrls(env);
    expect(env.DATABASE_APP_URL).toBe('postgresql://explicit');
  });

  it('leaves a role unset when its password is missing', () => {
    const env: NodeJS.ProcessEnv = { DATABASE_HOST: 'h', DATABASE_APP_PASSWORD: 'x' };
    composeDatabaseUrls(env);
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DATABASE_APP_URL).toBeDefined();
  });
});

describe('composeRedisUrl', () => {
  it('builds a TLS URL from host and token, never overriding an explicit one', () => {
    const env: NodeJS.ProcessEnv = { REDIS_HOST: 'cache.example', REDIS_AUTH_TOKEN: 'a/b' };
    composeRedisUrl(env);
    expect(env.REDIS_URL).toBe('rediss://:a%2Fb@cache.example:6379');
    const explicit: NodeJS.ProcessEnv = {
      REDIS_URL: 'redis://x',
      REDIS_HOST: 'h',
      REDIS_AUTH_TOKEN: 't',
    };
    composeRedisUrl(explicit);
    expect(explicit.REDIS_URL).toBe('redis://x');
  });
});
