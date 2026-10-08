/**
 * Record-level scope for the class roster and related lookups
 * (`people-scope.util.ts`, 2026-10-08). Before it, a Teacher or Student
 * could read any class's roster (names and Login IDs) by its id, because
 * `assignments.view` was only checked at the route.
 *
 * Layout: department D (subject S); class A offers S, taught by the
 * fixture Teacher and headed (via S) by the fixture HOD; class B offers an
 * unrelated subject nobody here teaches. The fixture Student is in A; a
 * second student is in B; a second teacher teaches B.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma, withTenant } from '@atlas/db';
import {
  bootSecurityApp,
  call,
  SecurityFixture,
  type Ctx,
  type FixtureSchool,
} from '../../test-support/security-fixture.js';

let app: NestFastifyApplication;
const fixture = new SecurityFixture();
let school: FixtureSchool;
const ids = {
  classA: '',
  classB: '',
  studentA: '',
  studentB: '',
  teacherA: '',
  teacherB: '',
};
const ctx: Partial<Record<'SCHOOL_ADMIN' | 'MODERATOR' | 'HOD' | 'TEACHER' | 'STUDENT', Ctx>> = {};

beforeAll(async () => {
  app = await bootSecurityApp();
  school = await fixture.createSchool('people-scope');
  const sid = school.schoolId;
  const suffix = randomUUID().slice(0, 6);
  const otherUser = await prisma.user.create({
    data: {
      firstName: 'Other',
      lastName: 'Student',
      displayName: 'Other Student',
      status: 'ACTIVE',
      credentialState: 'OK',
    },
  });
  const otherTeacherUser = await prisma.user.create({
    data: {
      firstName: 'Other',
      lastName: 'Teacher',
      displayName: 'Other Teacher',
      status: 'ACTIVE',
      credentialState: 'OK',
    },
  });
  fixture.userIds.push(otherUser.id, otherTeacherUser.id);

  await withTenant(prisma, sid, async (tx) => {
    const session = await tx.academicSession.create({
      data: {
        schoolId: sid,
        name: `S-${suffix}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
      },
    });
    const sessionId = session.id;
    const start = new Date('2026-09-01');
    const dept = await tx.department.create({
      data: { schoolId: sid, name: `Sciences ${suffix}`, code: `SC${suffix}` },
    });
    const science = await tx.subject.create({
      data: {
        schoolId: sid,
        name: `Physics ${suffix}`,
        code: `PH${suffix}`,
        departmentId: dept.id,
      },
    });
    const art = await tx.subject.create({
      data: { schoolId: sid, name: `Fine Art ${suffix}`, code: `FA${suffix}` },
    });
    const classA = await tx.classGroup.create({
      data: { schoolId: sid, academicSessionId: sessionId, name: 'SS1A', level: 'SS1', arm: 'A' },
    });
    const classB = await tx.classGroup.create({
      data: { schoolId: sid, academicSessionId: sessionId, name: 'JSS3B', level: 'JSS3', arm: 'B' },
    });
    const csA = await tx.classSubject.create({
      data: {
        schoolId: sid,
        classId: classA.id,
        subjectId: science.id,
        academicSessionId: sessionId,
      },
    });
    const csB = await tx.classSubject.create({
      data: { schoolId: sid, classId: classB.id, subjectId: art.id, academicSessionId: sessionId },
    });

    const teacherA = await tx.teacherProfile.findUniqueOrThrow({
      where: {
        schoolId_membershipId: { schoolId: sid, membershipId: school.users.TEACHER.membershipId },
      },
    });
    await tx.teacherAssignment.create({
      data: {
        schoolId: sid,
        teacherProfileId: teacherA.id,
        classSubjectId: csA.id,
        academicSessionId: sessionId,
        startDate: start,
      },
    });
    const otherTeacherMembership = await tx.schoolMembership.create({
      data: {
        schoolId: sid,
        userId: otherTeacherUser.id,
        loginIdentifier: `OT-${suffix}`,
        status: 'ACTIVE',
      },
    });
    await tx.roleAssignment.create({
      data: { schoolId: sid, membershipId: otherTeacherMembership.id, role: 'TEACHER' },
    });
    const teacherB = await tx.teacherProfile.create({
      data: { schoolId: sid, membershipId: otherTeacherMembership.id, staffId: `OT-${suffix}` },
    });
    await tx.teacherAssignment.create({
      data: {
        schoolId: sid,
        teacherProfileId: teacherB.id,
        classSubjectId: csB.id,
        academicSessionId: sessionId,
        startDate: start,
      },
    });
    await tx.hODAssignment.create({
      data: {
        schoolId: sid,
        membershipId: school.users.HOD.membershipId,
        departmentId: dept.id,
        academicSessionId: sessionId,
        startDate: start,
      },
    });

    const studentA = await tx.studentProfile.findUniqueOrThrow({
      where: {
        schoolId_membershipId: { schoolId: sid, membershipId: school.users.STUDENT.membershipId },
      },
    });
    await tx.studentEnrollment.create({
      data: {
        schoolId: sid,
        studentProfileId: studentA.id,
        classId: classA.id,
        academicSessionId: sessionId,
        startDate: start,
      },
    });
    const otherMembership = await tx.schoolMembership.create({
      data: {
        schoolId: sid,
        userId: otherUser.id,
        loginIdentifier: `OS-${suffix}`,
        status: 'ACTIVE',
      },
    });
    await tx.roleAssignment.create({
      data: { schoolId: sid, membershipId: otherMembership.id, role: 'STUDENT' },
    });
    const studentB = await tx.studentProfile.create({
      data: { schoolId: sid, membershipId: otherMembership.id, studentId: `OS-${suffix}` },
    });
    await tx.studentEnrollment.create({
      data: {
        schoolId: sid,
        studentProfileId: studentB.id,
        classId: classB.id,
        academicSessionId: sessionId,
        startDate: start,
      },
    });

    Object.assign(ids, {
      classA: classA.id,
      classB: classB.id,
      studentA: studentA.id,
      studentB: studentB.id,
      teacherA: teacherA.id,
      teacherB: teacherB.id,
    });
  });

  for (const role of ['SCHOOL_ADMIN', 'MODERATOR', 'HOD', 'TEACHER', 'STUDENT'] as const) {
    ctx[role] = await fixture.loginAs(app, school, role);
  }
});

afterAll(async () => {
  await app.close();
  await fixture.cleanup();
});

async function status(role: keyof typeof ctx, url: string): Promise<number> {
  const res = await call(app, ctx[role]!, 'GET', url);
  return res.statusCode;
}

describe('class roster and class teachers', () => {
  const urls = (classId: string) => [
    `/classes/${classId}/students`,
    `/classes/${classId}/teachers`,
  ];

  it('School Admin and Moderator see every class', async () => {
    for (const role of ['SCHOOL_ADMIN', 'MODERATOR'] as const) {
      for (const url of [...urls(ids.classA), ...urls(ids.classB)]) {
        expect(await status(role, url), `${role} ${url}`).toBe(200);
      }
    }
  });

  it('a Teacher sees only the classes they teach', async () => {
    for (const url of urls(ids.classA)) expect(await status('TEACHER', url), url).toBe(200);
    for (const url of urls(ids.classB)) expect(await status('TEACHER', url), url).toBe(403);
  });

  it("an HOD sees only classes offering their department's subjects", async () => {
    for (const url of urls(ids.classA)) expect(await status('HOD', url), url).toBe(200);
    for (const url of urls(ids.classB)) expect(await status('HOD', url), url).toBe(403);
  });

  it('a Student cannot read any roster, not even their own class', async () => {
    for (const url of [...urls(ids.classA), ...urls(ids.classB)]) {
      expect(await status('STUDENT', url), url).toBe(403);
    }
  });

  it('the roster a Teacher may read lists their class only', async () => {
    const res = await call(app, ctx.TEACHER!, 'GET', `/classes/${ids.classA}/students`);
    const body = res.json<{ students: { studentProfileId: string }[] }>();
    expect(body.students.map((s) => s.studentProfileId)).toEqual([ids.studentA]);
  });
});

describe("a student's enrollments and subject registrations", () => {
  const urls = (id: string) => [
    `/students/${id}/enrollments`,
    `/students/${id}/subject-registrations`,
  ];

  it('a Student sees their own records and no one else’s', async () => {
    for (const url of urls(ids.studentA)) expect(await status('STUDENT', url), url).toBe(200);
    for (const url of urls(ids.studentB)) expect(await status('STUDENT', url), url).toBe(403);
  });

  it('a Teacher and an HOD cannot read a student outside their classes', async () => {
    for (const role of ['TEACHER', 'HOD'] as const) {
      expect(await status(role, `/students/${ids.studentB}/enrollments`), role).toBe(403);
    }
  });

  it('a Teacher and an HOD can read the enrollments of a student in their class', async () => {
    for (const role of ['TEACHER', 'HOD'] as const) {
      expect(await status(role, `/students/${ids.studentA}/enrollments`), role).toBe(200);
    }
  });

  it('School Admin sees any student', async () => {
    for (const url of [...urls(ids.studentA), ...urls(ids.studentB)]) {
      expect(await status('SCHOOL_ADMIN', url), url).toBe(200);
    }
  });
});

describe("a teacher's assignments", () => {
  it('a Teacher sees only their own', async () => {
    expect(await status('TEACHER', `/teachers/${ids.teacherA}/assignments`)).toBe(200);
    expect(await status('TEACHER', `/teachers/${ids.teacherB}/assignments`)).toBe(403);
  });

  it("an HOD sees teachers of their department's subjects only", async () => {
    expect(await status('HOD', `/teachers/${ids.teacherA}/assignments`)).toBe(200);
    expect(await status('HOD', `/teachers/${ids.teacherB}/assignments`)).toBe(403);
  });

  it('a Student sees no teacher’s assignments', async () => {
    expect(await status('STUDENT', `/teachers/${ids.teacherA}/assignments`)).toBe(403);
  });
});
