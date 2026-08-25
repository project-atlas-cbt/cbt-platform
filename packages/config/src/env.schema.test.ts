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
