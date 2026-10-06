/**
 * Assessment Rules — `GET/PUT /v1/school/assessment-rules` (05 §58), end to
 * end over real HTTP against the real AppModule and real Postgres (RLS
 * included). Fixture helpers follow `school-result-policy.integration.test.ts`
 * (each integration test file owns its own, this codebase's convention).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import { safeDeleteSchools } from '../../test-support/safe-delete-schools.js';
import type { Role } from '@atlas/domain';
import { AppModule } from '../../app.module.js';
import { PasswordService } from '../identity/password.service.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
const RUN = Math.floor(Math.random() * 200) + 1;

let app: NestFastifyApplication;
const passwords = new PasswordService();
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
  consoleLogSpy.mockRestore();
});

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Assessment Rules Test School ${randomUUID()}`,
      subdomain: `assessrules-${randomUUID().slice(0, 8)}`,
    },
  });
}

async function seedMember(schoolId: string, loginIdentifier: string, password: string, role: Role) {
  const passwordHash = await passwords.hash(password);
  const user = await prisma.user.create({
    data: {
      firstName: 'Assessment',
      lastName: 'Rules Tester',
      displayName: 'Assessment Rules Tester',
      passwordHash,
      status: 'ACTIVE',
      credentialState: 'OK',
    },
  });
  const membership = await withTenant(prisma, schoolId, (tx) =>
    tx.schoolMembership.create({
      data: { schoolId, userId: user.id, loginIdentifier, status: 'ACTIVE' },
    }),
  );
  await withTenant(prisma, schoolId, (tx) =>
    tx.roleAssignment.create({ data: { schoolId, membershipId: membership.id, role } }),
  );
  return user;
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
  const sessionCookie = extractCookie(res.headers['set-cookie'], 'atlas_session');
  if (sessionCookie) ctx.sessionCookie = sessionCookie;
  return res;
}

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.roleAssignment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.deleteMany({ where: { schoolId } }),
    );
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await safeDeleteSchools(prisma, createdSchoolIds);
});

const FRESH_DEFAULTS = {
  defaultExamDurationSeconds: null,
  defaultAttemptLimit: 1,
  defaultNavigationPolicy: 'FREE',
  defaultRandomizeQuestions: false,
  defaultRandomizeOptions: false,
};

async function adminCtx(label: string, octet: number, role: Role = 'SCHOOL_ADMIN') {
  const school = await createSchool();
  createdSchoolIds.push(school.id);
  const identifier = `ar-${label}-${RUN}`;
  const user = await seedMember(school.id, identifier, 'CorrectHorseBattery1!', role);
  createdUserIds.push(user.id);
  const ctx = await freshCtx(`${school.subdomain}.${ROOT_DOMAIN}`, `10.${RUN}.21.${octet}`);
  await login(ctx, identifier, 'CorrectHorseBattery1!');
  return { school, ctx };
}

let invalidCase = 0;

describe('Assessment Rules — school defaults for new exams', () => {
  it('starts with no default duration, one attempt, free navigation and no shuffling', async () => {
    const { ctx } = await adminCtx('default', 1);
    const res = await get(ctx, '/school/assessment-rules');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(FRESH_DEFAULTS);
  });

  it('School Admin can update every field, and a real change is audited once', async () => {
    const { school, ctx } = await adminCtx('update', 2);
    const next = {
      defaultExamDurationSeconds: 2700,
      defaultAttemptLimit: 2,
      defaultNavigationPolicy: 'SEQUENTIAL_WITH_REVISIT',
      defaultRandomizeQuestions: true,
      defaultRandomizeOptions: true,
    };
    const res = await put(ctx, '/school/assessment-rules', next);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(next);
    expect((await get(ctx, '/school/assessment-rules')).json()).toEqual(next);

    // Same values again: no change, no second audit event.
    await put(ctx, '/school/assessment-rules', next);
    const auditEvents = await withTenant(prisma, school.id, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId: school.id, action: 'SCHOOL_ASSESSMENT_RULES_CHANGED' },
      }),
    );
    expect(auditEvents).toHaveLength(1);
  });

  it('a null duration clears the default; other fields are left as they were', async () => {
    const { ctx } = await adminCtx('clear', 3);
    await put(ctx, '/school/assessment-rules', {
      defaultExamDurationSeconds: 3600,
      defaultAttemptLimit: 3,
    });
    const res = await put(ctx, '/school/assessment-rules', { defaultExamDurationSeconds: null });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ defaultExamDurationSeconds: null, defaultAttemptLimit: 3 });
  });

  it.each([
    { defaultNavigationPolicy: 'NOT_A_POLICY' },
    { defaultAttemptLimit: 0 },
    { defaultExamDurationSeconds: 30 },
    { defaultExamDurationSeconds: 24 * 60 * 60 + 60 },
    { defaultRandomizeOptions: 'yes' },
  ])('rejects %o at the DTO layer', async (payload) => {
    invalidCase += 1;
    const { ctx } = await adminCtx(`invalid-${invalidCase}`, 10 + invalidCase);
    const res = await put(ctx, '/school/assessment-rules', payload);
    expect(res.statusCode).toBe(400);
  });

  it('Moderator can view but not edit', async () => {
    const { ctx } = await adminCtx('moderator', 5, 'MODERATOR');
    expect((await get(ctx, '/school/assessment-rules')).statusCode).toBe(200);
    const editRes = await put(ctx, '/school/assessment-rules', { defaultAttemptLimit: 2 });
    expect(editRes.statusCode).toBe(403);
  });

  it('denies Teacher entirely (view and edit)', async () => {
    const { ctx } = await adminCtx('teacher', 6, 'TEACHER');
    expect((await get(ctx, '/school/assessment-rules')).statusCode).toBe(403);
    const editRes = await put(ctx, '/school/assessment-rules', { defaultAttemptLimit: 2 });
    expect(editRes.statusCode).toBe(403);
  });

  it("cannot affect another school's defaults (cross-tenant isolation)", async () => {
    const a = await adminCtx('a', 7);
    const b = await adminCtx('b', 8);
    await put(a.ctx, '/school/assessment-rules', { defaultAttemptLimit: 4 });
    const res = await get(b.ctx, '/school/assessment-rules');
    expect(res.json()).toEqual(FRESH_DEFAULTS);
  });
});
