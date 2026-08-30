/**
 * B9 — Question Review & Governance. Mirrors
 * `questions/question-lifecycle.integration.test.ts`'s own harness exactly
 * (real HTTP via `app.inject()` against a real, running `AppModule` and
 * real Postgres) — this phase's job is to make the SUBMITTED ->
 * UNDER_REVIEW -> APPROVED/REJECTED transitions real for the first time, so
 * every state this suite needs is produced through the real
 * `question-review.v1` endpoints, not direct Prisma writes (unlike B8's own
 * suite, which stood in for B9 with direct writes precisely because no real
 * endpoint existed yet).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import type { NotificationChannel } from '@atlas/notifications';
import { prisma, withTenant } from '@atlas/db';
import { PERMISSION_TABLE, type Role } from '@atlas/domain';
import { AppModule } from '../../app.module.js';
import { NOTIFICATION_CHANNEL } from '../../notifications/notifications.module.js';
import { PasswordService } from '../identity/password.service.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
const RUN = Math.floor(Math.random() * 200) + 1;

let app: NestFastifyApplication;
const passwords = new PasswordService();
// Spying on console.log wouldn't work here: ConsoleNotificationChannel's
// `sink` parameter defaults to `console.log` captured once at construction
// time (during app.init(), before any test runs) — a later
// `vi.spyOn(console, 'log')` replaces the *property*, not the reference
// already closed over. Spying directly on the injected singleton's own
// `send` method (an own-property override shadowing the prototype one)
// works regardless of install order, since every call site resolves
// `this.notifications.send` on the same instance at call time.
let notificationSendSpy: MockInstance<NotificationChannel['send']>;

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const channel = app.get<NotificationChannel>(NOTIFICATION_CHANNEL);
  notificationSendSpy = vi.spyOn(channel, 'send');
});

afterAll(async () => {
  await app.close();
});

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Question Review Test School ${randomUUID()}`,
      subdomain: `qr-${randomUUID().slice(0, 8)}`,
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
      email: `${opts.loginIdentifier}@example.com`,
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

async function loginAs(
  host: string,
  remoteAddress: string,
  identifier: string,
): Promise<RequestCtx> {
  const ctx = await freshCtx(host, remoteAddress);
  await login(ctx, identifier, 'a-real-password-123');
  return ctx;
}

async function setPassword(schoolId: string, membershipId: string): Promise<void> {
  const passwordHash = await passwords.hash('a-real-password-123');
  await prisma.user.update({
    where: { id: await userIdForMembership(schoolId, membershipId) },
    data: { passwordHash, credentialState: 'OK', status: 'ACTIVE' },
  });
}

async function createAndSubmitQuestion(
  teacher: RequestCtx,
  subjectId: string,
  content: string,
): Promise<{ questionId: string; revisionId: string }> {
  const created = await post(teacher, '/questions', {
    subjectId,
    level: 'SS2',
    questionType: 'SINGLE_CHOICE',
    content,
    difficulty: 'EASY',
    marks: 2,
    options: [
      { content: '4', correctFlag: false },
      { content: '5', correctFlag: true },
      { content: '6', correctFlag: false },
    ],
  });
  const body = created.json<{ id: string; revisions: { id: string }[] }>();
  const questionId = body.id;
  const revisionId = body.revisions[0]!.id;
  const submitRes = await post(teacher, `/questions/${questionId}/revisions/${revisionId}/submit`);
  expect(submitRes.statusCode).toBe(200);
  return { questionId, revisionId };
}

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    // B9: question_reviews is unconditionally append-only (this migration's
    // trigger blocks every UPDATE/DELETE) — every review row this suite
    // creates is therefore genuinely, permanently undeletable, and so, by
    // the Restrict FK from question_reviews to question_revisions, is
    // everything from Question downward. Same reasoning as
    // question-lifecycle.integration.test.ts's own afterAll for its
    // APPROVED-revision case: cleanup can't fight the guarantee it exists
    // to prove — best-effort from here, harmless leftover data.
    await withTenant(prisma, schoolId, (tx) =>
      tx.questionReview.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.question.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) => tx.topic.deleteMany({ where: { schoolId } })).catch(
      () => undefined,
    );
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

describe('B9 Question Review & Governance', () => {
  let schoolId: string;
  let host: string;
  let admin: RequestCtx;
  let teacherA: RequestCtx;
  let hodSci: RequestCtx;
  let hodArts: RequestCtx;
  let teacherHod: RequestCtx;
  let moderator: RequestCtx;
  let sessionId: string;
  let mathSubjectId: string;
  let hodSciMembershipId: string;
  let teacherHodMembershipId: string;

  beforeAll(async () => {
    const school = await createSchool();
    schoolId = school.id;
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolId);

    const { user: adminUser } = await seedUser({
      schoolId,
      loginIdentifier: 'qradmin01',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(adminUser.id);
    admin = await freshCtx(host, `10.${RUN}.10.1`);
    await login(admin, 'qradmin01', 'a-real-password-123');

    sessionId = (
      await post(admin, '/academics/sessions', {
        name: `QR Session ${randomUUID().slice(0, 8)}`,
        startDate: '2026-09-01',
        endDate: '2027-07-31',
      })
    ).json<{ id: string }>().id;
    const classId = (
      await post(admin, '/academics/classes', {
        academicSessionId: sessionId,
        name: 'SS2A',
        level: 'SS2',
        arm: 'A',
      })
    ).json<{ id: string }>().id;

    const sciencesDeptId = (
      await post(admin, '/academics/departments', {
        name: `Sciences ${randomUUID().slice(0, 6)}`,
        code: `SCI-${randomUUID().slice(0, 6)}`,
      })
    ).json<{ id: string }>().id;
    const artsDeptId = (
      await post(admin, '/academics/departments', {
        name: `Arts ${randomUUID().slice(0, 6)}`,
        code: `ART-${randomUUID().slice(0, 6)}`,
      })
    ).json<{ id: string }>().id;

    mathSubjectId = (
      await post(admin, '/academics/subjects', {
        name: 'Mathematics',
        code: `MTH-${randomUUID().slice(0, 6)}`,
      })
    ).json<{ id: string }>().id;
    await patch(admin, `/academics/subjects/${mathSubjectId}`, { departmentId: sciencesDeptId });
    const govSubjectId = (
      await post(admin, '/academics/subjects', {
        name: 'Government',
        code: `GOV-${randomUUID().slice(0, 6)}`,
      })
    ).json<{ id: string }>().id;
    await patch(admin, `/academics/subjects/${govSubjectId}`, { departmentId: artsDeptId });

    const mathOfferingId = (
      await post(admin, `/academics/classes/${classId}/subjects`, { subjectId: mathSubjectId })
    ).json<{ id: string }>().id;
    await post(admin, `/academics/classes/${classId}/subjects`, { subjectId: govSubjectId });

    // teacherA: authors Math questions, never an HOD — the "normal" author
    // for the full-cycle flow.
    const teacherARes = await post(admin, '/teachers', {
      firstName: 'Ade',
      lastName: 'Ola',
      email: `ade-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    const teacherABody = teacherARes.json<{
      teacherProfileId: string;
      membershipId: string;
      loginIdentifier: string;
    }>();
    await setPassword(schoolId, teacherABody.membershipId);
    await put(admin, `/teachers/${teacherABody.teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [mathOfferingId],
    });
    teacherA = await loginAs(host, `10.${RUN}.10.2`, teacherABody.loginIdentifier);

    // hodSci: a distinct person, HOD of Sciences (covers Math) — never
    // authors anything, the "normal" reviewer for the full-cycle flow.
    const hodSciRes = await post(admin, '/teachers', {
      firstName: 'Chidi',
      lastName: 'Nwosu',
      email: `chidi-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    const hodSciBody = hodSciRes.json<{ membershipId: string; loginIdentifier: string }>();
    hodSciMembershipId = hodSciBody.membershipId;
    await setPassword(schoolId, hodSciMembershipId);
    await post(admin, '/hods', { membershipId: hodSciMembershipId });
    await put(admin, `/hods/${hodSciMembershipId}/department`, {
      departmentId: sciencesDeptId,
      academicSessionId: sessionId,
    });
    hodSci = await loginAs(host, `10.${RUN}.10.3`, hodSciBody.loginIdentifier);

    // hodArts: HOD of a *different* department (covers Government, not
    // Math) — proves cross-department denial (DoD item 6).
    const hodArtsRes = await post(admin, '/teachers', {
      firstName: 'Funke',
      lastName: 'Bello',
      email: `funke-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    const hodArtsBody = hodArtsRes.json<{ membershipId: string; loginIdentifier: string }>();
    await setPassword(schoolId, hodArtsBody.membershipId);
    await post(admin, '/hods', { membershipId: hodArtsBody.membershipId });
    await put(admin, `/hods/${hodArtsBody.membershipId}/department`, {
      departmentId: artsDeptId,
      academicSessionId: sessionId,
    });
    hodArts = await loginAs(host, `10.${RUN}.10.4`, hodArtsBody.loginIdentifier);

    // teacherHod: holds BOTH TEACHER (assigned to Math) and HOD (of
    // Sciences) — 07 §5.3 explicitly permits this combination; DoD item 7
    // requires blocking self-approval for exactly this person.
    const teacherHodRes = await post(admin, '/teachers', {
      firstName: 'Bola',
      lastName: 'Ige',
      email: `bola-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    const teacherHodBody = teacherHodRes.json<{
      teacherProfileId: string;
      membershipId: string;
      loginIdentifier: string;
    }>();
    teacherHodMembershipId = teacherHodBody.membershipId;
    await setPassword(schoolId, teacherHodMembershipId);
    await put(admin, `/teachers/${teacherHodBody.teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [mathOfferingId],
    });
    await post(admin, '/hods', { membershipId: teacherHodMembershipId });
    await put(admin, `/hods/${teacherHodMembershipId}/department`, {
      departmentId: sciencesDeptId,
      academicSessionId: sessionId,
    });
    teacherHod = await loginAs(host, `10.${RUN}.10.5`, teacherHodBody.loginIdentifier);

    const { user: moderatorUser } = await seedUser({
      schoolId,
      loginIdentifier: 'qrmod01',
      password: 'a-real-password-123',
      role: 'MODERATOR',
    });
    createdUserIds.push(moderatorUser.id);
    moderator = await loginAs(host, `10.${RUN}.10.6`, 'qrmod01');
  });

  it('security: SOFTWARE_ADMIN has no grant at all on approve — not even break-glass (ADR-0012)', () => {
    const row = PERMISSION_TABLE.find((r) => r.id === 'questionBank.approve');
    expect(row?.grants.SOFTWARE_ADMIN.kind).toBe('DENIED');
  });

  it('security: MODERATOR is denied outright on approve/reject/request-changes', async () => {
    const { questionId } = await createAndSubmitQuestion(
      teacherA,
      mathSubjectId,
      'Moderator-denied Q',
    );
    const approve = await post(moderator, `/reviews/questions/${questionId}/approve`, {});
    expect(approve.statusCode).toBe(403);
    const reject = await post(moderator, `/reviews/questions/${questionId}/reject`, {
      reason: 'no',
    });
    expect(reject.statusCode).toBe(403);
  });

  it("security: an HOD outside the question's department cannot see or decide it (DoD item 6)", async () => {
    const { questionId } = await createAndSubmitQuestion(teacherA, mathSubjectId, 'Cross-dept Q');

    const queue = await get(hodArts, '/reviews/queue');
    expect(queue.statusCode).toBe(200);
    const subjects = queue.json<{ subjects: { subjectId: string }[] }>().subjects;
    expect(subjects.some((s) => s.subjectId === mathSubjectId)).toBe(false);

    const workspace = await get(hodArts, `/reviews/questions/${questionId}`);
    expect(workspace.statusCode).toBe(404);

    const approve = await post(hodArts, `/reviews/questions/${questionId}/approve`, {});
    expect(approve.statusCode).toBe(403);
  });

  it('DoD item 7: a teacher who is also HOD of the department cannot approve their own question', async () => {
    const { questionId } = await createAndSubmitQuestion(
      teacherHod,
      mathSubjectId,
      'Self-authored Q',
    );
    const res = await post(teacherHod, `/reviews/questions/${questionId}/approve`, {});
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'QUESTION_SELF_REVIEW_FORBIDDEN',
    );
  });

  it('reject requires a reason; rejection without one is refused (DoD item 3)', async () => {
    const { questionId } = await createAndSubmitQuestion(
      teacherA,
      mathSubjectId,
      'Needs a reason Q',
    );
    const res = await post(hodSci, `/reviews/questions/${questionId}/reject`, {});
    expect(res.statusCode).toBe(400);
  });

  it('approving twice is refused once the revision is no longer pending', async () => {
    const { questionId } = await createAndSubmitQuestion(
      teacherA,
      mathSubjectId,
      'Double approve Q',
    );
    const first = await post(hodSci, `/reviews/questions/${questionId}/approve`, {});
    expect(first.statusCode).toBe(200);
    const second = await post(hodSci, `/reviews/questions/${questionId}/approve`, {});
    expect(second.statusCode).toBe(409);
    expect(second.json<{ error: { code: string } }>().error.code).toBe(
      'QUESTION_REVISION_NOT_SUBMITTED',
    );
  });

  it(
    'full cycle: submit -> queue -> request-changes -> revise -> resubmit -> approve, ' +
      "with complete ordered history, a real notification per decision, and DoD item 1's queue shape",
    async () => {
      const { questionId, revisionId } = await createAndSubmitQuestion(
        teacherA,
        mathSubjectId,
        'What is 2 + 3?',
      );

      // DoD item 1: the queue is grouped by subject, embeds enough to
      // review without a second round trip (04 §70).
      const queue = await get(hodSci, '/reviews/queue');
      expect(queue.statusCode).toBe(200);
      const queueBody = queue.json<{
        subjects: {
          subjectId: string;
          pendingCount: number;
          items: { questionId: string; revision: { content: string } }[];
        }[];
      }>();
      const mathGroup = queueBody.subjects.find((s) => s.subjectId === mathSubjectId);
      expect(mathGroup?.pendingCount).toBeGreaterThanOrEqual(1);
      const queueItem = mathGroup?.items.find((i) => i.questionId === questionId);
      expect(queueItem?.revision.content).toBe('What is 2 + 3?');

      // Request changes — behaves like reject (DoD item 4).
      const requestChanges = await post(
        hodSci,
        `/reviews/questions/${questionId}/request-changes`,
        {
          reason: 'Option B is ambiguous',
        },
      );
      expect(requestChanges.statusCode).toBe(200);
      expect(
        requestChanges.json<{ currentRevision: { status: string } }>().currentRevision.status,
      ).toBe('REJECTED');
      expect(notificationSendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'question-review-changes-requested' }),
      );

      // Resubmit — B8's own existing createRevision()+submit() flow,
      // unmodified by B9.
      const revised = await post(teacherA, `/questions/${questionId}/revisions`, {
        content: 'What is 2 + 3? (revised)',
      });
      expect(revised.statusCode).toBe(201);
      const revisedId = revised.json<{ id: string }>().id;
      const resubmit = await post(
        teacherA,
        `/questions/${questionId}/revisions/${revisedId}/submit`,
      );
      expect(resubmit.statusCode).toBe(200);

      // Approve, with an optional note.
      const approve = await post(hodSci, `/reviews/questions/${questionId}/approve`, {
        note: 'Looks good now',
      });
      expect(approve.statusCode).toBe(200);
      expect(approve.json<{ currentRevision: { status: string } }>().currentRevision.status).toBe(
        'APPROVED',
      );
      expect(notificationSendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'question-review-approved' }),
      );

      // DoD item 5: full, ordered, never-overwritten history across both
      // revisions.
      const history = await get(hodSci, `/reviews/history/${questionId}`);
      expect(history.statusCode).toBe(200);
      const events = history.json<{
        history: { revisionNumber: number; decision: string; comment: string | null }[];
      }>().history;
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        revisionNumber: 1,
        decision: 'REQUEST_CHANGES',
        comment: 'Option B is ambiguous',
      });
      expect(events[1]).toMatchObject({ revisionNumber: 2, decision: 'APPROVED' });

      // Teacher can see their own question's history too
      // (questionBank.comment.view — TEACHER OWNED).
      const teacherHistory = await get(teacherA, `/reviews/history/${questionId}`);
      expect(teacherHistory.statusCode).toBe(200);

      // Immutability proof (mirrors question-lifecycle's own raw-SQL proof
      // pattern exactly): a direct database UPDATE/DELETE against a real
      // question_reviews row is rejected by the new trigger.
      const reviewRow = await withTenant(prisma, schoolId, (tx) =>
        tx.questionReview.findFirstOrThrow({ where: { questionRevisionId: revisionId } }),
      );
      await expect(
        withTenant(
          prisma,
          schoolId,
          (tx) =>
            tx.$executeRaw`UPDATE question_reviews SET comment = 'tampered' WHERE id = ${reviewRow.id}::uuid`,
        ),
      ).rejects.toThrow();
      await expect(
        withTenant(
          prisma,
          schoolId,
          (tx) => tx.$executeRaw`DELETE FROM question_reviews WHERE id = ${reviewRow.id}::uuid`,
        ),
      ).rejects.toThrow();
    },
  );

  it('DoD item 8: changing the HOD leaves prior decisions attributed to the previous HOD, and reassigns the pending queue', async () => {
    const { questionId: decidedQuestionId } = await createAndSubmitQuestion(
      teacherA,
      mathSubjectId,
      'Decided before reassignment',
    );
    const decided = await post(hodSci, `/reviews/questions/${decidedQuestionId}/approve`, {});
    expect(decided.statusCode).toBe(200);

    const { questionId: pendingQuestionId } = await createAndSubmitQuestion(
      teacherA,
      mathSubjectId,
      'Still pending at reassignment time',
    );

    // Promote a second Sciences HOD, ending hodSci's own HOD status
    // entirely (POST /hods/:id/remove) — the real B6 mechanism DoD item 8
    // relies on; B9 builds no reassignment logic of its own.
    const hodSci2Res = await post(admin, '/teachers', {
      firstName: 'Tolu',
      lastName: 'Adeyemi',
      email: `tolu-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    const hodSci2Body = hodSci2Res.json<{ membershipId: string; loginIdentifier: string }>();
    await setPassword(schoolId, hodSci2Body.membershipId);
    await post(admin, '/hods', { membershipId: hodSci2Body.membershipId });
    await put(admin, `/hods/${hodSci2Body.membershipId}/department`, {
      departmentId: (
        await withTenant(prisma, schoolId, (tx) =>
          tx.hODAssignment.findFirstOrThrow({ where: { membershipId: hodSciMembershipId } }),
        )
      ).departmentId,
      academicSessionId: sessionId,
    });
    await post(admin, `/hods/${hodSciMembershipId}/remove`, {});
    const hodSci2 = await loginAs(host, `10.${RUN}.10.7`, hodSci2Body.loginIdentifier);

    // The prior decision still shows hodSci as reviewer — never re-resolved
    // to whoever holds the department now.
    const history = await get(admin, `/reviews/history/${decidedQuestionId}`);
    expect(history.json<{ history: { reviewerName: string }[] }>().history[0]?.reviewerName).toBe(
      'Chidi Nwosu',
    );

    // hodSci can no longer decide anything (their HODAssignment is ENDED).
    const deniedNow = await post(hodSci, `/reviews/questions/${pendingQuestionId}/approve`, {});
    expect(deniedNow.statusCode).toBe(403);

    // hodSci2 now sees and can decide the still-pending item.
    const queue = await get(hodSci2, '/reviews/queue');
    const mathGroup = queue
      .json<{ subjects: { subjectId: string; items: { questionId: string }[] }[] }>()
      .subjects.find((s) => s.subjectId === mathSubjectId);
    expect(mathGroup?.items.some((i) => i.questionId === pendingQuestionId)).toBe(true);
    const approve = await post(hodSci2, `/reviews/questions/${pendingQuestionId}/approve`, {});
    expect(approve.statusCode).toBe(200);
  });

  it('cross-tenant: an actor in a different school cannot reach this question', async () => {
    const { questionId } = await createAndSubmitQuestion(teacherA, mathSubjectId, 'Cross-tenant Q');

    const otherSchool = await createSchool();
    createdSchoolIds.push(otherSchool.id);
    const { user: otherAdminUser } = await seedUser({
      schoolId: otherSchool.id,
      loginIdentifier: 'qradminB01',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(otherAdminUser.id);
    const otherHost = `${otherSchool.subdomain}.${ROOT_DOMAIN}`;
    const otherAdmin = await loginAs(otherHost, `10.${RUN}.10.8`, 'qradminB01');

    const res = await get(otherAdmin, `/reviews/questions/${questionId}`);
    expect(res.statusCode).toBe(404);
  });
});
