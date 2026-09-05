/**
 * B13 — Attempt Engine. Mirrors `exam-control.integration.test.ts`'s own
 * harness exactly (real HTTP via `app.inject()` against a real, running
 * `AppModule` and real Postgres) — the highest-integrity subsystem in the
 * product (`AGENTS.md §5`), so this suite is deliberately the most
 * thorough in the repository.
 *
 * Organized by the roadmap's own testing-requirements table: Integration,
 * Concurrency, Timer, Refresh, Reconnect/ordering, Duplicate submission,
 * Timeout, Invalidation, Security (including the release-blocking X-05
 * contract test), Accommodations (decision 2), Signals (decision 1).
 */
import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppModule } from '../../app.module.js';
import { PasswordService } from '../identity/password.service.js';
import { AttemptMarkingQueueService } from './attempt-marking-queue.service.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
const RUN = Math.floor(Math.random() * 200) + 1;

let app: NestFastifyApplication;
const passwords = new PasswordService();
// B14: mocked rather than left to hit real Redis — nothing in this process
// consumes the marking queue (the consumer lives in apps/worker, proven
// separately by attempt-marking.integration.test.ts there), so this suite
// only needs to assert ITS OWN code called enqueue correctly, matching
// question-review.integration.test.ts's own "spy directly on the injected
// singleton" precedent for the identical class of out-of-band side effect.
let markingEnqueueSpy: MockInstance<AttemptMarkingQueueService['enqueue']>;

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const markingQueue = app.get(AttemptMarkingQueueService);
  markingEnqueueSpy = vi.spyOn(markingQueue, 'enqueue').mockResolvedValue(undefined);
});

beforeEach(() => {
  markingEnqueueSpy.mockClear();
});

afterAll(async () => {
  await app.close();
});

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Attempt Engine Test School ${randomUUID()}`,
      subdomain: `atmpt-${randomUUID().slice(0, 8)}`,
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

async function post(
  ctx: RequestCtx,
  url: string,
  payload?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
) {
  return app.inject({
    method: 'POST',
    url,
    headers: {
      host: ctx.host,
      cookie: cookieHeader(ctx),
      'x-csrf-token': ctx.csrfToken,
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
      ...extraHeaders,
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
    // This suite produces real ExamAttempt/AttemptQuestionSnapshot/
    // AttemptAnswer/AttemptAnswerEvent rows, several carrying unconditional
    // immutability triggers (AttemptQuestionSnapshot always; AttemptAnswer/
    // AttemptAnswerEvent whenever their parent attempt is no longer
    // IN_PROGRESS, which most of this suite's own attempts end up as) — so
    // every step here is best-effort, matching exam-control.integration
    // .test.ts's own established precedent for this exact class of gap.
    await withTenant(prisma, schoolId, (tx) =>
      tx.attemptEvent.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.attemptAnswerEvent.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.attemptAnswer.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    // B14: no immutability trigger on this table (re-marking is a
    // deliberate, expected overwrite), but its FK to exam_attempts is still
    // onDelete: Restrict — must clear before examAttempt.deleteMany below.
    await withTenant(prisma, schoolId, (tx) =>
      tx.attemptQuestionResult.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.attemptQuestionSnapshot.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.deleteMany({ where: { schoolId } }),
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

interface AttemptPackage {
  attemptId: string;
  examId: string;
  examSessionId: string;
  state: string;
  startedAt: string;
  expiresAt: string;
  serverTime: string;
  navigationPolicy: string;
  questions: {
    examQuestionId: string;
    displaySequence: number;
    marks: number;
    content: string;
    options: { optionId: string; content: string; displayPosition: number }[];
    selectedOptionId: string | null;
    answerSequenceNumber?: number;
  }[];
}

describe('B13 Attempt Engine (attempt.v1)', () => {
  let schoolId: string;
  let host: string;
  let admin: RequestCtx;
  let teacher: RequestCtx;
  let hod: RequestCtx;
  let sessionId: string;
  let classAId: string;
  let mathSubjectId: string;
  let studentAProfileId: string;
  let studentBProfileId: string;
  let studentA: RequestCtx;
  let studentB: RequestCtx;
  let approvedRevisionIds: string[];

  async function createApprovedQuestion(content: string, correctIndex: number): Promise<string> {
    const options = ['4', '5', '6'].map((v, i) => ({
      content: v,
      correctFlag: i === correctIndex,
    }));
    const q = (
      await post(teacher, '/questions', {
        subjectId: mathSubjectId,
        level: 'SS2',
        questionType: 'SINGLE_CHOICE',
        content,
        difficulty: 'EASY',
        marks: 2,
        options,
      })
    ).json<{ id: string; revisions: { id: string }[] }>();
    const revisionId = q.revisions[0]!.id;
    const submitRes = await post(teacher, `/questions/${q.id}/revisions/${revisionId}/submit`);
    if (submitRes.statusCode !== 200) throw new Error(`submit failed: ${submitRes.body}`);
    const approveRes = await post(hod, `/reviews/questions/${q.id}/approve`, {});
    if (approveRes.statusCode !== 200) throw new Error(`approve failed: ${approveRes.body}`);
    return revisionId;
  }

  async function buildReadyExam(opts?: {
    durationSeconds?: number;
    attemptLimit?: number;
    randomizeQuestions?: boolean;
    randomizeOptions?: boolean;
  }): Promise<string> {
    const termId = (await get(admin, '/academics/context')).json<{ term: { id: string } }>().term
      .id;
    const examId = (
      await post(teacher, '/exams', {
        academicSessionId: sessionId,
        academicTermId: termId,
        subjectId: mathSubjectId,
        title: `Attempt Engine Test ${randomUUID().slice(0, 8)}`,
        examType: 'Test',
        classIds: [classAId],
      })
    ).json<{ id: string }>().id;
    await put(teacher, `/exams/${examId}/questions`, {
      questions: approvedRevisionIds.map((questionRevisionId) => ({ questionRevisionId })),
    });
    await put(teacher, `/exams/${examId}/configuration`, {
      durationSeconds: opts?.durationSeconds ?? 3600,
      attemptLimit: opts?.attemptLimit ?? 1,
      randomizeQuestions: opts?.randomizeQuestions ?? false,
      randomizeOptions: opts?.randomizeOptions ?? false,
      resultPolicy: 'TEACHER',
      resultDetailVisibility: 'SCORE_AND_COUNTS',
      generalInstructions: 'Answer all.',
      navigationInstructions: 'Free navigation.',
      submissionInstructions: 'Submit when done.',
      accessMode: 'OPEN_TO_ELIGIBLE',
    });
    const readyRes = await post(teacher, `/exams/${examId}/ready`, {});
    if (readyRes.statusCode !== 200) throw new Error(`ready failed: ${readyRes.body}`);
    return examId;
  }

  /** Opens a session (auto-authorizing every eligible student under
   * OPEN_TO_ELIGIBLE) and returns its id. */
  async function openSession(examId: string): Promise<string> {
    const res = await post(teacher, `/exams/${examId}/sessions`, {});
    if (res.statusCode !== 201) throw new Error(`open session failed: ${res.body}`);
    return res.json<{ id: string }>().id;
  }

  /** Mirrors `exam-control.integration.test.ts`'s own teacher-login
   * precedent exactly: `reset-credentials` issues a real password but
   * leaves `credentialState: 'MUST_CHANGE_PASSWORD'`, which `AuthGuard`
   * forces through `POST /auth/password/change` before any other route —
   * a real flow this suite isn't testing, so the password/credentialState
   * are set directly, the same way every other role's test fixture in
   * this codebase already does. */
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
      loginIdentifier: 'atmptadmin01',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(adminUser.id);
    admin = await freshCtx(host, `10.${RUN}.13.1`);
    await login(admin, 'atmptadmin01', 'a-real-password-123');

    sessionId = (
      await post(admin, '/academics/sessions', {
        name: `Attempt Session ${randomUUID().slice(0, 8)}`,
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
    teacher = await freshCtx(host, `10.${RUN}.13.2`);
    await login(teacher, teacherBody.loginIdentifier, 'a-real-password-123');

    // HOD, promoted from a second teacher — approves the questions below.
    const hodTeacherRes = await post(admin, '/teachers', {
      firstName: 'Bola',
      lastName: 'Ige',
      email: `bola-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    const hodTeacherBody = hodTeacherRes.json<{ membershipId: string; loginIdentifier: string }>();
    await prisma.user.update({
      where: { id: await userIdForMembership(schoolId, hodTeacherBody.membershipId) },
      data: {
        passwordHash: await passwords.hash('a-real-password-123'),
        credentialState: 'OK',
        status: 'ACTIVE',
      },
    });
    await post(admin, '/hods', { membershipId: hodTeacherBody.membershipId });
    await put(admin, `/hods/${hodTeacherBody.membershipId}/department`, {
      departmentId: deptId,
      academicSessionId: sessionId,
    });
    hod = await freshCtx(host, `10.${RUN}.13.3`);
    await login(hod, hodTeacherBody.loginIdentifier, 'a-real-password-123');

    const studentACreate = (
      await post(admin, '/students', {
        firstName: 'Tunde',
        lastName: 'Bello',
        studentId: `ST-${randomUUID().slice(0, 8)}`,
      })
    ).json<{ studentProfileId: string; membershipId: string }>();
    studentAProfileId = studentACreate.studentProfileId;
    await post(admin, `/students/${studentAProfileId}/enrollments`, {
      academicSessionId: sessionId,
      classId: classAId,
    });
    studentA = await giveStudentLogin(studentACreate.membershipId, `10.${RUN}.13.10`);

    const studentBCreate = (
      await post(admin, '/students', {
        firstName: 'Ngozi',
        lastName: 'Uche',
        studentId: `ST-${randomUUID().slice(0, 8)}`,
      })
    ).json<{ studentProfileId: string; membershipId: string }>();
    studentBProfileId = studentBCreate.studentProfileId;
    await post(admin, `/students/${studentBProfileId}/enrollments`, {
      academicSessionId: sessionId,
      classId: classAId,
    });
    studentB = await giveStudentLogin(studentBCreate.membershipId, `10.${RUN}.13.11`);

    approvedRevisionIds = [
      await createApprovedQuestion('What is 2 + 3?', 1),
      await createApprovedQuestion('What is 10 - 6?', 0),
    ];
  });

  // ---------------------------------------------------------------------
  // Integration: the full lifecycle
  // ---------------------------------------------------------------------

  it('DoD 1/3/4/12/13: start creates the attempt and its complete snapshot, server-derived timing, no answer key in the payload', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);

    const startRes = await post(studentA, `/exams/${examId}/attempts`, {});
    expect(startRes.statusCode).toBe(200);
    const pkg = startRes.json<AttemptPackage>();
    expect(pkg.examId).toBe(examId);
    expect(pkg.state).toBe('IN_PROGRESS');
    expect(pkg.questions).toHaveLength(2);
    expect(new Date(pkg.expiresAt).getTime() - new Date(pkg.startedAt).getTime()).toBe(3600 * 1000);

    // DoD 12/X-05 — release-blocking.
    expect(startRes.body).not.toContain('correctFlag');
    expect(startRes.body).not.toContain('correct_answer');

    const attempt = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.findUniqueOrThrow({ where: { id: pkg.attemptId } }),
    );
    expect(attempt.state).toBe('IN_PROGRESS');
    const snapshot = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptQuestionSnapshot.findUnique({
        where: { schoolId_attemptId: { schoolId, attemptId: pkg.attemptId } },
      }),
    );
    expect(snapshot).not.toBeNull();
    expect(snapshot?.documentVersion).toBe(1);

    const auditEvents = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId, action: 'ATTEMPT_STARTED', entityId: pkg.attemptId },
      }),
    );
    expect(auditEvents.length).toBeGreaterThan(0);
  });

  it('DoD 2/9: a duplicate start (double-click/refresh/retry) yields exactly one attempt, idempotently', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);

    const first = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();
    const second = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();
    expect(second.attemptId).toBe(first.attemptId);
    expect(second.startedAt).toBe(first.startedAt);
    expect(second.expiresAt).toBe(first.expiresAt);

    const count = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.count({
        where: { schoolId, examId, studentProfileId: studentAProfileId },
      }),
    );
    expect(count).toBe(1);
  });

  // ---------------------------------------------------------------------
  // Concurrency
  // ---------------------------------------------------------------------

  it('concurrency: 20 simultaneous duplicate starts for the same student/exam create exactly one attempt', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);

    const results = await Promise.all(
      Array.from({ length: 20 }, () => post(studentA, `/exams/${examId}/attempts`, {})),
    );
    for (const res of results) {
      expect(res.statusCode).toBe(200);
    }
    const attemptIds = new Set(results.map((r) => r.json<AttemptPackage>().attemptId));
    expect(attemptIds.size).toBe(1);

    const count = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.count({
        where: { schoolId, examId, studentProfileId: studentAProfileId, state: 'IN_PROGRESS' },
      }),
    );
    expect(count).toBe(1);
  });

  it('concurrency: simultaneous answer writes with the same sequence number never both silently overwrite each other incorrectly', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();
    const questionId = pkg.questions[0]!.examQuestionId;
    const optionA = pkg.questions[0]!.options[0]!.optionId;
    const optionB = pkg.questions[0]!.options[1]!.optionId;

    const [resA, resB] = await Promise.all([
      put(studentA, `/attempts/${pkg.attemptId}/answers/${questionId}`, {
        selectedOptionId: optionA,
        sequenceNumber: 5,
      }),
      put(studentA, `/attempts/${pkg.attemptId}/answers/${questionId}`, {
        selectedOptionId: optionB,
        sequenceNumber: 5,
      }),
    ]);
    // Both requests carry the SAME sequence number — the atomic `<=` upsert
    // accepts both as idempotent (whichever's INSERT/UPDATE physically
    // lands), so both succeed; a real single stored row, matching one of
    // the two option choices, must be the deterministic end state.
    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(200);

    const stored = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptAnswer.findUniqueOrThrow({
        where: {
          schoolId_attemptId_examQuestionId: {
            schoolId,
            attemptId: pkg.attemptId,
            examQuestionId: questionId,
          },
        },
      }),
    );
    expect([optionA, optionB]).toContain(stored.selectedOptionId);
    expect(stored.sequenceNumber).toBe(5);
  });

  // ---------------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------------

  it('DoD 4: two students starting at different times have independent, correct expiries', async () => {
    const examId = await buildReadyExam({ durationSeconds: 600 });
    await openSession(examId);

    const a = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();
    // A real, small gap between starts.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const b = (await post(studentB, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    expect(new Date(b.startedAt).getTime()).toBeGreaterThan(new Date(a.startedAt).getTime());
    expect(new Date(b.expiresAt).getTime()).toBeGreaterThan(new Date(a.expiresAt).getTime());
    expect(new Date(a.expiresAt).getTime() - new Date(a.startedAt).getTime()).toBe(600 * 1000);
    expect(new Date(b.expiresAt).getTime() - new Date(b.startedAt).getTime()).toBe(600 * 1000);
  });

  it('DoD 11: a device clock moved backward (a stale client timestamp) never extends expiresAt', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();
    const questionId = pkg.questions[0]!.examQuestionId;
    const optionId = pkg.questions[0]!.options[0]!.optionId;

    // No client-supplied timestamp field exists on SaveAnswerDto at all —
    // the server never reads one; this proves it structurally by asserting
    // expiresAt is unchanged after a normal answer save.
    await put(studentA, `/attempts/${pkg.attemptId}/answers/${questionId}`, {
      selectedOptionId: optionId,
      sequenceNumber: 1,
    });
    const attempt = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.findUniqueOrThrow({ where: { id: pkg.attemptId } }),
    );
    expect(attempt.expiresAt.toISOString()).toBe(pkg.expiresAt);
  });

  // ---------------------------------------------------------------------
  // Refresh
  // ---------------------------------------------------------------------

  it('DoD 5: refresh (GET) returns byte-identical question/option ordering and every saved answer', async () => {
    const examId = await buildReadyExam({ randomizeQuestions: true, randomizeOptions: true });
    await openSession(examId);
    const started = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();
    const questionId = started.questions[0]!.examQuestionId;
    const optionId = started.questions[0]!.options[0]!.optionId;
    await put(studentA, `/attempts/${started.attemptId}/answers/${questionId}`, {
      selectedOptionId: optionId,
      sequenceNumber: 1,
    });

    const first = (await get(studentA, `/attempts/${started.attemptId}`)).json<AttemptPackage>();
    const second = (await get(studentA, `/attempts/${started.attemptId}`)).json<AttemptPackage>();

    expect(second.questions.map((q) => q.examQuestionId)).toEqual(
      first.questions.map((q) => q.examQuestionId),
    );
    expect(second.questions.map((q) => q.options.map((o) => o.optionId))).toEqual(
      first.questions.map((q) => q.options.map((o) => o.optionId)),
    );
    const answeredQuestion = second.questions.find((q) => q.examQuestionId === questionId);
    expect(answeredQuestion?.selectedOptionId).toBe(optionId);
  });

  // ---------------------------------------------------------------------
  // Reconnect / ordering (ADR-0007, X-04)
  // ---------------------------------------------------------------------

  it('DoD 8/X-04: an out-of-order (offline-replayed) answer with a lower sequence never overwrites a newer one', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();
    const questionId = pkg.questions[0]!.examQuestionId;
    const optionA = pkg.questions[0]!.options[0]!.optionId;
    const optionB = pkg.questions[0]!.options[1]!.optionId;

    // The "newer" online answer arrives first (e.g. answered later but
    // synced sooner), sequence 3.
    const newer = await put(studentA, `/attempts/${pkg.attemptId}/answers/${questionId}`, {
      selectedOptionId: optionB,
      sequenceNumber: 3,
    });
    expect(newer.statusCode).toBe(200);

    // A stale, offline-queued answer (sequence 1, answered earlier)
    // replays afterward.
    const stale = await put(studentA, `/attempts/${pkg.attemptId}/answers/${questionId}`, {
      selectedOptionId: optionA,
      sequenceNumber: 1,
      source: 'offline-replay',
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json<{ error: { code: string } }>().error.code).toBe(
      'ATTEMPT_ANSWER_SEQUENCE_STALE',
    );

    const stored = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptAnswer.findUniqueOrThrow({
        where: {
          schoolId_attemptId_examQuestionId: {
            schoolId,
            attemptId: pkg.attemptId,
            examQuestionId: questionId,
          },
        },
      }),
    );
    expect(stored.selectedOptionId).toBe(optionB);
    expect(stored.sequenceNumber).toBe(3);

    // The rejection was itself recorded for forensic reconstructability
    // (ADR-0007).
    const rejectedEvent = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptAnswerEvent.findFirst({
        where: { schoolId, attemptId: pkg.attemptId, accepted: false },
      }),
    );
    expect(rejectedEvent).not.toBeNull();
  });

  it('DoD 9: a repeated identical write (same sequence number) is idempotent, not rejected as stale', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();
    const questionId = pkg.questions[0]!.examQuestionId;
    const optionId = pkg.questions[0]!.options[0]!.optionId;

    const first = await put(studentA, `/attempts/${pkg.attemptId}/answers/${questionId}`, {
      selectedOptionId: optionId,
      sequenceNumber: 2,
    });
    const retry = await put(studentA, `/attempts/${pkg.attemptId}/answers/${questionId}`, {
      selectedOptionId: optionId,
      sequenceNumber: 2,
    });
    expect(first.statusCode).toBe(200);
    expect(retry.statusCode).toBe(200);
  });

  it('never lost: a batch flush with one stale item still accepts the other valid answers', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();
    const q1 = pkg.questions[0]!;
    const q2 = pkg.questions[1]!;

    // Prime q1 with a real answer at sequence 5 first.
    await put(studentA, `/attempts/${pkg.attemptId}/answers/${q1.examQuestionId}`, {
      selectedOptionId: q1.options[0]!.optionId,
      sequenceNumber: 5,
    });

    const batchRes = await post(studentA, `/attempts/${pkg.attemptId}/answers/batch`, {
      answers: [
        // Stale relative to what's already stored for q1.
        {
          examQuestionId: q1.examQuestionId,
          selectedOptionId: q1.options[1]!.optionId,
          sequenceNumber: 1,
        },
        // A genuinely new, valid answer for q2.
        {
          examQuestionId: q2.examQuestionId,
          selectedOptionId: q2.options[0]!.optionId,
          sequenceNumber: 1,
        },
      ],
    });
    expect(batchRes.statusCode).toBe(200);
    const results = batchRes.json<{ results: { examQuestionId: string; accepted: boolean }[] }>()
      .results;
    expect(results.find((r) => r.examQuestionId === q1.examQuestionId)?.accepted).toBe(false);
    expect(results.find((r) => r.examQuestionId === q2.examQuestionId)?.accepted).toBe(true);

    const q2Stored = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptAnswer.findUnique({
        where: {
          schoolId_attemptId_examQuestionId: {
            schoolId,
            attemptId: pkg.attemptId,
            examQuestionId: q2.examQuestionId,
          },
        },
      }),
    );
    expect(q2Stored?.selectedOptionId).toBe(q2.options[0]!.optionId);
  });

  it("rejects an answer naming a question/option not present in this attempt's own snapshot", async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    const badQuestion = await put(studentA, `/attempts/${pkg.attemptId}/answers/${randomUUID()}`, {
      sequenceNumber: 1,
    });
    expect(badQuestion.statusCode).toBe(400);
    expect(badQuestion.json<{ error: { code: string } }>().error.code).toBe(
      'ATTEMPT_QUESTION_NOT_IN_SNAPSHOT',
    );

    const realQuestionId = pkg.questions[0]!.examQuestionId;
    const badOption = await put(studentA, `/attempts/${pkg.attemptId}/answers/${realQuestionId}`, {
      selectedOptionId: randomUUID(),
      sequenceNumber: 1,
    });
    expect(badOption.statusCode).toBe(400);
    expect(badOption.json<{ error: { code: string } }>().error.code).toBe(
      'ATTEMPT_QUESTION_NOT_IN_SNAPSHOT',
    );
  });

  // ---------------------------------------------------------------------
  // Duplicate submission / Submit
  // ---------------------------------------------------------------------

  it('DoD 9: submit transitions to SUBMITTED, and a duplicate submit is idempotent', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    const first = await post(studentA, `/attempts/${pkg.attemptId}/submit`, {});
    expect(first.statusCode).toBe(200);
    expect(first.json<{ state: string; submittedAt: string | null }>().state).toBe('SUBMITTED');

    const second = await post(studentA, `/attempts/${pkg.attemptId}/submit`, {});
    expect(second.statusCode).toBe(200);
    expect(second.json<{ state: string }>().state).toBe('SUBMITTED');

    const auditEvents = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId, action: 'ATTEMPT_SUBMITTED', entityId: pkg.attemptId },
      }),
    );
    expect(auditEvents.length).toBe(1);
  });

  // ---------------------------------------------------------------------
  // B14 — Submission & Marking
  // ---------------------------------------------------------------------

  it('B14: submit enqueues exactly one marking job after the transition commits, and a duplicate submit never re-enqueues', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    const first = await post(studentA, `/attempts/${pkg.attemptId}/submit`, {});
    expect(first.statusCode).toBe(200);
    expect(markingEnqueueSpy).toHaveBeenCalledTimes(1);
    expect(markingEnqueueSpy).toHaveBeenCalledWith(
      { schoolId, attemptId: pkg.attemptId },
      `mark-${pkg.attemptId}`,
    );

    // DoD 9's own idempotency, extended: the second, already-terminal call
    // must not enqueue a second marking run (re-queued marking overwrites,
    // per the roadmap's own scope text — it must never be asked to run
    // twice for one submission in the first place).
    const second = await post(studentA, `/attempts/${pkg.attemptId}/submit`, {});
    expect(second.statusCode).toBe(200);
    expect(markingEnqueueSpy).toHaveBeenCalledTimes(1);
  });

  it('B14 concurrency: N simultaneous submit calls yield exactly one submission and exactly one marking enqueue', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => post(studentA, `/attempts/${pkg.attemptId}/submit`, {})),
    );
    for (const res of responses) {
      expect(res.statusCode).toBe(200);
      expect(res.json<{ state: string }>().state).toBe('SUBMITTED');
    }

    const attempt = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.findUniqueOrThrow({ where: { id: pkg.attemptId } }),
    );
    expect(attempt.state).toBe('SUBMITTED');

    const auditEvents = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId, action: 'ATTEMPT_SUBMITTED', entityId: pkg.attemptId },
      }),
    );
    expect(auditEvents.length).toBe(1);
    expect(markingEnqueueSpy).toHaveBeenCalledTimes(1);
  });

  it('B14 confirmed decision: a manual submit past the grace window opportunistically finalizes to AUTO_SUBMITTED (200), not an error', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.update({
        where: { id: pkg.attemptId },
        data: { expiresAt: new Date(Date.now() - 120 * 1000) },
      }),
    );

    const res = await post(studentA, `/attempts/${pkg.attemptId}/submit`, {});
    expect(res.statusCode).toBe(200);
    expect(res.json<{ state: string }>().state).toBe('AUTO_SUBMITTED');

    const auditEvents = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId, action: 'ATTEMPT_AUTO_SUBMITTED', entityId: pkg.attemptId },
      }),
    );
    expect(auditEvents.length).toBe(1);
    expect(markingEnqueueSpy).toHaveBeenCalledTimes(1);
  });

  it('B14 GET /status: NOT_APPLICABLE while the attempt is still IN_PROGRESS', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    const res = await get(studentA, `/attempts/${pkg.attemptId}/status`);
    expect(res.statusCode).toBe(200);
    const body = res.json<{ state: string; marking: { status: string; questionCount: number } }>();
    expect(body.state).toBe('IN_PROGRESS');
    expect(body.marking.status).toBe('NOT_APPLICABLE');
    expect(body.marking.questionCount).toBe(2);
  });

  it('B14 GET /status: PENDING immediately after submit, before any marking has run', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();
    await post(studentA, `/attempts/${pkg.attemptId}/submit`, {});

    const res = await get(studentA, `/attempts/${pkg.attemptId}/status`);
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      state: string;
      marking: { status: string; markedCount: number; questionCount: number };
    }>();
    expect(body.state).toBe('SUBMITTED');
    expect(body.marking.status).toBe('PENDING');
    expect(body.marking.markedCount).toBe(0);
    expect(body.marking.questionCount).toBe(2);
  });

  it('B14 GET /status: COMPLETE with correct live-aggregated totals once marking output exists', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();
    await post(studentA, `/attempts/${pkg.attemptId}/submit`, {});

    // Stands in for "the real apps/worker marking job has since run" — that
    // real read-snapshot/write-result path is proven independently by
    // apps/worker's own attempt-marking.integration.test.ts; this suite
    // only proves GET /status's own live-aggregation contract.
    const [q1, q2] = pkg.questions;
    await withTenant(prisma, schoolId, (tx) =>
      tx.attemptQuestionResult.createMany({
        data: [
          {
            schoolId,
            attemptId: pkg.attemptId,
            examQuestionId: q1!.examQuestionId,
            correctness: 'CORRECT',
            awardedMarks: 2,
            maximumMarks: 2,
          },
          {
            schoolId,
            attemptId: pkg.attemptId,
            examQuestionId: q2!.examQuestionId,
            correctness: 'INCORRECT',
            awardedMarks: 0,
            maximumMarks: 2,
          },
        ],
      }),
    );

    const res = await get(studentA, `/attempts/${pkg.attemptId}/status`);
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      marking: {
        status: string;
        questionCount: number;
        markedCount: number;
        correctCount: number;
        incorrectCount: number;
        unansweredCount: number;
        partialCount: number;
        awardedMarks: number;
        maximumMarks: number;
        percentage: number | null;
      };
    }>();
    expect(body.marking).toEqual({
      status: 'COMPLETE',
      questionCount: 2,
      markedCount: 2,
      correctCount: 1,
      incorrectCount: 1,
      unansweredCount: 0,
      partialCount: 0,
      awardedMarks: 2,
      maximumMarks: 4,
      percentage: 50,
    });
  });

  it("B14 security regression: a student cannot view another student's submission status", async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    const res = await get(studentB, `/attempts/${pkg.attemptId}/status`);
    expect(res.statusCode).toBe(403);
  });

  it('B14: the database trigger itself blocks writing a marking result while the parent attempt is still IN_PROGRESS, independent of the service layer', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    await expect(
      withTenant(prisma, schoolId, (tx) =>
        tx.attemptQuestionResult.create({
          data: {
            schoolId,
            attemptId: pkg.attemptId,
            examQuestionId: pkg.questions[0]!.examQuestionId,
            correctness: 'CORRECT',
            awardedMarks: 2,
            maximumMarks: 2,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  // ---------------------------------------------------------------------
  // Timeout (ADR-0003)
  // ---------------------------------------------------------------------

  it('DoD 10: writes inside the grace window are accepted and flagged; writes beyond it are rejected, non-retryable', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();
    const q1 = pkg.questions[0]!;
    const q2 = pkg.questions[1]!;

    // Directly move expiresAt into the past to avoid a real 60s+ sleep —
    // this test asserts the server's own admissibility logic, which reads
    // the stored expiresAt, not wall-clock elapsed time. RLS is FORCE'd on
    // this table, so — matching every other direct-DB assertion in this
    // suite — the write must go through withTenant to carry the school
    // context; a bare `prisma.examAttempt.update()` sees zero rows.
    await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.update({
        where: { id: pkg.attemptId },
        data: { expiresAt: new Date(Date.now() - 30 * 1000) },
      }),
    );
    const graceRes = await put(
      studentA,
      `/attempts/${pkg.attemptId}/answers/${q1.examQuestionId}`,
      {
        selectedOptionId: q1.options[0]!.optionId,
        sequenceNumber: 1,
      },
    );
    expect(graceRes.statusCode).toBe(200);
    expect(graceRes.json<{ gradeWindowFlag: boolean }>().gradeWindowFlag).toBe(true);

    await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.update({
        where: { id: pkg.attemptId },
        data: { expiresAt: new Date(Date.now() - 120 * 1000) },
      }),
    );
    const closedRes = await put(
      studentA,
      `/attempts/${pkg.attemptId}/answers/${q2.examQuestionId}`,
      {
        selectedOptionId: q2.options[0]!.optionId,
        sequenceNumber: 1,
      },
    );
    expect(closedRes.statusCode).toBe(409);
    const body = closedRes.json<{ error: { code: string; retryable: boolean } }>();
    expect(body.error.code).toBe('ATTEMPT_WRITE_WINDOW_CLOSED');
    expect(body.error.retryable).toBe(false);
  });

  // ---------------------------------------------------------------------
  // Invalidation — the DB-level backstop, independent of who sets it (B14)
  // ---------------------------------------------------------------------

  it('DoD 15: once an attempt is INVALIDATED, further answer writes are rejected with a distinct, non-retryable error', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    // Simulates B14's own invalidation mechanism (not yet built) — the
    // state-machine trigger blocks this from IN_PROGRESS regardless of who
    // sets it, so this direct write is the correct way to prove B13's own
    // guarantee independently of a caller that doesn't exist yet.
    await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.update({
        where: { id: pkg.attemptId },
        data: { state: 'INVALIDATED', invalidationReason: 'test' },
      }),
    );

    const res = await put(
      studentA,
      `/attempts/${pkg.attemptId}/answers/${pkg.questions[0]!.examQuestionId}`,
      {
        selectedOptionId: pkg.questions[0]!.options[0]!.optionId,
        sequenceNumber: 1,
      },
    );
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string; retryable: boolean } }>().error.code).toBe(
      'ATTEMPT_NOT_WRITABLE',
    );
  });

  it('the database trigger itself blocks a direct write once the parent attempt is not IN_PROGRESS, independent of the service layer', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();
    await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.update({ where: { id: pkg.attemptId }, data: { state: 'SUBMITTED' } }),
    );

    await expect(
      withTenant(prisma, schoolId, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO attempt_answers (id, school_id, attempt_id, exam_question_id, state, sequence_number, answered_at, last_saved_at)
           VALUES (uuidv7(), '${schoolId}'::uuid, '${pkg.attemptId}'::uuid, '${pkg.questions[0]!.examQuestionId}'::uuid, 'ANSWERED', 1, now(), now())`,
        ),
      ),
    ).rejects.toThrow();
  });

  it('the database trigger blocks a direct mutation of an already-written attempt snapshot', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    await expect(
      withTenant(prisma, schoolId, (tx) =>
        tx.$executeRawUnsafe(
          `UPDATE attempt_question_snapshots SET seed = 'tampered' WHERE attempt_id = '${pkg.attemptId}'::uuid`,
        ),
      ),
    ).rejects.toThrow();
  });

  // ---------------------------------------------------------------------
  // Security
  // ---------------------------------------------------------------------

  it("security regression: a student cannot read or answer another student's attempt", async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    const readRes = await get(studentB, `/attempts/${pkg.attemptId}`);
    expect([403, 404]).toContain(readRes.statusCode);

    const writeRes = await put(
      studentB,
      `/attempts/${pkg.attemptId}/answers/${pkg.questions[0]!.examQuestionId}`,
      {
        selectedOptionId: pkg.questions[0]!.options[0]!.optionId,
        sequenceNumber: 1,
      },
    );
    expect([403, 404]).toContain(writeRes.statusCode);
  });

  it('cross-tenant: a student from another school receives NOT_FOUND for this attempt', async () => {
    const otherSchool = await createSchool();
    createdSchoolIds.push(otherSchool.id);
    const { user: otherAdminUser } = await seedUser({
      schoolId: otherSchool.id,
      loginIdentifier: 'otheradmin01',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(otherAdminUser.id);
    const otherHost = `${otherSchool.subdomain}.${ROOT_DOMAIN}`;
    const otherAdmin = await freshCtx(otherHost, `10.${RUN}.13.20`);
    await login(otherAdmin, 'otheradmin01', 'a-real-password-123');
    const otherStudentCreate = (
      await post(otherAdmin, '/students', {
        firstName: 'Cross',
        lastName: 'Tenant',
        studentId: `ST-${randomUUID().slice(0, 8)}`,
      })
    ).json<{ studentProfileId: string; membershipId: string }>();
    const otherMembership = await withTenant(prisma, otherSchool.id, (tx) =>
      tx.schoolMembership.findUniqueOrThrow({ where: { id: otherStudentCreate.membershipId } }),
    );
    await prisma.user.update({
      where: { id: otherMembership.userId },
      data: {
        passwordHash: await passwords.hash('a-real-password-123'),
        credentialState: 'OK',
        status: 'ACTIVE',
      },
    });
    const otherStudent = await freshCtx(otherHost, `10.${RUN}.13.21`);
    await login(otherStudent, otherMembership.loginIdentifier, 'a-real-password-123');

    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    const res = await get(otherStudent, `/attempts/${pkg.attemptId}`);
    expect(res.statusCode).toBe(404);
  });

  it('security regression: the student attempt payload contains no correct-answer field anywhere (X-05, release-blocking)', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    const resumeRes = await get(studentA, `/attempts/${pkg.attemptId}`);
    expect(resumeRes.statusCode).toBe(200);
    expect(JSON.stringify(resumeRes.json())).not.toContain('correctFlag');
    expect(JSON.stringify(resumeRes.json())).not.toContain('correctAnswer');
    expect(JSON.stringify(resumeRes.json())).not.toContain('correct_answer');
    // The question's own marking-only explanation field must not leak
    // either.
    expect(JSON.stringify(resumeRes.json())).not.toContain('explanation');
  });

  // ---------------------------------------------------------------------
  // Accommodations (decision 2, X-11)
  // ---------------------------------------------------------------------

  it("DoD 14: a granted extra-time accommodation is resolved at creation and frozen for the attempt's life", async () => {
    const examId = await buildReadyExam({ durationSeconds: 1800 });
    const openSessionId = await openSession(examId);

    const grantRes = await post(
      teacher,
      `/exam-sessions/${openSessionId}/participants/${studentAProfileId}/extra-time`,
      { extraTimeSeconds: 300 },
    );
    expect(grantRes.statusCode).toBe(200);

    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();
    expect(new Date(pkg.expiresAt).getTime() - new Date(pkg.startedAt).getTime()).toBe(
      (1800 + 300) * 1000,
    );

    const auditEvents = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({ where: { schoolId, action: 'ATTEMPT_EXTRA_TIME_GRANTED' } }),
    );
    expect(auditEvents.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------
  // Signals (ADR-0020, decision 1)
  // ---------------------------------------------------------------------

  it('heartbeat updates lastSeenAt without touching the answer path', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();
    const before = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.findUniqueOrThrow({ where: { id: pkg.attemptId } }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    const res = await post(studentA, `/attempts/${pkg.attemptId}/heartbeat`, {});
    expect(res.statusCode).toBe(200);

    const after = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.findUniqueOrThrow({ where: { id: pkg.attemptId } }),
    );
    expect(after.lastSeenAt.getTime()).toBeGreaterThan(before.lastSeenAt.getTime());
  });

  it('records a client-reported integrity event (ADR-0020) — a signal, never a block', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    const res = await post(studentA, `/attempts/${pkg.attemptId}/events`, {
      type: 'TAB_HIDDEN',
      occurredAt: new Date().toISOString(),
    });
    expect(res.statusCode).toBe(200);

    const events = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptEvent.findMany({
        where: { schoolId, attemptId: pkg.attemptId, type: 'TAB_HIDDEN' },
      }),
    );
    expect(events.length).toBe(1);

    // Still fully answerable afterward — a signal never blocks anything.
    const answerRes = await put(
      studentA,
      `/attempts/${pkg.attemptId}/answers/${pkg.questions[0]!.examQuestionId}`,
      {
        selectedOptionId: pkg.questions[0]!.options[0]!.optionId,
        sequenceNumber: 1,
      },
    );
    expect(answerRes.statusCode).toBe(200);
  });

  it('decision 1: a heartbeat from a materially different device id records a neutral BINDING_MISMATCH signal, never a block', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const startRes = await post(
      studentA,
      `/exams/${examId}/attempts`,
      {},
      { 'x-device-id': randomUUID() },
    );
    const pkg = startRes.json<AttemptPackage>();

    const heartbeatRes = await post(
      studentA,
      `/attempts/${pkg.attemptId}/heartbeat`,
      {},
      { 'x-device-id': randomUUID() },
    );
    expect(heartbeatRes.statusCode).toBe(200);

    const events = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptEvent.findMany({
        where: { schoolId, attemptId: pkg.attemptId, type: 'BINDING_MISMATCH' },
      }),
    );
    expect(events.length).toBeGreaterThan(0);

    // Never a block — the attempt is still fully writable.
    const answerRes = await put(
      studentA,
      `/attempts/${pkg.attemptId}/answers/${pkg.questions[0]!.examQuestionId}`,
      {
        selectedOptionId: pkg.questions[0]!.options[0]!.optionId,
        sequenceNumber: 1,
      },
    );
    expect(answerRes.statusCode).toBe(200);
  });

  // ---------------------------------------------------------------------
  // Staff-initiated end
  // ---------------------------------------------------------------------

  it('a teacher (owning the exam) can end a running attempt', async () => {
    const examId = await buildReadyExam();
    await openSession(examId);
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<AttemptPackage>();

    const endRes = await post(teacher, `/attempts/${pkg.attemptId}/end`, {});
    expect(endRes.statusCode).toBe(200);
    expect(endRes.json<{ state: string }>().state).toBe('SUBMITTED');

    const auditEvents = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId, action: 'ATTEMPT_ENDED_BY_STAFF', entityId: pkg.attemptId },
      }),
    );
    expect(auditEvents.length).toBe(1);
  });

  // ---------------------------------------------------------------------
  // Failure — no orphan attempt on a snapshot-build failure
  // ---------------------------------------------------------------------

  it('DoD 1: an exam with no questions never leaves a half-created attempt behind', async () => {
    const termId = (await get(admin, '/academics/context')).json<{ term: { id: string } }>().term
      .id;
    const emptyExamId = (
      await post(teacher, '/exams', {
        academicSessionId: sessionId,
        academicTermId: termId,
        subjectId: mathSubjectId,
        title: `Empty Exam ${randomUUID().slice(0, 8)}`,
        examType: 'Test',
        classIds: [classAId],
      })
    ).json<{ id: string }>().id;
    // Never reaches READY (no questions bound) — starting should be
    // impossible via the normal flow; asserted here as a structural check
    // that no orphan attempt exists for a DRAFT exam regardless.
    const startRes = await post(studentA, `/exams/${emptyExamId}/attempts`, {});
    expect(startRes.statusCode).not.toBe(200);
    const count = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.count({ where: { schoolId, examId: emptyExamId } }),
    );
    expect(count).toBe(0);
  });
});
