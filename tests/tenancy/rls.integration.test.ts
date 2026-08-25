/**
 * B0 Definition of Done #6: "A cross-tenant access attempt is blocked by
 * the tenancy primitive and a test proves it." Also the B0 Testing
 * requirements table's "Security | Cross-tenant RLS probe."
 *
 * Deliberately queries tenancy_probes WITHOUT a school_id filter — the
 * point of ADR-0023's defence-in-depth is that RLS still blocks the read
 * even when application code forgets to scope it.
 *
 * Two connections, deliberately: fixture setup/teardown runs as the
 * schema-owner role (DATABASE_URL_TEST) so it isn't itself subject to RLS;
 * every assertion below runs as the actual application role
 * (DATABASE_APP_URL_TEST, see infra/postgres/init.sql) — a Postgres
 * superuser bypasses RLS unconditionally, so testing against the owner
 * connection would pass without RLS doing anything at all.
 */
import { randomUUID } from 'node:crypto';
import { createPrismaClient, withTenant, type PrismaClient } from '@atlas/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPrisma } from '../support/run-prisma.js';

const ownerDatabaseUrl = process.env.DATABASE_URL_TEST;
const appDatabaseUrl = process.env.DATABASE_APP_URL_TEST;

describe.skipIf(!ownerDatabaseUrl || !appDatabaseUrl)(
  'Row-Level Security tenant isolation (ADR-0023)',
  () => {
    let owner: PrismaClient;
    let app: PrismaClient;
    let schoolA: { id: string };
    let schoolB: { id: string };

    beforeAll(async () => {
      // Deploy is idempotent (a no-op if already applied) and cheap — this
      // makes the file self-sufficient regardless of what other
      // integration test files against the same database ran, or reset,
      // before it (see migrations.integration.test.ts, which deliberately
      // ends by resetting the schema to empty).
      await runPrisma(['migrate', 'deploy'], ownerDatabaseUrl);

      owner = createPrismaClient(ownerDatabaseUrl);
      app = createPrismaClient(appDatabaseUrl);

      schoolA = await owner.school.create({
        data: { name: `RLS Test School A ${randomUUID()}`, subdomain: `rls-a-${Date.now()}` },
      });
      schoolB = await owner.school.create({
        data: { name: `RLS Test School B ${randomUUID()}`, subdomain: `rls-b-${Date.now()}` },
      });

      await owner.tenancyProbe.create({
        data: { schoolId: schoolA.id, label: 'belongs to school A' },
      });
      await owner.tenancyProbe.create({
        data: { schoolId: schoolB.id, label: 'belongs to school B' },
      });
    });

    afterAll(async () => {
      await owner.tenancyProbe.deleteMany({
        where: { schoolId: { in: [schoolA.id, schoolB.id] } },
      });
      await owner.school.deleteMany({ where: { id: { in: [schoolA.id, schoolB.id] } } });
      await owner.$disconnect();
      await app.$disconnect();
    });

    it('with no tenant context set, RLS blocks all rows (fails closed)', async () => {
      // No withTenant() wrapper — session variable is unset. FORCE ROW LEVEL
      // SECURITY means even the owning role sees nothing — proven here
      // against the app role, the connection that actually matters.
      const rows = await app.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM tenancy_probes WHERE id IN (SELECT id FROM tenancy_probes)`;
      expect(rows).toHaveLength(0);
    });

    it("scoped to school A, only school A's row is visible — school B's is not", async () => {
      const rows = await withTenant(
        app,
        schoolA.id,
        (tx) =>
          tx.$queryRaw<
            Array<{ school_id: string; label: string }>
          >`SELECT school_id, label FROM tenancy_probes`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.school_id).toBe(schoolA.id);
    });

    it("scoped to school B, only school B's row is visible", async () => {
      const rows = await withTenant(
        app,
        schoolB.id,
        (tx) => tx.$queryRaw<Array<{ school_id: string }>>`SELECT school_id FROM tenancy_probes`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.school_id).toBe(schoolB.id);
    });

    it('an explicit cross-tenant read by id returns nothing, even by primary key', async () => {
      const probeInSchoolB = await owner.tenancyProbe.findFirstOrThrow({
        where: { schoolId: schoolB.id },
      });

      const rows = await withTenant(
        app,
        schoolA.id,
        (tx) =>
          tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM tenancy_probes WHERE id = ${probeInSchoolB.id}::uuid`,
      );
      expect(rows).toHaveLength(0);
    });
  },
);
