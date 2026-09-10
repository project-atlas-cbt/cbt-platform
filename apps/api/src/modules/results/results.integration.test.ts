/**
 * B15 — Results & Publication. Mirrors `attempt.integration.test.ts`'s
 * harness exactly (real HTTP via `app.inject()` against a real running
 * `AppModule` and real Postgres), organised by the roadmap's own
 * testing-requirements table: Integration, Data integrity, Security,
 * Grading, Publication policy.
 *
 * Marking itself is SIMULATED here rather than driven through the real
 * queue: the marking consumer lives in `apps/worker`, which this process
 * cannot import, and its own behaviour (including B15's result finalisation
 * and automatic publication) is proven by
 * `apps/worker/src/queues/attempt-marking.integration.test.ts`. This suite's
 * job is `results.v1`/`student-results.v1` — everything downstream of a
 * finalised result.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import { computeResultTotals, type Role } from '@atlas/domain';
import { AppModule } from '../../app.module.js';
import { PasswordService } from '../identity/password.service.js';
import { AttemptMarkingQueueService } from '../execution/attempt-marking-queue.service.js';
import { ResultAdjustmentQueueService } from './result-adjustment-queue.service.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
const RUN = Math.floor(Math.random() * 200) + 1;

let app: NestFastifyApplication;
const passwords = new PasswordService();
let markingEnqueueSpy: MockInstance<AttemptMarkingQueueService['enqueue']>;
let adjustmentEnqueueSpy: MockInstance<ResultAdjustmentQueueService['enqueue']>;

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  markingEnqueueSpy = vi
    .spyOn(app.get(AttemptMarkingQueueService), 'enqueue')
    .mockResolvedValue(undefined);
  // The adjustment consumer lives in apps/worker; this suite asserts only
  // that the API enqueues correctly and that the operation is created with
  // the right hold in place. The worker's own suite proves the processing.
  adjustmentEnqueueSpy = vi
    .spyOn(app.get(ResultAdjustmentQueueService), 'enqueue')
    .mockResolvedValue(undefined);
});

afterAll(async () => {
  await app.close();
});

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
    // `result_adjustments` carries an UNCONDITIONAL immutability trigger, and
    // the attempt tables carry their own — so every step is best-effort,
    // matching attempt.integration.test.ts's established precedent. Leftover
    // rows are harmless: RLS-scoped, uniquely named, unreachable outside
    // their own school's context.
    const del = async (fn: () => Promise<unknown>) => {
      await fn().catch(() => undefined);
    };
    await del(() =>
      withTenant(prisma, schoolId, (tx) => tx.resultAdjustment.deleteMany({ where: { schoolId } })),
    );
    await del(() =>
      withTenant(prisma, schoolId, (tx) =>
        tx.resultAdjustmentOperation.deleteMany({ where: { schoolId } }),
      ),
    );
    await del(() =>
      withTenant(prisma, schoolId, (tx) => tx.result.deleteMany({ where: { schoolId } })),
    );
    await del(() =>
      withTenant(prisma, schoolId, (tx) =>
        tx.resultPublication.deleteMany({ where: { schoolId } }),
      ),
    );
    await del(() =>
      withTenant(prisma, schoolId, (tx) =>
        tx.gradingScale.updateMany({ where: { schoolId }, data: { currentVersionId: null } }),
      ),
    );
    await del(() =>
      withTenant(prisma, schoolId, (tx) => tx.gradingScaleBand.deleteMany({ where: { schoolId } })),
    );
    await del(() =>
      withTenant(prisma, schoolId, (tx) =>
        tx.gradingScaleVersion.deleteMany({ where: { schoolId } }),
      ),
    );
    await del(() =>
      withTenant(prisma, schoolId, (tx) => tx.gradingScale.deleteMany({ where: { schoolId } })),
    );
    for (const table of [
      'attemptEvent',
      'attemptAnswerEvent',
      'attemptAnswer',
      'attemptQuestionResult',
      'attemptQuestionSnapshot',
      'examAttempt',
      'examParticipation',
      'examSessionParticipant',
      'examSession',
      'exam',
      'question',
      'topic',
      'studentSubjectRegistration',
      'studentEnrollment',
      'studentProfile',
      'teacherAssignment',
      'classSubject',
      'hODAssignment',
      'classGroup',
      'subject',
      'department',
      'academicTerm',
      'academicSession',
      'teacherProfile',
      'notification',
      'auditEvent',
      'roleAssignment',
      'schoolMembership',
    ] as const) {
      await del(() =>
        withTenant(prisma, schoolId, (tx) =>
          (tx[table] as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({
            where: { schoolId },
          }),
        ),
      );
    }
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
  await prisma.school
    .deleteMany({ where: { id: { in: createdSchoolIds } } })
    .catch(() => undefined);
});

describe('B15 Results & Publication (results.v1 / student-results.v1)', () => {
  let schoolId: string;
  let host: string;
  let admin: RequestCtx;
  let teacher: RequestCtx;
  let hod: RequestCtx;
  let studentA: RequestCtx;
  let studentB: RequestCtx;
  let sessionId: string;
  let termId: string;
  let classAId: string;
  let mathSubjectId: string;
  let studentAProfileId: string;
  let studentBProfileId: string;
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
    await post(teacher, `/questions/${q.id}/revisions/${revisionId}/submit`);
    await post(hod, `/reviews/questions/${q.id}/approve`, {});
    return revisionId;
  }

  async function buildReadyExam(opts?: {
    resultPolicy?: string;
    resultDetailVisibility?: string;
  }): Promise<string> {
    const examId = (
      await post(teacher, '/exams', {
        academicSessionId: sessionId,
        academicTermId: termId,
        subjectId: mathSubjectId,
        title: `Results Test ${randomUUID().slice(0, 8)}`,
        examType: 'Test',
        classIds: [classAId],
      })
    ).json<{ id: string }>().id;
    await put(teacher, `/exams/${examId}/questions`, {
      questions: approvedRevisionIds.map((questionRevisionId) => ({ questionRevisionId })),
    });
    await put(teacher, `/exams/${examId}/configuration`, {
      durationSeconds: 3600,
      attemptLimit: 1,
      randomizeQuestions: false,
      randomizeOptions: false,
      resultPolicy: opts?.resultPolicy ?? 'TEACHER',
      resultDetailVisibility: opts?.resultDetailVisibility ?? 'SCORE_AND_COUNTS',
      generalInstructions: 'Answer all.',
      navigationInstructions: 'Free navigation.',
      submissionInstructions: 'Submit when done.',
      accessMode: 'OPEN_TO_ELIGIBLE',
    });
    await post(teacher, `/exams/${examId}/ready`, {});
    return examId;
  }

  /**
   * Runs a student's attempt end to end and simulates the marking worker:
   * writes the real `AttemptQuestionResult` rows the worker would write, then
   * moves the result `PROCESSING → FINAL` with the totals `@atlas/domain`
   * computes. Deliberately uses the SAME shared function the worker does, so
   * this simulation cannot drift from real marking arithmetic.
   */
  async function sitExamAndMark(
    student: RequestCtx,
    examId: string,
    correctAnswers: number,
  ): Promise<{ attemptId: string; resultId: string }> {
    const pkg = (await post(student, `/exams/${examId}/attempts`, {})).json<{
      attemptId: string;
      questions: {
        examQuestionId: string;
        options: { optionId: string; content: string }[];
      }[];
    }>();

    let answered = 0;
    for (const question of pkg.questions) {
      const shouldBeCorrect = answered < correctAnswers;
      answered += 1;
      const snapshotOption = await pickOption(
        pkg.attemptId,
        question.examQuestionId,
        shouldBeCorrect,
      );
      await put(student, `/attempts/${pkg.attemptId}/answers/${question.examQuestionId}`, {
        selectedOptionId: snapshotOption,
        sequenceNumber: answered,
      });
    }

    await post(student, `/attempts/${pkg.attemptId}/submit`, {});

    // --- what apps/worker's marking consumer does, replayed here ---
    const marking = await markAttempt(pkg.attemptId);
    const result = await withTenant(prisma, schoolId, (tx) =>
      tx.result.findUniqueOrThrow({
        where: { schoolId_attemptId: { schoolId, attemptId: pkg.attemptId } },
      }),
    );
    return { attemptId: pkg.attemptId, resultId: result.id, ...marking };
  }

  /** Chooses a correct or incorrect option by reading the snapshot's own
   * `correctFlag` — server-side data the student payload never carries
   * (X-05), which is exactly why the test reads it from the database. */
  async function pickOption(
    attemptId: string,
    examQuestionId: string,
    correct: boolean,
  ): Promise<string> {
    const snapshot = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptQuestionSnapshot.findUniqueOrThrow({
        where: { schoolId_attemptId: { schoolId, attemptId } },
      }),
    );
    const doc = snapshot.document as unknown as {
      questions: {
        examQuestionId: string;
        options: { optionId: string; correctFlag: boolean }[];
      }[];
    };
    const question = doc.questions.find((q) => q.examQuestionId === examQuestionId)!;
    const option = question.options.find((o) => o.correctFlag === correct)!;
    return option.optionId;
  }

  async function markAttempt(attemptId: string): Promise<Record<string, never>> {
    const snapshot = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptQuestionSnapshot.findUniqueOrThrow({
        where: { schoolId_attemptId: { schoolId, attemptId } },
      }),
    );
    const answers = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptAnswer.findMany({ where: { schoolId, attemptId } }),
    );
    const doc = snapshot.document as unknown as {
      questions: {
        examQuestionId: string;
        marks: number;
        options: { optionId: string; correctFlag: boolean }[];
      }[];
    };

    const rows = doc.questions.map((q) => {
      const answer = answers.find((a) => a.examQuestionId === q.examQuestionId);
      const selected = q.options.find((o) => o.optionId === answer?.selectedOptionId);
      const correctness = !answer?.selectedOptionId
        ? ('UNANSWERED' as const)
        : selected?.correctFlag
          ? ('CORRECT' as const)
          : ('INCORRECT' as const);
      return {
        examQuestionId: q.examQuestionId,
        correctness,
        awardedMarks: correctness === 'CORRECT' ? q.marks : 0,
        maximumMarks: q.marks,
      };
    });

    await withTenant(prisma, schoolId, async (tx) => {
      for (const row of rows) {
        await tx.attemptQuestionResult.create({ data: { schoolId, attemptId, ...row } });
      }
      const totals = computeResultTotals(rows);
      const scale = await tx.gradingScale.findFirst({
        where: { schoolId, archivedAt: null, currentVersionId: { not: null } },
        include: { currentVersion: { include: { bands: true } } },
      });
      const band = scale?.currentVersion?.bands.find(
        (b) =>
          totals.percentage >= Number(b.minPercentage) &&
          totals.percentage <= Number(b.maxPercentage),
      );
      await tx.result.update({
        where: { schoolId_attemptId: { schoolId, attemptId } },
        data: {
          state: 'FINAL',
          finalizedAt: new Date(),
          ...totals,
          ...(band && { grade: band.label, gradingScaleVersionId: scale!.currentVersion!.id }),
        },
      });
    });
    return {};
  }

  async function giveStudentLogin(membershipId: string, remoteAddress: string) {
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
    await login(ctx, membership.loginIdentifier, 'a-real-password-123');
    return ctx;
  }

  /** This suite's school accumulates results across tests, so visibility is
   * asserted per-result rather than by list length — a length assertion
   * would couple every test to the order of the ones before it. */
  async function studentSeesResult(student: RequestCtx, resultId: string): Promise<boolean> {
    const body = (await get(student, '/student/results')).json<{ items: { id: string }[] }>();
    return body.items.some((i) => i.id === resultId);
  }

  async function studentSeesExam(student: RequestCtx, examId: string): Promise<boolean> {
    const body = (await get(student, '/student/results')).json<{ items: { examId: string }[] }>();
    return body.items.some((i) => i.examId === examId);
  }

  beforeAll(async () => {
    const school = await prisma.school.create({
      data: {
        name: `Results Test School ${randomUUID()}`,
        subdomain: `res-${randomUUID().slice(0, 8)}`,
        status: 'ACTIVE',
      },
    });
    schoolId = school.id;
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolId);

    const { user: adminUser } = await seedUser({
      schoolId,
      loginIdentifier: 'resadmin01',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(adminUser.id);
    admin = await freshCtx(host, `10.${RUN}.15.1`);
    await login(admin, 'resadmin01', 'a-real-password-123');

    sessionId = (
      await post(admin, '/academics/sessions', {
        name: `Results Session ${randomUUID().slice(0, 8)}`,
        startDate: '2026-09-01',
        endDate: '2027-07-31',
      })
    ).json<{ id: string }>().id;
    termId = (
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

    const teacherBody = (
      await post(admin, '/teachers', {
        firstName: 'Ade',
        lastName: 'Ola',
        email: `ade-${randomUUID().slice(0, 8)}@example.com`,
        staffId: `STF-${randomUUID().slice(0, 8)}`,
      })
    ).json<{ teacherProfileId: string; membershipId: string; loginIdentifier: string }>();
    await prisma.user.update({
      where: { id: await userIdForMembership(schoolId, teacherBody.membershipId) },
      data: {
        passwordHash: await passwords.hash('a-real-password-123'),
        credentialState: 'OK',
        status: 'ACTIVE',
      },
    });
    const offeringId = (await get(admin, `/academics/classes/${classAId}/subjects`))
      .json<{ offerings: { id: string; subjectId: string }[] }>()
      .offerings.find((o) => o.subjectId === mathSubjectId)!.id;
    await put(admin, `/teachers/${teacherBody.teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [offeringId],
    });
    teacher = await freshCtx(host, `10.${RUN}.15.2`);
    await login(teacher, teacherBody.loginIdentifier, 'a-real-password-123');

    const hodBody = (
      await post(admin, '/teachers', {
        firstName: 'Bola',
        lastName: 'Ige',
        email: `bola-${randomUUID().slice(0, 8)}@example.com`,
        staffId: `STF-${randomUUID().slice(0, 8)}`,
      })
    ).json<{ membershipId: string; loginIdentifier: string }>();
    await prisma.user.update({
      where: { id: await userIdForMembership(schoolId, hodBody.membershipId) },
      data: {
        passwordHash: await passwords.hash('a-real-password-123'),
        credentialState: 'OK',
        status: 'ACTIVE',
      },
    });
    await post(admin, '/hods', { membershipId: hodBody.membershipId });
    await put(admin, `/hods/${hodBody.membershipId}/department`, {
      departmentId: deptId,
      academicSessionId: sessionId,
    });
    hod = await freshCtx(host, `10.${RUN}.15.3`);
    await login(hod, hodBody.loginIdentifier, 'a-real-password-123');

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
    studentA = await giveStudentLogin(studentACreate.membershipId, `10.${RUN}.15.10`);

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
    studentB = await giveStudentLogin(studentBCreate.membershipId, `10.${RUN}.15.11`);

    approvedRevisionIds = [
      await createApprovedQuestion('What is 2 + 3?', 1),
      await createApprovedQuestion('What is 10 - 6?', 0),
    ];
  });

  // ---------------------------------------------------------------------
  // Grading scale (ADR-0018)
  // ---------------------------------------------------------------------

  it('DoD 8: creates a grading scale, and editing it creates a version rather than mutating bands', async () => {
    const listBefore = (await get(admin, '/school/grading-scales')).json<{
      items: unknown[];
      defaultTemplate: { label: string }[];
    }>();
    expect(listBefore.defaultTemplate.map((b) => b.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);

    const created = (
      await put(admin, '/school/grading-scales', {
        name: 'School default',
        bands: [
          { label: 'A', minPercentage: 70, maxPercentage: 100, isPassing: true },
          { label: 'C', minPercentage: 50, maxPercentage: 69.99, isPassing: true },
          { label: 'F', minPercentage: 0, maxPercentage: 49.99, isPassing: false },
        ],
      })
    ).json<{ id: string; currentVersion: { id: string; versionNumber: number } }>();
    expect(created.currentVersion.versionNumber).toBe(1);

    const revised = (
      await put(admin, '/school/grading-scales', {
        scaleId: created.id,
        name: 'School default',
        bands: [
          { label: 'A', minPercentage: 80, maxPercentage: 100, isPassing: true },
          { label: 'C', minPercentage: 40, maxPercentage: 79.99, isPassing: true },
          { label: 'F', minPercentage: 0, maxPercentage: 39.99, isPassing: false },
        ],
      })
    ).json<{ currentVersion: { id: string; versionNumber: number } }>();

    expect(revised.currentVersion.versionNumber).toBe(2);
    expect(revised.currentVersion.id).not.toBe(created.currentVersion.id);

    const versions = (await get(admin, `/school/grading-scales/${created.id}/versions`)).json<{
      items: { versionNumber: number; bands: { label: string; minPercentage: number }[] }[];
    }>();
    expect(versions.items).toHaveLength(2);
    // Version 1's bands are untouched by version 2's creation — the whole
    // point of versioning rather than editing.
    const v1 = versions.items.find((v) => v.versionNumber === 1)!;
    expect(v1.bands.find((b) => b.label === 'A')!.minPercentage).toBe(70);
  });

  it('rejects a scale whose bands overlap or leave a gap', async () => {
    const overlapping = await put(admin, '/school/grading-scales', {
      name: 'Bad scale',
      bands: [
        { label: 'A', minPercentage: 40, maxPercentage: 100, isPassing: true },
        { label: 'F', minPercentage: 0, maxPercentage: 60, isPassing: false },
      ],
    });
    expect(overlapping.statusCode).toBe(400);
    expect(overlapping.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');

    const gapped = await put(admin, '/school/grading-scales', {
      name: 'Bad scale',
      bands: [
        { label: 'A', minPercentage: 60, maxPercentage: 100, isPassing: true },
        { label: 'F', minPercentage: 0, maxPercentage: 40, isPassing: false },
      ],
    });
    expect(gapped.statusCode).toBe(400);
  });

  it('a teacher cannot read or write grading configuration', async () => {
    expect((await get(teacher, '/school/grading-scales')).statusCode).toBe(403);
    expect(
      (
        await put(teacher, '/school/grading-scales', {
          name: 'Teacher scale',
          bands: [{ label: 'P', minPercentage: 0, maxPercentage: 100, isPassing: true }],
        })
      ).statusCode,
    ).toBe(403);
  });

  // ---------------------------------------------------------------------
  // Integration: mark → finalise → publish → student sees → unpublish
  // ---------------------------------------------------------------------

  it('DoD 1/2/3/5/13: the full lifecycle, and unpublishing reverses student visibility', async () => {
    const examId = await buildReadyExam();
    await post(teacher, `/exams/${examId}/sessions`, {});

    // A result exists in PROCESSING the moment the attempt is submitted —
    // before any marking has run (07 §29, DoD item 2).
    const pkg = (await post(studentA, `/exams/${examId}/attempts`, {})).json<{
      attemptId: string;
    }>();
    await post(studentA, `/attempts/${pkg.attemptId}/submit`, {});
    const processing = await withTenant(prisma, schoolId, (tx) =>
      tx.result.findUniqueOrThrow({
        where: { schoolId_attemptId: { schoolId, attemptId: pkg.attemptId } },
      }),
    );
    expect(processing.state).toBe('PROCESSING');
    expect(processing.finalizedAt).toBeNull();
    expect(markingEnqueueSpy).toHaveBeenCalled();

    await markAttempt(pkg.attemptId);

    const finalised = await withTenant(prisma, schoolId, (tx) =>
      tx.result.findUniqueOrThrow({
        where: { schoolId_attemptId: { schoolId, attemptId: pkg.attemptId } },
      }),
    );
    expect(finalised.state).toBe('FINAL');
    expect(finalised.totalMarks).toBe(4);
    // Both questions unanswered — 07 §42 invariant 9: no attempt at a
    // question is not a wrong answer, and earns nothing.
    expect(finalised.earnedMarks).toBe(0);
    expect(finalised.unansweredCount).toBe(2);

    // Not visible before publication.
    expect(await studentSeesExam(studentA, examId)).toBe(false);

    const publishRes = await post(teacher, `/exams/${examId}/results/publish`, {});
    expect(publishRes.statusCode).toBe(200);
    expect(publishRes.json<{ status: string; affectedResultCount: number }>()).toMatchObject({
      status: 'PUBLISHED',
      affectedResultCount: 1,
    });

    const visible = (await get(studentA, '/student/results')).json<{
      items: { id: string; examId: string; earnedMarks: number; totalMarks: number }[];
    }>();
    const mine = visible.items.find((i) => i.examId === examId);
    expect(mine).toMatchObject({ earnedMarks: 0, totalMarks: 4 });

    // The student was notified — B10 declared RESULT_PUBLISHED and left this
    // producer to B15 (its own DoD item 6).
    const notifications = await withTenant(prisma, schoolId, (tx) =>
      tx.notification.findMany({ where: { schoolId, type: 'RESULT_PUBLISHED' } }),
    );
    expect(notifications.length).toBeGreaterThan(0);

    const unpublishRes = await post(teacher, `/exams/${examId}/results/unpublish`, {
      reason: 'Marking under review.',
    });
    expect(unpublishRes.statusCode).toBe(200);
    expect(await studentSeesExam(studentA, examId)).toBe(false);

    // Both directions audited (05 §65).
    const audits = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: {
          schoolId,
          entityId: examId,
          action: { in: ['RESULT_PUBLISHED', 'RESULT_UNPUBLISHED'] },
        },
      }),
    );
    expect(audits.map((a) => a.action).sort()).toEqual(['RESULT_PUBLISHED', 'RESULT_UNPUBLISHED']);
  });

  it("DoD 13: detail is gated by the exam's own result_detail_visibility policy", async () => {
    // Two exams rather than one mutated in place: B11's own exam-immutability
    // trigger correctly refuses a configuration change once an exam is READY,
    // which is exactly the guarantee that phase built.
    const scoreOnlyExam = await buildReadyExam({ resultDetailVisibility: 'SCORE_ONLY' });
    await post(teacher, `/exams/${scoreOnlyExam}/sessions`, {});
    const scoreOnlyResult = await sitExamAndMark(studentA, scoreOnlyExam, 2);
    await post(teacher, `/exams/${scoreOnlyExam}/results/publish`, {});

    const scoreOnly = (await get(studentA, `/student/results/${scoreOnlyResult.resultId}`)).json<{
      detailVisibility: string;
      correctCount: number | null;
      questions: unknown[];
      earnedMarks: number;
    }>();
    expect(scoreOnly.detailVisibility).toBe('SCORE_ONLY');
    expect(scoreOnly.correctCount).toBeNull();
    expect(scoreOnly.questions).toHaveLength(0);
    // Raw marks stay available regardless of grading/visibility config
    // (05 §46, DoD item 9).
    expect(scoreOnly.earnedMarks).toBe(4);

    const fullReviewExam = await buildReadyExam({ resultDetailVisibility: 'FULL_REVIEW' });
    await post(teacher, `/exams/${fullReviewExam}/sessions`, {});
    const fullReviewResult = await sitExamAndMark(studentB, fullReviewExam, 2);
    await post(teacher, `/exams/${fullReviewExam}/results/publish`, {});

    const fullReview = (await get(studentB, `/student/results/${fullReviewResult.resultId}`)).json<{
      correctCount: number;
      questions: { content: string; correctness: string }[];
    }>();
    expect(fullReview.correctCount).toBe(2);
    expect(fullReview.questions).toHaveLength(2);
    // Question review, never an answer key — the snapshot's correctFlag does
    // not leave the server (the X-05 boundary, extended to results).
    expect(JSON.stringify(fullReview)).not.toContain('correctFlag');
  });

  // ---------------------------------------------------------------------
  // Publication policy (DoD 7)
  // ---------------------------------------------------------------------

  it('DoD 7: a teacher cannot publish when the school has locked its result policy', async () => {
    const examId = await buildReadyExam({ resultPolicy: 'TEACHER' });
    await post(teacher, `/exams/${examId}/sessions`, {});
    await sitExamAndMark(studentA, examId, 1);

    await withTenant(prisma, schoolId, () =>
      prisma.school.update({
        where: { id: schoolId },
        data: { resultPolicy: 'SCHOOL_ADMIN', resultPolicyLocked: true },
      }),
    );

    const refused = await post(teacher, `/exams/${examId}/results/publish`, {});
    expect(refused.statusCode).toBe(403);
    expect(refused.json<{ error: { message: string } }>().error.message).toContain('locked');

    // The School Admin is unaffected by the lock — it constrains teachers,
    // not the administrative release the lock exists to require.
    expect((await post(admin, `/exams/${examId}/results/publish`, {})).statusCode).toBe(200);

    await prisma.school.update({
      where: { id: schoolId },
      data: { resultPolicy: 'SCHOOL_ADMIN', resultPolicyLocked: false },
    });
  });

  it('a teacher cannot publish an exam configured for administrative release', async () => {
    const examId = await buildReadyExam({ resultPolicy: 'SCHOOL_ADMIN' });
    await post(teacher, `/exams/${examId}/sessions`, {});
    await sitExamAndMark(studentA, examId, 1);

    const refused = await post(teacher, `/exams/${examId}/results/publish`, {});
    expect(refused.statusCode).toBe(403);
    expect((await post(admin, `/exams/${examId}/results/publish`, {})).statusCode).toBe(200);
  });

  // ---------------------------------------------------------------------
  // Withholding (ADR-0010)
  // ---------------------------------------------------------------------

  it('withholding hides one result without unpublishing the rest, and releasing restores it', async () => {
    const examId = await buildReadyExam();
    await post(teacher, `/exams/${examId}/sessions`, {});
    const a = await sitExamAndMark(studentA, examId, 2);
    await sitExamAndMark(studentB, examId, 1);
    await post(teacher, `/exams/${examId}/results/publish`, {});

    expect(await studentSeesResult(studentA, a.resultId)).toBe(true);

    const withheld = await post(teacher, `/results/${a.resultId}/withhold`, {
      reason: 'Suspected malpractice, under review.',
    });
    expect(withheld.statusCode).toBe(200);

    expect(await studentSeesResult(studentA, a.resultId)).toBe(false);
    // Student B's result for the same exam is untouched — this is the whole
    // reason withholding exists rather than unpublishing the cohort (A-09).
    expect(await studentSeesExam(studentB, examId)).toBe(true);

    // Staff still see it, with the reason.
    const staffView = (await get(teacher, `/results/${a.resultId}`)).json<{
      withheld: boolean;
      withheldReason: string;
    }>();
    expect(staffView.withheld).toBe(true);
    expect(staffView.withheldReason).toContain('malpractice');

    await post(teacher, `/results/${a.resultId}/release`, { reason: 'Cleared.' });
    expect(await studentSeesResult(studentA, a.resultId)).toBe(true);
  });

  it('a withhold without a reason is refused', async () => {
    const examId = await buildReadyExam();
    await post(teacher, `/exams/${examId}/sessions`, {});
    const a = await sitExamAndMark(studentA, examId, 1);

    expect(
      (await post(teacher, `/results/${a.resultId}/withhold`, { reason: '' })).statusCode,
    ).toBe(400);
  });

  // ---------------------------------------------------------------------
  // Data integrity (DoD 3, 4)
  // ---------------------------------------------------------------------

  it('DoD 3: the 1:1 attempt↔result constraint holds against a direct database write', async () => {
    const examId = await buildReadyExam();
    await post(teacher, `/exams/${examId}/sessions`, {});
    const a = await sitExamAndMark(studentA, examId, 1);

    const attempt = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.findUniqueOrThrow({ where: { id: a.attemptId } }),
    );

    // Bypasses the service layer entirely — the guarantee is the database's,
    // not the application's.
    await expect(
      withTenant(prisma, schoolId, (tx) =>
        tx.result.create({
          data: {
            schoolId,
            attemptId: a.attemptId,
            examId: attempt.examId,
            studentProfileId: attempt.studentProfileId,
            state: 'FINAL',
            totalMarks: 4,
            earnedMarks: 4,
            percentage: 100,
            correctCount: 2,
            incorrectCount: 0,
            unansweredCount: 0,
            partialCount: 0,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('DoD 4: a VOIDED result is retained, hidden from the student, and shown to staff with the invalidation reason', async () => {
    const examId = await buildReadyExam();
    await post(teacher, `/exams/${examId}/sessions`, {});
    const a = await sitExamAndMark(studentA, examId, 2);
    await post(teacher, `/exams/${examId}/results/publish`, {});
    expect(await studentSeesResult(studentA, a.resultId)).toBe(true);

    // B16 owns the invalidation ENDPOINT (ADR-0014 defers
    // examAdmin.invalidateAttempt there); B15 owns the VOIDED result state
    // and the exclusion. So the result transition is driven directly here —
    // the honest limit of what this phase can prove end to end.
    //
    // Note the attempt itself is NOT moved to INVALIDATED: B13's own
    // exam_attempts_status_transition_guard treats SUBMITTED as terminal, so
    // a submitted attempt cannot currently be invalidated at all. ADR-0025
    // explicitly contemplates exactly that case ("If a submitted, marked
    // attempt is invalidated, its Result still exists"), and 03 §76 / 05 §30
    // both allow invalidation after the student has started. That conflict is
    // real and is B16's to resolve — recorded in the roadmap rather than
    // resolved here, since changing another phase's shipped state machine is
    // outside B15's scope. Only `invalidationReason` is set (the trigger
    // fires on UPDATE OF state), which is what a VOIDED result reads.
    await withTenant(prisma, schoolId, async (tx) => {
      await tx.examAttempt.update({
        where: { id: a.attemptId },
        data: { invalidationReason: 'Malpractice confirmed by invigilator.' },
      });
      await tx.result.update({ where: { id: a.resultId }, data: { state: 'VOIDED' } });
    });

    expect(await studentSeesResult(studentA, a.resultId)).toBe(false);
    expect((await get(studentA, `/student/results/${a.resultId}`)).statusCode).toBe(404);

    const staffView = (await get(teacher, `/results/${a.resultId}`)).json<{
      state: string;
      voidedReason: string;
      earnedMarks: number;
    }>();
    expect(staffView.state).toBe('VOIDED');
    expect(staffView.voidedReason).toContain('Malpractice');
    // Retained in full — the marks are still there as evidence.
    expect(staffView.earnedMarks).toBe(4);

    // Excluded from every aggregate.
    const list = (await get(teacher, `/exams/${examId}/results`)).json<{
      summary: { resultCount: number; voidedCount: number; averagePercentage: number | null };
    }>();
    expect(list.summary.voidedCount).toBe(1);
    expect(list.summary.resultCount).toBe(0);
    expect(list.summary.averagePercentage).toBeNull();
  });

  it('a VOIDED result can never be transitioned back (database-enforced)', async () => {
    const examId = await buildReadyExam();
    await post(teacher, `/exams/${examId}/sessions`, {});
    const a = await sitExamAndMark(studentA, examId, 1);
    await withTenant(prisma, schoolId, (tx) =>
      tx.result.update({ where: { id: a.resultId }, data: { state: 'VOIDED' } }),
    );

    await expect(
      withTenant(prisma, schoolId, (tx) =>
        tx.result.update({ where: { id: a.resultId }, data: { state: 'FINAL' } }),
      ),
    ).rejects.toThrow();
  });

  // ---------------------------------------------------------------------
  // Summary statistics + per-class breakdown
  // ---------------------------------------------------------------------

  it('reports exam summary statistics, with a pass rate derived from the stored grade', async () => {
    await put(admin, '/school/grading-scales', {
      name: 'Pass/fail scale',
      bands: [
        { label: 'P', minPercentage: 50, maxPercentage: 100, isPassing: true },
        { label: 'F', minPercentage: 0, maxPercentage: 49.99, isPassing: false },
      ],
    });

    const examId = await buildReadyExam();
    await post(teacher, `/exams/${examId}/sessions`, {});
    await sitExamAndMark(studentA, examId, 2); // 100%
    await sitExamAndMark(studentB, examId, 0); // 0%

    const list = (await get(teacher, `/exams/${examId}/results`)).json<{
      items: { grade: string | null; percentage: number }[];
      summary: {
        resultCount: number;
        averagePercentage: number;
        highestPercentage: number;
        lowestPercentage: number;
        passRate: number;
      };
    }>();

    expect(list.summary.resultCount).toBe(2);
    expect(list.summary.averagePercentage).toBe(50);
    expect(list.summary.highestPercentage).toBe(100);
    expect(list.summary.lowestPercentage).toBe(0);
    expect(list.summary.passRate).toBe(50);
    expect(list.items.map((i) => i.grade).sort()).toEqual(['F', 'P']);
  });

  // ---------------------------------------------------------------------
  // Adjustment (DoD 10, 11)
  // ---------------------------------------------------------------------

  it('DoD 10/11: creating a void-question adjustment holds the cohort and enqueues the worker', async () => {
    const examId = await buildReadyExam();
    await post(teacher, `/exams/${examId}/sessions`, {});
    const a = await sitExamAndMark(studentA, examId, 2);
    await post(teacher, `/exams/${examId}/results/publish`, {});
    adjustmentEnqueueSpy.mockClear();

    const examQuestion = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptQuestionResult.findFirstOrThrow({ where: { schoolId, attemptId: a.attemptId } }),
    );

    const op = await post(admin, '/results/adjustments', {
      examId,
      type: 'VOID_QUESTION',
      reason: 'Question 1 was ambiguous.',
      targetExamQuestionId: examQuestion.examQuestionId,
    });
    expect(op.statusCode).toBe(200);
    const body = op.json<{ id: string; status: string; totalCount: number }>();
    expect(body.status).toBe('PENDING');
    expect(body.totalCount).toBe(1);
    expect(adjustmentEnqueueSpy).toHaveBeenCalledWith({ schoolId, operationId: body.id });

    // ADR-0025's hold: the cohort is marked under adjustment, and the
    // student sees nothing until the whole operation completes — while the
    // exam's PUBLISHED state itself is preserved.
    const publication = await withTenant(prisma, schoolId, (tx) =>
      tx.resultPublication.findUniqueOrThrow({ where: { schoolId_examId: { schoolId, examId } } }),
    );
    expect(publication.adjustmentInProgress).toBe(true);
    expect(publication.status).toBe('PUBLISHED');
    expect(
      (await get(studentA, '/student/results'))
        .json<{ items: { id: string }[] }>()
        .items.map((i) => i.id),
    ).not.toContain(a.resultId);

    // X-14: publishing while an adjustment is in flight is refused
    // deterministically rather than racing it.
    const racing = await post(admin, `/exams/${examId}/results/publish`, {});
    expect(racing.statusCode).toBe(409);

    const progress = (await get(admin, `/results/adjustments/${body.id}`)).json<{ id: string }>();
    expect(progress.id).toBe(body.id);
  });

  it('DoD 10: a teacher cannot adjust, and only a School Admin may manually override', async () => {
    const examId = await buildReadyExam();
    await post(teacher, `/exams/${examId}/sessions`, {});
    const a = await sitExamAndMark(studentA, examId, 1);

    // 02 §6: Teacher "Edit score ❌" — denied even on their own exam, which
    // is exactly the actor that rule is about.
    const teacherAttempt = await post(teacher, '/results/adjustments', {
      examId,
      type: 'AWARD_MARK',
      reason: 'Everyone deserves a mark.',
      markDelta: 1,
    });
    expect(teacherAttempt.statusCode).toBe(403);

    // MANUAL_OVERRIDE is School-Admin-only — an HOD holding results.adjust
    // for their department still cannot reach it.
    const hodOverride = await post(hod, '/results/adjustments', {
      examId,
      type: 'MANUAL_OVERRIDE',
      reason: 'Correcting a mis-scan.',
      targetResultId: a.resultId,
      overrideEarnedMarks: 4,
    });
    expect(hodOverride.statusCode).toBe(403);
    expect(hodOverride.json<{ error: { message: string } }>().error.message).toContain(
      'School Admin',
    );

    expect(
      (
        await post(admin, '/results/adjustments', {
          examId,
          type: 'MANUAL_OVERRIDE',
          reason: 'Correcting a mis-scan.',
          targetResultId: a.resultId,
          overrideEarnedMarks: 4,
        })
      ).statusCode,
    ).toBe(200);
  });

  it('rejects an adjustment whose arguments do not match its type, and one with no reason', async () => {
    const examId = await buildReadyExam();
    await post(teacher, `/exams/${examId}/sessions`, {});
    await sitExamAndMark(studentA, examId, 1);

    expect(
      (
        await post(admin, '/results/adjustments', {
          examId,
          type: 'VOID_QUESTION',
          reason: 'No target given.',
        })
      ).statusCode,
    ).toBe(400);

    expect(
      (
        await post(admin, '/results/adjustments', {
          examId,
          type: 'AWARD_MARK',
          reason: '',
          markDelta: 1,
        })
      ).statusCode,
    ).toBe(400);
  });

  // ---------------------------------------------------------------------
  // Security (DoD 14)
  // ---------------------------------------------------------------------

  it("DoD 14: a student cannot read another student's result, even by id", async () => {
    const examId = await buildReadyExam();
    await post(teacher, `/exams/${examId}/sessions`, {});
    const a = await sitExamAndMark(studentA, examId, 2);
    await sitExamAndMark(studentB, examId, 0);
    await post(teacher, `/exams/${examId}/results/publish`, {});

    // The roadmap's P14 expectation names URL manipulation explicitly.
    expect((await get(studentB, `/student/results/${a.resultId}`)).statusCode).toBe(404);
  });

  it('DoD 14: a result from another school is not found', async () => {
    const otherSchool = await prisma.school.create({
      data: {
        name: `Other Results School ${randomUUID()}`,
        subdomain: `oth-${randomUUID().slice(0, 8)}`,
        status: 'ACTIVE',
      },
    });
    createdSchoolIds.push(otherSchool.id);

    const examId = await buildReadyExam();
    await post(teacher, `/exams/${examId}/sessions`, {});
    const a = await sitExamAndMark(studentA, examId, 1);

    const { user: otherAdmin } = await seedUser({
      schoolId: otherSchool.id,
      loginIdentifier: 'otheradmin01',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(otherAdmin.id);
    const otherCtx = await freshCtx(`${otherSchool.subdomain}.${ROOT_DOMAIN}`, `10.${RUN}.15.90`);
    await login(otherCtx, 'otheradmin01', 'a-real-password-123');

    expect((await get(otherCtx, `/results/${a.resultId}`)).statusCode).toBe(404);
    expect((await get(otherCtx, `/exams/${examId}/results`)).statusCode).toBe(404);
  });

  it('DoD 10: no endpoint anywhere writes a score outside the adjustment workflow', () => {
    // A structural assertion, not a behavioural one: the guarantee is that
    // the route table contains no such path at all. Every route that can
    // reach `Result.earnedMarks` is enumerated here, and the only mutating
    // one is the adjustment endpoint.
    const server = app.getHttpAdapter().getInstance();
    const routes = server.printRoutes({ commonPrefix: false });

    const mutatingResultRoutes = routes
      .split('\n')
      // `/school/result-policy` and `/school/grading-scales` are school
      // CONFIGURATION (B3's F5 gap-closure and ADR-0018 respectively) — they
      // decide who may release results and how a percentage maps to a
      // letter, never what a student scored.
      .filter((line) => /\bresults?\b/i.test(line) && !/result-policy|grading-scales/.test(line))
      .filter((line) => /(POST|PUT|PATCH|DELETE)/.test(line));

    // Publish/unpublish/withhold/release change VISIBILITY, never a score;
    // adjustments are the sole score-changing path.
    for (const line of mutatingResultRoutes) {
      expect(line).toMatch(/publish|unpublish|withhold|release|adjustments|grading-scales/);
    }
  });
});
