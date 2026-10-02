/**
 * B0 Definition of Done #3: "A migration can be created, applied, and
 * rolled back." Proven here against DATABASE_URL_TEST, never the dev
 * database. "Rolled back" is `prisma migrate reset` — Prisma manages
 * schema state as apply-forward migrations plus a full reset rather than
 * per-migration down scripts; reset (drop + reapply from zero) is the
 * supported rollback primitive and is what this test exercises.
 *
 * Deliberately ends with the schema reset to empty — this file's job is
 * proving deploy/reset work, not leaving fixtures behind. Other
 * integration test files against the same database (e.g.
 * tests/tenancy/rls.integration.test.ts) must not assume the schema is
 * already migrated; each re-applies migrations itself before use.
 */
import { createPrismaClient, type PrismaClient } from '@atlas/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPrisma } from '../support/run-prisma.js';

const testDatabaseUrl = process.env.DATABASE_URL_TEST;

describe.skipIf(!testDatabaseUrl)('prisma migrations (create/apply/rollback)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createPrismaClient(testDatabaseUrl);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('applies all migrations cleanly to an ephemeral database', async () => {
    await runPrisma(['migrate', 'deploy'], testDatabaseUrl);
  });

  it('creates the tables the schema defines', async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `;
    const names = rows.map((r) => r.table_name);
    // tenancy_probes/tenancy_probe_children (B0 scaffolding) were dropped
    // in B1's migration once a real school-owned table existed to carry
    // the isolation-test suite instead — see schema.prisma's TenancyProbe
    // doc comment and tests/tenancy/rls.integration.test.ts.
    expect(names).toEqual(
      expect.arrayContaining([
        'schools',
        'users',
        'school_memberships',
        'role_assignments',
        'student_profiles',
        'teacher_profiles',
        'sessions',
        'password_reset_tokens',
      ]),
    );
  });

  it('rolls back via reset and re-applies from zero', async () => {
    // Prisma 7's `migrate reset` dropped --skip-seed (see prisma.config.ts's
    // migrations.seed) — --force alone now covers both the confirmation
    // prompt and any seed step.
    await runPrisma(['migrate', 'reset', '--force'], testDatabaseUrl);
    // ~14s alone (a full reset, every migration, then grantAppRole's B20
    // revoke pass); turbo runs it alongside other suites, where it crossed
    // the 30s default.
  }, 90_000);

  it('leaves a clean, empty schema after reset', async () => {
    const count = await prisma.school.count();
    expect(count).toBe(0);
  });
});
