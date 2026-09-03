/**
 * B10's own, buildable-now background job — "students missing a class
 * assignment" digest for Moderator (05 §57/04 §64). Runs against real
 * Postgres (RLS included, via the shared `prisma` singleton — same
 * convention as `subscription-expiry.integration.test.ts`).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@atlas/db';
import { runUnassignedStudentsDigest } from './unassigned-students-digest.queue.js';

const ownerDatabaseUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

interface FixtureSchool {
  schoolId: string;
  moderatorUserId: string;
  sessionId: string;
  classId: string;
}

/** One school, one CURRENT session, one class, one Moderator. */
async function createFixtureSchool(): Promise<FixtureSchool> {
  const suffix = randomUUID();
  const school = await prisma.school.create({
    data: { name: `Digest Test School ${suffix}`, subdomain: `digest-${suffix}` },
  });

  return withTenant(prisma, school.id, async (tx) => {
    const session = await tx.academicSession.create({
      data: {
        schoolId: school.id,
        name: `Digest ${suffix.slice(0, 8)}`,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        status: 'CURRENT',
      },
    });
    const classGroup = await tx.classGroup.create({
      data: {
        schoolId: school.id,
        academicSessionId: session.id,
        name: `Digest ${suffix.slice(0, 8)}`,
        level: 'SS2',
        arm: 'A',
      },
    });

    const moderatorUser = await tx.user.create({
      data: {
        firstName: 'Digest',
        lastName: 'Moderator',
        displayName: 'Digest Moderator',
        email: `moderator-${suffix}@example.com`,
        status: 'ACTIVE',
        credentialState: 'OK',
      },
    });
    const moderatorMembership = await tx.schoolMembership.create({
      data: {
        schoolId: school.id,
        userId: moderatorUser.id,
        loginIdentifier: `digest-moderator-${suffix}`,
        status: 'ACTIVE',
      },
    });
    await tx.roleAssignment.create({
      data: { schoolId: school.id, membershipId: moderatorMembership.id, role: 'MODERATOR' },
    });

    return {
      schoolId: school.id,
      moderatorUserId: moderatorUser.id,
      sessionId: session.id,
      classId: classGroup.id,
    };
  });
}

async function createStudent(
  schoolId: string,
  opts: { enrolled: boolean; classId: string; sessionId: string },
): Promise<string> {
  const suffix = randomUUID();
  return withTenant(prisma, schoolId, async (tx) => {
    const user = await tx.user.create({
      data: {
        firstName: 'Digest',
        lastName: 'Student',
        displayName: 'Digest Student',
        status: 'ACTIVE',
        credentialState: 'MUST_CHANGE_PASSWORD',
      },
    });
    const membership = await tx.schoolMembership.create({
      data: {
        schoolId,
        userId: user.id,
        loginIdentifier: `digest-student-${suffix}`,
        status: 'ACTIVE',
      },
    });
    await tx.roleAssignment.create({
      data: { schoolId, membershipId: membership.id, role: 'STUDENT' },
    });
    const studentProfile = await tx.studentProfile.create({
      data: { schoolId, membershipId: membership.id, studentId: `DG-${suffix.slice(0, 8)}` },
    });
    if (opts.enrolled) {
      await tx.studentEnrollment.create({
        data: {
          schoolId,
          studentProfileId: studentProfile.id,
          academicSessionId: opts.sessionId,
          classId: opts.classId,
          startDate: new Date(),
        },
      });
    }
    return studentProfile.id;
  });
}

async function cleanupSchool(schoolId: string): Promise<void> {
  const userIds = await withTenant(prisma, schoolId, (tx) =>
    tx.schoolMembership.findMany({ where: { schoolId }, select: { userId: true } }),
  );
  await withTenant(prisma, schoolId, async (tx) => {
    await tx.notification.deleteMany({ where: { schoolId } });
    await tx.studentEnrollment.deleteMany({ where: { schoolId } });
    await tx.studentProfile.deleteMany({ where: { schoolId } });
    await tx.roleAssignment.deleteMany({ where: { schoolId } });
    await tx.classGroup.deleteMany({ where: { schoolId } });
    await tx.academicSession.deleteMany({ where: { schoolId } });
  });
  await prisma.school.delete({ where: { id: schoolId } });
  for (const { userId } of userIds) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

describe.skipIf(!ownerDatabaseUrl)('unassigned-students digest (B10)', () => {
  const schools: string[] = [];

  afterAll(async () => {
    for (const schoolId of schools) {
      await cleanupSchool(schoolId).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('notifies every active Moderator when unassigned students exist', async () => {
    const school = await createFixtureSchool();
    schools.push(school.schoolId);
    await createStudent(school.schoolId, {
      enrolled: false,
      classId: school.classId,
      sessionId: school.sessionId,
    });
    await createStudent(school.schoolId, {
      enrolled: true,
      classId: school.classId,
      sessionId: school.sessionId,
    });

    await runUnassignedStudentsDigest();

    const notifications = await withTenant(prisma, school.schoolId, (tx) =>
      tx.notification.findMany({
        where: { schoolId: school.schoolId, type: 'STUDENTS_UNASSIGNED' },
      }),
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.recipientUserId).toBe(school.moderatorUserId);
    expect(notifications[0]?.content).toContain('1 student(s)');
  });

  it('does not re-notify on a second tick when the count has not changed', async () => {
    const school = await createFixtureSchool();
    schools.push(school.schoolId);
    await createStudent(school.schoolId, {
      enrolled: false,
      classId: school.classId,
      sessionId: school.sessionId,
    });

    await runUnassignedStudentsDigest();
    await runUnassignedStudentsDigest();

    const notifications = await withTenant(prisma, school.schoolId, (tx) =>
      tx.notification.findMany({
        where: { schoolId: school.schoolId, type: 'STUDENTS_UNASSIGNED' },
      }),
    );
    expect(notifications).toHaveLength(1);
  });

  it('notifies again when the count genuinely changes', async () => {
    const school = await createFixtureSchool();
    schools.push(school.schoolId);
    await createStudent(school.schoolId, {
      enrolled: false,
      classId: school.classId,
      sessionId: school.sessionId,
    });
    await runUnassignedStudentsDigest();

    await createStudent(school.schoolId, {
      enrolled: false,
      classId: school.classId,
      sessionId: school.sessionId,
    });
    await runUnassignedStudentsDigest();

    const notifications = await withTenant(prisma, school.schoolId, (tx) =>
      tx.notification.findMany({
        where: { schoolId: school.schoolId, type: 'STUDENTS_UNASSIGNED' },
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(notifications).toHaveLength(2);
    expect(notifications[0]?.content).toContain('1 student(s)');
    expect(notifications[1]?.content).toContain('2 student(s)');
  });

  it('never notifies when every student is enrolled', async () => {
    const school = await createFixtureSchool();
    schools.push(school.schoolId);
    await createStudent(school.schoolId, {
      enrolled: true,
      classId: school.classId,
      sessionId: school.sessionId,
    });

    await runUnassignedStudentsDigest();

    const notifications = await withTenant(prisma, school.schoolId, (tx) =>
      tx.notification.findMany({
        where: { schoolId: school.schoolId, type: 'STUDENTS_UNASSIGNED' },
      }),
    );
    expect(notifications).toHaveLength(0);
  });
});
