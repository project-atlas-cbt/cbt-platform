import { z } from 'zod';

/**
 * B0 scope: ".env contract and validation at boot (fail fast on missing
 * config)". This is the single source of truth for what the platform's
 * processes (apps/api, apps/worker) require to start.
 *
 * PROJECT.md requirement: the product name must be read from environment,
 * never hardcoded — see PRODUCT_NAME below and packages/config/src/product.ts.
 */
const envObject = z.object({
  PRODUCT_NAME: z.string().min(1, 'PRODUCT_NAME must not be empty'),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().min(1).default('0.0.0.0'),

  // DATABASE_URL is the schema-owner (migration) connection; the running
  // application connects as DATABASE_APP_URL instead — a non-superuser
  // role, so ADR-0023's Row-Level Security actually applies to it. See
  // infra/postgres/init.sql for why this split exists.
  // B23: optional — only migrations and operator commands use the schema
  // owner's URL. The API and worker tasks are never given it on AWS (least
  // privilege); they connect as atlas_app / atlas_audit_reader only.
  DATABASE_URL: z.url({ protocol: /^postgresql?$/ }).optional(),
  DATABASE_APP_URL: z.url({ protocol: /^postgresql?$/ }),
  DATABASE_URL_TEST: z.url({ protocol: /^postgresql?$/ }).optional(),
  DATABASE_APP_URL_TEST: z.url({ protocol: /^postgresql?$/ }).optional(),

  // B10: a third, even-more-restricted role — read-only on audit_events
  // alone, used only by PlatformAuditReaderService's cross-school query
  // (GET /v1/platform/audit). Required, not optional: that endpoint is core
  // B10 scope, not best-effort. See infra/postgres/init.sql and the B10
  // migration's own hand-written GRANT/POLICY for why this must stay a
  // separate connection from DATABASE_APP_URL — that one is scoped by
  // request-time RLS, this one deliberately bypasses it for one table only.
  DATABASE_AUDIT_READER_URL: z.url({ protocol: /^postgresql?$/ }),
  DATABASE_AUDIT_READER_URL_TEST: z.url({ protocol: /^postgresql?$/ }).optional(),

  // B21: per-process connection pool size (node-postgres `max`). Total
  // demand is DATABASE_POOL_MAX × processes, which must fit the pooler's
  // client limit (production: RDS Proxy; locally PgBouncer) — never the raw
  // Postgres max_connections. Sizing: docs/performance/capacity-plan.md.
  // (packages/db reads the same variable directly; this validates it.)
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),

  // B20: `rediss://` (TLS) accepted, and required in production (see the
  // production rules at the bottom of this file).
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),

  SESSION_COOKIE_SECRET: z.string().min(16, 'SESSION_COOKIE_SECRET must be at least 16 chars'),
  WEB_ORIGIN: z.url(),

  // ADR-0005 / ADR-0022: the registrable parent domain school subdomains,
  // the API, and the platform-admin host all sit under — e.g. "examkeep.com"
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
  // ".examkeep.com") once B23 provisions production DNS.
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
  /** B23: path-style addressing for local/CI S3 stand-ins; `false` on AWS. */
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Local Docker Desktop can retain a stale VM clock after host sleep. An
  // explicit signing offset keeps presigned URLs valid against that storage
  // clock; production should leave this at the default zero.
  S3_SYSTEM_CLOCK_OFFSET_MS: z.coerce.number().int().default(0),

  // B4: apps/worker's orphan-media reporting sweep interval — report only,
  // never deletes (cleanup is a future M-14 retention-policy job). Not
  // precision-sensitive, same reasoning as SUBSCRIPTION_SWEEP_INTERVAL_MS
  // above. Default: 24 hours.
  MEDIA_ORPHAN_SWEEP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 60 * 60 * 1000),

  // B7: apps/worker's import staging-expiry sweep interval (A-17). More
  // frequent than the other sweeps above — a stale VALIDATED import
  // blocking a legitimate re-upload attempt should resolve reasonably
  // promptly, even though POST /v1/imports/:id/confirm already lazily
  // rejects an expired job on its own regardless of sweep cadence.
  // Default: 1 hour.
  IMPORT_EXPIRY_SWEEP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),

  // B10: apps/worker's "students with no active enrollment" digest sweep
  // for Moderator, per school/session. Not precision-sensitive, same
  // reasoning as the other sweep intervals above. Default: 12 hours — more
  // frequent than the 24h media-orphan report (a genuinely actionable gap
  // in day-to-day roster management), less frequent than the 1h import
  // sweep (this isn't time-critical the way a stuck import staging row is).
  UNASSIGNED_STUDENTS_DIGEST_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(12 * 60 * 60 * 1000),

  // B12: apps/worker's Exam Control Center aggregate-refresh + stale-exam
  // detection sweep — merges the roadmap's two named jobs into one
  // per-tenant pass (both iterate the identical "exams currently OPEN or
  // CLOSED" set), mirroring subscription-expiry.queue.ts's own precedent
  // of combining related per-tenant work. Short by this file's own
  // standards — a live exam's Control Center should feel near-real-time
  // even for a client that only ever polls GET .../control (SSE is the
  // enhancement, not the only path — R-04). Default: 5 seconds.
  EXAM_CONTROL_REFRESH_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1000),
  // B21: the every-school Control Center scan (staleness detection) runs at
  // most this often; exams with live attempts are still refreshed every
  // EXAM_CONTROL_REFRESH_INTERVAL_MS. Staleness is hours-scale, so a minute
  // is ample.
  EXAM_CONTROL_FULL_SCAN_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 1000),

  // B17 derived analytics cache-maintenance sweep. This never stores
  // academic facts; it only keeps tenant refresh health observable.
  ANALYTICS_REFRESH_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),

  // B12: how long an exam may sit OPEN with no session activity before the
  // Control Center flags it as stale (A-14) — never auto-closed, only
  // surfaced. An engineering default: long enough that a normal lab-to-lab
  // gap between batches never falsely triggers, short enough that a
  // genuinely forgotten exam is caught same-day. Default: 4 hours.
  EXAM_STALENESS_THRESHOLD_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(4 * 60 * 60 * 1000),

  // B14: apps/worker's ADR-0004 auto-submission sweep interval — the
  // "authority" half of that ADR's shared idempotent finalisation routine
  // (apps/api's own opportunistic-finalisation touchpoints are the other
  // half, and catch the common case immediately; this sweep is the
  // last-resort backstop for a truly abandoned attempt — browser closed,
  // power lost — with no further server request to opportunistically catch
  // it). An engineering default pending real load-testing (ADR-0004 itself:
  // "sized against B21 load results; must never contend with the
  // interactive answer path") — short enough to feel responsive without
  // the sweep itself becoming a load concern. Default: 15 seconds.
  ATTEMPT_AUTO_SUBMIT_SWEEP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 1000),

  // ADR-0003's post-expiry grace window, in seconds — read directly by
  // `@atlas/domain`'s `attemptGraceWindowSeconds()` (not through this
  // validated `Env` object; `packages/domain` deliberately has no
  // dependency on `packages/config`, so it keeps its own defensive
  // `process.env` read with an identical fallback-to-60 behaviour).
  // Declared here anyway, matching every other configurable knob in this
  // file, so `apps/api`/`apps/worker` fail fast at boot on a malformed
  // value instead of silently falling back — an integrity parameter, never
  // a per-school policy. Default: 60 seconds.
  ATTEMPT_GRACE_WINDOW_SECONDS: z.coerce.number().int().min(0).default(60),

  // ---- B20: Security hardening ---------------------------------------------
  // Separate signing secret for the CSRF double-submit cookie, so the
  // session and CSRF keys can rotate independently. Optional outside
  // production (falls back to SESSION_COOKIE_SECRET); required there.
  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must be at least 32 chars').optional(),

  // How many reverse-proxy hops to trust for the client IP (X-Forwarded-For).
  // 0 = trust none (local dev, direct exposure). Production behind the ALB
  // is 1 (B23). Without this, every request behind a load balancer shares
  // the balancer's IP — and every per-IP rate limit becomes one global one.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  // Per-class rate limits (security/rate-limit.ts). `answer` is per
  // authenticated session — never per IP, because a school lab puts 40
  // students behind one NAT address (R-09). `authIdentifier` bounds
  // guessing against one account; `authIp` bounds credential stuffing
  // from one address while still letting a whole lab sign in at once.
  RATE_LIMIT_ANSWER_MAX: z.coerce.number().int().positive().default(600),
  RATE_LIMIT_HEAVY_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_AUTH_IDENTIFIER_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_AUTH_IP_MAX: z.coerce.number().int().positive().default(120),

  // Software Admin session hardening (08 §16 "stronger controls" for
  // administrative operations). Defaults: 8-hour absolute, 30-minute idle.
  PLATFORM_SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(8 * 60 * 60),
  PLATFORM_SESSION_IDLE_TIMEOUT_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 60),

  // Software Admin TOTP MFA. MFA_ENCRYPTION_KEY seals TOTP secrets at rest
  // (AES-256-GCM); required in production. PLATFORM_MFA_REQUIRED confines an
  // unenrolled admin to the enrolment routes. F20 shipped the enrolment UI
  // (the web shell routes such an admin straight into it), so it is now on
  // by default; test suites that sign admins in without MFA set it false.
  MFA_ENCRYPTION_KEY: z.string().min(32, 'MFA_ENCRYPTION_KEY must be at least 32 chars').optional(),
  PLATFORM_MFA_REQUIRED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // F20 — encrypted media pre-cache (ADR-0021 amendment). The per-exam media
  // key is derived from this secret (HKDF), never stored; a student receives
  // it only in their attempt package at Start. Required in production;
  // rotating it re-encrypts on the next pre-cache request.
  MEDIA_PRECACHE_SECRET: z
    .string()
    .min(32, 'MEDIA_PRECACHE_SECRET must be at least 32 chars')
    .optional(),

  // ADR-0034 amendment (2026-10-15): the shared key the marketing site's
  // server sends with page views and contact forms. Unset (or empty, as the
  // VPS Compose file passes it) turns those two routes off: they answer 404.
  MARKETING_INGEST_KEY: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(32, 'MARKETING_INGEST_KEY must be at least 32 chars').optional(),
  ),

  // Observability (08 §18, 09 §35). All optional: unset means no export
  // (logs still go to stdout as JSON).
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  // Empty counts as unset: the VPS Compose file passes `${SENTRY_DSN:-}` to
  // the api and worker, which is "" until a DSN is put in .env.
  SENTRY_DSN: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
  RELEASE_VERSION: z.string().optional(),

  // Exam Health Monitor (09 §37) and operational/security alert dispatch.
  // OPS_ALERT_EMAILS: comma-separated operator addresses, delivered through
  // the NotificationChannel (SES or SMTP in production, console in dev/CI).
  OPS_ALERT_EMAILS: z.string().optional().default(''),
  /** B23 (ADR-0019 provider decision): `ses` sends real email through
   * Amazon SES, `smtp` through an SMTP provider (the VPS pilot, ADR-0019
   * amendment 2026-10-04); `console` is the dev/CI transport. Production
   * requires `ses` or `smtp`. */
  NOTIFICATION_TRANSPORT: z.enum(['console', 'ses', 'smtp']).default('console'),
  /** Sender address for SES, on the domain's verified SES identity
   * (e.g. `"ExamKeep" <no-reply@example.ng>`). */
  SES_FROM_ADDRESS: z.string().optional().default(''),
  /** Region of the SES identity; defaults to the deployment's own region. */
  SES_REGION: z.string().optional().default(''),
  /** SMTP transport (VPS pilot). Port 465 is implicit TLS; any other port
   * must offer STARTTLS, which the channel requires. */
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  /** Sender address for SMTP, on a domain the provider has verified. */
  SMTP_FROM_ADDRESS: z.string().optional().default(''),
  EXAM_HEALTH_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 1000),
  EXAM_HEALTH_WINDOW_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
  EXAM_HEALTH_ANSWER_SUCCESS_MIN: z.coerce.number().min(0).max(1).default(0.95),
  EXAM_HEALTH_ANSWER_MIN_SAMPLE: z.coerce.number().int().min(1).default(50),

  // Retention sweep (ADR-0028 amended in B20) — operational data only.
  RETENTION_SWEEP_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 60 * 60 * 1000),

  // B21 load shedding (R-12). Under saturation the API sheds reporting
  // (analytics, exports, search, imports) with 503 SERVICE_UNAVAILABLE +
  // Retry-After so answer saves and submissions keep their capacity; exam
  // execution and sign-in are never shed. Thresholds measured in B21 —
  // docs/performance/capacity-plan.md and docs/performance/scaling-runbook.md.
  LOAD_SHED_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Event-loop delay p99 (per 1 s window) above which this process sheds. */
  LOAD_SHED_EVENT_LOOP_P99_MS: z.coerce.number().int().positive().default(200),
  /** Exam write-path (answer save, heartbeat, events, submit) p95 per 1 s
   * window above which this process sheds — below the 250 ms answer-save
   * budget, so reporting yields before the budget is breached. */
  LOAD_SHED_EXAM_P95_MS: z.coerce.number().int().positive().default(200),
  /** Event-loop utilisation (busy fraction of each 1 s) above which this
   * process sheds reporting — the signal for a CPU-pegged process, whose
   * requests queue before any middleware can time them. */
  LOAD_SHED_ELU: z.coerce.number().min(0.5).max(1).default(0.9),
  /** Reporting requests one API process runs at once while it is serving
   * exam writes (the bulkhead); the rest get 503 + Retry-After. No cap when
   * no exam traffic is present. */
  LOAD_SHED_REPORTING_CONCURRENCY: z.coerce.number().int().min(1).max(256).default(4),
  /** Reporting requests per second one API process admits while it is
   * serving exam writes (token bucket); the rest get 503 + Retry-After. */
  LOAD_SHED_REPORTING_RATE: z.coerce.number().int().min(1).max(1000).default(10),
  /** Concurrent in-flight requests above which this process sheds. */
  LOAD_SHED_MAX_IN_FLIGHT: z.coerce.number().int().positive().default(256),
  /** Minimum time shedding stays on once tripped (hysteresis), and the TTL of the cluster-wide signal. */
  LOAD_SHED_HOLD_MS: z.coerce.number().int().positive().default(30_000),
  /** B21: concurrent Argon2 hash/verify per API process (they share Node's libuv threadpool with DNS and file I/O; read directly by PasswordService). */
  ARGON2_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  /** B21: parallel marking jobs per worker process (each holds one pooled connection while it runs). */
  MARKING_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  /** Control Center SSE streams one API process will hold; beyond it, clients fall back to polling (R-04). */
  SSE_MAX_CONNECTIONS_PER_PROCESS: z.coerce.number().int().positive().default(500),

  // B22 failure handling (08 §25). A Redis or object-storage outage must
  // degrade, never hang: every dependency call is bounded and falls back.
  /** Longest a single Redis command may take (including while reconnecting)
   * before it fails and the caller's fallback runs. */
  REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().min(50).max(30_000).default(1000),
  /** Longest a queue enqueue may take before the caller treats it as failed
   * (the job id is stable, so a late success is harmless). */
  QUEUE_ENQUEUE_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(2000),
  /** API processes the cluster may run at most. While Redis is down each
   * process enforces rate limits and login lockout in memory at
   * limit ÷ this number, so the cluster as a whole is never looser than
   * the normal shared limit. Set it to the autoscaling maximum (B23). */
  RATE_LIMIT_FALLBACK_PROCESSES: z.coerce.number().int().min(1).max(64).default(2),
  /** Object-storage client: connect and per-request timeouts, and SDK attempts. */
  S3_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(3000),
  S3_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(500).max(300_000).default(15_000),
  S3_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  /** Whether the API creates its bucket at boot. Dev/CI only — production's
   * bucket is provisioned by infrastructure (B23), and the runtime role has
   * no CreateBucket right. A failure is logged, never fatal. */
  S3_ENSURE_BUCKET: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Upper bound on a graceful shutdown (drain requests, stop consumers,
   * flush telemetry) before the process exits anyway. Keep it below the
   * orchestrator's stop timeout (ECS default 30 s). */
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(25_000),
  /** Dev/CI only: also enable bucket versioning at boot (MinIO); s3rver
   * does not support it, so it is off by default. */
  S3_ENSURE_VERSIONING: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const DEV_SECRET_MARKERS = ['dev-only', 'change-me', 'changeme', 'ci-only', 'example', 'secret'];

/**
 * B20: production refuses to boot on configuration that is only safe in
 * development — dev-default secrets, plaintext database/Redis transport,
 * a missing CSRF or MFA key. Encryption in transit is enforced here because
 * this is the last point the application can refuse it; encryption at rest
 * is an infrastructure property verified at B23 provisioning.
 */
export const envSchema = envObject.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  const fail = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });

  const weak = (v: string | undefined) =>
    !v || v.length < 32 || DEV_SECRET_MARKERS.some((m) => v.toLowerCase().includes(m));
  if (weak(env.SESSION_COOKIE_SECRET)) {
    fail(
      'SESSION_COOKIE_SECRET',
      'must be ≥32 random chars and not a dev/CI default in production',
    );
  }
  if (weak(env.CSRF_SECRET)) {
    fail('CSRF_SECRET', 'is required in production (≥32 random chars, not a dev default)');
  } else if (env.CSRF_SECRET === env.SESSION_COOKIE_SECRET) {
    fail('CSRF_SECRET', 'must differ from SESSION_COOKIE_SECRET');
  }
  if (weak(env.MFA_ENCRYPTION_KEY)) {
    fail('MFA_ENCRYPTION_KEY', 'is required in production (≥32 random chars)');
  }
  if (weak(env.MEDIA_PRECACHE_SECRET)) {
    fail('MEDIA_PRECACHE_SECRET', 'is required in production (≥32 random chars)');
  } else if (
    env.MEDIA_PRECACHE_SECRET === env.MFA_ENCRYPTION_KEY ||
    env.MEDIA_PRECACHE_SECRET === env.SESSION_COOKIE_SECRET
  ) {
    fail('MEDIA_PRECACHE_SECRET', 'must not reuse another secret');
  }
  for (const key of ['DATABASE_URL', 'DATABASE_APP_URL', 'DATABASE_AUDIT_READER_URL'] as const) {
    const value = env[key];
    if (!value) continue; // DATABASE_URL is absent from the API/worker tasks
    const mode = new URL(value).searchParams.get('sslmode');
    if (mode !== 'require' && mode !== 'verify-ca' && mode !== 'verify-full') {
      fail(key, 'must set sslmode=require (or verify-ca/verify-full) in production');
    }
  }
  if (!env.REDIS_URL.startsWith('rediss://')) {
    fail('REDIS_URL', 'must use rediss:// (TLS) in production');
  }
  if (!env.COOKIE_DOMAIN) {
    fail('COOKIE_DOMAIN', 'must be set in production (ADR-0022)');
  }
  // B23: the console transport withholds content in production, so a
  // reset or activation email would silently never arrive.
  const sender = /@[^@\s]+\.[^@\s]+>?$/;
  if (env.NOTIFICATION_TRANSPORT === 'ses') {
    if (!sender.test(env.SES_FROM_ADDRESS)) {
      fail('SES_FROM_ADDRESS', 'must be a sender address on the verified SES identity');
    }
  } else if (env.NOTIFICATION_TRANSPORT === 'smtp') {
    if (!sender.test(env.SMTP_FROM_ADDRESS)) {
      fail('SMTP_FROM_ADDRESS', 'must be a sender address the SMTP provider has verified');
    }
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'] as const) {
      if (!env[key]) fail(key, 'is required when NOTIFICATION_TRANSPORT is smtp');
    }
  } else {
    fail('NOTIFICATION_TRANSPORT', 'must be ses or smtp in production (ADR-0019)');
  }
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
