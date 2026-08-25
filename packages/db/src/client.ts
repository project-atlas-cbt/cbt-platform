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
  const adapter = new PrismaPg({ connectionString: url });
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
