/**
 * B2 — end to end over real HTTP against the real AppModule and real
 * Postgres (RLS included), following identity.integration.test.ts's own
 * precedent: boot AppModule, seed fixtures directly via the shared
 * `prisma` singleton (no user-creation endpoint exists yet — B6).
 *
 * Covers: DoD item 3 (contract shape stable for F2), the multi-role union
 * case, the tiny student surface (DoD item 8), cross-cutting guard
 * ordering (AuthGuard's PASSWORD_CHANGE_REQUIRED gate still applies
 * through @Authorized()), and that PolicyCoverageService's startup
 * assertion — proven directly in policy-coverage.service.test.ts — also
 * doesn't block the real app from booting.
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
      name: `Authorization Test School ${randomUUID()}`,
      subdomain: `authz-${randomUUID().slice(0, 8)}`,
    },
  });
}

async function seedUser(opts: {
  schoolId: string;
  loginIdentifier: string;
  password: string;
  roles: Role[];
  credentialState?: 'MUST_SET_PASSWORD' | 'MUST_CHANGE_PASSWORD' | 'OK';
}) {
  const passwordHash = await passwords.hash(opts.password);
  const user = await prisma.user.create({
    data: {
      firstName: 'Test',
      lastName: 'User',
      displayName: `Test User ${opts.loginIdentifier}`,
      passwordHash,
      status: 'ACTIVE',
      credentialState: opts.credentialState ?? 'OK',
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
  for (const role of opts.roles) {
    // Sequential seeding, not a hot path.
    await withTenant(prisma, opts.schoolId, (tx) =>
      tx.roleAssignment.create({
        data: { schoolId: opts.schoolId, membershipId: membership.id, role },
      }),
    );
  }
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

async function post(ctx: RequestCtx, url: string, payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
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
      tx.schoolMembership.deleteMany({ where: { schoolId } }),
    );
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
});

describe('GET /v1/me/permissions (B2 DoD item: contract stable for F2)', () => {
  let schoolId: string;
  let host: string;

  beforeAll(async () => {
    const school = await createSchool();
    schoolId = school.id;
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolId);
  });

  it('rejects an unauthenticated caller', async () => {
    const ctx = await freshCtx(host, `10.${RUN}.2.1`);
    const res = await get(ctx, '/me/permissions');
    expect(res.statusCode).toBe(401);
  });

  it('a Student gets a tiny, SELF-scoped surface (02 rule 9 / DoD item 8)', async () => {
    const identifier = `student-${randomUUID().slice(0, 8)}`;
    const { user } = await seedUser({
      schoolId,
      loginIdentifier: identifier,
      password: 'a-real-password-123',
      roles: ['STUDENT'],
    });
    createdUserIds.push(user.id);

    const ctx = await freshCtx(host, `10.${RUN}.2.2`);
    await login(ctx, identifier, 'a-real-password-123');
    const res = await get(ctx, '/me/permissions');
    expect(res.statusCode).toBe(200);

    const body = res.json<{
      roles: string[];
      permissions: Array<{ resource: string; scope?: string }>;
    }>();
    expect(body.roles).toEqual(['STUDENT']);
    expect(body.permissions.length).toBeGreaterThan(0);
    // Every scoped grant a student holds is SELF, with one named narrow
    // exception (schoolConfig.profile.view) — mirrors the domain-level
    // table test's own assertion, proven here end to end over real HTTP.
    for (const permission of body.permissions) {
      if (permission.scope) {
        expect(['SELF', 'SCHOOL'].includes(permission.scope), permission.resource).toBe(true);
        if (permission.scope === 'SCHOOL')
          expect(permission.resource).toBe('schoolConfig.profile.view');
      }
    }
    expect(body.permissions.find((p) => p.resource === 'questionBank.view')).toBeUndefined();
  });

  it("a membership holding two roles (TEACHER + HOD) gets the union of both role's capabilities", async () => {
    const identifier = `dual-${randomUUID().slice(0, 8)}`;
    const { user } = await seedUser({
      schoolId,
      loginIdentifier: identifier,
      password: 'a-real-password-123',
      roles: ['TEACHER', 'HOD'],
    });
    createdUserIds.push(user.id);

    const ctx = await freshCtx(host, `10.${RUN}.2.3`);
    await login(ctx, identifier, 'a-real-password-123');
    const res = await get(ctx, '/me/permissions');
    expect(res.statusCode).toBe(200);

    const body = res.json<{
      roles: string[];
      permissions: Array<{ resource: string; scope?: string }>;
    }>();
    expect(body.roles.sort()).toEqual(['HOD', 'TEACHER']);
    // HOD-only capability present...
    expect(body.permissions.find((p) => p.resource === 'questionBank.approve')).toBeDefined();
    // ...and a Teacher-only capability (SELF-scoped ones are unaffected by
    // the ASSIGNED resolver's fail-closed-until-B6 state) is present too.
    expect(body.permissions.find((p) => p.resource === 'identity.me.read')).toBeDefined();
  });

  it('a MUST_CHANGE_PASSWORD account is blocked by AuthGuard before PermissionGuard ever runs', async () => {
    const identifier = `pending-${randomUUID().slice(0, 8)}`;
    const { user } = await seedUser({
      schoolId,
      loginIdentifier: identifier,
      password: 'a-temporary-password-123',
      roles: ['TEACHER'],
      credentialState: 'MUST_CHANGE_PASSWORD',
    });
    createdUserIds.push(user.id);

    const ctx = await freshCtx(host, `10.${RUN}.2.4`);
    await login(ctx, identifier, 'a-temporary-password-123');
    const res = await get(ctx, '/me/permissions');
    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });
});
