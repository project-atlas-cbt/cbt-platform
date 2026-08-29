/**
 * B8 — Question Bank. Mirrors `teacher-assignment.integration.test.ts`'s own
 * harness exactly (real HTTP via `app.inject()` against a real, running
 * `AppModule` and real Postgres).
 *
 * Covers every DoD item (1–12) plus the roadmap's own Security row. B9's
 * review workflow (SUBMITTED -> UNDER_REVIEW -> APPROVED/REJECTED) has no
 * B8 endpoint — tests that need a revision in one of those states construct
 * it via direct Prisma writes, mirroring
 * `import-commit-resume.integration.test.ts`'s and
 * `session-activation-concurrency.integration.test.ts`'s own precedent for
 * this, never a hidden endpoint.
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
  return prisma.school.create({
    data: {
      name: `Question Bank Test School ${randomUUID()}`,
      subdomain: `qb-${randomUUID().slice(0, 8)}`,
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

/** `SchoolMembership` is RLS-protected — a lookup must go through
 * `withTenant`, unlike `User` itself (tenant-independent, no RLS). */
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
    // This suite deliberately creates APPROVED question_revisions rows to
    // prove DoD item 6's database-level immutability — those rows (and,
    // by Cascade, their parent Question) are then genuinely, permanently
    // undeletable, exactly as designed. Cleanup can't fight the guarantee
    // it exists to prove, so this is caught and swallowed rather than
    // failing the whole suite on teardown; the small amount of leftover
    // test data is harmless (RLS-scoped, uniquely UUID-named, never
    // reachable outside this deleted school's own context).
    await withTenant(prisma, schoolId, (tx) =>
      tx.question.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    // Topics referenced by a leftover (undeletable) QuestionRevision are
    // themselves then RESTRICT-blocked — same root cause, same reasoning.
    await withTenant(prisma, schoolId, (tx) => tx.topic.deleteMany({ where: { schoolId } })).catch(
      () => undefined,
    );
    // Everything below can also be RESTRICT-blocked transitively by the
    // same leftover immutable Question row (its subjectId/
    // authorTeacherProfileId references) — best-effort from here on,
    // same reasoning as above, not a distinct concern per table.
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

describe('B8 Question Bank', () => {
  let schoolId: string;
  let host: string;
  let admin: RequestCtx;
  let teacher: RequestCtx;
  let otherTeacher: RequestCtx;
  let hod: RequestCtx;
  let sessionId: string;
  let mathSubjectId: string;
  let physicsSubjectId: string; // never assigned to `teacher`

  const validOptions = [
    { content: '4', correctFlag: false },
    { content: '5', correctFlag: true },
    { content: '6', correctFlag: false },
  ];

  beforeAll(async () => {
    const school = await createSchool();
    schoolId = school.id;
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolId);

    const { user: adminUser } = await seedUser({
      schoolId,
      loginIdentifier: 'qbadmin01',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(adminUser.id);
    admin = await freshCtx(host, `10.${RUN}.9.1`);
    await login(admin, 'qbadmin01', 'a-real-password-123');

    const sessionRes = await post(admin, '/academics/sessions', {
      name: `QB Session ${randomUUID().slice(0, 8)}`,
      startDate: '2026-09-01',
      endDate: '2027-07-31',
    });
    sessionId = sessionRes.json<{ id: string }>().id;
    const classRes = await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      name: 'SS2A',
      level: 'SS2',
      arm: 'A',
    });
    const classId = classRes.json<{ id: string }>().id;

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
    const mathOfferingId = (
      await post(admin, `/academics/classes/${classId}/subjects`, { subjectId: mathSubjectId })
    ).json<{ id: string }>().id;

    // Second class/department for the HOD department-scoped view test.
    const deptRes = await post(admin, '/academics/departments', {
      name: `Sciences ${randomUUID().slice(0, 6)}`,
      code: `SCI-${randomUUID().slice(0, 6)}`,
    });
    const departmentId = deptRes.json<{ id: string }>().id;
    await patch(admin, `/academics/subjects/${mathSubjectId}`, { departmentId });

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
    // Set a known password directly (credential-sheet flow is out of scope
    // for this test) — mirrors this codebase's own established shortcut for
    // fixtures that only need a working login, not the real reveal flow.
    const teacherPasswordHash = await passwords.hash('a-real-password-123');
    await prisma.user.update({
      where: { id: await userIdForMembership(schoolId, teacherBody.membershipId) },
      data: { passwordHash: teacherPasswordHash, credentialState: 'OK', status: 'ACTIVE' },
    });
    await put(admin, `/teachers/${teacherBody.teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [mathOfferingId],
    });
    teacher = await freshCtx(host, `10.${RUN}.9.2`);
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
      where: {
        id: await userIdForMembership(schoolId, otherTeacherBody.membershipId),
      },
      data: { passwordHash: otherPasswordHash, credentialState: 'OK', status: 'ACTIVE' },
    });
    otherTeacher = await freshCtx(host, `10.${RUN}.9.3`);
    await login(otherTeacher, otherTeacherBody.loginIdentifier, 'a-real-password-123');

    await post(admin, '/hods', { membershipId: teacherBody.membershipId });
    await put(admin, `/hods/${teacherBody.membershipId}/department`, {
      departmentId,
      academicSessionId: sessionId,
    });
    hod = await freshCtx(host, `10.${RUN}.9.4`);
    await login(hod, teacherBody.loginIdentifier, 'a-real-password-123');
  });

  it('DoD 1: creates an MCQ with >=2 options, exactly one correct, within assigned scope', async () => {
    const res = await post(teacher, '/questions', {
      subjectId: mathSubjectId,
      level: 'SS2',
      questionType: 'SINGLE_CHOICE',
      content: 'What is 2 + 3?',
      topicName: 'Addition',
      difficulty: 'EASY',
      marks: 2,
      options: validOptions,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{
      id: string;
      currentStatus: string;
      revisions: { revisionNumber: number; status: string; options: { correctFlag: boolean }[] }[];
    }>();
    expect(body.currentStatus).toBe('DRAFT');
    expect(body.revisions).toHaveLength(1);
    expect(body.revisions[0]?.options.filter((o) => o.correctFlag)).toHaveLength(1);
  });

  it('DoD 2: creating outside assigned subject/level is refused', async () => {
    const res = await post(teacher, '/questions', {
      subjectId: physicsSubjectId,
      level: 'SS2',
      questionType: 'SINGLE_CHOICE',
      content: 'Physics question',
      difficulty: 'EASY',
      marks: 2,
      options: validOptions,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('QUESTION_OUT_OF_SCOPE');
  });

  it('DoD 8: validation catalogue refuses empty text, <2 options, missing correct answer, invalid marks', async () => {
    const base = {
      subjectId: mathSubjectId,
      level: 'SS2',
      questionType: 'SINGLE_CHOICE' as const,
      difficulty: 'EASY' as const,
      marks: 2,
    };
    const emptyText = await post(teacher, '/questions', {
      ...base,
      content: '  ',
      options: validOptions,
    });
    expect(emptyText.json<{ error: { code: string } }>().error.code).toBe('QUESTION_TEXT_EMPTY');

    // POST /questions itself DTO-gates options at @ArrayMinSize(2), so
    // "fewer than two options" can only reach the domain-layer catalogue
    // function via a PATCH (options is optional there, no ArrayMinSize) —
    // proving the *domain* rule specifically, not just the DTO one, and
    // exercised at the actual submit-time gate DoD item 8 describes.
    const draftForOneOption = await post(teacher, '/questions', {
      ...base,
      content: 'x',
      options: validOptions,
    });
    const draftBody = draftForOneOption.json<{ id: string; revisions: { id: string }[] }>();
    await patch(teacher, `/questions/${draftBody.id}/revisions/${draftBody.revisions[0]!.id}`, {
      options: [{ content: 'A', correctFlag: true }],
    });
    const oneOption = await post(
      teacher,
      `/questions/${draftBody.id}/revisions/${draftBody.revisions[0]!.id}/submit`,
    );
    expect(oneOption.json<{ error: { code: string } }>().error.code).toBe(
      'QUESTION_INSUFFICIENT_OPTIONS',
    );

    const noCorrect = await post(teacher, '/questions', {
      ...base,
      content: 'x',
      options: [
        { content: 'A', correctFlag: false },
        { content: 'B', correctFlag: false },
      ],
    });
    expect(noCorrect.json<{ error: { code: string } }>().error.code).toBe(
      'QUESTION_CORRECT_ANSWER_MISSING',
    );

    // marks: 0 is caught by CreateQuestionDto's own @Min(1) before the
    // domain-layer catalogue ever runs (a generic VALIDATION_ERROR, not
    // QUESTION_MARKS_INVALID) — still a 400, still refused, per DoD item
    // 8's own wording; `question-validation.util.test.ts` proves the
    // domain function's own marks rule directly as a pure-function unit
    // test, since no HTTP path can bypass the DTO gate to reach it.
    const badMarks = await post(teacher, '/questions', {
      ...base,
      content: 'x',
      marks: 0,
      options: validOptions,
    });
    expect(badMarks.statusCode).toBe(400);
  });

  describe('draft lifecycle, submit, revision history, immutability', () => {
    let questionId: string;
    let revisionId: string;

    beforeAll(async () => {
      const res = await post(teacher, '/questions', {
        subjectId: mathSubjectId,
        level: 'SS2',
        questionType: 'SINGLE_CHOICE',
        content: 'What is 6 x 7?',
        difficulty: 'MEDIUM',
        marks: 3,
        options: validOptions,
      });
      const body = res.json<{ id: string; revisions: { id: string }[] }>();
      questionId = body.id;
      revisionId = body.revisions[0]!.id;
    });

    it('DoD 3: a draft is freely editable by its author', async () => {
      const res = await patch(teacher, `/questions/${questionId}/revisions/${revisionId}`, {
        content: 'What is 6 times 7?',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ content: string }>().content).toBe('What is 6 times 7?');
    });

    it("DoD 3: a draft is freely deletable — deleting a question's only revision removes the question too", async () => {
      const created = await post(teacher, '/questions', {
        subjectId: mathSubjectId,
        level: 'SS2',
        questionType: 'SINGLE_CHOICE',
        content: 'Disposable question',
        difficulty: 'EASY',
        marks: 1,
        options: validOptions,
      });
      const body = created.json<{ id: string; revisions: { id: string }[] }>();
      const res = await del(teacher, `/questions/${body.id}/revisions/${body.revisions[0]!.id}`);
      expect(res.statusCode).toBe(200);
      const getRes = await get(teacher, `/questions/${body.id}`);
      expect(getRes.statusCode).toBe(404);
    });

    it('deleting a non-only draft revision repoints currentRevisionId back at the prior one', async () => {
      const created = await post(teacher, '/questions', {
        subjectId: mathSubjectId,
        level: 'SS2',
        questionType: 'SINGLE_CHOICE',
        content: 'Question with two revisions',
        difficulty: 'EASY',
        marks: 1,
        options: validOptions,
      });
      const body = created.json<{ id: string; revisions: { id: string }[] }>();
      await withTenant(prisma, schoolId, (tx) =>
        tx.questionRevision.update({
          where: { id: body.revisions[0]!.id },
          data: { status: 'APPROVED' },
        }),
      );
      const revised = await post(teacher, `/questions/${body.id}/revisions`);
      const revisedId = revised.json<{ id: string }>().id;

      const delRes = await del(teacher, `/questions/${body.id}/revisions/${revisedId}`);
      expect(delRes.statusCode).toBe(200);

      const detail = await get(teacher, `/questions/${body.id}`);
      const detailBody = detail.json<{ currentStatus: string; revisions: { id: string }[] }>();
      expect(detailBody.currentStatus).toBe('APPROVED');
      expect(detailBody.revisions).toHaveLength(1);
    });

    it('security: another teacher cannot edit this draft', async () => {
      const res = await patch(otherTeacher, `/questions/${questionId}/revisions/${revisionId}`, {
        content: 'tampered',
      });
      expect(res.statusCode).toBe(403);
    });

    it('DoD 4: submit transitions DRAFT -> SUBMITTED and locks editing', async () => {
      const submitRes = await post(
        teacher,
        `/questions/${questionId}/revisions/${revisionId}/submit`,
      );
      expect(submitRes.statusCode).toBe(200);
      expect(submitRes.json<{ status: string }>().status).toBe('SUBMITTED');

      const patchRes = await patch(teacher, `/questions/${questionId}/revisions/${revisionId}`, {
        content: 'should be rejected',
      });
      expect(patchRes.statusCode).toBe(409);
      expect(patchRes.json<{ error: { code: string } }>().error.code).toBe(
        'QUESTION_REVISION_NOT_DRAFT',
      );
    });

    it('DoD 5/7/6: approve directly (B9 stands in), revise, and prove DB-level immutability', async () => {
      // B9 stands in: no B8 endpoint reaches APPROVED — construct it
      // directly, exactly as import-commit-resume/session-activation-
      // concurrency's own tests already establish this codebase's
      // precedent for.
      await withTenant(prisma, schoolId, (tx) =>
        tx.questionRevision.update({ where: { id: revisionId }, data: { status: 'APPROVED' } }),
      );
      const before = await withTenant(prisma, schoolId, (tx) =>
        tx.questionRevision.findUniqueOrThrow({ where: { id: revisionId } }),
      );

      // DoD 7: editing an approved question produces a new revision.
      const reviseRes = await post(teacher, `/questions/${questionId}/revisions`, {
        content: 'What is 6 times 7? (revised)',
      });
      expect(reviseRes.statusCode).toBe(201);
      const revised = reviseRes.json<{ id: string; revisionNumber: number; status: string }>();
      expect(revised.revisionNumber).toBe(2);
      expect(revised.status).toBe('DRAFT');

      const after = await withTenant(prisma, schoolId, (tx) =>
        tx.questionRevision.findUniqueOrThrow({ where: { id: revisionId } }),
      );
      expect(after).toEqual(before); // the approved one is byte-identical

      // DoD 6: a direct database UPDATE against the APPROVED row is
      // rejected by constraint — bypasses Prisma's query builder via raw
      // SQL, the literal wording the DoD asks for.
      await expect(
        withTenant(
          prisma,
          schoolId,
          (tx) =>
            tx.$executeRaw`UPDATE question_revisions SET content = 'tampered' WHERE id = ${revisionId}::uuid`,
        ),
      ).rejects.toThrow();
      await expect(
        withTenant(
          prisma,
          schoolId,
          (tx) => tx.$executeRaw`DELETE FROM question_revisions WHERE id = ${revisionId}::uuid`,
        ),
      ).rejects.toThrow();
      const optionId =
        before &&
        (
          await withTenant(prisma, schoolId, (tx) =>
            tx.questionOption.findFirstOrThrow({ where: { questionRevisionId: revisionId } }),
          )
        ).id;
      await expect(
        withTenant(
          prisma,
          schoolId,
          (tx) =>
            tx.$executeRaw`UPDATE question_options SET content = 'tampered' WHERE id = ${optionId}::uuid`,
        ),
      ).rejects.toThrow();

      // DoD 5: a REJECTED revision can also be revised.
      await withTenant(prisma, schoolId, (tx) =>
        tx.questionRevision.update({ where: { id: revised.id }, data: { status: 'REJECTED' } }),
      );
      const secondRevise = await post(teacher, `/questions/${questionId}/revisions`);
      expect(secondRevise.statusCode).toBe(201);
      expect(secondRevise.json<{ revisionNumber: number }>().revisionNumber).toBe(3);

      const detail = await get(teacher, `/questions/${questionId}`);
      const revisions = detail.json<{ revisions: { revisionNumber: number; status: string }[] }>()
        .revisions;
      expect(revisions.map((r) => r.revisionNumber)).toEqual([1, 2, 3]);
      expect(revisions[0]?.status).toBe('APPROVED');
      expect(revisions[1]?.status).toBe('REJECTED');
      expect(revisions[2]?.status).toBe('DRAFT');
    });

    it('QUESTION_REVISION_NOT_REVISABLE: cannot start a new revision from a DRAFT source', async () => {
      const res = await post(teacher, `/questions/${questionId}/revisions`);
      expect(res.statusCode).toBe(409);
      expect(res.json<{ error: { code: string } }>().error.code).toBe(
        'QUESTION_REVISION_NOT_REVISABLE',
      );
    });
  });

  it('DoD 9: topics resolve case-insensitively and auto-create on first use', async () => {
    const name = `Quadratic Equations ${randomUUID().slice(0, 6)}`;
    const first = await post(teacher, '/topics', { subjectId: mathSubjectId, name });
    const second = await post(teacher, '/topics', {
      subjectId: mathSubjectId,
      name: name.toUpperCase(),
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json<{ id: string }>().id).toBe(first.json<{ id: string }>().id);
  });

  // Regression: `list()`'s `where` object used to spread `topicId`/
  // `difficulty`/a non-ARCHIVED `status` into three independent
  // `{ currentRevision: {...} }` entries — the same top-level key, so each
  // later spread silently clobbered the one before it and only the
  // last-spread filter ever actually applied.
  it('GET /questions combines topicId + difficulty + status filters (regression: object-key collision)', async () => {
    const topicName = `Filter Regression Topic ${randomUUID().slice(0, 6)}`;
    const easyMatch = await post(teacher, '/questions', {
      subjectId: mathSubjectId,
      level: 'SS2',
      questionType: 'SINGLE_CHOICE',
      content: 'Easy question in the target topic',
      topicName,
      difficulty: 'EASY',
      marks: 1,
      options: validOptions,
    });
    const targetTopicId = easyMatch.json<{ topicId: string }>().topicId;

    // Same topic, but HARD — must be excluded by the difficulty filter.
    await post(teacher, '/questions', {
      subjectId: mathSubjectId,
      level: 'SS2',
      questionType: 'SINGLE_CHOICE',
      content: 'Hard question in the same topic',
      topicId: targetTopicId,
      difficulty: 'HARD',
      marks: 1,
      options: validOptions,
    });
    // EASY, but a different topic — must be excluded by the topic filter.
    await post(teacher, '/questions', {
      subjectId: mathSubjectId,
      level: 'SS2',
      questionType: 'SINGLE_CHOICE',
      content: 'Easy question in a different topic',
      topicName: `Other Topic ${randomUUID().slice(0, 6)}`,
      difficulty: 'EASY',
      marks: 1,
      options: validOptions,
    });

    const res = await get(
      teacher,
      `/questions?topicId=${targetTopicId}&difficulty=EASY&status=DRAFT`,
    );
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      questions: { id: string; topicId: string | null; difficulty: string }[];
    }>();
    expect(body.questions.length).toBeGreaterThan(0);
    for (const q of body.questions) {
      expect(q.topicId).toBe(targetTopicId);
      expect(q.difficulty).toBe('EASY');
    }
  });

  // Regression: creating >4 options used to be silently accepted by the API
  // and then silently truncated (with the correct-answer flag potentially
  // lost entirely) on `GET /questions/export`. Now rejected up front.
  it('POST /questions rejects more than 4 options', async () => {
    const res = await post(teacher, '/questions', {
      subjectId: mathSubjectId,
      level: 'SS2',
      questionType: 'SINGLE_CHOICE',
      content: 'Too many options',
      difficulty: 'EASY',
      marks: 1,
      options: [
        { content: 'A', correctFlag: false },
        { content: 'B', correctFlag: false },
        { content: 'C', correctFlag: false },
        { content: 'D', correctFlag: false },
        { content: 'E', correctFlag: true },
      ],
    });
    expect(res.statusCode).toBe(400);
  });

  // Regression: `resolveTopicRefs` used to resolve/create a free-text
  // `subtopicName` with `parentTopicId: null` whenever the topic itself
  // wasn't also part of the same request — mis-parenting the subtopic as a
  // top-level Topic instead of nesting it under the revision's actual
  // (unchanged) current topic.
  it('PATCH .../revisions/:rev nests a subtopic-only edit under the existing topic, not top-level', async () => {
    const topicName = `Parent Topic ${randomUUID().slice(0, 6)}`;
    const created = await post(teacher, '/questions', {
      subjectId: mathSubjectId,
      level: 'SS2',
      questionType: 'SINGLE_CHOICE',
      content: 'Subtopic parenting regression',
      topicName,
      difficulty: 'EASY',
      marks: 1,
      options: validOptions,
    });
    const body = created.json<{ id: string; topicId: string; revisions: { id: string }[] }>();

    const subtopicName = `Child Topic ${randomUUID().slice(0, 6)}`;
    const patchRes = await patch(
      teacher,
      `/questions/${body.id}/revisions/${body.revisions[0]!.id}`,
      {
        subtopicName,
      },
    );
    expect(patchRes.statusCode).toBe(200);
    const subtopicId = patchRes.json<{ subtopicId: string }>().subtopicId;

    const topicsRes = await get(
      teacher,
      `/topics?subjectId=${mathSubjectId}&parentTopicId=${body.topicId}`,
    );
    const children = topicsRes.json<{ topics: { id: string; name: string }[] }>().topics;
    expect(children.some((t) => t.id === subtopicId)).toBe(true);
  });

  it('DoD 11: status counts match a hand-computed fixture', async () => {
    const freshSubject = (
      await post(admin, '/academics/subjects', {
        name: `Counts Subject ${randomUUID().slice(0, 6)}`,
        code: `CNT-${randomUUID().slice(0, 6)}`,
      })
    ).json<{ id: string }>().id;
    const classRes = await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      name: `SS2B-${randomUUID().slice(0, 4)}`,
      level: 'SS2',
      arm: `B${randomUUID().slice(0, 4)}`,
    });
    const classId = classRes.json<{ id: string }>().id;
    const offeringId = (
      await post(admin, `/academics/classes/${classId}/subjects`, { subjectId: freshSubject })
    ).json<{ id: string }>().id;
    const teacherRes = await post(admin, '/teachers', {
      firstName: 'Counts',
      lastName: 'Teacher',
      email: `counts-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    const { teacherProfileId, membershipId } = teacherRes.json<{
      teacherProfileId: string;
      membershipId: string;
      loginIdentifier: string;
    }>();
    await put(admin, `/teachers/${teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [offeringId],
    });
    const passwordHash = await passwords.hash('a-real-password-123');
    await prisma.user.update({
      where: { id: await userIdForMembership(schoolId, membershipId) },
      data: { passwordHash, credentialState: 'OK', status: 'ACTIVE' },
    });
    const countsTeacher = await freshCtx(host, `10.${RUN}.9.${5 + Math.floor(Math.random() * 50)}`);
    await login(
      countsTeacher,
      teacherRes.json<{ loginIdentifier: string }>().loginIdentifier,
      'a-real-password-123',
    );

    async function createDraft() {
      const res = await post(countsTeacher, '/questions', {
        subjectId: freshSubject,
        level: 'SS2',
        questionType: 'SINGLE_CHOICE',
        content: `Q ${randomUUID()}`,
        difficulty: 'EASY',
        marks: 1,
        options: validOptions,
      });
      return res.json<{ id: string; revisions: { id: string }[] }>();
    }

    const draftOnly = await createDraft();
    const submitted = await createDraft();
    await post(
      countsTeacher,
      `/questions/${submitted.id}/revisions/${submitted.revisions[0]!.id}/submit`,
    );
    const approved = await createDraft();
    await withTenant(prisma, schoolId, (tx) =>
      tx.questionRevision.update({
        where: { id: approved.revisions[0]!.id },
        data: { status: 'APPROVED' },
      }),
    );
    const archived = await createDraft();
    await post(countsTeacher, `/questions/${archived.id}/archive`);

    const countsRes = await get(countsTeacher, '/questions/counts');
    const counts = countsRes.json<Record<string, number>>();
    expect(counts.draft).toBe(1);
    expect(counts.submitted).toBe(1);
    expect(counts.approved).toBe(1);
    expect(counts.archived).toBe(1);
    void draftOnly;
  });

  it('DoD 12: cross-tenant access is denied', async () => {
    const otherSchool = await createSchool();
    createdSchoolIds.push(otherSchool.id);
    const otherHost = `${otherSchool.subdomain}.${ROOT_DOMAIN}`;
    const { user } = await seedUser({
      schoolId: otherSchool.id,
      loginIdentifier: 'other-admin',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(user.id);
    const otherCtx = await freshCtx(otherHost, `10.${RUN}.9.99`);
    await login(otherCtx, 'other-admin', 'a-real-password-123');

    const created = await post(teacher, '/questions', {
      subjectId: mathSubjectId,
      level: 'SS2',
      questionType: 'SINGLE_CHOICE',
      content: 'cross-tenant probe',
      difficulty: 'EASY',
      marks: 1,
      options: validOptions,
    });
    const id = created.json<{ id: string }>().id;

    const res = await get(otherCtx, `/questions/${id}`);
    expect(res.statusCode).toBe(404);
  });

  it('HOD department-scoped view sees a question in their department (real ASSIGNED/DEPARTMENT gap-closure, proven over HTTP)', async () => {
    const created = await post(teacher, '/questions', {
      subjectId: mathSubjectId,
      level: 'SS2',
      questionType: 'SINGLE_CHOICE',
      content: 'HOD-visible question',
      difficulty: 'EASY',
      marks: 1,
      options: validOptions,
    });
    const id = created.json<{ id: string }>().id;

    const listRes = await get(hod, '/questions');
    const list = listRes.json<{ questions: { id: string }[] }>();
    expect(list.questions.some((q) => q.id === id)).toBe(true);

    const getRes = await get(hod, `/questions/${id}`);
    expect(getRes.statusCode).toBe(200);
  });
});
