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
    // B20 least privilege: the runtime role can resolve objects in the
    // schema but cannot create or replace schema objects. DDL remains
    // exclusively on DATABASE_URL's migration owner.
    await owner.$executeRawUnsafe('REVOKE CREATE ON SCHEMA public FROM atlas_app');
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
    // B10 gap closure: the blanket "ON ALL TABLES" grant two statements
    // above would otherwise silently re-grant UPDATE/DELETE on
    // audit_events, undoing the B10 migration's own
    // `REVOKE UPDATE, DELETE ON "audit_events" FROM atlas_app` the moment
    // this function next runs (every `migrate deploy`/`migrate reset`
    // calls it — see run-prisma.ts). That's the exact footgun B2's own
    // migration comment already identified and chose not to fight for this
    // same table; re-asserting the narrower revoke here, as part of what
    // this function considers atlas_app's *correct* grant state, is what
    // actually avoids it this time instead of just documenting the risk.
    // Wrapped in a guard against `undefined_table` — this function can run
    // against a database migrated only up to a pre-B10 state (no schema
    // history is skipped in practice via `migrate deploy`/`reset`, but nothing
    // here should assume that), where audit_events doesn't exist yet.
    await owner.$executeRawUnsafe(`
      DO $$
      BEGIN
        REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
          ON "audit_events" FROM atlas_app;
        GRANT SELECT, INSERT ON "audit_events" TO atlas_app;
      EXCEPTION WHEN undefined_table THEN
        NULL;
      END $$;
    `);
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
