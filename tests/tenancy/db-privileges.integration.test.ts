/**
 * B20 DoD 11 ("database roles follow least privilege; the application role
 * cannot alter audit records") and DoD 10's database half ("never deletes
 * what invariant 14 protects") — asserted against the live catalog, not
 * against what grants.ts intends.
 *
 * Also the catalog check the hand-written RLS suite cannot make: every
 * table carrying `school_id` has row-level security ENABLED and FORCED, so
 * a future table added without its policy fails here on its first run.
 */
import { randomUUID } from 'node:crypto';
import {
  APPEND_ONLY_TABLES,
  createPrismaClient,
  NO_ACCESS_TABLES,
  NO_DELETE_TABLES,
  NO_WRITE_TABLES,
  type PrismaClient,
} from '@atlas/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPrisma } from '../support/run-prisma.js';

const ownerDatabaseUrl = process.env.DATABASE_URL_TEST;
const appDatabaseUrl = process.env.DATABASE_APP_URL_TEST;

describe.skipIf(!ownerDatabaseUrl || !appDatabaseUrl)(
  'least-privilege database roles (B20)',
  () => {
    let owner: PrismaClient;
    let app: PrismaClient;

    beforeAll(async () => {
      // Deploy also re-runs grantAppRole(), which is the code under test.
      await runPrisma(['migrate', 'deploy'], ownerDatabaseUrl);
      owner = createPrismaClient(ownerDatabaseUrl);
      app = createPrismaClient(appDatabaseUrl);
    });

    afterAll(async () => {
      await owner.$disconnect();
      await app.$disconnect();
    });

    const can = async (table: string, privilege: string): Promise<boolean> => {
      const rows = await owner.$queryRawUnsafe<Array<{ ok: boolean }>>(
        `SELECT has_table_privilege('atlas_app', '"${table}"', '${privilege}') AS ok`,
      );
      return rows[0]!.ok;
    };

    it('atlas_app is not a superuser, owns no table, and cannot bypass RLS', async () => {
      const [role] = await owner.$queryRaw<
        Array<{
          rolsuper: boolean;
          rolbypassrls: boolean;
          rolcreaterole: boolean;
          rolcreatedb: boolean;
        }>
      >`
      SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = 'atlas_app'`;
      expect(role).toEqual({
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
      });
      const owned = await owner.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'atlas_app'`;
      expect(Number(owned[0]!.n)).toBe(0);
    });

    it('append-only tables: no UPDATE, no DELETE', async () => {
      for (const t of APPEND_ONLY_TABLES) {
        expect(await can(t, 'UPDATE'), `${t} UPDATE`).toBe(false);
        expect(await can(t, 'DELETE'), `${t} DELETE`).toBe(false);
        expect(await can(t, 'INSERT'), `${t} INSERT`).toBe(true);
      }
    });

    it('academic evidence, audit and schools: no DELETE (invariants 14 and 15)', async () => {
      for (const t of NO_DELETE_TABLES) {
        expect(await can(t, 'DELETE'), `${t} DELETE`).toBe(false);
      }
    });

    it('platform authority and the migration ledger are out of reach', async () => {
      for (const t of NO_WRITE_TABLES) {
        for (const p of ['INSERT', 'UPDATE', 'DELETE'])
          expect(await can(t, p), `${t} ${p}`).toBe(false);
        expect(await can(t, 'SELECT'), `${t} SELECT`).toBe(true);
      }
      for (const t of NO_ACCESS_TABLES) {
        for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
          expect(await can(t, p), `${t} ${p}`).toBe(false);
      }
    });

    it('no table grants atlas_app TRUNCATE, TRIGGER or REFERENCES, and it cannot create in the schema', async () => {
      const tables = await owner.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
      for (const { tablename } of tables) {
        for (const p of ['TRUNCATE', 'TRIGGER', 'REFERENCES']) {
          expect(await can(tablename, p), `${tablename} ${p}`).toBe(false);
        }
      }
      const [schema] = await owner.$queryRaw<Array<{ ok: boolean }>>`
      SELECT has_schema_privilege('atlas_app', 'public', 'CREATE') AS ok`;
      expect(schema!.ok).toBe(false);
    });

    it('the denials hold in practice: DROP, TRUNCATE, audit UPDATE and evidence DELETE all fail as atlas_app', async () => {
      await expect(app.$executeRawUnsafe('DROP TABLE "exam_attempts"')).rejects.toThrow();
      await expect(app.$executeRawUnsafe('TRUNCATE "audit_events"')).rejects.toThrow();
      await expect(app.$executeRawUnsafe(`UPDATE "audit_events" SET reason = 'x'`)).rejects.toThrow(
        /permission denied/iu,
      );
      await expect(app.$executeRawUnsafe('DELETE FROM "results"')).rejects.toThrow(
        /permission denied/iu,
      );
      await expect(app.$executeRawUnsafe('DELETE FROM "schools"')).rejects.toThrow(
        /permission denied/iu,
      );
      await expect(
        app.$executeRawUnsafe(
          `INSERT INTO "platform_role_assignments" (user_id, role) VALUES ('${randomUUID()}', 'SOFTWARE_ADMIN')`,
        ),
      ).rejects.toThrow(/permission denied/iu);
      await expect(app.$queryRawUnsafe('SELECT * FROM "_prisma_migrations"')).rejects.toThrow(
        /permission denied/iu,
      );
    });

    it('every table with school_id has row-level security enabled AND forced', async () => {
      const rows = await owner.$queryRaw<
        Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>
      >`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM information_schema.columns col
                    WHERE col.table_schema = 'public' AND col.table_name = c.relname
                      AND col.column_name = 'school_id')`;
      expect(rows.length).toBeGreaterThan(40);
      const unprotected = rows
        .filter((r) => !r.relrowsecurity || !r.relforcerowsecurity)
        .map((r) => r.relname);
      expect(unprotected).toEqual([]);
    });

    it('a platform-level audit row (school_id NULL) can be written but never read back by atlas_app', async () => {
      const actor = await owner.user.create({
        data: { firstName: 'Audit', lastName: 'Probe', displayName: 'Audit Probe' },
      });
      try {
        await app.auditEvent.createMany({
          data: [
            {
              schoolId: null,
              actorUserId: actor.id,
              actorRole: 'SOFTWARE_ADMIN',
              action: 'PRIVILEGE_PROBE',
            },
          ],
        });
        expect(await app.auditEvent.count({ where: { actorUserId: actor.id } })).toBe(0);
        expect(await owner.auditEvent.count({ where: { actorUserId: actor.id } })).toBe(1);
      } finally {
        // The audit row is immutable by design; the probe user stays referenced
        // only by it (no FK from audit_events.actor_user_id) and is removed.
        await owner.user.delete({ where: { id: actor.id } });
      }
    });
  },
);
