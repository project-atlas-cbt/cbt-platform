/**
 * ADR-0037 (owner decision 2026-10-08): an exam is private to its author,
 * the teachers delegated to run it, the HOD of its department and the
 * school's Admin and Moderators. Before it, every teacher of one of the
 * exam's class-subjects could list and open a colleague's exam (`exam.viewAll`
 * was ASSIGNED), and the builder then offered edits the server refused.
 *
 * Layout: department D with subject S; subject N has no department. Class A
 * offers both. The author and the fixture Teacher (the co-teacher) both teach
 * A·S and A·N. A third teacher teaches nothing here and is delegated to run
 * exam E1. The fixture HOD heads D and also teaches.
 *
 * - E1: S (department D), by the author.
 * - E2: N (no department), by the author.
 * - E3: N (no department), by the HOD.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma, withTenant } from '@atlas/db';
import {
  bootSecurityApp,
  call,
  nextIp,
  SecurityFixture,
  type Ctx,
  type FixtureSchool,
} from '../../test-support/security-fixture.js';

let app: NestFastifyApplication;
const fixture = new SecurityFixture();
let school: FixtureSchool;
const exams = { e1: '', e2: '', e3: '' };
const ctx: Record<'admin' | 'moderator' | 'hod' | 'author' | 'coTeacher' | 'delegate', Ctx> =
  {} as never;

beforeAll(async () => {
  app = await bootSecurityApp();
  school = await fixture.createSchool('exam-visibility');
  const sid = school.schoolId;
  const suffix = randomUUID().slice(0, 6);
  const author = await fixture.addTeacher(school, 'author');
  const delegate = await fixture.addTeacher(school, 'delegate');

  await withTenant(prisma, sid, async (tx) => {
    const session = await tx.academicSession.create({
      data: {
        schoolId: sid,
        name: `S-${suffix}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
      },
    });
    const term = await tx.academicTerm.create({
      data: {
        schoolId: sid,
        academicSessionId: session.id,
        name: 'First Term',
        sequence: 1,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-15'),
      },
    });
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
    const loose = await tx.subject.create({
      data: { schoolId: sid, name: `Civic ${suffix}`, code: `CV${suffix}` },
    });
    const classA = await tx.classGroup.create({
      data: { schoolId: sid, academicSessionId: session.id, name: 'SS1A', level: 'SS1', arm: 'A' },
    });
    const offer = (subjectId: string) =>
      tx.classSubject.create({
        data: { schoolId: sid, classId: classA.id, subjectId, academicSessionId: session.id },
      });
    const csScience = await offer(science.id);
    const csLoose = await offer(loose.id);

    const coTeacher = await tx.teacherProfile.findUniqueOrThrow({
      where: {
        schoolId_membershipId: { schoolId: sid, membershipId: school.users.TEACHER.membershipId },
      },
    });
    const hodProfile = await tx.teacherProfile.findUniqueOrThrow({
      where: {
        schoolId_membershipId: { schoolId: sid, membershipId: school.users.HOD.membershipId },
      },
    });
    await tx.roleAssignment.create({
      data: { schoolId: sid, membershipId: school.users.HOD.membershipId, role: 'TEACHER' },
    });
    for (const teacherProfileId of [author.teacherProfileId, coTeacher.id, hodProfile.id]) {
      for (const classSubjectId of [csScience.id, csLoose.id]) {
        await tx.teacherAssignment.create({
          data: {
            schoolId: sid,
            teacherProfileId,
            classSubjectId,
            academicSessionId: session.id,
            startDate: new Date('2026-09-01'),
          },
        });
      }
    }
    await tx.hODAssignment.create({
      data: {
        schoolId: sid,
        membershipId: school.users.HOD.membershipId,
        departmentId: dept.id,
        academicSessionId: session.id,
        startDate: new Date('2026-09-01'),
      },
    });

    const exam = async (
      title: string,
      subjectId: string,
      departmentId: string | null,
      createdByMembershipId: string,
      classSubjectId: string,
    ) => {
      const row = await tx.exam.create({
        data: {
          schoolId: sid,
          academicSessionId: session.id,
          academicTermId: term.id,
          subjectId,
          departmentId,
          title,
          examType: 'CA',
          durationSeconds: 1800,
          resultPolicy: 'TEACHER',
          resultDetailVisibility: 'SCORE_ONLY',
          createdByMembershipId,
        },
      });
      await tx.examClass.create({ data: { schoolId: sid, examId: row.id, classSubjectId } });
      return row.id;
    };
    exams.e1 = await exam('E1', science.id, dept.id, author.membershipId, csScience.id);
    exams.e2 = await exam('E2', loose.id, null, author.membershipId, csLoose.id);
    exams.e3 = await exam('E3', loose.id, null, school.users.HOD.membershipId, csLoose.id);

    await tx.examAdministrator.create({
      data: {
        schoolId: sid,
        examId: exams.e1,
        membershipId: delegate.membershipId,
        assignedByMembershipId: author.membershipId,
      },
    });
  });

  ctx.admin = await fixture.loginAs(app, school, 'SCHOOL_ADMIN');
  ctx.moderator = await fixture.loginAs(app, school, 'MODERATOR');
  ctx.hod = await fixture.loginAs(app, school, 'HOD');
  ctx.coTeacher = await fixture.loginAs(app, school, 'TEACHER');
  ctx.author = (await fixture.loginIdentifier(app, school, author.identifier, nextIp())).ctx;
  ctx.delegate = (await fixture.loginIdentifier(app, school, delegate.identifier, nextIp())).ctx;
});

afterAll(async () => {
  await app.close();
  await fixture.cleanup();
});

async function listed(who: keyof typeof ctx): Promise<string[]> {
  const res = await call(app, ctx[who], 'GET', '/exams?pageSize=100');
  expect(res.statusCode, who).toBe(200);
  const titles = res.json<{ exams: { title: string }[] }>().exams.map((e) => e.title);
  return titles.sort();
}

async function status(who: keyof typeof ctx, url: string): Promise<number> {
  return (await call(app, ctx[who], 'GET', url)).statusCode;
}

describe('who sees which exam', () => {
  it('School Admin and Moderator see every exam', async () => {
    expect(await listed('admin')).toEqual(['E1', 'E2', 'E3']);
    expect(await listed('moderator')).toEqual(['E1', 'E2', 'E3']);
  });

  it('the author sees their own exams', async () => {
    expect(await listed('author')).toEqual(['E1', 'E2']);
    expect(await status('author', `/exams/${exams.e1}`)).toBe(200);
  });

  it("a teacher of the same class and subject does not see a colleague's exam", async () => {
    expect(await listed('coTeacher')).toEqual([]);
    for (const id of [exams.e1, exams.e2]) {
      expect(await status('coTeacher', `/exams/${id}`)).toBe(404);
      expect(await status('coTeacher', `/exams/${id}/readiness`)).toBe(404);
      expect(await status('coTeacher', `/exams/${id}/available-questions`)).toBe(404);
      expect(await status('coTeacher', `/exams/${id}/results`)).toBe(404);
    }
  });

  it('a delegated teacher sees the exam they were asked to run, and nothing else', async () => {
    expect(await listed('delegate')).toEqual(['E1']);
    expect(await status('delegate', `/exams/${exams.e1}`)).toBe(200);
    expect(await status('delegate', `/exams/${exams.e2}`)).toBe(404);
  });

  it('an HOD who also teaches sees their department plus their own exams, not an undepartmented colleague exam', async () => {
    expect(await listed('hod')).toEqual(['E1', 'E3']);
    expect(await status('hod', `/exams/${exams.e1}`)).toBe(200);
    expect(await status('hod', `/exams/${exams.e3}`)).toBe(200);
    expect(await status('hod', `/exams/${exams.e2}`)).toBe(404);
  });
});

describe("a co-teacher cannot act on a colleague's exam", () => {
  it('edits, publishing and the control centre are refused', async () => {
    const edit = await call(app, ctx.coTeacher, 'PATCH', `/exams/${exams.e1}`, { title: 'x' });
    expect(edit.statusCode).toBeGreaterThanOrEqual(403);
    const publish = await call(
      app,
      ctx.coTeacher,
      'POST',
      `/exams/${exams.e1}/results/publish`,
      {},
    );
    expect(publish.statusCode).toBeGreaterThanOrEqual(403);
    expect(await status('coTeacher', `/exams/${exams.e1}/control`)).toBeGreaterThanOrEqual(403);
  });
});
