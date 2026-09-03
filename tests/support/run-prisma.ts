/**
 * Shared by every integration test file that needs the Prisma CLI against
 * an explicit database URL (never the default DATABASE_URL a bare `prisma`
 * invocation would pick up).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { grantAppRole, grantAuditReaderRole } from '@atlas/db';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPackageDir = resolve(__dirname, '../../packages/db');

/**
 * `databaseUrl` must be the schema-owner connection (DATABASE_URL /
 * DATABASE_URL_TEST) — `migrate` commands need DDL rights the restricted
 * `atlas_app` role doesn't have.
 *
 * Any `migrate` subcommand re-asserts atlas_app's grants afterwards (see
 * grantAppRole): `migrate reset` drops and recreates the `public` schema
 * object outright, which silently wipes the schema-level GRANT
 * infra/postgres/init.sql set up at container init — after a reset,
 * atlas_app can't even see table names until this runs again.
 */
export async function runPrisma(args: string[], databaseUrl: string | undefined): Promise<void> {
  execFileSync('pnpm', ['exec', 'prisma', ...args], {
    cwd: dbPackageDir,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      // `migrate reset` refuses to run when Prisma detects it's being
      // invoked by an AI coding agent, without this. Scoped to this
      // test-only helper — which only ever targets DATABASE_URL_TEST
      // (the ephemeral atlas_test database, never a dev/prod one) — per
      // the project owner's explicit, recorded consent to this specific,
      // repeatable test running `migrate reset` against that database.
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'Yes, proceed (Recommended)',
    },
    stdio: 'pipe',
    // Windows: `pnpm` on PATH resolves to pnpm.cmd/pnpm.ps1, which
    // execFileSync cannot invoke directly (ENOENT) without shell
    // resolution. Harmless on POSIX shells too.
    shell: true,
  });

  if (args[0] === 'migrate' && databaseUrl) {
    await grantAppRole(databaseUrl);
    await grantAuditReaderRole(databaseUrl);
  }
}
