/**
 * B12 — Exam Activation & Control. Mirrors `exam-builder.integration
 * .test.ts`'s own harness exactly (real HTTP via `app.inject()` against a
 * real, running `AppModule` and real Postgres).
 *
 * Covers the roadmap's 14 DoD items plus this phase's own confirmed
 * additions: exam-level close/reopen (with session cascade), the
 * `ExamAdministrator` delegate endpoints, and the concurrent-sessions
 * decision. DoD items 9 (live table)/10 (SSE)/11 (liveness) are asserted
 * only as the honest B12 placeholder — real coverage is B13's job.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import { examControlChannel, type Role } from '@atlas/domain';
import { AppModule } from '../../app.module.js';
import { PasswordService } from '../identity/password.service.js';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { ExamControlStreamService } from './exam-control-stream.service.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
const RUN = Math.floor(Math.random() * 200) + 1;

let app: NestFastifyApplication;
const passwords = new PasswordService();

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
});

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Exam Control Test School ${randomUUID()}`,
      subdomain: `exc-${randomUUID().slice(0, 8)}`,
      status: 'ACTIVE',
    },
  });
}

async function seedUser(opts: {
  schoolId: string;
  loginIdentifier: string;
  password: string;
  role: Role;
}) {
  const passwordHash = await passwords.hash(opts.password);
  const user = await prisma.user.create({
    data: {
      firstName: 'Test',
      lastName: 'User',
      displayName: `Test User ${opts.loginIdentifier}`,
      passwordHash,
      status: 'ACTIVE',
      credentialState: 'OK',
    },
  });
  const membership = await withTenant(prisma, opts.schoolId, (tx) =>
    tx.schoolMembership.create({
      data: {
        schoolId: opts.schoolId,
        userId: user.id,
        loginIdentifier: opts.loginIdentifier,
        status: 'ACTIVE',
      },
    }),
  );
  await withTenant(prisma, opts.schoolId, (tx) =>
    tx.roleAssignment.create({
      data: { schoolId: opts.schoolId, membershipId: membership.id, role: opts.role },
    }),
  );
  return { user, membership };
}

async function userIdForMembership(schoolId: string, membershipId: string): Promise<string> {
  const membership = await withTenant(prisma, schoolId, (tx) =>
    tx.schoolMembership.findUniqueOrThrow({ where: { id: membershipId } }),
  );
  return membership.userId;
}

function extractCookie(setCookie: string | string[] | undefined, name: string): string | undefined {
  const headers = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const header of headers) {
    const value = parseCookie(header.split(';')[0] ?? '')[name];
    if (value) return value;
  }
  return undefined;
}

interface RequestCtx {
  host: string;
  remoteAddress: string;
  csrfCookie: string;
  csrfToken: string;
  sessionCookie?: string;
}

async function freshCtx(host: string, remoteAddress: string): Promise<RequestCtx> {
  const res = await app.inject({
    method: 'GET',
    url: '/tenant/resolve',
    headers: { host },
    remoteAddress,
  });
  const body = res.json<{ csrfToken: string }>();
  const csrfCookie = extractCookie(res.headers['set-cookie'], '_csrf');
  if (!csrfCookie) throw new Error('tenant/resolve did not set a _csrf cookie');
  return { host, remoteAddress, csrfCookie, csrfToken: body.csrfToken };
}

function cookieHeader(ctx: RequestCtx): string {
  const parts = [`_csrf=${ctx.csrfCookie}`];
  if (ctx.sessionCookie) parts.push(`atlas_session=${ctx.sessionCookie}`);
  return parts.join('; ');
}

async function post(ctx: RequestCtx, url: string, payload?: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url,
    headers: {
      host: ctx.host,
      cookie: cookieHeader(ctx),
      'x-csrf-token': ctx.csrfToken,
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload !== undefined ? { payload } : {}),
    remoteAddress: ctx.remoteAddress,
  });
}

async function put(ctx: RequestCtx, url: string, payload: Record<string, unknown>) {
  return app.inject({
    method: 'PUT',
    url,
    headers: {
      host: ctx.host,
      cookie: cookieHeader(ctx),
      'x-csrf-token': ctx.csrfToken,
      'content-type': 'application/json',
    },
    payload,
    remoteAddress: ctx.remoteAddress,
  });
}

async function patch(ctx: RequestCtx, url: string, payload: Record<string, unknown>) {
  return app.inject({
    method: 'PATCH',
    url,
    headers: {
      host: ctx.host,
      cookie: cookieHeader(ctx),
      'x-csrf-token': ctx.csrfToken,
      'content-type': 'application/json',
    },
    payload,
    remoteAddress: ctx.remoteAddress,
  });
}

async function del(ctx: RequestCtx, url: string, payload?: Record<string, unknown>) {
  return app.inject({
    method: 'DELETE',
    url,
    headers: {
      host: ctx.host,
      cookie: cookieHeader(ctx),
      'x-csrf-token': ctx.csrfToken,
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload !== undefined ? { payload } : {}),
    remoteAddress: ctx.remoteAddress,
  });
}

async function get(ctx: RequestCtx, url: string) {
  return app.inject({
    method: 'GET',
    url,
    headers: { host: ctx.host, cookie: cookieHeader(ctx) },
    remoteAddress: ctx.remoteAddress,
  });
}

async function login(ctx: RequestCtx, identifier: string, password: string) {
  const res = await post(ctx, '/auth/login', { identifier, password });
  if (res.statusCode === 200) {
    const sessionCookie = extractCookie(res.headers['set-cookie'], 'atlas_session');
    if (sessionCookie) ctx.sessionCookie = sessionCookie;
  }
  return res;
}

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    // This suite produces real ExamSession/ExamSessionParticipant/
    // ExamParticipation/ExamAdministrator rows and APPROVED question
    // revisions — cleanup can't fight the immutability guarantees those
    // carry, so every step is best-effort, matching exam-builder
    // .integration.test.ts's own established precedent.
    await withTenant(prisma, schoolId, (tx) =>
      tx.examAdministrator.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.examParticipation.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.examSessionParticipant.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.examSession.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) => tx.exam.deleteMany({ where: { schoolId } })).catch(
      () => undefined,
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.question.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) => tx.topic.deleteMany({ where: { schoolId } })).catch(
      () => undefined,
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.studentSubjectRegistration.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.studentEnrollment.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.teacherAssignment.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.classSubject.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.hODAssignment.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.classGroup.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.subject.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.department.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.academicTerm.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.notification.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.roleAssignment.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
  await prisma.school
    .deleteMany({ where: { id: { in: createdSchoolIds } } })
    .catch(() => undefined);
});

describe('B12 Exam Activation & Control', () => {
  let schoolId: string;
  let host: string;
  let admin: RequestCtx;
  let teacher: RequestCtx;
  let teacherMembershipId: string;
  let otherTeacher: RequestCtx; // HOD — approves questions, never assigned to any class here
  let plainTeacher: RequestCtx; // No assignment, no HOD role — the genuine "plain denied" actor
  let plainTeacherMembershipId: string;
  let hod: RequestCtx;
  let sessionId: string;
  let classAId: string;
  let mathSubjectId: string;
  let studentProfileId: string;
  let studentMembershipId: string;
  let studentCtx: RequestCtx;
  let approvedRevisionId: string;

  async function buildReadyExam(
    accessMode: 'OPEN_TO_ELIGIBLE' | 'EXPLICIT_AUTHORIZATION',
  ): Promise<string> {
    const examId = (
      await post(teacher, '/exams', {
        academicSessionId: sessionId,
        academicTermId: (await get(admin, '/academics/context')).json<{ term: { id: string } }>()
          .term.id,
        subjectId: mathSubjectId,
        title: `Exam Control Test ${randomUUID().slice(0, 8)}`,
        examType: 'Test',
        classIds: [classAId],
      })
    ).json<{ id: string }>().id;
    await put(teacher, `/exams/${examId}/questions`, {
      questions: [{ questionRevisionId: approvedRevisionId }],
    });
    await put(teacher, `/exams/${examId}/configuration`, {
      durationSeconds: 3600,
      attemptLimit: 1,
      resultPolicy: 'TEACHER',
      resultDetailVisibility: 'SCORE_AND_COUNTS',
      generalInstructions: 'Answer all.',
      navigationInstructions: 'Free navigation.',
      submissionInstructions: 'Submit when done.',
      accessMode,
    });
    const readyRes = await post(teacher, `/exams/${examId}/ready`, {});
    if (readyRes.statusCode !== 200) throw new Error(`ready failed: ${readyRes.body}`);
    return examId;
  }

  /** Mirrors `attempt.integration.test.ts`'s own student-login precedent
   * exactly (real login against a real credential). */
  async function giveStudentLogin(
    membershipId: string,
    remoteAddress: string,
  ): Promise<RequestCtx> {
    const membership = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findUniqueOrThrow({ where: { id: membershipId } }),
    );
    await prisma.user.update({
      where: { id: membership.userId },
      data: {
        passwordHash: await passwords.hash('a-real-password-123'),
        credentialState: 'OK',
        status: 'ACTIVE',
      },
    });
    const ctx = await freshCtx(host, remoteAddress);
    const loginRes = await login(ctx, membership.loginIdentifier, 'a-real-password-123');
    if (loginRes.statusCode !== 200) throw new Error(`student login failed: ${loginRes.body}`);
    return ctx;
  }

  beforeAll(async () => {
    const school = await createSchool();
    schoolId = school.id;
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolId);

    const { user: adminUser } = await seedUser({
      schoolId,
      loginIdentifier: 'excadmin01',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(adminUser.id);
    admin = await freshCtx(host, `10.${RUN}.12.1`);
    await login(admin, 'excadmin01', 'a-real-password-123');

    sessionId = (
      await post(admin, '/academics/sessions', {
        name: `EXC Session ${randomUUID().slice(0, 8)}`,
        startDate: '2026-09-01',
        endDate: '2027-07-31',
      })
    ).json<{ id: string }>().id;
    const termId = (
      await post(admin, `/academics/sessions/${sessionId}/terms`, {
        name: 'First Term',
        sequence: 1,
        startDate: '2026-09-01',
        endDate: '2026-12-15',
      })
    ).json<{ id: string }>().id;
    await post(admin, `/academics/sessions/${sessionId}/activate`);
    await post(admin, `/academics/terms/${termId}/activate`);

    classAId = (
      await post(admin, '/academics/classes', {
        academicSessionId: sessionId,
        name: 'SS2A',
        level: 'SS2',
        arm: 'A',
      })
    ).json<{ id: string }>().id;
    mathSubjectId = (
      await post(admin, '/academics/subjects', {
        name: 'Mathematics',
        code: `MTH-${randomUUID().slice(0, 6)}`,
      })
    ).json<{ id: string }>().id;
    await post(admin, `/academics/classes/${classAId}/subjects`, { subjectId: mathSubjectId });

    const deptId = (
      await post(admin, '/academics/departments', {
        name: `Sciences ${randomUUID().slice(0, 6)}`,
        code: `SCI-${randomUUID().slice(0, 6)}`,
      })
    ).json<{ id: string }>().id;
    await patch(admin, `/academics/subjects/${mathSubjectId}`, { departmentId: deptId });

    const teacherRes = await post(admin, '/teachers', {
      firstName: 'Ade',
      lastName: 'Ola',
      email: `ade-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    const teacherBody = teacherRes.json<{
      teacherProfileId: string;
      membershipId: string;
      loginIdentifier: string;
    }>();
    await prisma.user.update({
      where: { id: await userIdForMembership(schoolId, teacherBody.membershipId) },
      data: {
        passwordHash: await passwords.hash('a-real-password-123'),
        credentialState: 'OK',
        status: 'ACTIVE',
      },
    });
    const classAMathOfferingId = (await get(admin, `/academics/classes/${classAId}/subjects`))
      .json<{ offerings: { id: string; subjectId: string }[] }>()
      .offerings.find((o) => o.subjectId === mathSubjectId)!.id;
    await put(admin, `/teachers/${teacherBody.teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [classAMathOfferingId],
    });
    teacher = await freshCtx(host, `10.${RUN}.12.2`);
    await login(teacher, teacherBody.loginIdentifier, 'a-real-password-123');
    teacherMembershipId = teacherBody.membershipId;

    const otherTeacherRes = await post(admin, '/teachers', {
      firstName: 'Bola',
      lastName: 'Ige',
      email: `bola-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    const otherTeacherBody = otherTeacherRes.json<{
      teacherProfileId: string;
      membershipId: string;
      loginIdentifier: string;
    }>();
    await prisma.user.update({
      where: { id: await userIdForMembership(schoolId, otherTeacherBody.membershipId) },
      data: {
        passwordHash: await passwords.hash('a-real-password-123'),
        credentialState: 'OK',
        status: 'ACTIVE',
      },
    });
    otherTeacher = await freshCtx(host, `10.${RUN}.12.3`);
    await login(otherTeacher, otherTeacherBody.loginIdentifier, 'a-real-password-123');

    // A third teacher with no assignment to classA's Math offering and no
    // HOD role at all — otherTeacher (above) is deliberately promoted to
    // HOD of the exam's own department below, which grants it real
    // DEPARTMENT-scoped examAdmin.controlCenter access (correct per the
    // permission table), so it can't also stand in for "a plain,
    // genuinely unauthorized teacher" in the delegation test.
    const plainTeacherRes = await post(admin, '/teachers', {
      firstName: 'Chidi',
      lastName: 'Eze',
      email: `chidi-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    const plainTeacherBody = plainTeacherRes.json<{
      membershipId: string;
      loginIdentifier: string;
    }>();
    await prisma.user.update({
      where: { id: await userIdForMembership(schoolId, plainTeacherBody.membershipId) },
      data: {
        passwordHash: await passwords.hash('a-real-password-123'),
        credentialState: 'OK',
        status: 'ACTIVE',
      },
    });
    plainTeacher = await freshCtx(host, `10.${RUN}.12.5`);
    await login(plainTeacher, plainTeacherBody.loginIdentifier, 'a-real-password-123');
    plainTeacherMembershipId = plainTeacherBody.membershipId;

    await post(admin, '/hods', { membershipId: otherTeacherBody.membershipId });
    await put(admin, `/hods/${otherTeacherBody.membershipId}/department`, {
      departmentId: deptId,
      academicSessionId: sessionId,
    });
    hod = await freshCtx(host, `10.${RUN}.12.4`);
    await login(hod, otherTeacherBody.loginIdentifier, 'a-real-password-123');

    const createdStudent = (
      await post(admin, '/students', {
        firstName: 'Tunde',
        lastName: 'Bello',
        studentId: `ST-${randomUUID().slice(0, 8)}`,
      })
    ).json<{ studentProfileId: string; membershipId: string }>();
    studentProfileId = createdStudent.studentProfileId;
    studentMembershipId = createdStudent.membershipId;
    await post(admin, `/students/${studentProfileId}/enrollments`, {
      academicSessionId: sessionId,
      classId: classAId,
    });
    studentCtx = await giveStudentLogin(studentMembershipId, `10.${RUN}.12.6`);

    const validOptions = [
      { content: '4', correctFlag: false },
      { content: '5', correctFlag: true },
      { content: '6', correctFlag: false },
    ];
    const mathQ = (
      await post(teacher, '/questions', {
        subjectId: mathSubjectId,
        level: 'SS2',
        questionType: 'SINGLE_CHOICE',
        content: 'What is 2 + 3?',
        difficulty: 'EASY',
        marks: 2,
        options: validOptions,
      })
    ).json<{ id: string; revisions: { id: string }[] }>();
    const mathRevisionId = mathQ.revisions[0]!.id;
    const submitRes = await post(
      teacher,
      `/questions/${mathQ.id}/revisions/${mathRevisionId}/submit`,
    );
    if (submitRes.statusCode !== 200) throw new Error(`submit failed: ${submitRes.body}`);
    const approveRes = await post(hod, `/reviews/questions/${mathQ.id}/approve`, {});
    if (approveRes.statusCode !== 200) throw new Error(`approve failed: ${approveRes.body}`);
    approvedRevisionId = mathRevisionId;
  });

  it('DoD 1/2: opening a session on a READY OPEN_TO_ELIGIBLE exam moves it to OPEN and auto-authorizes the eligible student', async () => {
    const examId = await buildReadyExam('OPEN_TO_ELIGIBLE');
    const openRes = await post(teacher, `/exams/${examId}/sessions`, {});
    expect(openRes.statusCode).toBe(201);
    const session = openRes.json<{
      id: string;
      status: string;
      sessionType: string;
      openedByName: string;
      closedByName: string | null;
    }>();
    expect(session.status).toBe('OPEN');
    expect(session.sessionType).toBe('STANDARD');
    // F12 gap closure: every sibling actor-facing DTO already resolves a
    // display name — a raw membership id here would regress against that.
    // `teacher` was seeded as firstName 'Ade' lastName 'Ola' (beforeAll).
    expect(session.openedByName).toBe('Ade Ola');
    expect(session.closedByName).toBeNull();

    const examRes = await get(teacher, `/exams/${examId}`);
    expect(examRes.json<{ status: string }>().status).toBe('OPEN');

    const eligible = await get(teacher, `/exams/${examId}/eligible-students`);
    const students = eligible.json<{
      students: { studentProfileId: string; participantStatus: string | null }[];
    }>().students;
    const student = students.find((s) => s.studentProfileId === studentProfileId);
    expect(student?.participantStatus).toBe('AUTHORIZED');

    const events = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId, action: { in: ['EXAM_OPENED', 'EXAM_SESSION_OPENED'] } },
      }),
    );
    expect(events.some((e) => e.action === 'EXAM_OPENED')).toBe(true);
    expect(events.some((e) => e.action === 'EXAM_SESSION_OPENED')).toBe(true);

    const notifications = await withTenant(prisma, schoolId, (tx) =>
      tx.notification.findMany({ where: { schoolId, type: 'EXAM_OPENED' } }),
    );
    expect(notifications.length).toBeGreaterThan(0);
  });

  it('DoD 3: EXPLICIT_AUTHORIZATION creates zero participants on session open', async () => {
    const examId = await buildReadyExam('EXPLICIT_AUTHORIZATION');
    const openRes = await post(teacher, `/exams/${examId}/sessions`, {});
    const sessionIdVal = openRes.json<{ id: string }>().id;
    const count = await withTenant(prisma, schoolId, (tx) =>
      tx.examSessionParticipant.count({ where: { schoolId, examSessionId: sessionIdVal } }),
    );
    expect(count).toBe(0);

    const eligible = await get(teacher, `/exams/${examId}/eligible-students`);
    const student = eligible
      .json<{
        students: {
          studentProfileId: string;
          eligible: boolean;
          participantStatus: string | null;
        }[];
      }>()
      .students.find((s) => s.studentProfileId === studentProfileId);
    expect(student?.eligible).toBe(true);
    expect(student?.participantStatus).toBeNull();
  });

  it('DoD 4/decision 1: a second batch after closing the first stays under the same exam; concurrent sessions are allowed', async () => {
    const examId = await buildReadyExam('EXPLICIT_AUTHORIZATION');
    const session1 = (await post(teacher, `/exams/${examId}/sessions`, {})).json<{ id: string }>();
    const authRes1 = await post(teacher, `/exam-sessions/${session1.id}/participants`, {
      studentProfileIds: [studentProfileId],
    });
    expect(authRes1.statusCode).toBe(200);
    expect(authRes1.json<{ results: { authorized: boolean }[] }>().results[0]?.authorized).toBe(
      true,
    );

    // Concurrent session while session1 is still OPEN — both coexist.
    const session2 = (await post(teacher, `/exams/${examId}/sessions`, {})).json<{ id: string }>();
    const closeRes = await post(teacher, `/exam-sessions/${session1.id}/close`, {});
    expect(closeRes.statusCode).toBe(200);
    expect(closeRes.json<{ status: string }>().status).toBe('CLOSED');

    const session2Status = await withTenant(prisma, schoolId, (tx) =>
      tx.examSession.findUniqueOrThrow({ where: { id: session2.id } }),
    );
    expect(session2Status.status).toBe('OPEN');

    // Batch 2 against session2, same exam.
    const authRes2 = await post(teacher, `/exam-sessions/${session2.id}/participants`, {
      studentProfileIds: [studentProfileId],
    });
    expect(authRes2.statusCode).toBe(200);

    const examCount = await withTenant(prisma, schoolId, (tx) =>
      tx.exam.count({ where: { schoolId, id: examId } }),
    );
    expect(examCount).toBe(1);

    const reopenRes = await post(teacher, `/exam-sessions/${session1.id}/reopen`, {});
    expect(reopenRes.statusCode).toBe(200);
    expect(reopenRes.json<{ status: string }>().status).toBe('OPEN');
  });

  it('DoD 7/X-13: revoke before "start" succeeds; mandatory reason enforced', async () => {
    const examId = await buildReadyExam('EXPLICIT_AUTHORIZATION');
    const session = (await post(teacher, `/exams/${examId}/sessions`, {})).json<{ id: string }>();
    await post(teacher, `/exam-sessions/${session.id}/participants`, {
      studentProfileIds: [studentProfileId],
    });

    const noReason = await del(
      teacher,
      `/exam-sessions/${session.id}/participants/${studentProfileId}`,
      {},
    );
    expect(noReason.statusCode).toBe(400);

    const revokeRes = await del(
      teacher,
      `/exam-sessions/${session.id}/participants/${studentProfileId}`,
      {
        reason: 'Wrong student authorized by mistake.',
      },
    );
    expect(revokeRes.statusCode).toBe(200);

    const participant = await withTenant(prisma, schoolId, (tx) =>
      tx.examSessionParticipant.findFirstOrThrow({
        where: { schoolId, examSessionId: session.id, studentProfileId },
      }),
    );
    expect(participant.status).toBe('REVOKED');
    expect(participant.revokedReason).toBe('Wrong student authorized by mistake.');

    // Revoking an already-REVOKED participant fails cleanly.
    const again = await del(
      teacher,
      `/exam-sessions/${session.id}/participants/${studentProfileId}`,
      {
        reason: 'Retry.',
      },
    );
    expect(again.statusCode).toBe(409);
    expect(again.json<{ error: { code: string } }>().error.code).toBe(
      'EXAM_SESSION_PARTICIPANT_NOT_AUTHORIZED',
    );
  });

  it('exam-level close cascades every OPEN session to CLOSED and refuses a new session; reopen does not auto-reopen sessions', async () => {
    const examId = await buildReadyExam('EXPLICIT_AUTHORIZATION');
    const session1 = (await post(teacher, `/exams/${examId}/sessions`, {})).json<{ id: string }>();
    const session2 = (await post(teacher, `/exams/${examId}/sessions`, {})).json<{ id: string }>();

    const closeExamRes = await post(teacher, `/exams/${examId}/close`, {});
    expect(closeExamRes.statusCode).toBe(200);
    expect(closeExamRes.json<{ status: string }>().status).toBe('CLOSED');

    const sessions = await withTenant(prisma, schoolId, (tx) =>
      tx.examSession.findMany({
        where: { schoolId, examId, id: { in: [session1.id, session2.id] } },
      }),
    );
    expect(sessions.every((s) => s.status === 'CLOSED')).toBe(true);

    const blockedOpen = await post(teacher, `/exams/${examId}/sessions`, {});
    expect(blockedOpen.statusCode).toBe(409);
    expect(blockedOpen.json<{ error: { code: string } }>().error.code).toBe('EXAM_NOT_OPENABLE');

    const reopenExamRes = await post(teacher, `/exams/${examId}/reopen`, {});
    expect(reopenExamRes.statusCode).toBe(200);
    expect(reopenExamRes.json<{ status: string }>().status).toBe('OPEN');

    const sessionsAfterExamReopen = await withTenant(prisma, schoolId, (tx) =>
      tx.examSession.findMany({
        where: { schoolId, examId, id: { in: [session1.id, session2.id] } },
      }),
    );
    expect(sessionsAfterExamReopen.every((s) => s.status === 'CLOSED')).toBe(true);
  });

  it('DoD 8: Control Center aggregate matches a hand-built fixture; inProgress/submitted are real (B13) zero counts, not fabricated', async () => {
    const examId = await buildReadyExam('OPEN_TO_ELIGIBLE');
    await post(teacher, `/exams/${examId}/sessions`, {});

    const controlRes = await get(teacher, `/exams/${examId}/control`);
    expect(controlRes.statusCode).toBe(200);
    const body = controlRes.json<{
      aggregate: {
        authorizedCount: number;
        notStartedCount: number;
        inProgressCount: number;
        submittedCount: number;
        absentCount: number;
        attemptDataAvailable: boolean;
      };
      liveAttempts: unknown[];
    }>();
    expect(body.aggregate.authorizedCount).toBe(1);
    expect(body.aggregate.notStartedCount).toBe(1);
    expect(body.aggregate.inProgressCount).toBe(0);
    expect(body.aggregate.submittedCount).toBe(0);
    expect(body.aggregate.absentCount).toBe(0);
    // B13 gap closure: this was the honest B12-era placeholder (`false`,
    // no ExamAttempt existing yet) — now that B13 ships ExamAttempt, the
    // Control Center genuinely computes this data, so a school with zero
    // actual attempts correctly reports `true` alongside real zero counts,
    // not a fabricated placeholder.
    expect(body.aggregate.attemptDataAvailable).toBe(true);
    expect(body.liveAttempts).toEqual([]);
  });

  it('post-B13 gap closure: /control returns a real IN_PROGRESS live attempt row with studentName, startedAt, and time remaining', async () => {
    const examId = await buildReadyExam('OPEN_TO_ELIGIBLE');
    await post(teacher, `/exams/${examId}/sessions`, {});

    const startRes = await post(studentCtx, `/exams/${examId}/attempts`, {});
    expect(startRes.statusCode).toBe(200);
    expect(startRes.json<{ state: string }>().state).toBe('IN_PROGRESS');

    const controlRes = await get(teacher, `/exams/${examId}/control`);
    expect(controlRes.statusCode).toBe(200);
    const body = controlRes.json<{
      aggregate: { inProgressCount: number; attemptDataAvailable: boolean };
      liveAttempts: {
        studentProfileId: string;
        studentName: string;
        status: string;
        startedAt: string;
        timeRemainingSeconds: number | null;
      }[];
    }>();
    expect(body.aggregate.inProgressCount).toBe(1);
    expect(body.aggregate.attemptDataAvailable).toBe(true);
    const row = body.liveAttempts.find((x) => x.studentProfileId === studentProfileId);
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.status).toBe('IN_PROGRESS');
    // Seeded as firstName 'Tunde' lastName 'Bello' (beforeAll).
    expect(row.studentName).toBe('Tunde Bello');
    expect(Number.isNaN(Date.parse(row.startedAt))).toBe(false);
    expect(row.timeRemainingSeconds).not.toBeNull();
    expect(row.timeRemainingSeconds as number).toBeGreaterThanOrEqual(0);
  });

  it('B23 (audit M-08/M-09): a live row carries integrity-signal counts and a derived disconnected flag', async () => {
    const examId = await buildReadyExam('OPEN_TO_ELIGIBLE');
    await post(teacher, `/exams/${examId}/sessions`, {});
    const startRes = await post(studentCtx, `/exams/${examId}/attempts`, {});
    expect(startRes.statusCode).toBe(200);
    const attemptId = startRes.json<{ attemptId: string }>().attemptId;

    for (const type of ['TAB_HIDDEN', 'TAB_HIDDEN', 'WINDOW_BLUR']) {
      const res = await post(studentCtx, `/attempts/${attemptId}/events`, {
        type,
        occurredAt: new Date().toISOString(),
      });
      expect(res.statusCode).toBe(200);
    }

    type Row = {
      studentProfileId: string;
      lastSeenAt: string;
      disconnected: boolean;
      signals: Record<string, number>;
    };
    const liveRow = async (): Promise<Row> => {
      const res = await get(teacher, `/exams/${examId}/control`);
      expect(res.statusCode).toBe(200);
      const row = res
        .json<{ liveAttempts: Row[] }>()
        .liveAttempts.find((x) => x.studentProfileId === studentProfileId);
      if (!row) throw new Error('live row missing');
      return row;
    };

    let row = await liveRow();
    expect(row.disconnected).toBe(false);
    expect(row.signals).toEqual({
      WINDOW_BLUR: 1,
      FULLSCREEN_EXIT: 0,
      TAB_HIDDEN: 2,
      RECONNECTED: 0,
      RESUMED: 0,
      BINDING_MISMATCH: 0,
    });

    // Nothing heard for two minutes: shown as disconnected, still IN_PROGRESS.
    await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.update({
        where: { id: attemptId },
        data: { lastSeenAt: new Date(Date.now() - 120_000) },
      }),
    );
    row = await liveRow();
    expect(row.disconnected).toBe(true);

    // A heartbeat brings it back.
    expect((await post(studentCtx, `/attempts/${attemptId}/heartbeat`, {})).statusCode).toBe(200);
    row = await liveRow();
    expect(row.disconnected).toBe(false);
    expect(Date.now() - Date.parse(row.lastSeenAt)).toBeLessThan(30_000);
  });

  it('DoD 12/A-14: End Examination requires every session CLOSED and an exact absentee-list match, marks absences, audited', async () => {
    const examId = await buildReadyExam('OPEN_TO_ELIGIBLE');
    const session = (await post(teacher, `/exams/${examId}/sessions`, {})).json<{ id: string }>();

    const stillOpen = await post(teacher, `/exams/${examId}/complete`, {
      confirmedAbsentStudentProfileIds: [],
    });
    expect(stillOpen.statusCode).toBe(409);
    expect(stillOpen.json<{ error: { code: string } }>().error.code).toBe(
      'EXAM_SESSIONS_STILL_OPEN',
    );

    await post(teacher, `/exam-sessions/${session.id}/close`, {});

    const staleList = await post(teacher, `/exams/${examId}/complete`, {
      confirmedAbsentStudentProfileIds: [],
    });
    expect(staleList.statusCode).toBe(409);
    expect(staleList.json<{ error: { code: string } }>().error.code).toBe('STALE_ABSENTEE_LIST');

    const completeRes = await post(teacher, `/exams/${examId}/complete`, {
      confirmedAbsentStudentProfileIds: [studentProfileId],
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json<{ status: string }>().status).toBe('COMPLETED');

    const participation = await withTenant(prisma, schoolId, (tx) =>
      tx.examParticipation.findFirstOrThrow({ where: { schoolId, examId, studentProfileId } }),
    );
    expect(participation.status).toBe('ABSENT');

    const events = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({ where: { schoolId, entityId: examId, action: 'EXAM_COMPLETED' } }),
    );
    expect(events.length).toBeGreaterThan(0);
  });

  it('ExamAdministrator delegation: a delegate can operate a session another teacher created; a plain non-owner cannot', async () => {
    const examId = await buildReadyExam('EXPLICIT_AUTHORIZATION');

    // plainTeacher (no assignment, no HOD role, not the exam's creator) is
    // refused outright.
    const deniedOpen = await post(plainTeacher, `/exams/${examId}/sessions`, {});
    expect(deniedOpen.statusCode).toBe(403);

    const assignRes = await post(teacher, `/exams/${examId}/administrators`, {
      membershipId: plainTeacherMembershipId,
    });
    expect(assignRes.statusCode).toBe(201);

    const delegatedOpen = await post(plainTeacher, `/exams/${examId}/sessions`, {});
    expect(delegatedOpen.statusCode).toBe(201);

    const revokeRes = await del(
      teacher,
      `/exams/${examId}/administrators/${plainTeacherMembershipId}`,
    );
    expect(revokeRes.statusCode).toBe(200);

    const afterRevoke = await post(teacher, `/exams/${examId}/close`, {});
    expect(afterRevoke.statusCode).toBe(200);
    const deniedAgain = await post(plainTeacher, `/exams/${examId}/reopen`, {});
    expect(deniedAgain.statusCode).toBe(403);
  });

  it('F12 gap closure: GET /exams/:id/administrators lists every delegation, including revoked ones, name-resolved', async () => {
    const examId = await buildReadyExam('EXPLICIT_AUTHORIZATION');

    const emptyList = await get(teacher, `/exams/${examId}/administrators`);
    expect(emptyList.statusCode).toBe(200);
    expect(emptyList.json<{ administrators: unknown[] }>().administrators).toEqual([]);

    await post(teacher, `/exams/${examId}/administrators`, {
      membershipId: plainTeacherMembershipId,
    });
    const afterAssign = await get(teacher, `/exams/${examId}/administrators`);
    const assigned = afterAssign.json<{
      administrators: { membershipId: string; memberName: string; status: string }[];
    }>().administrators;
    expect(assigned).toHaveLength(1);
    expect(assigned[0]?.membershipId).toBe(plainTeacherMembershipId);
    expect(assigned[0]?.memberName).toBe('Chidi Eze');
    expect(assigned[0]?.status).toBe('ACTIVE');

    await del(teacher, `/exams/${examId}/administrators/${plainTeacherMembershipId}`);
    const afterRevokeList = await get(teacher, `/exams/${examId}/administrators`);
    const revoked = afterRevokeList.json<{ administrators: { status: string }[] }>().administrators;
    // Still listed (never dropped), just REVOKED — a delegate-management
    // panel needs to show a revoked delegation, not silently disappear it.
    expect(revoked).toHaveLength(1);
    expect(revoked[0]?.status).toBe('REVOKED');

    // A delegate excluded from `exam.manageAdministrators` themselves
    // (per that check's own deliberate `examId`-omission) cannot list
    // administrators either — same boundary as assign/revoke.
    await post(teacher, `/exams/${examId}/administrators`, {
      membershipId: plainTeacherMembershipId,
    });
    const listAsDelegate = await get(plainTeacher, `/exams/${examId}/administrators`);
    expect(listAsDelegate.statusCode).toBe(403);
  });

  it('cross-tenant: another school cannot see or act on this exam', async () => {
    const otherSchool = await createSchool();
    createdSchoolIds.push(otherSchool.id);
    const otherHost = `${otherSchool.subdomain}.${ROOT_DOMAIN}`;
    const { user: otherAdminUser } = await seedUser({
      schoolId: otherSchool.id,
      loginIdentifier: 'excadmin02',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(otherAdminUser.id);
    const otherAdmin = await freshCtx(otherHost, `10.${RUN}.12.9`);
    await login(otherAdmin, 'excadmin02', 'a-real-password-123');

    const examId = await buildReadyExam('EXPLICIT_AUTHORIZATION');
    const crossRes = await get(otherAdmin, `/exams/${examId}/control`);
    expect(crossRes.statusCode).toBe(404);
  });

  it('security regression: the Control Center SSE stream re-checks resource-scoped authorization, not just the coarse guard', async () => {
    // Found in review: attach() alone only ever verified the exam exists in
    // this tenant, never that this specific actor may see it — any
    // TEACHER/HOD in the school could stream any other exam's live Control
    // Center. app.inject() can't drive a real long-lived SSE connection, so
    // this calls the real service's assertAccess() directly — the exact
    // guard the controller now runs before writing any response header —
    // against constructed actors, mirroring AuthorizationService's own
    // established "constructed AuthorizedActor fixtures" precedent.
    const examId = await buildReadyExam('EXPLICIT_AUTHORIZATION');
    const streamService = app.get(ExamControlStreamService);

    const ownerActor: AuthorizedActor = {
      kind: 'SCHOOL',
      userId: randomUUID(),
      schoolId,
      membershipId: teacherMembershipId,
      roles: ['TEACHER'],
    };
    await expect(streamService.assertAccess(schoolId, ownerActor, examId)).resolves.toMatchObject({
      id: examId,
    });

    const strangerActor: AuthorizedActor = {
      kind: 'SCHOOL',
      userId: randomUUID(),
      schoolId,
      membershipId: plainTeacherMembershipId,
      roles: ['TEACHER'],
    };
    await expect(streamService.assertAccess(schoolId, strangerActor, examId)).rejects.toMatchObject(
      {
        code: 'FORBIDDEN',
      },
    );
  });

  it("regression: GET /control never serves a cached snapshot whose examStatus disagrees with the exam's current status", async () => {
    // Found in review: the worker sweep only ever refreshes exams currently
    // OPEN/CLOSED, and no mutation used to write through the GET-read cache
    // key at all — so once an exam completes, a pre-completion cache entry
    // could be served forever. Simulates exactly that leftover entry
    // directly against Redis, matching what a real worker sweep tick from
    // just before completion would have left behind.
    const examId = await buildReadyExam('EXPLICIT_AUTHORIZATION');
    const session = (await post(teacher, `/exams/${examId}/sessions`, {})).json<{ id: string }>();
    await post(teacher, `/exam-sessions/${session.id}/close`, {});
    const completeRes = await post(teacher, `/exams/${examId}/complete`, {
      confirmedAbsentStudentProfileIds: [],
    });
    expect(completeRes.statusCode).toBe(200);

    const redis = app.get<Redis>(REDIS_CLIENT);
    const staleSnapshot = {
      examId,
      examStatus: 'OPEN',
      sessions: [],
      aggregate: {
        authorizedCount: 0,
        notStartedCount: 0,
        inProgressCount: 0,
        submittedCount: 0,
        absentCount: 0,
        attemptDataAvailable: false,
      },
      liveAttempts: [],
      staleness: { isStale: false, openSince: null, thresholdMs: 1000 },
      computedAt: new Date(0).toISOString(),
    };
    await redis.set(examControlChannel(schoolId, examId), JSON.stringify(staleSnapshot));

    const controlRes = await get(teacher, `/exams/${examId}/control`);
    expect(controlRes.statusCode).toBe(200);
    expect(controlRes.json<{ examStatus: string }>().examStatus).toBe('COMPLETED');
  });

  it('security regression: an ExamAdministrator delegate cannot manage other delegates', async () => {
    // Found in review: exam.manageAdministrators is TEACHER: OWNED, and the
    // ExamAdministrator-aware OWNED resolver treats an active delegate as
    // ownership-equivalent for every other exam permission by design — this
    // is the one row where that equivalence must not hold (ADR-0012/M-15: a
    // delegate may operate the exam but must never extend or revoke
    // delegation itself).
    const examId = await buildReadyExam('EXPLICIT_AUTHORIZATION');

    const assignRes = await post(teacher, `/exams/${examId}/administrators`, {
      membershipId: plainTeacherMembershipId,
    });
    expect(assignRes.statusCode).toBe(201);

    const anotherRes = await post(admin, '/teachers', {
      firstName: 'Dupe',
      lastName: 'Okoro',
      email: `dupe-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    const anotherMembershipId = anotherRes.json<{ membershipId: string }>().membershipId;

    const escalateRes = await post(plainTeacher, `/exams/${examId}/administrators`, {
      membershipId: anotherMembershipId,
    });
    expect(escalateRes.statusCode).toBe(403);

    const revokeAttempt = await del(
      plainTeacher,
      `/exams/${examId}/administrators/${plainTeacherMembershipId}`,
    );
    expect(revokeAttempt.statusCode).toBe(403);

    // The true creator can still do both.
    const properAssign = await post(teacher, `/exams/${examId}/administrators`, {
      membershipId: anotherMembershipId,
    });
    expect(properAssign.statusCode).toBe(201);
  });

  it('regression: re-authorizing an already-AUTHORIZED student is not double-counted as newly authorized', async () => {
    // Found in review: newlyAuthorized previously collected every eligible
    // student submitted in the call, regardless of prior status — a repeat
    // call over an overlapping batch re-sent an EXAM_OPENED notification
    // and mislabeled an already-authorized student as newly authorized in
    // the audit trail.
    const examId = await buildReadyExam('EXPLICIT_AUTHORIZATION');
    const session = (await post(teacher, `/exams/${examId}/sessions`, {})).json<{ id: string }>();

    const first = await post(teacher, `/exam-sessions/${session.id}/participants`, {
      studentProfileIds: [studentProfileId],
    });
    expect(first.statusCode).toBe(200);

    const notificationCountAfterFirst = await withTenant(prisma, schoolId, (tx) =>
      tx.notification.count({ where: { schoolId, type: 'EXAM_OPENED', relatedEntityId: examId } }),
    );
    expect(notificationCountAfterFirst).toBe(1);

    const second = await post(teacher, `/exam-sessions/${session.id}/participants`, {
      studentProfileIds: [studentProfileId],
    });
    expect(second.statusCode).toBe(200);
    expect(second.json<{ results: { authorized: boolean }[] }>().results[0]?.authorized).toBe(true);

    const notificationCountAfterSecond = await withTenant(prisma, schoolId, (tx) =>
      tx.notification.count({ where: { schoolId, type: 'EXAM_OPENED', relatedEntityId: examId } }),
    );
    expect(notificationCountAfterSecond).toBe(1);

    const auditEvents = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId, entityId: session.id, action: 'EXAM_SESSION_PARTICIPANT_AUTHORIZED' },
        orderBy: { occurredAt: 'asc' },
      }),
    );
    expect(auditEvents.length).toBe(2);
    const secondMetadata = auditEvents[1]?.metadata as { studentProfileIds: string[] } | null;
    expect(secondMetadata?.studentProfileIds ?? []).toEqual([]);
  });

  it('concurrency: opening a new session and ending the examination at the same time never leaves an OPEN session under a COMPLETED exam', async () => {
    // Found in review: open() never re-checked exam status inside its own
    // transaction, and complete() computed its pending-absentee set without
    // guarding against a session opening afterward — a session could be
    // created and then force-completed by complete()'s own final write
    // without its participants ever being accounted for. Both methods now
    // take an identical SELECT ... FOR UPDATE on the exam row first, fully
    // serializing them — so regardless of which one happens to acquire the
    // lock first, exactly one of the two must succeed, deterministically,
    // with no artificial delay needed to prove it.
    const examId = await buildReadyExam('EXPLICIT_AUTHORIZATION');
    const session1 = (await post(teacher, `/exams/${examId}/sessions`, {})).json<{ id: string }>();
    await post(teacher, `/exam-sessions/${session1.id}/close`, {});

    const [openRes, completeRes] = await Promise.all([
      post(teacher, `/exams/${examId}/sessions`, {}),
      post(teacher, `/exams/${examId}/complete`, { confirmedAbsentStudentProfileIds: [] }),
    ]);

    const openSucceeded = openRes.statusCode === 201;
    const completeSucceeded = completeRes.statusCode === 200;
    expect(openSucceeded).not.toBe(completeSucceeded);
    if (!openSucceeded) {
      expect(openRes.json<{ error: { code: string } }>().error.code).toBe('EXAM_NOT_OPENABLE');
    }
    if (!completeSucceeded) {
      expect(completeRes.json<{ error: { code: string } }>().error.code).toBe(
        'EXAM_SESSIONS_STILL_OPEN',
      );
    }

    const finalExam = await withTenant(prisma, schoolId, (tx) =>
      tx.exam.findUniqueOrThrow({ where: { id: examId } }),
    );
    if (finalExam.status === 'COMPLETED') {
      const openSessions = await withTenant(prisma, schoolId, (tx) =>
        tx.examSession.count({ where: { schoolId, examId, status: 'OPEN' } }),
      );
      expect(openSessions).toBe(0);
    }
  });
});
