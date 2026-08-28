/**
 * B6 roadmap Testing requirements table / DoD item 9: "A student cannot be
 * enrolled twice concurrently in one session."
 *
 * Mirrors session-activation-concurrency.integration.test.ts's own
 * technique exactly: an ordinary `Promise.all([app.inject(...), ...])` race
 * isn't deterministic enough to reliably prove a database-level guarantee,
 * so this forces a real overlap directly against Postgres with an explicit
 * `pg_sleep` between one transaction's read and its write, and asserts the
 * outcome the partial unique index
 * (`student_enrollments_one_active_per_session`) is responsible for: exactly
 * one ACTIVE enrollment survives, and the delayed transaction's own insert
 * is the one Postgres rejects.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma, withTenant, Prisma } from '@atlas/db';

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Enrollment Concurrency School ${randomUUID()}`,
      subdomain: `enrconc-${randomUUID().slice(0, 8)}`,
    },
  });
}

const createdSchoolIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, (tx) =>
      tx.studentEnrollment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) => tx.classGroup.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.roleAssignment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.deleteMany({ where: { schoolId } }),
    );
  }
  await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
});

describe('B6 — concurrent student enrollment (DoD item 9, data integrity)', () => {
  it('exactly one of two concurrent enrollment attempts for the same (student, session) survives; the delayed one is rejected by the database', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);

    const session = await withTenant(prisma, school.id, (tx) =>
      tx.academicSession.create({
        data: {
          schoolId: school.id,
          name: `Concur ${randomUUID().slice(0, 6)}`,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-07-31'),
        },
      }),
    );
    const [classA, classB] = await withTenant(prisma, school.id, async (tx) => [
      await tx.classGroup.create({
        data: {
          schoolId: school.id,
          academicSessionId: session.id,
          name: 'SS2A',
          level: 'SS2',
          arm: 'A',
        },
      }),
      await tx.classGroup.create({
        data: {
          schoolId: school.id,
          academicSessionId: session.id,
          name: 'SS2B',
          level: 'SS2',
          arm: 'B',
        },
      }),
    ]);

    const user = await prisma.user.create({
      data: { firstName: 'C', lastName: 'D', displayName: 'C D', status: 'ACTIVE' },
    });
    const membership = await withTenant(prisma, school.id, (tx) =>
      tx.schoolMembership.create({
        data: {
          schoolId: school.id,
          userId: user.id,
          loginIdentifier: `concur-${randomUUID().slice(0, 6)}`,
          status: 'ACTIVE',
        },
      }),
    );
    const studentProfile = await withTenant(prisma, school.id, (tx) =>
      tx.studentProfile.create({
        data: {
          schoolId: school.id,
          membershipId: membership.id,
          studentId: `ST-${randomUUID().slice(0, 6)}`,
        },
      }),
    );

    // The delayed transaction: reads the (empty) active-enrollment state,
    // sleeps, then attempts to enroll into classA. By the time it wakes,
    // the fast transaction has already committed the classB enrollment as
    // ACTIVE, so this INSERT must collide with the partial unique index.
    const delayedEnrollment = withTenant(prisma, school.id, async (tx) => {
      await tx.studentEnrollment.findFirst({
        where: {
          schoolId: school.id,
          studentProfileId: studentProfile.id,
          academicSessionId: session.id,
          status: 'ACTIVE',
        },
      });
      await tx.$executeRaw`SELECT pg_sleep(0.5)`;
      return tx.studentEnrollment.create({
        data: {
          schoolId: school.id,
          studentProfileId: studentProfile.id,
          academicSessionId: session.id,
          classId: classA.id,
          startDate: new Date(),
        },
      });
    });

    const fastEnrollment = withTenant(prisma, school.id, async (tx) => {
      await tx.studentEnrollment.findFirst({
        where: {
          schoolId: school.id,
          studentProfileId: studentProfile.id,
          academicSessionId: session.id,
          status: 'ACTIVE',
        },
      });
      return tx.studentEnrollment.create({
        data: {
          schoolId: school.id,
          studentProfileId: studentProfile.id,
          academicSessionId: session.id,
          classId: classB.id,
          startDate: new Date(),
        },
      });
    });

    const [delayedResult, fastResult] = await Promise.allSettled([
      delayedEnrollment,
      fastEnrollment,
    ]);

    expect(fastResult.status).toBe('fulfilled');
    expect(delayedResult.status).toBe('rejected');
    if (delayedResult.status === 'rejected') {
      expect(delayedResult.reason).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((delayedResult.reason as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
    }

    const activeEnrollments = await withTenant(prisma, school.id, (tx) =>
      tx.studentEnrollment.findMany({
        where: {
          schoolId: school.id,
          studentProfileId: studentProfile.id,
          academicSessionId: session.id,
          status: 'ACTIVE',
        },
      }),
    );
    expect(activeEnrollments).toHaveLength(1);
    expect(activeEnrollments[0]?.classId).toBe(classB.id);
  });
});
