import { PrismaPg } from '@prisma/adapter-pg';
import { loadRootEnv } from '@atlas/config';
import { PrismaClient } from '../generated/client/index.js';

// Called here, not left to import order, so `prisma` below is safe to
// construct regardless of which module happens to import @atlas/db first
// (see the git history of this file for why that mattered).
loadRootEnv();

/**
 * Process-wide singleton. Both apps/api and apps/worker import this rather
 * than constructing their own PrismaClient, so connection pooling and the
 * tenancy session-variable convention (see tenancy.ts) stay consistent
 * across the request path and the job path (ADR-0023).
 */
declare global {
  var __atlasPrisma: PrismaClient | undefined;
}

/**
 * Prisma 7 constructs its connection via a driver adapter rather than a
 * schema-file URL (see prisma/schema.prisma's datasource comment).
 *
 * Defaults to DATABASE_APP_URL, not DATABASE_URL: the running application
 * connects as the non-superuser `atlas_app` role (infra/postgres/init.sql),
 * never as the migration/schema-owner role, so ADR-0023's Row-Level
 * Security actually constrains it — a Postgres superuser bypasses RLS
 * unconditionally, FORCE ROW LEVEL SECURITY notwithstanding.
 * `connectionString` lets tests or tooling override this explicitly (e.g.
 * DATABASE_APP_URL_TEST, or the owner URL for schema-level operations).
 */
export function createPrismaClient(connectionString?: string): PrismaClient {
  const url = connectionString ?? process.env.DATABASE_APP_URL;
  if (!url) {
    throw new Error(
      'DATABASE_APP_URL is not set. Copy .env.example to .env at the repo root, or pass a connection string explicitly.',
    );
  }
  // B21: pool size from DATABASE_POOL_MAX (default 10 = node-postgres's own
  // default, unchanged unless configured). Read here rather than through
  // @atlas/config's schema so this package stays usable by tooling that
  // never loads the full application env.
  const poolMax = Number(process.env.DATABASE_POOL_MAX ?? '10');
  const adapter = new PrismaPg({
    connectionString: url,
    max: Number.isInteger(poolMax) && poolMax > 0 ? poolMax : 10,
    // B21: node-postgres closes idle connections after 10 s by default, so
    // a bursty exam load (quiet, then a lab of 40 at once) re-opens them —
    // each a DNS lookup + TLS + auth on the critical path. A minute keeps
    // the pool warm across the gaps; the pooler (RDS Proxy / PgBouncer)
    // owns the real server-side connection budget.
    idleTimeoutMillis: 60_000,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient = globalThis.__atlasPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__atlasPrisma = prisma;
}

export { PrismaClient } from '../generated/client/index.js';
export type * from '../generated/client/index.js';
// B5: the first consumer needing to catch a specific Prisma error class at
// runtime (PrismaClientKnownRequestError, to translate a partial-unique-
// index violation into ACADEMIC_ACTIVATION_CONFLICT) — `export type *`
// above only forwards type declarations, not the runtime namespace object,
// so `Prisma` needs its own explicit value export alongside it.
export { Prisma } from '../generated/client/index.js';
