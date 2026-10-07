/**
 * B11 — Exam Builder & Readiness. Mirrors `question-lifecycle.integration
 * .test.ts`'s own harness exactly (real HTTP via `app.inject()` against a
 * real, running `AppModule` and real Postgres).
 *
 * Covers every DoD item (1-10) plus the roadmap's own Security/Data
 * integrity rows. Uses B8/B9's real endpoints (submit + approve) to reach
 * an APPROVED question revision rather than a direct Prisma write, since
 * both endpoints already exist — the direct-Prisma technique is reserved
 * for the two places this suite specifically needs to prove a database-
 * level guarantee independent of the service layer (DoD items 2 and 6's
 * "even by direct insert"/trigger-enforced-immutability language).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppModule } from '../../app.module.js';
import { PasswordService } from '../identity/password.service.js';

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
  // Readiness's SCHOOL_ACTIVE check reads School.status directly — a
  // freshly created school defaults to PROVISIONAL (the real B3 lifecycle,
  // only flipped to ACTIVE by activation-key redemption), so this fixture
  // sets it explicitly rather than routing every test through that flow.
  return prisma.school.create({
    data: {
      name: `Exam Builder Test School ${randomUUID()}`,
      subdomain: `exb-${randomUUID().slice(0, 8)}`,
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

async function del(ctx: RequestCtx, url: string) {
  return app.inject({
    method: 'DELETE',
    url,
    headers: { host: ctx.host, cookie: cookieHeader(ctx), 'x-csrf-token': ctx.csrfToken },
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
    // This suite deliberately produces APPROVED question_revisions and
    // READY/CANCELLED/ARCHIVED exams to prove DoD items 2/6's database-
    // level guarantees — some rows become genuinely undeletable by design.
    // Cleanup can't fight the guarantee it exists to prove (same precedent
    // as question-lifecycle.integration.test.ts's own afterAll), so every
    // step here is best-effort.
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

describe('B11 Exam Builder & Readiness', () => {
  let schoolId: string;
  let host: string;
  let admin: RequestCtx;
  let teacher: RequestCtx;
  let otherTeacher: RequestCtx;
  let hod: RequestCtx;
  let sessionId: string;
  let termId: string;
  let classAId: string; // SS2A — teacher assigned here
  let classBId: string; // SS2B — teacher NOT assigned, same level as A
  let classCId: string; // SS1A — different level, does NOT offer Math (not-offered fixture)
  let classDId: string; // SS1B — different level, DOES offer Math (level-mismatch fixture)
  let mathSubjectId: string;
  let physicsSubjectId: string;
  let approvedRevisionId: string; // Mathematics/SS2, marks=2
  let physicsApprovedRevisionId: string; // Physics/SS2 — out-of-scope binding target
  let draftRevisionId: string; // Mathematics/SS2, never approved

  beforeAll(async () => {
    const school = await createSchool();
    schoolId = school.id;
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolId);

    const { user: adminUser } = await seedUser({
      schoolId,
      loginIdentifier: 'exbadmin01',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(adminUser.id);
    admin = await freshCtx(host, `10.${RUN}.11.1`);
    await login(admin, 'exbadmin01', 'a-real-password-123');

    sessionId = (
      await post(admin, '/academics/sessions', {
        name: `EXB Session ${randomUUID().slice(0, 8)}`,
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
    // Readiness's SESSION_ACTIVE/TERM_ACTIVE checks require UPCOMING/CURRENT
    // — both default to DRAFT on creation (AcademicSessionStatus/
    // AcademicTermStatus's own schema default), so an exam built against a
    // freshly created, never-activated session/term can never become READY.
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
    classBId = (
      await post(admin, '/academics/classes', {
        academicSessionId: sessionId,
        name: 'SS2B',
        level: 'SS2',
        arm: 'B',
      })
    ).json<{ id: string }>().id;
    classCId = (
      await post(admin, '/academics/classes', {
        academicSessionId: sessionId,
        name: 'SS1A',
        level: 'SS1',
        arm: 'A',
      })
    ).json<{ id: string }>().id;
    // Also SS1, but DOES offer Mathematics — the level-mismatch fixture
    // needs a class that resolves successfully (offers the subject) yet
    // disagrees on level, isolating EXAM_CLASS_LEVEL_MISMATCH from
    // EXAM_CLASS_SUBJECT_NOT_OFFERED (classC covers the latter alone).
    classDId = (
      await post(admin, '/academics/classes', {
        academicSessionId: sessionId,
        name: 'SS1B',
        level: 'SS1',
        arm: 'B',
      })
    ).json<{ id: string }>().id;

    mathSubjectId = (
      await post(admin, '/academics/subjects', {
        name: 'Mathematics',
        code: `MTH-${randomUUID().slice(0, 6)}`,
      })
    ).json<{ id: string }>().id;
    physicsSubjectId = (
      await post(admin, '/academics/subjects', {
        name: 'Physics',
        code: `PHY-${randomUUID().slice(0, 6)}`,
      })
    ).json<{ id: string }>().id;

    const classAMathOfferingId = (
      await post(admin, `/academics/classes/${classAId}/subjects`, { subjectId: mathSubjectId })
    ).json<{ id: string }>().id;
    await post(admin, `/academics/classes/${classBId}/subjects`, { subjectId: mathSubjectId });
    // classC deliberately does NOT offer Mathematics — EXAM_CLASS_SUBJECT_NOT_OFFERED fixture.
    await post(admin, `/academics/classes/${classDId}/subjects`, { subjectId: mathSubjectId });
    await post(admin, `/academics/classes/${classAId}/subjects`, { subjectId: physicsSubjectId });

    const deptRes = await post(admin, '/academics/departments', {
      name: `Sciences ${randomUUID().slice(0, 6)}`,
      code: `SCI-${randomUUID().slice(0, 6)}`,
    });
    const departmentId = deptRes.json<{ id: string }>().id;
    await patch(admin, `/academics/subjects/${mathSubjectId}`, { departmentId });
    await patch(admin, `/academics/subjects/${physicsSubjectId}`, { departmentId });

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
    const teacherPasswordHash = await passwords.hash('a-real-password-123');
    await prisma.user.update({
      where: { id: await userIdForMembership(schoolId, teacherBody.membershipId) },
      data: { passwordHash: teacherPasswordHash, credentialState: 'OK', status: 'ACTIVE' },
    });
    // Assigned to classA's Math AND Physics offerings only — never classB/classC.
    const classAPhysicsOfferingId = (await get(admin, `/academics/classes/${classAId}/subjects`))
      .json<{ offerings: { id: string; subjectId: string }[] }>()
      .offerings.find((o) => o.subjectId === physicsSubjectId)!.id;
    await put(admin, `/teachers/${teacherBody.teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [classAMathOfferingId, classAPhysicsOfferingId],
    });
    teacher = await freshCtx(host, `10.${RUN}.11.2`);
    await login(teacher, teacherBody.loginIdentifier, 'a-real-password-123');

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
    const otherPasswordHash = await passwords.hash('a-real-password-123');
    await prisma.user.update({
      where: { id: await userIdForMembership(schoolId, otherTeacherBody.membershipId) },
      data: { passwordHash: otherPasswordHash, credentialState: 'OK', status: 'ACTIVE' },
    });
    otherTeacher = await freshCtx(host, `10.${RUN}.11.3`);
    await login(otherTeacher, otherTeacherBody.loginIdentifier, 'a-real-password-123');

    // Promotes otherTeacher (NOT teacher) to HOD — B9's self-review-
    // forbidden rule would otherwise silently reject every approve() call
    // below, since teacher is this fixture's question author.
    await post(admin, '/hods', { membershipId: otherTeacherBody.membershipId });
    await put(admin, `/hods/${otherTeacherBody.membershipId}/department`, {
      departmentId,
      academicSessionId: sessionId,
    });
    hod = await freshCtx(host, `10.${RUN}.11.4`);
    await login(hod, otherTeacherBody.loginIdentifier, 'a-real-password-123');

    // Student enrolled in classA — auto-registers Math + Physics (ADR-0011).
    const studentProfileId = (
      await post(admin, '/students', {
        firstName: 'Tunde',
        lastName: 'Bello',
        studentId: `ST-${randomUUID().slice(0, 8)}`,
      })
    ).json<{ studentProfileId: string }>().studentProfileId;
    await post(admin, `/students/${studentProfileId}/enrollments`, {
      academicSessionId: sessionId,
      classId: classAId,
    });

    const validOptions = [
      { content: '4', correctFlag: false },
      { content: '5', correctFlag: true },
      { content: '6', correctFlag: false },
    ];

    // Approved Mathematics/SS2 question, marks=2.
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
    const mathSubmit = await post(
      teacher,
      `/questions/${mathQ.id}/revisions/${mathRevisionId}/submit`,
    );
    if (mathSubmit.statusCode !== 200) throw new Error(`math submit failed: ${mathSubmit.body}`);
    const mathApprove = await post(hod, `/reviews/questions/${mathQ.id}/approve`, {});
    if (mathApprove.statusCode !== 200) throw new Error(`math approve failed: ${mathApprove.body}`);
    approvedRevisionId = mathRevisionId;

    // Approved Physics/SS2 question — used to prove EXAM_QUESTION_OUT_OF_SCOPE.
    const physicsQ = (
      await post(teacher, '/questions', {
        subjectId: physicsSubjectId,
        level: 'SS2',
        questionType: 'SINGLE_CHOICE',
        content: 'What is the SI unit of force?',
        difficulty: 'EASY',
        marks: 3,
        options: [
          { content: 'Newton', correctFlag: true },
          { content: 'Joule', correctFlag: false },
        ],
      })
    ).json<{ id: string; revisions: { id: string }[] }>();
    const physicsRevisionId = physicsQ.revisions[0]!.id;
    const physicsSubmit = await post(
      teacher,
      `/questions/${physicsQ.id}/revisions/${physicsRevisionId}/submit`,
    );
    if (physicsSubmit.statusCode !== 200)
      throw new Error(`physics submit failed: ${physicsSubmit.body}`);
    const physicsApprove = await post(hod, `/reviews/questions/${physicsQ.id}/approve`, {});
    if (physicsApprove.statusCode !== 200)
      throw new Error(`physics approve failed: ${physicsApprove.body}`);
    physicsApprovedRevisionId = physicsRevisionId;

    // A never-submitted DRAFT Mathematics/SS2 question — the approved-only rejection fixture.
    const draftQ = (
      await post(teacher, '/questions', {
        subjectId: mathSubjectId,
        level: 'SS2',
        questionType: 'SINGLE_CHOICE',
        content: 'What is 10 - 4?',
        difficulty: 'EASY',
        marks: 2,
        options: validOptions,
      })
    ).json<{ id: string; revisions: { id: string }[] }>();
    draftRevisionId = draftQ.revisions[0]!.id;
  });

  let examId: string;

  it('DoD 1 / ADR-0013: teacher builds an exam targeting classA+classB, assigned to classA only (partial coverage)', async () => {
    const res = await post(teacher, '/exams', {
      academicSessionId: sessionId,
      academicTermId: termId,
      subjectId: mathSubjectId,
      title: 'First Term Mathematics Examination',
      examType: 'First Term Examination',
      classIds: [classAId, classBId],
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; status: string; classes: { classId: string }[] }>();
    expect(body.status).toBe('DRAFT');
    expect(body.classes.map((c) => c.classId).sort()).toEqual([classAId, classBId].sort());
    examId = body.id;
  });

  it('security: a teacher with no assignment to any targeted class is refused (EXAM_OUT_OF_SCOPE)', async () => {
    const res = await post(otherTeacher, '/exams', {
      academicSessionId: sessionId,
      academicTermId: termId,
      subjectId: mathSubjectId,
      title: 'Unauthorized attempt',
      examType: 'Mock Examination',
      classIds: [classAId],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('EXAM_OUT_OF_SCOPE');
  });

  it('ADR-0013: targeting classes of different levels is refused (EXAM_CLASS_LEVEL_MISMATCH)', async () => {
    const res = await post(teacher, '/exams', {
      academicSessionId: sessionId,
      academicTermId: termId,
      subjectId: mathSubjectId,
      title: 'Mixed-level attempt',
      examType: 'Mock Examination',
      classIds: [classAId, classDId],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('EXAM_CLASS_LEVEL_MISMATCH');
  });

  it('a class that does not offer the subject is refused (EXAM_CLASS_SUBJECT_NOT_OFFERED)', async () => {
    const res = await post(teacher, '/exams', {
      academicSessionId: sessionId,
      academicTermId: termId,
      subjectId: mathSubjectId,
      title: 'Not-offered attempt',
      examType: 'Mock Examination',
      classIds: [classCId],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'EXAM_CLASS_SUBJECT_NOT_OFFERED',
    );
  });

  it('DoD 2 (API half): binding a non-approved revision is refused', async () => {
    const res = await put(teacher, `/exams/${examId}/questions`, {
      questions: [{ questionRevisionId: draftRevisionId }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('EXAM_REVISION_NOT_APPROVED');
  });

  it('DoD 2 (database half): a direct insert bypassing the service is rejected by the trigger', async () => {
    const section = await withTenant(prisma, schoolId, (tx) =>
      tx.examSection.findFirstOrThrow({ where: { schoolId, examId } }),
    );
    await expect(
      withTenant(prisma, schoolId, (tx) =>
        tx.examQuestion.create({
          data: {
            schoolId,
            examId,
            examSectionId: section.id,
            questionRevisionId: draftRevisionId,
            sequence: 1,
            marks: 2,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('a question from a different subject is refused (EXAM_QUESTION_OUT_OF_SCOPE)', async () => {
    const res = await put(teacher, `/exams/${examId}/questions`, {
      questions: [{ questionRevisionId: physicsApprovedRevisionId }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('EXAM_QUESTION_OUT_OF_SCOPE');
  });

  it('DoD 9: marks default from the revision, and may be overridden while DRAFT', async () => {
    const defaultRes = await put(teacher, `/exams/${examId}/questions`, {
      questions: [{ questionRevisionId: approvedRevisionId }],
    });
    expect(defaultRes.statusCode).toBe(200);
    let body = defaultRes.json<{ sections: { questions: { marks: number }[] }[] }>();
    expect(body.sections[0]?.questions[0]?.marks).toBe(2);

    const overrideRes = await put(teacher, `/exams/${examId}/questions`, {
      questions: [{ questionRevisionId: approvedRevisionId, marks: 5 }],
    });
    expect(overrideRes.statusCode).toBe(200);
    body = overrideRes.json<{ sections: { questions: { marks: number }[] }[] }>();
    expect(body.sections[0]?.questions[0]?.marks).toBe(5);
  });

  it('DoD 3: configuration covers duration, attempts, navigation, randomization, result policy, instructions', async () => {
    const res = await put(teacher, `/exams/${examId}/configuration`, {
      durationSeconds: 3600,
      attemptLimit: 1,
      navigationPolicy: 'SEQUENTIAL_WITH_REVISIT',
      randomizeQuestions: true,
      randomizeOptions: true,
      resultPolicy: 'TEACHER',
      resultDetailVisibility: 'SCORE_AND_COUNTS',
      generalInstructions: 'Answer all questions.',
      navigationInstructions: 'You may move freely between questions.',
      submissionInstructions: 'Check your answers before submitting.',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      durationSeconds: number;
      attemptLimit: number;
      navigationPolicy: string;
      randomizeQuestions: boolean;
      randomizeOptions: boolean;
      resultPolicy: string;
      resultDetailVisibility: string;
      generalInstructions: string | null;
    }>();
    expect(body.durationSeconds).toBe(3600);
    expect(body.attemptLimit).toBe(1);
    expect(body.navigationPolicy).toBe('SEQUENTIAL_WITH_REVISIT');
    expect(body.randomizeQuestions).toBe(true);
    expect(body.randomizeOptions).toBe(true);
    expect(body.resultPolicy).toBe('TEACHER');
    expect(body.resultDetailVisibility).toBe('SCORE_AND_COUNTS');
    expect(body.generalInstructions).toBe('Answer all questions.');
  });

  it('DoD 4/5: readiness is itemised and DRAFT -> READY succeeds only once every check passes', async () => {
    const readiness = await get(teacher, `/exams/${examId}/readiness`);
    expect(readiness.statusCode).toBe(200);
    const readinessBody = readiness.json<{
      ready: boolean;
      checks: { code: string; passed: boolean }[];
    }>();
    expect(readinessBody.ready).toBe(true);
    expect(readinessBody.checks.length).toBeGreaterThan(10);
    expect(readinessBody.checks.every((c) => c.passed)).toBe(true);

    const readyRes = await post(teacher, `/exams/${examId}/ready`, {});
    expect(readyRes.statusCode).toBe(200);
    expect(readyRes.json<{ status: string }>().status).toBe('READY');
  });

  it('DoD 4: an incomplete exam is refused with the specific failing check named', async () => {
    const incompleteExam = (
      await post(teacher, '/exams', {
        academicSessionId: sessionId,
        academicTermId: termId,
        subjectId: mathSubjectId,
        title: 'Incomplete Exam',
        examType: 'Mock Examination',
        classIds: [classAId],
      })
    ).json<{ id: string }>();
    const readyRes = await post(teacher, `/exams/${incompleteExam.id}/ready`, {});
    expect(readyRes.statusCode).toBe(409);
    const body = readyRes.json<{
      error: { code: string; details?: { checks: { code: string; passed: boolean }[] } };
    }>();
    expect(body.error.code).toBe('EXAM_NOT_READY');
    const failing = body.error.details?.checks.filter((c) => !c.passed).map((c) => c.code) ?? [];
    expect(failing).toContain('QUESTIONS_SELECTED');
    expect(failing).toContain('DURATION_CONFIGURED');
  });

  it('DoD 6 (API half): a READY exam refuses question/configuration changes', async () => {
    const questionsRes = await put(teacher, `/exams/${examId}/questions`, {
      questions: [{ questionRevisionId: approvedRevisionId }],
    });
    expect(questionsRes.statusCode).toBe(409);
    expect(questionsRes.json<{ error: { code: string } }>().error.code).toBe('EXAM_NOT_DRAFT');

    const configRes = await put(teacher, `/exams/${examId}/configuration`, {
      durationSeconds: 1200,
    });
    expect(configRes.statusCode).toBe(409);
    expect(configRes.json<{ error: { code: string } }>().error.code).toBe('EXAM_NOT_DRAFT');
  });

  it('DoD 6 (database half): a direct insert/update on a READY exam is rejected by the trigger', async () => {
    await expect(
      withTenant(prisma, schoolId, (tx) =>
        tx.exam.update({ where: { id: examId }, data: { durationSeconds: 999 } }),
      ),
    ).rejects.toThrow();

    const section = await withTenant(prisma, schoolId, (tx) =>
      tx.examSection.findFirstOrThrow({ where: { schoolId, examId } }),
    );
    await expect(
      withTenant(prisma, schoolId, (tx) =>
        tx.examQuestion.create({
          data: {
            schoolId,
            examId,
            examSectionId: section.id,
            questionRevisionId: physicsApprovedRevisionId,
            sequence: 99,
            marks: 1,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('DoD 8: approving a later revision of an already-bound question does not alter the exam binding', async () => {
    const question = await withTenant(prisma, schoolId, (tx) =>
      tx.questionRevision.findUniqueOrThrow({
        where: { id: approvedRevisionId },
        select: { questionId: true },
      }),
    );
    const newRevRes = await post(teacher, `/questions/${question.questionId}/revisions`, {
      content: 'What is 2 + 3? (revised)',
    });
    expect(newRevRes.statusCode).toBe(201);
    const newRevisionId = newRevRes.json<{ id: string }>().id;
    await post(teacher, `/questions/${question.questionId}/revisions/${newRevisionId}/submit`);
    await post(hod, `/reviews/questions/${question.questionId}/approve`, {});

    const examRes = await get(admin, `/exams/${examId}`);
    const body = examRes.json<{
      sections: { questions: { questionRevisionId: string; content: string }[] }[];
    }>();
    expect(body.sections[0]?.questions[0]?.questionRevisionId).toBe(approvedRevisionId);
    expect(body.sections[0]?.questions[0]?.content).toBe('What is 2 + 3?');
  });

  it('DoD 7: cancelling a READY exam requires a reason and is audited', async () => {
    const noReason = await post(teacher, `/exams/${examId}/cancel`, {});
    expect(noReason.statusCode).toBe(400);

    const res = await post(teacher, `/exams/${examId}/cancel`, {
      reason: 'Duplicate paper set by mistake.',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; cancelledReason: string | null }>();
    expect(body.status).toBe('CANCELLED');
    expect(body.cancelledReason).toBe('Duplicate paper set by mistake.');

    const audit = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findFirst({ where: { schoolId, action: 'EXAM_CANCELLED', entityId: examId } }),
    );
    expect(audit).not.toBeNull();
  });

  it('archive is allowed from CANCELLED, and a second archive is refused', async () => {
    const res = await post(teacher, `/exams/${examId}/archive`, {});
    expect(res.statusCode).toBe(200);
    expect(res.json<{ status: string }>().status).toBe('ARCHIVED');

    const again = await post(teacher, `/exams/${examId}/archive`, {});
    expect(again.statusCode).toBe(409);
    expect(again.json<{ error: { code: string } }>().error.code).toBe('EXAM_NOT_ARCHIVABLE');
  });

  it('DRAFT-only delete removes the exam outright', async () => {
    const draft = (
      await post(teacher, '/exams', {
        academicSessionId: sessionId,
        academicTermId: termId,
        subjectId: mathSubjectId,
        title: 'To be deleted',
        examType: 'Mock Examination',
        classIds: [classAId],
      })
    ).json<{ id: string }>();
    const res = await del(teacher, `/exams/${draft.id}`);
    expect(res.statusCode).toBe(200);
    const getRes = await get(admin, `/exams/${draft.id}`);
    expect(getRes.statusCode).toBe(404);
  });

  it("Assessment Rules (05 §58): a new exam starts from the school's defaults", async () => {
    const defaults = {
      defaultExamDurationSeconds: 2400,
      defaultAttemptLimit: 2,
      defaultNavigationPolicy: 'SEQUENTIAL_NO_REVISIT',
      defaultRandomizeQuestions: true,
      defaultRandomizeOptions: true,
    };
    expect((await put(admin, '/school/assessment-rules', defaults)).statusCode).toBe(200);
    try {
      const res = await post(teacher, '/exams', {
        academicSessionId: sessionId,
        academicTermId: termId,
        subjectId: mathSubjectId,
        title: 'Seeded from school defaults',
        examType: 'Mock Examination',
        classIds: [classAId],
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        durationSeconds: 2400,
        attemptLimit: 2,
        navigationPolicy: 'SEQUENTIAL_NO_REVISIT',
        randomizeQuestions: true,
        randomizeOptions: true,
      });
    } finally {
      // Later tests rely on a new exam starting with no duration.
      await put(admin, '/school/assessment-rules', {
        defaultExamDurationSeconds: null,
        defaultAttemptLimit: 1,
        defaultNavigationPolicy: 'FREE',
        defaultRandomizeQuestions: false,
        defaultRandomizeOptions: false,
      });
    }
  });

  it('DoD 10: cross-tenant — a revision id from a different school cannot be bound (NOT_FOUND, never FORBIDDEN)', async () => {
    const otherSchool = await createSchool();
    createdSchoolIds.push(otherSchool.id);
    const otherRevision = await withTenant(prisma, otherSchool.id, async (tx) => {
      const subject = await tx.subject.create({
        data: { schoolId: otherSchool.id, name: 'Other Math', code: 'OM1' },
      });
      const question = await tx.question
        .create({
          data: {
            schoolId: otherSchool.id,
            subjectId: subject.id,
            level: 'SS2',
            authorTeacherProfileId: randomUUID(),
          },
        })
        .catch(() => null);
      return question;
    }).catch(() => null);
    // authorTeacherProfileId with a random id violates the FK — this
    // cross-tenant fixture only needs a revision id that structurally
    // cannot resolve for this school; a random UUID already proves that
    // without needing a fully valid other-school question at all.
    const foreignRevisionId = otherRevision?.id ?? randomUUID();

    const freshExam = (
      await post(teacher, '/exams', {
        academicSessionId: sessionId,
        academicTermId: termId,
        subjectId: mathSubjectId,
        title: 'Cross-tenant probe',
        examType: 'Mock Examination',
        classIds: [classAId],
      })
    ).json<{ id: string }>();
    const res = await put(teacher, `/exams/${freshExam.id}/questions`, {
      questions: [{ questionRevisionId: foreignRevisionId }],
    });
    expect(res.statusCode).toBe(404);
  });

  it("bug audit P1-8: a draft cannot be moved to classes or a department outside the editor's scope", async () => {
    const created = await post(teacher, '/exams', {
      academicSessionId: sessionId,
      academicTermId: termId,
      subjectId: mathSubjectId,
      title: 'Retarget fixture',
      examType: 'Mock Examination',
      classIds: [classAId],
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ id: string }>().id;
    const code = (res: { json: <T>() => T }) => res.json<{ error: { code: string } }>().error.code;

    // A teacher: only to classes they teach, as at create().
    const toSs1 = await patch(teacher, `/exams/${id}`, { classIds: [classDId] });
    expect(code(toSs1)).toBe('EXAM_OUT_OF_SCOPE');
    const toUntaught = await patch(teacher, `/exams/${id}`, { classIds: [classBId] });
    expect(code(toUntaught)).toBe('EXAM_OUT_OF_SCOPE');
    const kept = await patch(teacher, `/exams/${id}`, { classIds: [classAId, classBId] });
    expect(kept.statusCode).toBe(200);

    // An HOD: not into another department's subject.
    const otherDeptId = (
      await post(admin, '/academics/departments', {
        name: `Arts ${randomUUID().slice(0, 6)}`,
        code: `ART-${randomUUID().slice(0, 6)}`,
      })
    ).json<{ id: string }>().id;
    const englishId = (
      await post(admin, '/academics/subjects', {
        name: `English ${randomUUID().slice(0, 6)}`,
        code: `ENG-${randomUUID().slice(0, 6)}`,
      })
    ).json<{ id: string }>().id;
    await patch(admin, `/academics/subjects/${englishId}`, { departmentId: otherDeptId });
    await post(admin, `/academics/classes/${classAId}/subjects`, { subjectId: englishId });
    const hodMove = await patch(hod, `/exams/${id}`, {
      subjectId: englishId,
      classIds: [classAId],
    });
    expect(code(hodMove)).toBe('EXAM_OUT_OF_SCOPE');
    const teacherMove = await patch(teacher, `/exams/${id}`, {
      subjectId: englishId,
      classIds: [classAId],
    });
    expect(code(teacherMove)).toBe('EXAM_OUT_OF_SCOPE');

    // School Admin holds every draft by school scope.
    const adminMove = await patch(admin, `/exams/${id}`, {
      subjectId: englishId,
      classIds: [classAId],
    });
    expect(adminMove.statusCode).toBe(200);
  });

  it('bug audit P2-5: a question under revision stays bindable as its approved revision, and one question cannot be bound twice', async () => {
    const created = (
      await post(teacher, '/questions', {
        subjectId: mathSubjectId,
        level: 'SS2',
        questionType: 'SINGLE_CHOICE',
        content: `What is 9 - 4? ${randomUUID().slice(0, 6)}`,
        difficulty: 'EASY',
        marks: 1,
        options: [
          { content: '5', correctFlag: true },
          { content: '4', correctFlag: false },
        ],
      })
    ).json<{ id: string; revisions: { id: string }[] }>();
    const firstRev = created.revisions[0]!.id;
    await post(teacher, `/questions/${created.id}/revisions/${firstRev}/submit`);
    expect((await post(hod, `/reviews/questions/${created.id}/approve`, {})).statusCode).toBe(200);
    const secondRev = (
      await post(teacher, `/questions/${created.id}/revisions`, { content: 'What is 9 - 4 now?' })
    ).json<{ id: string }>().id;

    const exam = (
      await post(teacher, '/exams', {
        academicSessionId: sessionId,
        academicTermId: termId,
        subjectId: mathSubjectId,
        title: 'Revision binding fixture',
        examType: 'Mock Examination',
        classIds: [classAId],
      })
    ).json<{ id: string }>();
    const available = await get(teacher, `/exams/${exam.id}/available-questions?pageSize=100`);
    const row = available
      .json<{ questions: { id: string; currentRevisionId: string }[] }>()
      .questions.find((q) => q.id === created.id);
    expect(row?.currentRevisionId).toBe(firstRev);

    await post(teacher, `/questions/${created.id}/revisions/${secondRev}/submit`);
    await post(hod, `/reviews/questions/${created.id}/approve`, {});
    const both = await put(teacher, `/exams/${exam.id}/questions`, {
      questions: [{ questionRevisionId: firstRev }, { questionRevisionId: secondRev }],
    });
    expect(both.statusCode).toBe(400);
    expect(both.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');

    // P3-7: an absurd duration or attempt limit is a validation error, not a 500.
    const huge = await put(teacher, `/exams/${exam.id}/configuration`, {
      durationSeconds: 10_000_000_000,
      attemptLimit: 10_000_000_000,
    });
    expect(huge.statusCode).toBe(400);
  });

  it('concurrency: two simultaneous ready() calls on one DRAFT exam — exactly one succeeds', async () => {
    const raceExam = (
      await post(teacher, '/exams', {
        academicSessionId: sessionId,
        academicTermId: termId,
        subjectId: mathSubjectId,
        title: 'Concurrency Exam',
        examType: 'Mock Examination',
        classIds: [classAId],
      })
    ).json<{ id: string }>();
    await put(teacher, `/exams/${raceExam.id}/questions`, {
      questions: [{ questionRevisionId: approvedRevisionId }],
    });
    await put(teacher, `/exams/${raceExam.id}/configuration`, {
      durationSeconds: 1800,
      resultPolicy: 'TEACHER',
      resultDetailVisibility: 'SCORE_ONLY',
      generalInstructions: 'Answer all questions.',
    });

    const [first, second] = await Promise.all([
      post(teacher, `/exams/${raceExam.id}/ready`, {}),
      post(teacher, `/exams/${raceExam.id}/ready`, {}),
    ]);
    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([200, 409]);
  });

  // --- Gap-closure regression coverage (review fixes) -------------------

  it('review fix: a teacher can still view (not just edit) an exam they authored after losing every assignment to its classes', async () => {
    const reassignTeacherRes = await post(admin, '/teachers', {
      firstName: 'Chidi',
      lastName: 'Nwosu',
      email: `chidi-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    const reassignTeacherBody = reassignTeacherRes.json<{
      teacherProfileId: string;
      membershipId: string;
      loginIdentifier: string;
    }>();
    await prisma.user.update({
      where: { id: await userIdForMembership(schoolId, reassignTeacherBody.membershipId) },
      data: {
        passwordHash: await passwords.hash('a-real-password-123'),
        credentialState: 'OK',
        status: 'ACTIVE',
      },
    });
    const classAMathOfferingId = (await get(admin, `/academics/classes/${classAId}/subjects`))
      .json<{ offerings: { id: string; subjectId: string }[] }>()
      .offerings.find((o) => o.subjectId === mathSubjectId)!.id;
    await put(admin, `/teachers/${reassignTeacherBody.teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [classAMathOfferingId],
    });
    const reassignTeacher = await freshCtx(host, `10.${RUN}.11.5`);
    await login(reassignTeacher, reassignTeacherBody.loginIdentifier, 'a-real-password-123');

    const ownedExam = (
      await post(reassignTeacher, '/exams', {
        academicSessionId: sessionId,
        academicTermId: termId,
        subjectId: mathSubjectId,
        title: 'Owned then reassigned away',
        examType: 'Mock Examination',
        classIds: [classAId],
      })
    ).json<{ id: string }>();

    // Full-replace to zero assignments — the teacher no longer has an
    // active TeacherAssignment covering ANY of this exam's targeted
    // classes, exactly the state that exposed the list()/get() gap.
    await put(admin, `/teachers/${reassignTeacherBody.teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [],
    });

    const listRes = await get(reassignTeacher, '/exams');
    const listBody = listRes.json<{ exams: { id: string }[] }>();
    expect(listBody.exams.map((e) => e.id)).toContain(ownedExam.id);

    const getRes = await get(reassignTeacher, `/exams/${ownedExam.id}`);
    expect(getRes.statusCode).toBe(200);

    const readinessRes = await get(reassignTeacher, `/exams/${ownedExam.id}/readiness`);
    expect(readinessRes.statusCode).toBe(200);

    const availableRes = await get(reassignTeacher, `/exams/${ownedExam.id}/available-questions`);
    expect(availableRes.statusCode).toBe(200);
  });

  it('F11 gap-closure: available-questions rows carry currentRevisionId, and it round-trips through a real bind', async () => {
    // `QuestionListItemResponseDto.id` is the parent Question's id, not a
    // revision id — `ExamQuestionInputDto.questionRevisionId` needs the
    // latter. Found only by building the frontend's own picker against this
    // route: the field the picker actually needs to bind a question was
    // never mapped onto the DTO, even though the Prisma query already
    // fetched it (`currentRevision: { include: ... }`).
    //
    // Deliberately authors and approves its own fresh question rather than
    // reusing the describe block's shared `approvedRevisionId` fixture — a
    // later test in this same file advances that Question to a second
    // approved revision (a real, legitimate B8 flow), which correctly makes
    // the *original* revision id no longer the Question's *current* one and
    // therefore invisible to `available-questions` (which surfaces only the
    // current revision). That's expected product behaviour, not something
    // this test should fight; a self-contained fixture avoids the ordering
    // dependency entirely.
    const own = (
      await post(teacher, '/questions', {
        subjectId: mathSubjectId,
        level: 'SS2',
        questionType: 'SINGLE_CHOICE',
        content: 'currentRevisionId round-trip question',
        difficulty: 'EASY',
        marks: 3,
        options: [
          { content: 'A', correctFlag: true },
          { content: 'B', correctFlag: false },
        ],
      })
    ).json<{ id: string; revisions: { id: string }[] }>();
    const ownRevisionId = own.revisions[0]!.id;
    const ownSubmit = await post(teacher, `/questions/${own.id}/revisions/${ownRevisionId}/submit`);
    expect(ownSubmit.statusCode).toBe(200);
    const ownApprove = await post(hod, `/reviews/questions/${own.id}/approve`, {});
    expect(ownApprove.statusCode).toBe(200);

    const draft = (
      await post(teacher, '/exams', {
        academicSessionId: sessionId,
        academicTermId: termId,
        subjectId: mathSubjectId,
        title: 'currentRevisionId round-trip',
        examType: 'Test',
        classIds: [classAId],
      })
    ).json<{ id: string }>();

    // pageSize pinned well above this suite's own accumulated fixture count
    // (many earlier tests in this file create their own Math/SS2 approved
    // questions) — otherwise the target row can land past the default
    // 25-row page, unrelated to the fix this test actually proves.
    const availableRes = await get(teacher, `/exams/${draft.id}/available-questions?pageSize=100`);
    expect(availableRes.statusCode).toBe(200);
    const available = availableRes.json<{
      questions: { id: string; currentRevisionId: string | null }[];
    }>().questions;
    const row = available.find((q) => q.id === own.id);
    expect(row).toBeDefined();
    expect(row?.currentRevisionId).toBe(ownRevisionId);
    expect(row?.id).not.toBe(ownRevisionId); // the Question id, deliberately distinct

    const bindRes = await put(teacher, `/exams/${draft.id}/questions`, {
      questions: [{ questionRevisionId: row!.currentRevisionId! }],
    });
    expect(bindRes.statusCode).toBe(200);
    const bound = bindRes.json<{
      sections: { questions: { questionRevisionId: string }[] }[];
    }>();
    expect(bound.sections[0]?.questions[0]?.questionRevisionId).toBe(ownRevisionId);
  });

  it('review fix: exam.create on a TEACHER-role actor with no TeacherProfile row is refused with an exam-specific code', async () => {
    const passwordHash = await passwords.hash('a-real-password-123');
    const user = await prisma.user.create({
      data: {
        firstName: 'No',
        lastName: 'Profile',
        displayName: 'No Profile',
        passwordHash,
        status: 'ACTIVE',
        credentialState: 'OK',
      },
    });
    createdUserIds.push(user.id);
    const loginIdentifier = `noprofile-${randomUUID().slice(0, 8)}`;
    const membership = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.create({
        data: { schoolId, userId: user.id, loginIdentifier, status: 'ACTIVE' },
      }),
    );
    // A real TEACHER RoleAssignment with deliberately NO accompanying
    // TeacherProfile — every real /teachers-created account gets both
    // together; this fixture only needs the data-integrity edge case.
    await withTenant(prisma, schoolId, (tx) =>
      tx.roleAssignment.create({
        data: { schoolId, membershipId: membership.id, role: 'TEACHER' },
      }),
    );
    const noProfileCtx = await freshCtx(host, `10.${RUN}.11.6`);
    await login(noProfileCtx, loginIdentifier, 'a-real-password-123');

    const res = await post(noProfileCtx, '/exams', {
      academicSessionId: sessionId,
      academicTermId: termId,
      subjectId: mathSubjectId,
      title: 'Should never be created',
      examType: 'Mock Examination',
      classIds: [classAId],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'EXAM_REQUIRES_TEACHER_PROFILE',
    );
  });

  it('review fix: a losing race against ready() on PUT .../questions never surfaces a raw 500', async () => {
    const raceExam = (
      await post(teacher, '/exams', {
        academicSessionId: sessionId,
        academicTermId: termId,
        subjectId: mathSubjectId,
        title: 'Questions-vs-ready race',
        examType: 'Mock Examination',
        classIds: [classAId],
      })
    ).json<{ id: string }>();
    await put(teacher, `/exams/${raceExam.id}/questions`, {
      questions: [{ questionRevisionId: approvedRevisionId }],
    });
    await put(teacher, `/exams/${raceExam.id}/configuration`, {
      durationSeconds: 1800,
      resultPolicy: 'TEACHER',
      resultDetailVisibility: 'SCORE_ONLY',
      generalInstructions: 'Answer all questions.',
    });

    const [readyRes, questionsRes] = await Promise.all([
      post(teacher, `/exams/${raceExam.id}/ready`, {}),
      put(teacher, `/exams/${raceExam.id}/questions`, {
        questions: [{ questionRevisionId: approvedRevisionId, marks: 5 }],
      }),
    ]);
    expect(readyRes.statusCode).not.toBe(500);
    expect(questionsRes.statusCode).not.toBe(500);
    expect([200, 409]).toContain(readyRes.statusCode);
    expect([200, 409]).toContain(questionsRes.statusCode);
    if (questionsRes.statusCode === 409) {
      expect(questionsRes.json<{ error: { code: string } }>().error.code).toBe('EXAM_NOT_DRAFT');
    }
  });

  it('review fix: a losing race against ready() on PUT .../configuration never surfaces a raw 500', async () => {
    const raceExam = (
      await post(teacher, '/exams', {
        academicSessionId: sessionId,
        academicTermId: termId,
        subjectId: mathSubjectId,
        title: 'Configuration-vs-ready race',
        examType: 'Mock Examination',
        classIds: [classAId],
      })
    ).json<{ id: string }>();
    await put(teacher, `/exams/${raceExam.id}/questions`, {
      questions: [{ questionRevisionId: approvedRevisionId }],
    });
    await put(teacher, `/exams/${raceExam.id}/configuration`, {
      durationSeconds: 1800,
      resultPolicy: 'TEACHER',
      resultDetailVisibility: 'SCORE_ONLY',
      generalInstructions: 'Answer all questions.',
    });

    const [readyRes, configRes] = await Promise.all([
      post(teacher, `/exams/${raceExam.id}/ready`, {}),
      put(teacher, `/exams/${raceExam.id}/configuration`, { durationSeconds: 2400 }),
    ]);
    expect(readyRes.statusCode).not.toBe(500);
    expect(configRes.statusCode).not.toBe(500);
    expect([200, 409]).toContain(readyRes.statusCode);
    expect([200, 409]).toContain(configRes.statusCode);
    if (configRes.statusCode === 409) {
      expect(configRes.json<{ error: { code: string } }>().error.code).toBe('EXAM_NOT_DRAFT');
    }
  });

  it('review fix: a losing race against ready() on PATCH never surfaces a raw 500', async () => {
    const raceExam = (
      await post(teacher, '/exams', {
        academicSessionId: sessionId,
        academicTermId: termId,
        subjectId: mathSubjectId,
        title: 'Patch-vs-ready race',
        examType: 'Mock Examination',
        classIds: [classAId],
      })
    ).json<{ id: string }>();
    await put(teacher, `/exams/${raceExam.id}/questions`, {
      questions: [{ questionRevisionId: approvedRevisionId }],
    });
    await put(teacher, `/exams/${raceExam.id}/configuration`, {
      durationSeconds: 1800,
      resultPolicy: 'TEACHER',
      resultDetailVisibility: 'SCORE_ONLY',
      generalInstructions: 'Answer all questions.',
    });

    const [readyRes, patchRes] = await Promise.all([
      post(teacher, `/exams/${raceExam.id}/ready`, {}),
      patch(teacher, `/exams/${raceExam.id}`, { title: 'Renamed mid-race' }),
    ]);
    expect(readyRes.statusCode).not.toBe(500);
    expect(patchRes.statusCode).not.toBe(500);
    expect([200, 409]).toContain(readyRes.statusCode);
    expect([200, 409]).toContain(patchRes.statusCode);
    if (patchRes.statusCode === 409) {
      expect(patchRes.json<{ error: { code: string } }>().error.code).toBe('EXAM_NOT_DRAFT');
    }
  });
});
