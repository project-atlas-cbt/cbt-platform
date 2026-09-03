/**
 * F5/B3 gap-closure — `GET/PUT /v1/school/result-policy` (05 §47,
 * ADR-0010's "Required changes: B5/B3: school-level defaults and the lock
 * flag", never actually built there), end to end over real HTTP against
 * the real AppModule and real Postgres (RLS included). Same fixture-helper
 * shape as `school-branding.integration.test.ts` — each integration test
 * file owns its own fixture helpers, this codebase's established
 * convention (see that file's own header comment).
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
      name: `Result Policy Test School ${randomUUID()}`,
      subdomain: `resultpolicy-${randomUUID().slice(0, 8)}`,
    },
  });
}

async function seedMember(schoolId: string, loginIdentifier: string, password: string, role: Role) {
  const passwordHash = await passwords.hash(password);
  const user = await prisma.user.create({
    data: {
      firstName: 'Result',
      lastName: 'Policy Tester',
      displayName: 'Result Policy Tester',
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

describe('F5/B3 gap-closure — school result-policy defaults and lock flag', () => {
  it('defaults to SCHOOL_ADMIN / SCORE_AND_COUNTS / unlocked for a freshly created school', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedMember(
      school.id,
      `rp-default-${RUN}`,
      'CorrectHorseBattery1!',
      'SCHOOL_ADMIN',
    );
    createdUserIds.push(admin.id);
    const ctx = await freshCtx(host, `10.${RUN}.20.1`);
    await login(ctx, `rp-default-${RUN}`, 'CorrectHorseBattery1!');

    const res = await get(ctx, '/school/result-policy');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      resultPolicy: 'SCHOOL_ADMIN',
      resultDetailVisibility: 'SCORE_AND_COUNTS',
      resultPolicyLocked: false,
    });
  });

  it('School Admin can update all three fields, and every change is audited', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedMember(
      school.id,
      `rp-update-${RUN}`,
      'CorrectHorseBattery1!',
      'SCHOOL_ADMIN',
    );
    createdUserIds.push(admin.id);
    const ctx = await freshCtx(host, `10.${RUN}.20.2`);
    await login(ctx, `rp-update-${RUN}`, 'CorrectHorseBattery1!');

    const res = await put(ctx, '/school/result-policy', {
      resultPolicy: 'AUTOMATIC',
      resultDetailVisibility: 'FULL_REVIEW',
      resultPolicyLocked: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      resultPolicy: 'AUTOMATIC',
      resultDetailVisibility: 'FULL_REVIEW',
      resultPolicyLocked: true,
    });

    const getRes = await get(ctx, '/school/result-policy');
    expect(getRes.json()).toEqual({
      resultPolicy: 'AUTOMATIC',
      resultDetailVisibility: 'FULL_REVIEW',
      resultPolicyLocked: true,
    });

    const auditEvents = await withTenant(prisma, school.id, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId: school.id, action: 'SCHOOL_RESULT_POLICY_CHANGED' },
      }),
    );
    expect(auditEvents).toHaveLength(1);
  });

  it('rejects an out-of-vocabulary value at the DTO layer', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedMember(
      school.id,
      `rp-invalid-${RUN}`,
      'CorrectHorseBattery1!',
      'SCHOOL_ADMIN',
    );
    createdUserIds.push(admin.id);
    const ctx = await freshCtx(host, `10.${RUN}.20.3`);
    await login(ctx, `rp-invalid-${RUN}`, 'CorrectHorseBattery1!');

    const res = await put(ctx, '/school/result-policy', { resultPolicy: 'NOT_A_POLICY' });
    expect(res.statusCode).toBe(400);
  });

  it('Moderator can view but not edit (schoolConfig.settings.view vs .manage)', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const moderator = await seedMember(
      school.id,
      `rp-moderator-${RUN}`,
      'CorrectHorseBattery1!',
      'MODERATOR',
    );
    createdUserIds.push(moderator.id);
    const ctx = await freshCtx(host, `10.${RUN}.20.4`);
    await login(ctx, `rp-moderator-${RUN}`, 'CorrectHorseBattery1!');

    const viewRes = await get(ctx, '/school/result-policy');
    expect(viewRes.statusCode).toBe(200);

    const editRes = await put(ctx, '/school/result-policy', { resultPolicy: 'AUTOMATIC' });
    expect(editRes.statusCode).toBe(403);
  });

  it('denies Teacher entirely (view and edit)', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const teacher = await seedMember(
      school.id,
      `rp-teacher-${RUN}`,
      'CorrectHorseBattery1!',
      'TEACHER',
    );
    createdUserIds.push(teacher.id);
    const ctx = await freshCtx(host, `10.${RUN}.20.5`);
    await login(ctx, `rp-teacher-${RUN}`, 'CorrectHorseBattery1!');

    const viewRes = await get(ctx, '/school/result-policy');
    expect(viewRes.statusCode).toBe(403);
    const editRes = await put(ctx, '/school/result-policy', { resultPolicy: 'AUTOMATIC' });
    expect(editRes.statusCode).toBe(403);
  });

  it("cannot read or affect another school's result policy (cross-tenant isolation)", async () => {
    const schoolA = await createSchool();
    const schoolB = await createSchool();
    createdSchoolIds.push(schoolA.id, schoolB.id);
    const adminA = await seedMember(
      schoolA.id,
      `rp-a-${RUN}`,
      'CorrectHorseBattery1!',
      'SCHOOL_ADMIN',
    );
    const adminB = await seedMember(
      schoolB.id,
      `rp-b-${RUN}`,
      'CorrectHorseBattery1!',
      'SCHOOL_ADMIN',
    );
    createdUserIds.push(adminA.id, adminB.id);

    const ctxA = await freshCtx(`${schoolA.subdomain}.${ROOT_DOMAIN}`, `10.${RUN}.20.6`);
    await login(ctxA, `rp-a-${RUN}`, 'CorrectHorseBattery1!');
    await put(ctxA, '/school/result-policy', { resultPolicy: 'AUTOMATIC' });

    const ctxB = await freshCtx(`${schoolB.subdomain}.${ROOT_DOMAIN}`, `10.${RUN}.20.7`);
    await login(ctxB, `rp-b-${RUN}`, 'CorrectHorseBattery1!');
    const res = await get(ctxB, '/school/result-policy');
    // School B's own default, unaffected by School A's change.
    expect(res.json<{ resultPolicy: string }>().resultPolicy).toBe('SCHOOL_ADMIN');
  });
});
