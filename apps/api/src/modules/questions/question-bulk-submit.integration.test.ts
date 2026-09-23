/**
 * Bulk-submit gap-closure (teacher Question Bank Draft tab): `POST
 * /v1/questions/bulk-submit` — best-effort per-question submission of each
 * question's current DRAFT revision, replaying the single-submit engine
 * (`POST .../revisions/:rev/submit`) unchanged per question.
 *
 * Mirrors `question-lifecycle.integration.test.ts`'s harness exactly (real
 * HTTP via `app.inject()` against a real, running `AppModule` and real
 * Postgres).
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
      name: `Bulk Submit Test School ${randomUUID()}`,
      subdomain: `bulk-${randomUUID().slice(0, 8)}`,
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

/** Seeds a school with admin + two teachers sharing one subject/level offering,
 * returns the wiring every test below needs. */
async function seedSchool() {
  const school = await createSchool();
  const schoolId = school.id;
  const host = `${school.subdomain}.${ROOT_DOMAIN}`;
  createdSchoolIds.push(schoolId);

  const adminLogin = `bulkadmin${RUN}${randomUUID().slice(0, 4)}`;
  const { user: adminUser } = await seedUser({
    schoolId,
    loginIdentifier: adminLogin,
    password: 'a-real-password-123',
    role: 'SCHOOL_ADMIN',
  });
  createdUserIds.push(adminUser.id);
  const admin = await freshCtx(host, `10.${RUN}.8.1`);
  await login(admin, adminLogin, 'a-real-password-123');

  const sessionId = (
    await post(admin, '/academics/sessions', {
      name: `Bulk Session ${randomUUID().slice(0, 8)}`,
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
  const subjectId = (
    await post(admin, '/academics/subjects', {
      name: 'Mathematics',
      code: `MTH-${randomUUID().slice(0, 6)}`,
    })
  ).json<{ id: string }>().id;
  const offeringId = (
    await post(admin, `/academics/classes/${classId}/subjects`, { subjectId })
  ).json<{ id: string }>().id;

  async function seedTeacher(loginIdentifier: string, ip: string) {
    const teacherBody = (
      await post(admin, '/teachers', {
        firstName: 'Test',
        lastName: 'Teacher',
        email: `${loginIdentifier}@example.com`,
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
    await put(admin, `/teachers/${teacherBody.teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [offeringId],
    });
    const ctx = await freshCtx(host, ip);
    await login(ctx, teacherBody.loginIdentifier, 'a-real-password-123');
    return { ctx, teacherProfileId: teacherBody.teacherProfileId };
  }

  const teacherOne = await seedTeacher(`bulkt1${RUN}`, `10.${RUN}.9.1`);
  const teacherTwo = await seedTeacher(`bulkt2${RUN}`, `10.${RUN}.9.2`);

  return {
    schoolId,
    host,
    admin,
    teacherOne,
    teacherTwo,
    sessionId,
    subjectId,
    validOptions: [
      { content: '4', correctFlag: false },
      { content: '5', correctFlag: true },
      { content: '6', correctFlag: false },
    ],
  };
}

interface SchoolWiring {
  schoolId: string;
  admin: RequestCtx;
  teacherOne: { ctx: RequestCtx; teacherProfileId: string };
  teacherTwo: { ctx: RequestCtx; teacherProfileId: string };
  subjectId: string;
  sessionId: string;
  validOptions: { content: string; correctFlag: boolean }[];
}

async function createDraft(
  wiring: SchoolWiring,
  ctx: RequestCtx,
  content: string,
): Promise<{ questionId: string; revisionId: string }> {
  const res = await post(ctx, '/questions', {
    subjectId: wiring.subjectId,
    level: 'SS2',
    questionType: 'SINGLE_CHOICE',
    content,
    topicName: 'Bulk Submit',
    difficulty: 'EASY',
    marks: 2,
    options: wiring.validOptions,
  });
  expect(res.statusCode).toBe(201);
  const body = res.json<{ id: string; currentRevisionId: string }>();
  return { questionId: body.id, revisionId: body.currentRevisionId };
}

describe('POST /questions/bulk-submit — teacher bulk submit for review', () => {
  let wiring: SchoolWiring;

  beforeAll(async () => {
    wiring = await seedSchool();
  });

  it("submits a batch of the caller's own valid drafts at once, auditing each", async () => {
    const q1 = await createDraft(wiring, wiring.teacherOne.ctx, 'Bulk Q1');
    const q2 = await createDraft(wiring, wiring.teacherOne.ctx, 'Bulk Q2');
    const q3 = await createDraft(wiring, wiring.teacherOne.ctx, 'Bulk Q3');

    const submittedBefore = await withTenant(prisma, wiring.schoolId, (tx) =>
      tx.auditEvent.count({
        where: { schoolId: wiring.schoolId, action: 'QUESTION_REVISION_SUBMITTED' },
      }),
    );

    const res = await post(wiring.teacherOne.ctx, '/questions/bulk-submit', {
      questionIds: [q1.questionId, q2.questionId, q3.questionId],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      submitted: { questionId: string; revisionId: string }[];
      failed: { questionId: string; code: string }[];
    }>();
    expect(body.failed).toEqual([]);
    expect(new Set(body.submitted.map((s) => s.questionId))).toEqual(
      new Set([q1.questionId, q2.questionId, q3.questionId]),
    );
    expect(body.submitted.map((s) => s.revisionId).sort()).toEqual(
      [q1.revisionId, q2.revisionId, q3.revisionId].sort(),
    );

    for (const revisionId of [q1.revisionId, q2.revisionId, q3.revisionId]) {
      const status = await withTenant(prisma, wiring.schoolId, (tx) =>
        tx.questionRevision.findUniqueOrThrow({
          where: { id: revisionId },
          select: { status: true },
        }),
      );
      expect(status.status).toBe('SUBMITTED');
    }

    const submittedAfter = await withTenant(prisma, wiring.schoolId, (tx) =>
      tx.auditEvent.count({
        where: { schoolId: wiring.schoolId, action: 'QUESTION_REVISION_SUBMITTED' },
      }),
    );
    expect(submittedAfter - submittedBefore).toBe(3);
  });

  it('reports per-question failures without blocking valid drafts', async () => {
    const good = await createDraft(wiring, wiring.teacherOne.ctx, 'Bulk good');
    const alreadySubmitted = await createDraft(
      wiring,
      wiring.teacherOne.ctx,
      'Bulk already submitted',
    );
    await post(
      wiring.teacherOne.ctx,
      `/questions/${alreadySubmitted.questionId}/revisions/${alreadySubmitted.revisionId}/submit`,
    );
    const colleagueOwned = await createDraft(wiring, wiring.teacherTwo.ctx, 'Bulk colleague');
    const incomplete = await createDraft(wiring, wiring.teacherOne.ctx, 'Bulk incomplete');
    await patch(
      wiring.teacherOne.ctx,
      `/questions/${incomplete.questionId}/revisions/${incomplete.revisionId}`,
      { content: '' },
    );

    const res = await post(wiring.teacherOne.ctx, '/questions/bulk-submit', {
      questionIds: [
        good.questionId,
        alreadySubmitted.questionId,
        colleagueOwned.questionId,
        incomplete.questionId,
      ],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      submitted: { questionId: string }[];
      failed: { questionId: string; code: string; message: string }[];
    }>();
    expect(body.submitted.map((s) => s.questionId)).toEqual([good.questionId]);

    const byId = new Map(body.failed.map((f) => [f.questionId, f]));
    expect(byId.get(alreadySubmitted.questionId)?.code).toBe('QUESTION_REVISION_NOT_DRAFT');
    expect(byId.get(colleagueOwned.questionId)?.code).toBe('FORBIDDEN');
    expect(byId.get(incomplete.questionId)?.code).toBe('QUESTION_TEXT_EMPTY');
  });

  it('marks ownership in the bank list so the UI can disable non-owned drafts', async () => {
    const mine = await createDraft(wiring, wiring.teacherOne.ctx, 'Bulk mine flag');
    const theirs = await createDraft(wiring, wiring.teacherTwo.ctx, 'Bulk theirs flag');

    const res = await get(wiring.teacherOne.ctx, `/questions?status=DRAFT`);
    expect(res.statusCode).toBe(200);
    const rows = res.json<{ questions: { id: string; mine: boolean }[] }>().questions;
    const mineRow = rows.find((r) => r.id === mine.questionId);
    const theirsRow = rows.find((r) => r.id === theirs.questionId);
    expect(mineRow?.mine).toBe(true);
    expect(theirsRow?.mine).toBe(false);
  });

  it('rejects empty and oversized batches', async () => {
    const empty = await post(wiring.teacherOne.ctx, '/questions/bulk-submit', { questionIds: [] });
    expect(empty.statusCode).toBe(400);

    const tooMany = await post(wiring.teacherOne.ctx, '/questions/bulk-submit', {
      questionIds: Array.from({ length: 201 }, () => randomUUID()),
    });
    expect(tooMany.statusCode).toBe(400);
  });

  it('forbids a non-teacher role (School Admin)', async () => {
    const res = await post(wiring.admin, '/questions/bulk-submit', { questionIds: [randomUUID()] });
    expect(res.statusCode).toBe(403);
  });

  it('does not let a foreign-school question id in (tenant isolation)', async () => {
    const foreignSchool = await seedSchool();
    const foreignDraft = await createDraft(
      foreignSchool,
      foreignSchool.teacherOne.ctx,
      'Bulk foreign',
    );

    const res = await post(wiring.teacherOne.ctx, '/questions/bulk-submit', {
      questionIds: [foreignDraft.questionId],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      submitted: unknown[];
      failed: { questionId: string; code: string }[];
    }>();
    expect(body.submitted).toEqual([]);
    expect(body.failed[0]?.code).toBe('NOT_FOUND');
  });

  it("reports QUESTION_OUT_OF_SCOPE when the teacher's assignment ended after drafting", async () => {
    const scopedSchool = await seedSchool();
    const draft = await createDraft(scopedSchool, scopedSchool.teacherOne.ctx, 'Bulk scope ended');
    await withTenant(prisma, scopedSchool.schoolId, (tx) =>
      tx.teacherAssignment.deleteMany({
        where: {
          schoolId: scopedSchool.schoolId,
          teacherProfileId: scopedSchool.teacherOne.teacherProfileId,
        },
      }),
    );

    const res = await post(scopedSchool.teacherOne.ctx, '/questions/bulk-submit', {
      questionIds: [draft.questionId],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      submitted: unknown[];
      failed: { questionId: string; code: string }[];
    }>();
    expect(body.submitted).toEqual([]);
    expect(body.failed[0]?.code).toBe('QUESTION_OUT_OF_SCOPE');
  });
});
