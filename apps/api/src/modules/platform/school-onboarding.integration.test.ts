/**
 * F4 gap-closure — end to end over real HTTP against the real AppModule
 * and real Postgres (RLS included), following academics.integration.test.ts's
 * own precedent: boot AppModule, seed fixtures directly via the shared
 * `prisma` singleton, drive requests via Fastify's `app.inject()`.
 *
 * Covers: default progress shape, the PUT round-trip, the re-entry-blocked
 * 409 once completed, both of 05 §5.2's hard-blocker 409s, a successful
 * completion (with its audit event), idempotent re-completion, and that no
 * non-SCHOOL_ADMIN role can reach any of the three endpoints.
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

// ---- Fixture helpers (mirrors academics.integration.test.ts) ------------

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Onboarding Test School ${randomUUID()}`,
      subdomain: `onb-${randomUUID().slice(0, 8)}`,
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

// Content-Type is only set when a payload is actually sent — the bodyless-
// POST bug CLAUDE.md's B4/F3 entries already documented (an unconditional
// `application/json` header on a bodyless POST makes Fastify's JSON body
// parser throw). POST .../complete and .../activate-style endpoints here
// are bodyless, so this matters.
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
    await withTenant(prisma, schoolId, (tx) => tx.classGroup.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.roleAssignment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.deleteMany({ where: { schoolId } }),
    );
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
});

// ---------------------------------------------------------------------

describe('F4 gap-closure — GET/PUT /school/onboarding, POST /school/onboarding/complete', () => {
  let schoolId: string;
  let host: string;
  let admin: RequestCtx;

  beforeAll(async () => {
    const school = await createSchool();
    schoolId = school.id;
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolId);
    const { user } = await seedUser({
      schoolId,
      loginIdentifier: 'onb-admin',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(user.id);
    admin = await freshCtx(host, `10.${RUN}.9.1`);
    await login(admin, 'onb-admin', 'a-real-password-123');
  });

  it('defaults to step 1, no skipped steps, not completed', async () => {
    const res = await get(admin, '/school/onboarding');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ completedAt: null, currentStep: 1, skippedSteps: [] });
  });

  it('PUT progress persists and round-trips', async () => {
    const putRes = await put(admin, '/school/onboarding/progress', {
      currentStep: 4,
      skippedSteps: [1, 2],
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json()).toEqual({ completedAt: null, currentStep: 4, skippedSteps: [1, 2] });

    const getRes = await get(admin, '/school/onboarding');
    expect(getRes.json()).toEqual({ completedAt: null, currentStep: 4, skippedSteps: [1, 2] });
  });

  it('POST complete is refused with no current session (05 §5.2 hard blocker)', async () => {
    const res = await post(admin, '/school/onboarding/complete');
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'ONBOARDING_FUNDAMENTALS_MISSING',
    );
  });

  it('POST complete is refused with a session but no class (05 §5.2 hard blocker)', async () => {
    const sessionRes = await post(admin, '/academics/sessions', {
      name: `${randomUUID().slice(0, 8)}`,
      startDate: '2026-09-01',
      endDate: '2027-07-31',
    });
    const sessionId = sessionRes.json<{ id: string }>().id;
    await post(admin, `/academics/sessions/${sessionId}/activate`);

    const res = await post(admin, '/school/onboarding/complete');
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'ONBOARDING_FUNDAMENTALS_MISSING',
    );

    await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      name: 'SS2A',
      level: 'SS2',
      arm: 'A',
    });
  });

  it('POST complete succeeds once a current session and a class exist, and records an audit event', async () => {
    const res = await post(admin, '/school/onboarding/complete');
    expect(res.statusCode).toBe(200);
    const body = res.json<{ completedAt: string | null; currentStep: number }>();
    expect(body.completedAt).not.toBeNull();
    expect(body.currentStep).toBe(4);

    const events = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({ where: { schoolId, action: 'SCHOOL_ONBOARDING_COMPLETED' } }),
    );
    expect(events).toHaveLength(1);
  });

  it('POST complete a second time is an idempotent no-op (not an error)', async () => {
    const res = await post(admin, '/school/onboarding/complete');
    expect(res.statusCode).toBe(200);
    expect(res.json<{ completedAt: string | null }>().completedAt).not.toBeNull();
  });

  it('PUT progress on an already-completed school is refused (re-entry blocked)', async () => {
    const res = await put(admin, '/school/onboarding/progress', { currentStep: 5 });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('ONBOARDING_ALREADY_COMPLETE');
  });
});

describe('F4 gap-closure — permission boundary', () => {
  let host: string;

  beforeAll(async () => {
    const school = await createSchool();
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(school.id);
    const roles: Role[] = ['MODERATOR', 'HOD', 'TEACHER', 'STUDENT'];
    const users = await Promise.all(
      roles.map((role) =>
        seedUser({
          schoolId: school.id,
          loginIdentifier: `onb-${role.toLowerCase()}`,
          password: 'a-real-password-123',
          role,
        }),
      ),
    );
    createdUserIds.push(...users.map((u) => u.user.id));
  });

  it.each(['moderator', 'hod', 'teacher', 'student'])(
    '%s cannot reach any onboarding endpoint',
    async (roleSlug) => {
      const ctx = await freshCtx(host, `10.${RUN}.9.${roleSlug.length}`);
      await login(ctx, `onb-${roleSlug}`, 'a-real-password-123');

      expect((await get(ctx, '/school/onboarding')).statusCode).toBe(403);
      expect((await put(ctx, '/school/onboarding/progress', { currentStep: 1 })).statusCode).toBe(
        403,
      );
      expect((await post(ctx, '/school/onboarding/complete')).statusCode).toBe(403);
    },
  );
});
