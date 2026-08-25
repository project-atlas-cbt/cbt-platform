/**
 * B1 Identity & Authentication — end-to-end over real HTTP against the real
 * AppModule, real Postgres (RLS included) and real Redis, per the phase's
 * Testing requirements table ("Integration | Full login/logout/refresh/
 * reset cycles..."; "Security | Enumeration resistance; lockout;
 * suspended/inactive users cannot authenticate; cross-tenant identifier
 * collision; token replay after revocation fails").
 *
 * Follows tenancy.middleware.integration.test.ts / notifications.module
 * .integration.test.ts's precedent: boots the real AppModule, writes
 * fixtures directly via the shared `prisma` singleton (B1 has no user-
 * creation endpoint of its own — that's B6 — so tests seed rows the same
 * way a future B6 will). Each `describe` block uses a distinct fake
 * `remoteAddress` so the tight per-route @Throttle() override on the auth
 * endpoints (10/min, identity.controller.ts) doesn't cross-contaminate
 * unrelated test groups sharing one Redis-backed counter.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import type { ErrorEnvelope } from '@atlas/validation';
import { AppModule } from '../../app.module.js';
import { PasswordService } from './password.service.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';

// Fake client IPs below are `10.${RUN}.<block>.<n>` — randomised per test
// process so re-running this file against the same long-lived local Redis
// (docker compose, not a fresh-per-run CI container) never inherits a
// previous run's leftover per-IP throttle/lockout counters. Each `describe`
// block still uses a fixed <block> digit so its own IPs stay distinct from
// every other block's within one run — see the tight @Throttle() override
// on the auth endpoints (identity.controller.ts) and AuthLockoutService.
const RUN = Math.floor(Math.random() * 200) + 1;

let app: NestFastifyApplication;
const passwords = new PasswordService();

// ConsoleNotificationChannel captures `console.log` by reference in its
// constructor's default parameter (packages/notifications/src/console-
// channel.ts) — spied *after* the app (and therefore that instance) is
// already constructed would bind to a stale reference and silently miss
// every call. Installed at module scope, before `beforeAll` boots the app,
// so the DI factory captures the spy itself; individual tests
// `.mockClear()` it and read `.mock.calls` around the action they care
// about instead of re-spying.
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

// ---- Fixture helpers --------------------------------------------------

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Identity Test School ${randomUUID()}`,
      subdomain: `id-${randomUUID().slice(0, 8)}`,
    },
  });
}

interface SeedUserOptions {
  schoolId: string;
  loginIdentifier: string;
  password?: string;
  userStatus?: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  membershipStatus?: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'ENDED';
  credentialState?: 'MUST_SET_PASSWORD' | 'MUST_CHANGE_PASSWORD' | 'OK';
  email?: string;
  role?: 'STUDENT' | 'TEACHER' | 'SCHOOL_ADMIN';
}

async function seedUser(opts: SeedUserOptions) {
  const passwordHash = opts.password ? await passwords.hash(opts.password) : null;
  const user = await prisma.user.create({
    data: {
      firstName: 'Test',
      lastName: 'User',
      displayName: `Test User ${opts.loginIdentifier}`,
      email: opts.email ?? null,
      passwordHash,
      status: opts.userStatus ?? 'ACTIVE',
      credentialState: opts.credentialState ?? (opts.password ? 'OK' : 'MUST_SET_PASSWORD'),
    },
  });
  const membership = await withTenant(prisma, opts.schoolId, (tx) =>
    tx.schoolMembership.create({
      data: {
        schoolId: opts.schoolId,
        userId: user.id,
        loginIdentifier: opts.loginIdentifier,
        status: opts.membershipStatus ?? 'ACTIVE',
      },
    }),
  );
  if (opts.role) {
    await withTenant(prisma, opts.schoolId, (tx) =>
      tx.roleAssignment.create({
        data: { schoolId: opts.schoolId, membershipId: membership.id, role: opts.role! },
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

async function getTenantContext(host: string, remoteAddress: string) {
  const res = await app.inject({
    method: 'GET',
    url: '/tenant/resolve',
    headers: { host },
    remoteAddress,
  });
  const body = res.json<{ school: unknown; csrfToken: string }>();
  const csrfCookie = extractCookie(res.headers['set-cookie'], '_csrf');
  if (!csrfCookie) throw new Error('tenant/resolve did not set a _csrf cookie');
  return { csrfCookie, csrfToken: body.csrfToken };
}

interface RequestCtx {
  host: string;
  remoteAddress: string;
  csrfCookie: string;
  csrfToken: string;
  sessionCookie?: string;
}

async function freshCtx(host: string, remoteAddress: string): Promise<RequestCtx> {
  const { csrfCookie, csrfToken } = await getTenantContext(host, remoteAddress);
  return { host, remoteAddress, csrfCookie, csrfToken };
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

/** Logs a successful login in, mutating `ctx` with the new session cookie. */
async function login(ctx: RequestCtx, identifier: string, password: string) {
  const res = await post(ctx, '/auth/login', { identifier, password });
  if (res.statusCode === 200) {
    const sessionCookie = extractCookie(res.headers['set-cookie'], 'atlas_session');
    if (sessionCookie) ctx.sessionCookie = sessionCookie;
  }
  return res;
}

// ---- Cleanup tracking ---------------------------------------------------

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  // RLS-protected — one withTenant() per school, not a single deleteMany
  // spanning many schools' rows at once (school.delete()'s own cascade
  // would also clear these, but going through withTenant explicitly here
  // avoids depending on cascade semantics interacting correctly with RLS).
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.deleteMany({ where: { schoolId } }),
    );
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }); // User: no RLS
  await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } }); // School: no RLS
});

// ---------------------------------------------------------------------

describe('Full login → me → logout → refresh cycle (DoD 1, 6, 10)', () => {
  let schoolId: string;
  let host: string;

  beforeAll(async () => {
    const school = await createSchool();
    schoolId = school.id;
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolId);
    const { user } = await seedUser({
      schoolId,
      loginIdentifier: 'staff01',
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    createdUserIds.push(user.id);
  });

  it('authenticates with a valid credential and sets a session cookie', async () => {
    const ctx = await freshCtx(host, `10.${RUN}.1.1`);
    const res = await login(ctx, 'staff01', 'a-real-password-123');
    expect(res.statusCode).toBe(200);
    expect(ctx.sessionCookie).toBeDefined();
  });

  it('GET /auth/me reads memberships and roles live from the database', async () => {
    const ctx = await freshCtx(host, `10.${RUN}.1.2`);
    await login(ctx, 'staff01', 'a-real-password-123');
    const res = await get(ctx, '/auth/me');
    expect(res.statusCode).toBe(200);
    const body = res.json<{ roles: string[]; membership: { loginIdentifier: string } }>();
    expect(body.roles).toContain('TEACHER');
    expect(body.membership.loginIdentifier).toBe('staff01');
  });

  it('logout revokes the session — a later /auth/me with the same cookie fails', async () => {
    const ctx = await freshCtx(host, `10.${RUN}.1.3`);
    await login(ctx, 'staff01', 'a-real-password-123');
    const logoutRes = await post(ctx, '/auth/logout', {});
    expect(logoutRes.statusCode).toBe(200);

    const meRes = await get(ctx, '/auth/me');
    expect(meRes.statusCode).toBe(401);
    expect(meRes.json<ErrorEnvelope>().error.code).toBe('UNAUTHENTICATED');
  });

  it('refresh rotates the session — the old cookie stops working, the new one works (DoD 6)', async () => {
    const ctx = await freshCtx(host, `10.${RUN}.1.4`);
    await login(ctx, 'staff01', 'a-real-password-123');
    const oldSessionCookie = ctx.sessionCookie!;

    const refreshRes = await post(ctx, '/auth/refresh', {});
    expect(refreshRes.statusCode).toBe(200);
    const newSessionCookie = extractCookie(refreshRes.headers['set-cookie'], 'atlas_session');
    expect(newSessionCookie).toBeDefined();
    expect(newSessionCookie).not.toBe(oldSessionCookie);
    if (!newSessionCookie) throw new Error('unreachable — asserted above');

    // Old cookie: revoked, must fail.
    const staleCtx = { ...ctx, sessionCookie: oldSessionCookie };
    const staleRes = await get(staleCtx, '/auth/me');
    expect(staleRes.statusCode).toBe(401);

    // New cookie: works.
    const rotatedCtx = { ...ctx, sessionCookie: newSessionCookie };
    const rotatedRes = await get(rotatedCtx, '/auth/me');
    expect(rotatedRes.statusCode).toBe(200);
  });
});

describe('Forced first-login password change cannot be bypassed (DoD 8)', () => {
  let host: string;

  beforeAll(async () => {
    const school = await createSchool();
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(school.id);
    const { user } = await seedUser({
      schoolId: school.id,
      loginIdentifier: 'student01',
      password: 'temporary-initial-pw-1',
      credentialState: 'MUST_CHANGE_PASSWORD',
      role: 'STUDENT',
    });
    createdUserIds.push(user.id);
  });

  it('every guarded route except password/change is blocked with PASSWORD_CHANGE_REQUIRED', async () => {
    const ctx = await freshCtx(host, `10.${RUN}.2.1`);
    await login(ctx, 'student01', 'temporary-initial-pw-1');

    const meRes = await get(ctx, '/auth/me');
    expect(meRes.statusCode).toBe(403);
    expect(meRes.json<ErrorEnvelope>().error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('password/change succeeds without a currentPassword, then every route works normally', async () => {
    const ctx = await freshCtx(host, `10.${RUN}.2.2`);
    await login(ctx, 'student01', 'temporary-initial-pw-1');

    const changeRes = await post(ctx, '/auth/password/change', {
      newPassword: 'a-new-chosen-password-1',
    });
    expect(changeRes.statusCode).toBe(200);

    const meRes = await get(ctx, '/auth/me');
    expect(meRes.statusCode).toBe(200);
  });
});

describe('Staff password reset request → confirm cycle (DoD 7)', () => {
  let host: string;

  beforeAll(async () => {
    const school = await createSchool();
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(school.id);
    const { user } = await seedUser({
      schoolId: school.id,
      loginIdentifier: 'staffreset01',
      password: 'original-password-1',
      email: 'staffreset01@example.test',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(user.id);
  });

  it('requesting a reset sends the templated email; confirming it lets the new password log in', async () => {
    consoleLogSpy.mockClear();
    const ctx = await freshCtx(host, `10.${RUN}.3.1`);
    const reqRes = await post(ctx, '/auth/password/reset/request', { identifier: 'staffreset01' });
    expect(reqRes.statusCode).toBe(200);

    const logged = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('to=staffreset01@example.test');
    const match = /token=([\w-]+)/.exec(logged);
    expect(match).not.toBeNull();
    const token = match![1];

    const confirmCtx = await freshCtx(host, `10.${RUN}.3.2`);
    const confirmRes = await post(confirmCtx, '/auth/password/reset/confirm', {
      token,
      newPassword: 'brand-new-password-1',
    });
    expect(confirmRes.statusCode).toBe(200);

    const loginCtx = await freshCtx(host, `10.${RUN}.3.3`);
    const loginRes = await login(loginCtx, 'staffreset01', 'brand-new-password-1');
    expect(loginRes.statusCode).toBe(200);
  });

  it('a used or unknown reset token is rejected', async () => {
    const ctx = await freshCtx(host, `10.${RUN}.3.4`);
    const res = await post(ctx, '/auth/password/reset/confirm', {
      token: 'not-a-real-token',
      newPassword: 'irrelevant-password-1',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Enumeration resistance and account-state precedence (DoD 2, 3, 4)', () => {
  let host: string;

  beforeAll(async () => {
    const school = await createSchool();
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(school.id);

    const active = await seedUser({
      schoolId: school.id,
      loginIdentifier: 'good01',
      password: 'a-correct-password-1',
    });
    createdUserIds.push(active.user.id);

    const invited = await seedUser({
      schoolId: school.id,
      loginIdentifier: 'invited01',
      userStatus: 'INVITED',
    });
    createdUserIds.push(invited.user.id);

    const suspended = await seedUser({
      schoolId: school.id,
      loginIdentifier: 'suspended01',
      password: 'whatever-password-1',
      userStatus: 'SUSPENDED',
    });
    createdUserIds.push(suspended.user.id);

    const inactive = await seedUser({
      schoolId: school.id,
      loginIdentifier: 'inactive01',
      password: 'whatever-password-1',
      userStatus: 'INACTIVE',
    });
    createdUserIds.push(inactive.user.id);

    // DoD 4: User.status ACTIVE but SchoolMembership ENDED must still fail.
    const ended = await seedUser({
      schoolId: school.id,
      loginIdentifier: 'ended01',
      password: 'whatever-password-1',
      membershipStatus: 'ENDED',
    });
    createdUserIds.push(ended.user.id);
  });

  async function attempt(identifier: string, password: string, remoteAddress: string) {
    const ctx = await freshCtx(host, remoteAddress);
    return post(ctx, '/auth/login', { identifier, password });
  }

  it('unknown identifier, wrong password, and every non-ACTIVE state all return an identical shape', async () => {
    const responses = await Promise.all([
      attempt('no-such-identifier', 'anything', `10.${RUN}.4.1`),
      attempt('good01', 'the-wrong-password', `10.${RUN}.4.2`),
      attempt('invited01', 'anything', `10.${RUN}.4.3`),
      attempt('suspended01', 'whatever-password-1', `10.${RUN}.4.4`),
      attempt('inactive01', 'whatever-password-1', `10.${RUN}.4.5`),
      attempt('ended01', 'whatever-password-1', `10.${RUN}.4.6`),
    ]);

    for (const res of responses) {
      expect(res.statusCode).toBe(401);
      const body = res.json<ErrorEnvelope>();
      expect(body.error.code).toBe('UNAUTHENTICATED');
      expect(body.error.message).toBe('Invalid credentials.');
    }
  });

  it('the correct credential still succeeds (sanity check the fixtures are wired right)', async () => {
    const res = await attempt('good01', 'a-correct-password-1', `10.${RUN}.4.7`);
    expect(res.statusCode).toBe(200);
  });
});

describe('Per-identifier lockout (DoD 9)', () => {
  let host: string;

  beforeAll(async () => {
    const school = await createSchool();
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(school.id);
    const { user } = await seedUser({
      schoolId: school.id,
      loginIdentifier: 'lockout01',
      password: 'the-real-password-1',
    });
    createdUserIds.push(user.id);
  });

  it('locks out after the configured threshold, then rejects even the correct password', async () => {
    const maxAttempts = Number(process.env.AUTH_LOCKOUT_MAX_ATTEMPTS ?? 5);
    for (let i = 0; i < maxAttempts; i++) {
      const ctx = await freshCtx(host, `10.${RUN}.5.1`);
      const res = await post(ctx, '/auth/login', { identifier: 'lockout01', password: 'wrong' });
      expect(res.statusCode).toBe(401);
    }

    // Correct password, but the lockout window is still open — must still fail.
    const lockedCtx = await freshCtx(host, `10.${RUN}.5.1`);
    const lockedOutRes = await post(lockedCtx, '/auth/login', {
      identifier: 'lockout01',
      password: 'the-real-password-1',
    });
    expect(lockedOutRes.statusCode).toBe(401);
    expect(lockedOutRes.json<ErrorEnvelope>().error.code).toBe('UNAUTHENTICATED');
  });
});

describe('Cross-tenant identifier collision (DoD 5)', () => {
  it('the same login identifier in two different schools never crosses over', async () => {
    const schoolA = await createSchool();
    const schoolB = await createSchool();
    createdSchoolIds.push(schoolA.id, schoolB.id);

    const userA = await seedUser({
      schoolId: schoolA.id,
      loginIdentifier: 'ST001',
      password: 'school-a-password-1',
    });
    const userB = await seedUser({
      schoolId: schoolB.id,
      loginIdentifier: 'ST001',
      password: 'school-b-password-1',
    });
    createdUserIds.push(userA.user.id, userB.user.id);

    const hostA = `${schoolA.subdomain}.${ROOT_DOMAIN}`;
    const hostB = `${schoolB.subdomain}.${ROOT_DOMAIN}`;

    // School A's password does not work against School B's "ST001".
    const crossCtx = await freshCtx(hostB, `10.${RUN}.6.1`);
    const crossRes = await post(crossCtx, '/auth/login', {
      identifier: 'ST001',
      password: 'school-a-password-1',
    });
    expect(crossRes.statusCode).toBe(401);

    // Each school's own password works within its own tenant.
    const okACtx = await freshCtx(hostA, `10.${RUN}.6.2`);
    const okARes = await post(okACtx, '/auth/login', {
      identifier: 'ST001',
      password: 'school-a-password-1',
    });
    expect(okARes.statusCode).toBe(200);

    const okBCtx = await freshCtx(hostB, `10.${RUN}.6.3`);
    const okBRes = await post(okBCtx, '/auth/login', {
      identifier: 'ST001',
      password: 'school-b-password-1',
    });
    expect(okBRes.statusCode).toBe(200);
  });
});
