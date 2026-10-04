/**
 * F20 (DoD 3; owner decision 2026-10-03) — the LARGER_TEXT accommodation
 * (07 §9.7): staff-granted, never self-selected, audited like B13's extra
 * time, surfaced on the roster staff grant it from.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma, withTenant } from '@atlas/db';
import {
  SecurityFixture,
  bootSecurityApp,
  call,
  type FixtureSchool,
} from '../../test-support/security-fixture.js';
import { ownerPrisma } from '../../test-support/owner-prisma.js';

let app: NestFastifyApplication;
const fixture = new SecurityFixture();
let school: FixtureSchool;
let examSessionId: string;
let studentProfileId: string;

beforeAll(async () => {
  app = await bootSecurityApp();
  school = await fixture.createSchool('accom');
  const sid = school.schoolId;
  const suffix = randomUUID().slice(0, 6);
  await withTenant(prisma, sid, async (tx) => {
    const session = await tx.academicSession.create({
      data: {
        schoolId: sid,
        name: `Acc ${suffix}`,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      },
    });
    const term = await tx.academicTerm.create({
      data: {
        schoolId: sid,
        academicSessionId: session.id,
        name: 'First Term',
        sequence: 1,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      },
    });
    const subject = await tx.subject.create({
      data: { schoolId: sid, name: 'Mathematics', code: `A-${suffix}` },
    });
    const exam = await tx.exam.create({
      data: {
        schoolId: sid,
        academicSessionId: session.id,
        academicTermId: term.id,
        subjectId: subject.id,
        title: `Accommodations ${suffix}`,
        examType: 'Test',
        durationSeconds: 1800,
        resultPolicy: 'TEACHER',
        resultDetailVisibility: 'SCORE_ONLY',
        createdByMembershipId: school.users.TEACHER.membershipId,
        status: 'OPEN',
      },
    });
    const examSession = await tx.examSession.create({
      data: {
        schoolId: sid,
        examId: exam.id,
        openedByMembershipId: school.users.TEACHER.membershipId,
      },
    });
    examSessionId = examSession.id;
    const profile = await tx.studentProfile.findFirstOrThrow({
      where: { schoolId: sid, membershipId: school.users.STUDENT.membershipId },
    });
    studentProfileId = profile.id;
    await tx.examSessionParticipant.create({
      data: { schoolId: sid, examSessionId, studentProfileId },
    });
  });
});

afterAll(async () => {
  await fixture.cleanup();
  await app.close();
});

const url = () => `/exam-sessions/${examSessionId}/participants/${studentProfileId}/larger-text`;

describe('F20 larger-text accommodation', () => {
  it('the exam owner grants it, it is recorded and audited', async () => {
    const teacher = await fixture.loginAs(app, school, 'TEACHER');
    const res = await call(app, teacher, 'POST', url(), { largerText: true });
    expect(res.statusCode).toBe(200);

    const row = await withTenant(prisma, school.schoolId, (tx) =>
      tx.examSessionParticipant.findFirstOrThrow({
        where: { schoolId: school.schoolId, examSessionId, studentProfileId },
      }),
    );
    expect(row.largerText).toBe(true);
    expect(row.largerTextGrantedByMembershipId).toBe(school.users.TEACHER.membershipId);

    const audit = await ownerPrisma().auditEvent.findFirst({
      where: { schoolId: school.schoolId, action: 'ATTEMPT_LARGER_TEXT_GRANTED' },
    });
    expect(audit?.metadata).toMatchObject({ studentProfileId, largerText: true });
  });

  it('is never self-selected: a student cannot grant it (07 §9.7)', async () => {
    const student = await fixture.loginAs(app, school, 'STUDENT');
    const res = await call(app, student, 'POST', url(), { largerText: false });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a body that is not a boolean', async () => {
    const teacher = await fixture.loginAs(app, school, 'TEACHER');
    const res = await call(app, teacher, 'POST', url(), { largerText: 'yes' });
    expect(res.statusCode).toBe(400);
  });
});
