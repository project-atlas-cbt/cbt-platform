/**
 * B21 / ADR-0023 ("connection pooling must not leak session variables
 * between requests"): tenant context set by withTenant() is transaction-
 * local, so a transaction-mode pooler — PgBouncer locally and in CI, the
 * stand-in for production RDS Proxy (project-owner decision 2026-10-02) —
 * can hand the same server connection to the next transaction of another
 * school without carrying the previous tenant along.
 *
 * Runs only when DATABASE_APP_POOLED_URL_TEST points at the pooler
 * (infra/load/pgbouncer.ini; CI's integration job sets it). The pooler's
 * per-database server pool is deliberately far smaller than the number of
 * interleaved transactions, so server connections are reused across
 * schools many times over.
 */
import { randomUUID } from 'node:crypto';
import { createPrismaClient, withTenant, type PrismaClient } from '@atlas/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { safeDeleteSchools } from '../support/safe-delete-schools.js';

const ownerDatabaseUrl = process.env.DATABASE_URL_TEST;
const pooledDatabaseUrl = process.env.DATABASE_APP_POOLED_URL_TEST;

describe.skipIf(!ownerDatabaseUrl || !pooledDatabaseUrl)(
  'tenant context through a transaction-mode pooler (B21, ADR-0023)',
  () => {
    let owner: PrismaClient;
    let pooled: PrismaClient;
    const schools: { id: string; departmentNames: Set<string> }[] = [];

    beforeAll(async () => {
      owner = createPrismaClient(ownerDatabaseUrl);
      pooled = createPrismaClient(pooledDatabaseUrl);
      for (let i = 0; i < 4; i++) {
        const school = await owner.school.create({
          data: {
            name: `Pooler isolation ${i}`,
            subdomain: `pool-${randomUUID().slice(0, 8)}`,
            status: 'ACTIVE',
          },
        });
        const names = new Set<string>();
        for (let d = 0; d < 3; d++) {
          const name = `Dept ${i}-${d}-${randomUUID().slice(0, 4)}`;
          await owner.department.create({
            data: { schoolId: school.id, name, code: `D${i}${d}${randomUUID().slice(0, 4)}` },
          });
          names.add(name);
        }
        schools.push({ id: school.id, departmentNames: names });
      }
    });

    afterAll(async () => {
      await owner.department.deleteMany({ where: { schoolId: { in: schools.map((s) => s.id) } } });
      await safeDeleteSchools(
        owner,
        schools.map((s) => s.id),
      );
      await pooled.$disconnect();
      await owner.$disconnect();
    });

    it('400 interleaved transactions across 4 schools each see exactly their own tenant', async () => {
      const results = await Promise.all(
        Array.from({ length: 400 }, async (_, i) => {
          const school = schools[i % schools.length]!;
          return withTenant(pooled, school.id, async (tx) => {
            const [setting] = await tx.$queryRaw<{ v: string | null }[]>`
              SELECT current_setting('app.current_school_id', true) AS v`;
            // A deliberate pause inside the transaction so other schools'
            // transactions are in flight on the remaining server connections.
            await tx.$executeRaw`SELECT pg_sleep(0.005)`;
            const departments = await tx.department.findMany({
              select: { schoolId: true, name: true },
            });
            return { school, setting: setting?.v ?? null, departments };
          });
        }),
      );
      for (const { school, setting, departments } of results) {
        expect(setting).toBe(school.id);
        expect(departments.every((d) => d.schoolId === school.id)).toBe(true);
        expect(new Set(departments.map((d) => d.name))).toEqual(school.departmentNames);
      }
    });

    it('no tenant survives the transaction: an untenanted statement on a reused connection sees none', async () => {
      for (const school of schools) {
        await withTenant(pooled, school.id, (tx) => tx.department.count());
      }
      const leaks = await Promise.all(
        Array.from({ length: 100 }, async () => {
          const [row] = await pooled.$queryRaw<{ v: string | null }[]>`
            SELECT current_setting('app.current_school_id', true) AS v`;
          const visible = await pooled.department.count({
            where: { schoolId: { in: schools.map((s) => s.id) } },
          });
          return { setting: row?.v ?? null, visible };
        }),
      );
      for (const { setting, visible } of leaks) {
        expect(setting === null || setting === '').toBe(true);
        // RLS with no tenant set: nothing at all is visible.
        expect(visible).toBe(0);
      }
    });
  },
);
