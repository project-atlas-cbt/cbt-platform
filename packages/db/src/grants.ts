import { createPrismaClient } from './client.js';

/**
 * Re-asserts the `atlas_app` role's access to the `public` schema.
 *
 * infra/postgres/init.sql grants this once, at container init — but
 * `prisma migrate reset` (and a real disaster-recovery restore) drops and
 * recreates the `public` schema object outright, which silently wipes both
 * the schema-level GRANT and the ALTER DEFAULT PRIVILEGES rule with it
 * (they're tied to that specific schema object, not the name "public").
 * After that, `atlas_app` can't even see table names — reads fail with
 * "relation does not exist", not a permissions error, because it no longer
 * has USAGE on the schema at all.
 *
 * Call this after any `migrate deploy`/`migrate reset` against a database
 * with an `atlas_app` role, using the schema-owner connection string
 * (`DATABASE_URL`, never `DATABASE_APP_URL` — the app role can't grant its
 * own access). Idempotent — safe to call whether or not anything was
 * actually reset.
 */
export async function grantAppRole(ownerConnectionUrl: string): Promise<void> {
  const owner = createPrismaClient(ownerConnectionUrl);
  try {
    await owner.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO atlas_app');
    await owner.$executeRawUnsafe(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO atlas_app',
    );
    await owner.$executeRawUnsafe(
      'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO atlas_app',
    );
    await owner.$executeRawUnsafe(
      'ALTER DEFAULT PRIVILEGES FOR ROLE atlas IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app',
    );
    await owner.$executeRawUnsafe(
      'ALTER DEFAULT PRIVILEGES FOR ROLE atlas IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO atlas_app',
    );
  } finally {
    await owner.$disconnect();
  }
}

/**
 * Re-asserts `atlas_audit_reader`'s schema-level USAGE grant (B10).
 *
 * Same failure mode as `grantAppRole` above: `migrate reset` drops and
 * recreates the `public` schema object outright, silently wiping this
 * role's `GRANT USAGE ON SCHEMA public` along with it. Deliberately a
 * separate, narrower function rather than folded into `grantAppRole` —
 * that function's contract is "blanket re-grant everything to atlas_app";
 * conflating it with a role that must never receive a blanket grant would
 * be a footgun for a future reader of this file.
 *
 * This role's table-scoped SELECT grant and its additive RLS policy on
 * `audit_events` both live inside the B10 migration's own SQL (not here),
 * so `migrate reset` replays them naturally along with every other
 * migration statement — only the schema-level USAGE grant, which lives
 * outside migration history entirely (see infra/postgres/init.sql), needs
 * this explicit re-assertion.
 */
export async function grantAuditReaderRole(ownerConnectionUrl: string): Promise<void> {
  const owner = createPrismaClient(ownerConnectionUrl);
  try {
    await owner.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO atlas_audit_reader');
  } finally {
    await owner.$disconnect();
  }
}
