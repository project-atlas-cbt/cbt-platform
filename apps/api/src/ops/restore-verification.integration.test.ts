/**
 * B22 (DoD 10): the post-restore checks pass on a consistent school and
 * catch a torn one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createPrismaClient, type PrismaClient } from '@atlas/db';
import { ownerPrisma } from '../test-support/owner-prisma.js';
import {
  bootSecurityApp,
  SecurityFixture,
  type FixtureSchool,
} from '../test-support/security-fixture.js';
import { verifyRestoredDatabase } from './restore-verification.js';

let app: NestFastifyApplication;
let db: PrismaClient;
const fixture = new SecurityFixture();
let school: FixtureSchool;

beforeAll(async () => {
  app = await bootSecurityApp();
  school = await fixture.createSchool('restore-verify');
  await fixture.populate(school);
  db = createPrismaClient(process.env.DATABASE_URL);
});

afterAll(async () => {
  await db.$disconnect();
  await app.close();
  await fixture.cleanup();
});

const errors = async () =>
  Object.fromEntries(
    (await verifyRestoredDatabase(db, { schoolIds: [school.schoolId] })).checks
      .filter((c) => c.severity === 'error')
      .map((c) => [c.name, c.count]),
  );

describe('ops:restore-verify', () => {
  it('passes on a consistent school, with RLS forced and migrations complete', async () => {
    const result = await verifyRestoredDatabase(db, { schoolIds: [school.schoolId] });
    expect(result.checks.filter((c) => c.severity === 'error' && c.count > 0)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails when a finalised attempt has lost its result (a torn restore)', async () => {
    // The transition and the PROCESSING result are one transaction; a copy
    // holding one without the other is not consistent.
    await ownerPrisma().$executeRaw`
      UPDATE exam_attempts SET state = 'SUBMITTED', submitted_at = now()
       WHERE school_id = ${school.schoolId}::uuid`;
    expect((await errors())['finalised attempts without a result']).toBe(1);
    expect((await verifyRestoredDatabase(db, { schoolIds: [school.schoolId] })).ok).toBe(false);
  });

  it('fails when the platform audit policies did not survive the restore (P1-13)', async () => {
    // pg_restore before atlas_app exists drops policies naming that role and
    // carries on; the check must catch it.
    await ownerPrisma().$executeRawUnsafe(
      'DROP POLICY "audit_events_platform_insert" ON "audit_events"',
    );
    try {
      expect(
        (await errors())['audit policies missing (restored before the database roles existed)'],
      ).toBe(1);
    } finally {
      await ownerPrisma().$executeRawUnsafe(
        `CREATE POLICY "audit_events_platform_insert" ON "audit_events"
           FOR INSERT TO atlas_app WITH CHECK (school_id IS NULL)`,
      );
    }
  });
});
