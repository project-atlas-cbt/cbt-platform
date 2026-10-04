import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from './env.schema.js';

const validEnv = {
  // Fixture value only — deliberately not the real product name, so this
  // file isn't itself a hardcoded-name violation of the rule it's testing
  // the *mechanism* for (see eslint.config.mjs's no-restricted-syntax).
  PRODUCT_NAME: 'Test Fixture School Platform',
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  DATABASE_APP_URL: 'postgresql://app_user:pass@localhost:5432/db',
  DATABASE_AUDIT_READER_URL: 'postgresql://audit_reader:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_COOKIE_SECRET: 'x'.repeat(32),
  WEB_ORIGIN: 'http://localhost:3000',
  PLATFORM_ROOT_DOMAIN: 'localtest.me',
};

describe('loadEnv', () => {
  it('accepts a fully valid environment and applies defaults', () => {
    const env = loadEnv(validEnv);
    expect(env.PRODUCT_NAME).toBe('Test Fixture School Platform');
    expect(env.API_PORT).toBe(3001);
    expect(env.DEFAULT_SCHOOL_TIMEZONE).toBe('Africa/Lagos');
  });

  it('fails fast when PRODUCT_NAME is missing', () => {
    const { PRODUCT_NAME: _omit, ...rest } = validEnv;
    expect(() => loadEnv(rest)).toThrow(EnvValidationError);
  });

  // B23: the app's own connection is the required one; the schema owner's
  // DATABASE_URL is optional (only migrations and ops commands use it).
  it('fails fast when DATABASE_APP_URL is missing', () => {
    const { DATABASE_APP_URL: _omit, ...rest } = validEnv;
    expect(() => loadEnv(rest)).toThrow(EnvValidationError);
  });

  it('fails fast when PLATFORM_ROOT_DOMAIN is missing', () => {
    const { PLATFORM_ROOT_DOMAIN: _omit, ...rest } = validEnv;
    expect(() => loadEnv(rest)).toThrow(EnvValidationError);
  });

  it('fails fast when DATABASE_AUDIT_READER_URL is missing', () => {
    const { DATABASE_AUDIT_READER_URL: _omit, ...rest } = validEnv;
    expect(() => loadEnv(rest)).toThrow(EnvValidationError);
  });

  it('defaults RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_SECONDS, and leaves COOKIE_DOMAIN unset', () => {
    const env = loadEnv(validEnv);
    expect(env.RATE_LIMIT_MAX).toBe(300);
    expect(env.RATE_LIMIT_WINDOW_SECONDS).toBe(60);
    expect(env.COOKIE_DOMAIN).toBeUndefined();
  });

  it('defaults the B1 identity/auth tuning variables', () => {
    const env = loadEnv(validEnv);
    expect(env.SESSION_TTL_SECONDS).toBe(60 * 60 * 24 * 7);
    expect(env.PASSWORD_RESET_TOKEN_TTL_SECONDS).toBe(60 * 60);
    expect(env.AUTH_LOCKOUT_MAX_ATTEMPTS).toBe(5);
    expect(env.AUTH_LOCKOUT_WINDOW_SECONDS).toBe(15 * 60);
  });

  it('rejects a session secret shorter than 16 characters', () => {
    expect(() => loadEnv({ ...validEnv, SESSION_COOKIE_SECRET: 'short' })).toThrow(
      EnvValidationError,
    );
  });

  it('reports every failing field, not just the first', () => {
    try {
      loadEnv({});
      expect.fail('expected loadEnv to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const validationError = err as EnvValidationError;
      expect(validationError.issues.length).toBeGreaterThan(1);
    }
  });
});

describe('loadEnv — B20 production hardening', () => {
  const strong = (seed: string) => `${seed}`.repeat(40).slice(0, 48);
  const productionEnv = {
    ...validEnv,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@db:5432/db?sslmode=require',
    DATABASE_APP_URL: 'postgresql://app_user:pass@db:5432/db?sslmode=verify-full',
    DATABASE_AUDIT_READER_URL: 'postgresql://audit_reader:pass@db:5432/db?sslmode=require',
    REDIS_URL: 'rediss://cache:6380',
    SESSION_COOKIE_SECRET: strong('a8Fq'),
    CSRF_SECRET: strong('Zp3x'),
    MFA_ENCRYPTION_KEY: strong('Kq7m'),
    MEDIA_PRECACHE_SECRET: strong('Wn5r'),
    COOKIE_DOMAIN: 'school.example.ng',
    NOTIFICATION_TRANSPORT: 'ses',
    SES_FROM_ADDRESS: 'Atlas <no-reply@example.ng>',
  };

  it('accepts a production API/worker task that is never given the schema owner URL (B23)', () => {
    const { DATABASE_URL: _owner, ...taskEnv } = productionEnv;
    expect(loadEnv(taskEnv).DATABASE_URL).toBeUndefined();
  });

  it('accepts a hardened production environment, with Software Admin MFA required by default (F20)', () => {
    expect(loadEnv(productionEnv).PLATFORM_MFA_REQUIRED).toBe(true);
    expect(
      loadEnv({ ...productionEnv, PLATFORM_MFA_REQUIRED: 'false' }).PLATFORM_MFA_REQUIRED,
    ).toBe(false);
  });

  it.each([
    ['SESSION_COOKIE_SECRET', 'dev-only-change-me-dev-only-change-me'],
    ['CSRF_SECRET', undefined],
    ['MFA_ENCRYPTION_KEY', undefined],
    ['MEDIA_PRECACHE_SECRET', undefined],
    ['MEDIA_PRECACHE_SECRET', 'dev-only-change-me-dev-only-change-me'],
    ['DATABASE_APP_URL', 'postgresql://app_user:pass@db:5432/db'],
    ['REDIS_URL', 'redis://cache:6379'],
    ['COOKIE_DOMAIN', undefined],
    ['NOTIFICATION_TRANSPORT', 'console'],
    ['NOTIFICATION_TRANSPORT', undefined],
    ['SES_FROM_ADDRESS', undefined],
    ['SES_FROM_ADDRESS', 'no-reply'],
  ] as Array<[string, string | undefined]>)(
    'rejects production with an unsafe %s',
    (key, value) => {
      const env: Record<string, string | undefined> = { ...productionEnv, [key]: value };
      if (value === undefined) delete env[key];
      expect(() => loadEnv(env)).toThrow(EnvValidationError);
    },
  );

  it('rejects a CSRF secret equal to the session secret in production', () => {
    expect(() =>
      loadEnv({ ...productionEnv, CSRF_SECRET: productionEnv.SESSION_COOKIE_SECRET }),
    ).toThrow(EnvValidationError);
  });

  it('rejects a media pre-cache secret that reuses another secret (F20)', () => {
    expect(() =>
      loadEnv({ ...productionEnv, MEDIA_PRECACHE_SECRET: productionEnv.MFA_ENCRYPTION_KEY }),
    ).toThrow(EnvValidationError);
  });

  it('applies none of the production rules outside production', () => {
    expect(() => loadEnv({ ...validEnv, REDIS_URL: 'redis://localhost:6379' })).not.toThrow();
  });
});
