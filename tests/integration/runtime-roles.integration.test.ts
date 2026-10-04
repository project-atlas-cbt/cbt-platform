/**
 * B23: `ensureRuntimeRoles` is how a managed database (RDS, no init.sql)
 * gets `atlas_app` and `atlas_audit_reader`. Re-asserted here with the
 * test cluster's existing passwords (read from the test URLs), so running
 * it changes nothing locally — and proves it is idempotent on roles that
 * already exist, that the roles can sign in afterwards, and that neither
 * can bypass RLS.
 */
import { createPrismaClient, ensureRuntimeRoles } from '@atlas/db';
import { describe, expect, it } from 'vitest';

const ownerUrl = process.env.DATABASE_URL_TEST;
const appUrl = process.env.DATABASE_APP_URL_TEST;
const auditUrl = process.env.DATABASE_AUDIT_READER_URL_TEST;

describe.skipIf(!ownerUrl || !appUrl || !auditUrl)('ensureRuntimeRoles', () => {
  it('re-passwords existing roles idempotently, without superuser or BYPASSRLS', async () => {
    const passwords = {
      app: decodeURIComponent(new URL(appUrl!).password),
      auditReader: decodeURIComponent(new URL(auditUrl!).password),
    };
    await ensureRuntimeRoles(ownerUrl!, passwords);
    await ensureRuntimeRoles(ownerUrl!, passwords);

    const owner = createPrismaClient(ownerUrl);
    try {
      const roles = await owner.$queryRaw<
        { rolname: string; rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean }[]
      >`SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles
        WHERE rolname IN ('atlas_app', 'atlas_audit_reader') ORDER BY rolname`;
      expect(roles).toEqual([
        { rolname: 'atlas_app', rolsuper: false, rolbypassrls: false, rolcanlogin: true },
        { rolname: 'atlas_audit_reader', rolsuper: false, rolbypassrls: false, rolcanlogin: true },
      ]);
    } finally {
      await owner.$disconnect();
    }

    for (const url of [appUrl!, auditUrl!]) {
      const client = createPrismaClient(url);
      try {
        const [row] = await client.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
        expect(row?.ok).toBe(1);
      } finally {
        await client.$disconnect();
      }
    }
  });
});
