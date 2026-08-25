import type { Env } from './env.schema.js';

/**
 * The only place in the codebase allowed to read PRODUCT_NAME directly.
 * Every other module — API responses, emails, error messages, the web app —
 * must go through this accessor. Enforced additionally by an ESLint rule
 * (eslint.config.mjs) that flags the literal string in source.
 */
export function getProductName(env: Pick<Env, 'PRODUCT_NAME'>): string {
  return env.PRODUCT_NAME;
}
