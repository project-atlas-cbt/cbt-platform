/**
 * B5 roadmap Testing requirements table — Data integrity: "Two concurrent
 * `CURRENT` activations — one must fail at the database level" (DoD item 2).
 *
 * Deliberately does NOT go through the NestJS app / HTTP layer: an ordinary
 * `Promise.all([app.inject(...), app.inject(...)])` race is not
 * deterministic enough to reliably prove a database-level guarantee (two
 * fast local round-trips may simply run sequentially without ever
 * overlapping). This test forces a real overlap directly against Postgres
 * — using the same `prisma`/`withTenant` primitives `SessionService` itself
 * uses, with an explicit `pg_sleep` inserted into one transaction between
 * its read and its write so the other transaction's commit is guaranteed to
 * land first — and asserts the *outcome* the partial unique index
 * (`academic_sessions_one_current_per_school`) is responsible for: exactly
 * one of the two sessions ends up CURRENT, and the delayed transaction's
 * own write is the one Postgres rejects, not merely "whichever happened to
 * finish first in application code."
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma, withTenant, Prisma } from '@atlas/db';
import { safeDeleteSchools } from '../../test-support/safe-delete-schools.js';

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Concurrency Test School ${randomUUID()}`,
      subdomain: `concur-${randomUUID().slice(0, 8)}`,
    },
  });
}

const createdSchoolIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.deleteMany({ where: { schoolId } }),
    );
  }
  await safeDeleteSchools(prisma, createdSchoolIds);
});

describe('B5 — concurrent session activation (DoD item 2, data integrity)', () => {
  it('exactly one of two concurrently-activated sessions ends up CURRENT; the delayed one is rejected by the database', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);

    const [sessionA, sessionB] = await withTenant(prisma, school.id, async (tx) => [
      await tx.academicSession.create({
        data: {
          schoolId: school.id,
          name: `Concur A ${randomUUID().slice(0, 6)}`,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-07-31'),
        },
      }),
      await tx.academicSession.create({
        data: {
          schoolId: school.id,
          name: `Concur B ${randomUUID().slice(0, 6)}`,
          startDate: new Date('2027-09-01'),
          endDate: new Date('2028-07-31'),
        },
      }),
    ]);

    // The delayed transaction: reads the (empty) current-session state,
    // sleeps — deliberately holding no lock during the sleep, since the
    // read is a plain SELECT — then attempts to activate session A. By the
    // time it wakes, the fast transaction below has already committed
    // session B as CURRENT, so this UPDATE must collide with the partial
    // unique index.
    const delayedActivation = withTenant(prisma, school.id, async (tx) => {
      await tx.academicSession.findFirst({ where: { schoolId: school.id, status: 'CURRENT' } });
      await tx.$executeRaw`SELECT pg_sleep(0.5)`;
      return tx.academicSession.update({ where: { id: sessionA.id }, data: { status: 'CURRENT' } });
    });

    // The fast transaction: no delay, commits well within the other's sleep
    // window.
    const fastActivation = withTenant(prisma, school.id, async (tx) => {
      await tx.academicSession.findFirst({ where: { schoolId: school.id, status: 'CURRENT' } });
      return tx.academicSession.update({ where: { id: sessionB.id }, data: { status: 'CURRENT' } });
    });

    const [delayedResult, fastResult] = await Promise.allSettled([
      delayedActivation,
      fastActivation,
    ]);

    expect(fastResult.status).toBe('fulfilled');
    expect(delayedResult.status).toBe('rejected');
    if (delayedResult.status === 'rejected') {
      expect(delayedResult.reason).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((delayedResult.reason as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
    }

    // The invariant that actually matters: never zero, never two.
    const currentSessions = await withTenant(prisma, school.id, (tx) =>
      tx.academicSession.findMany({ where: { schoolId: school.id, status: 'CURRENT' } }),
    );
    expect(currentSessions).toHaveLength(1);
    expect(currentSessions[0]?.id).toBe(sessionB.id);
  });
});
