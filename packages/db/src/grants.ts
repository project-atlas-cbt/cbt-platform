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
