import { z } from 'zod';

/**
 * B0 scope: ".env contract and validation at boot (fail fast on missing
 * config)". This is the single source of truth for what the platform's
 * processes (apps/api, apps/worker) require to start.
 *
 * PROJECT.md requirement: the product name must be read from environment,
 * never hardcoded — see PRODUCT_NAME below and packages/config/src/product.ts.
 */
export const envSchema = z.object({
  PRODUCT_NAME: z.string().min(1, 'PRODUCT_NAME must not be empty'),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().min(1).default('0.0.0.0'),

  // DATABASE_URL is the schema-owner (migration) connection; the running
  // application connects as DATABASE_APP_URL instead — a non-superuser
  // role, so ADR-0023's Row-Level Security actually applies to it. See
  // infra/postgres/init.sql for why this split exists.
  DATABASE_URL: z.url({ protocol: /^postgresql?$/ }),
  DATABASE_APP_URL: z.url({ protocol: /^postgresql?$/ }),
  DATABASE_URL_TEST: z.url({ protocol: /^postgresql?$/ }).optional(),
  DATABASE_APP_URL_TEST: z.url({ protocol: /^postgresql?$/ }).optional(),

  REDIS_URL: z.url({ protocol: /^redis$/ }),

  SESSION_COOKIE_SECRET: z.string().min(16, 'SESSION_COOKIE_SECRET must be at least 16 chars'),
  WEB_ORIGIN: z.url(),

  DEFAULT_SCHOOL_TIMEZONE: z.string().min(1).default('Africa/Lagos'),

  IDEMPOTENCY_KEY_TTL_SECONDS: z.coerce.number().int().positive().default(86400),

  S3_ENDPOINT: z.string().optional().default(''),
  S3_BUCKET: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_REGION: z.string().optional().default('eu-west-1'),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: z.core.$ZodIssue[]) {
    const summary = issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    super(`Environment validation failed:\n${summary}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Parses and validates `source` (defaults to process.env). Throws
 * EnvValidationError — never returns a partially-valid config — so a
 * misconfigured deployment fails at boot, not mid-request.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues);
  }
  return result.data;
}
