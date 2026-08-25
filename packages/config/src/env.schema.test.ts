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

  it('fails fast when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _omit, ...rest } = validEnv;
    expect(() => loadEnv(rest)).toThrow(EnvValidationError);
  });

  it('fails fast when PLATFORM_ROOT_DOMAIN is missing', () => {
    const { PLATFORM_ROOT_DOMAIN: _omit, ...rest } = validEnv;
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
