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

  // ADR-0005 / ADR-0022: the registrable parent domain school subdomains,
  // the API, and the platform-admin host all sit under — e.g. "atlas.app"
  // in production, "localtest.me" for local dev (a public domain whose
  // wildcard record already resolves every subdomain to 127.0.0.1, so
  // subdomain-aware tenant resolution works in a browser with no local DNS
  // setup — see docs/operations/domain-plan.md). Required, not defaulted:
  // this is a concrete infrastructure decision each environment must set
  // explicitly, the same way WEB_ORIGIN is.
  PLATFORM_ROOT_DOMAIN: z.string().min(1, 'PLATFORM_ROOT_DOMAIN must not be empty'),

  // ADR-0022: the Domain attribute B1's session cookie (and any other
  // cross-subdomain cookie) is issued with. Empty/unset means a host-only
  // cookie — correct for local dev, where the browser never crosses
  // subdomains for cookie purposes even when PLATFORM_ROOT_DOMAIN is set
  // for tenant-resolution testing. Set to the shared parent domain (e.g.
  // ".atlas.app") once B23 provisions production DNS.
  COOKIE_DOMAIN: z.string().optional(),

  DEFAULT_SCHOOL_TIMEZONE: z.string().min(1).default('Africa/Lagos'),

  IDEMPOTENCY_KEY_TTL_SECONDS: z.coerce.number().int().positive().default(86400),

  // ---- Identity & Auth (ADR-0005, ADR-0019, ADR-0022 — B1) -----------------
  SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 7), // 7 days
  PASSWORD_RESET_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60), // 1 hour
  AUTH_LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_LOCKOUT_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),

  // Global rate-limit scaffolding (B0 scope) — a generous baseline every
  // route gets for free via ThrottlerGuard (apps/api/src/security). B1
  // tightens specific endpoints (e.g. login) with @Throttle() overrides;
  // this default exists so a route that never gets a specific override
  // still has *some* protection rather than none.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),

  // B3: apps/worker's subscription-expiry sweeper / platform-metrics
  // aggregation tick interval. Not required to be precise to the minute
  // (ADR-0015's 14-day grace window dwarfs any reasonable interval here) —
  // an engineering default, easy to tune per environment. Default: 6 hours.
  SUBSCRIPTION_SWEEP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(6 * 60 * 60 * 1000),

  S3_ENDPOINT: z.string().optional().default(''),
  S3_BUCKET: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_REGION: z.string().optional().default('eu-west-1'),

  // B4: apps/worker's orphan-media reporting sweep interval — report only,
  // never deletes (cleanup is a future M-14 retention-policy job). Not
  // precision-sensitive, same reasoning as SUBSCRIPTION_SWEEP_INTERVAL_MS
  // above. Default: 24 hours.
  MEDIA_ORPHAN_SWEEP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 60 * 60 * 1000),
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
