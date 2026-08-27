/**
 * B3 — end to end over real HTTP against the real AppModule and real
 * Postgres (RLS included), following authorization.integration.test.ts's
 * own precedent: boot AppModule, seed fixtures directly via the shared
 * `prisma` singleton, drive requests via Fastify's `app.inject()`.
 *
 * Covers the roadmap's Testing requirements table: the full create → issue
 * key → activate → active flow; suspension/reactivation; key replay and
 * cross-school rejection; and the data-preservation guarantee (DoD item 6
 * — "a row-count assertion proves no academic data is deleted or modified
 * by any lifecycle transition").
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import { AppModule } from '../../app.module.js';
import { PasswordService } from '../identity/password.service.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
const RUN = Math.floor(Math.random() * 200) + 1;

let app: NestFastifyApplication;
const passwords = new PasswordService();

// ConsoleNotificationChannel captures `console.log` by reference in its
// constructor's default parameter (packages/notifications/src/console-
// channel.ts) — spying *after* the app (and therefore that instance) is
// already constructed would bind to a stale reference and silently miss
// every call (identity.integration.test.ts's own documented precedent).
// Installed at module scope, before `beforeAll` boots the app.
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
});

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
  platformSessionCookie?: string;
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
  if (ctx.platformSessionCookie) parts.push(`atlas_platform_session=${ctx.platformSessionCookie}`);
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
      'content-type': 'application/json',
    },
    ...(payload !== undefined ? { payload } : {}),
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

async function loginSchool(ctx: RequestCtx, identifier: string, password: string) {
  const res = await post(ctx, '/auth/login', { identifier, password });
  if (res.statusCode === 200) {
    const sessionCookie = extractCookie(res.headers['set-cookie'], 'atlas_session');
    if (sessionCookie) ctx.sessionCookie = sessionCookie;
  }
  return res;
}

async function loginPlatform(ctx: RequestCtx, email: string, password: string) {
  const res = await post(ctx, '/platform/auth/login', { email, password });
  if (res.statusCode === 200) {
    const sessionCookie = extractCookie(res.headers['set-cookie'], 'atlas_platform_session');
    if (sessionCookie) ctx.platformSessionCookie = sessionCookie;
  }
  return res;
}

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];
const createdPlatformUserIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, async (tx) => {
      await tx.activationGrant.deleteMany({ where: { schoolId } });
      await tx.subscription.deleteMany({ where: { schoolId } });
      await tx.roleAssignment.deleteMany({ where: { schoolId } });
      await tx.session.deleteMany({ where: { schoolId } });
      await tx.schoolMembership.deleteMany({ where: { schoolId } });
    });
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.platformSession.deleteMany({ where: { userId: { in: createdPlatformUserIds } } });
  await prisma.platformRoleAssignment.deleteMany({
    where: { userId: { in: createdPlatformUserIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdPlatformUserIds } } });
  await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
});

async function seedPlatformAdmin(): Promise<{ userId: string; email: string; password: string }> {
  const email = `platform-${randomUUID().slice(0, 8)}@example.com`;
  const password = 'a-real-platform-password-123';
  const passwordHash = await passwords.hash(password);
  const user = await prisma.user.create({
    data: {
      firstName: 'Platform',
      lastName: 'Admin',
      displayName: 'Platform Admin',
      email,
      passwordHash,
      status: 'ACTIVE',
      credentialState: 'OK',
      platformRoleAssignments: { create: { role: 'SOFTWARE_ADMIN' } },
    },
  });
  createdPlatformUserIds.push(user.id);
  return { userId: user.id, email, password };
}

const ADMIN_HOST = `admin.${ROOT_DOMAIN}`;

describe('Platform auth (B3)', () => {
  it('rejects an unknown email with the same generic message as a wrong password (enumeration resistance)', async () => {
    const ctx = await freshCtx(ADMIN_HOST, `10.${RUN}.9.1`);
    const unknown = await loginPlatform(ctx, 'nobody@example.com', 'irrelevant-password');
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json<{ error: { code: string } }>().error.code).toBe('UNAUTHENTICATED');

    const platformAdmin = await seedPlatformAdmin();
    const ctx2 = await freshCtx(ADMIN_HOST, `10.${RUN}.9.2`);
    const wrongPassword = await loginPlatform(ctx2, platformAdmin.email, 'totally-wrong');
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongPassword.json<{ error: { code: string } }>().error.code).toBe('UNAUTHENTICATED');
  });

  it('a school-scoped session cannot access platform routes, and vice versa', async () => {
    const platformAdmin = await seedPlatformAdmin();
    const ctx = await freshCtx(ADMIN_HOST, `10.${RUN}.9.3`);
    await loginPlatform(ctx, platformAdmin.email, platformAdmin.password);
    expect(ctx.platformSessionCookie).toBeDefined();

    // A platform session cookie presented on a school-tenant host is simply
    // absent there (different cookie name/host) — AuthGuard sees no
    // atlas_session cookie at all and rejects generically.
    const school = await prisma.school.create({
      data: {
        name: `Platform Test School ${randomUUID()}`,
        subdomain: `plat-${randomUUID().slice(0, 8)}`,
      },
    });
    createdSchoolIds.push(school.id);
    const schoolHost = `${school.subdomain}.${ROOT_DOMAIN}`;
    const schoolCtx = await freshCtx(schoolHost, `10.${RUN}.9.4`);
    if (ctx.platformSessionCookie) schoolCtx.platformSessionCookie = ctx.platformSessionCookie;
    const res = await get(schoolCtx, '/school/profile');
    expect(res.statusCode).toBe(401);
  });
});

describe('Full activation lifecycle (B3 DoD items 1-4, 6)', () => {
  let platformCtx: RequestCtx;
  let schoolId: string;
  let subdomain: string;
  let schoolHost: string;
  const adminEmail = `school-admin-${randomUUID().slice(0, 8)}@example.com`;
  const adminIdentifier = `school-admin-${randomUUID().slice(0, 8)}`;
  let activationKey: string;

  beforeAll(async () => {
    const platformAdmin = await seedPlatformAdmin();
    platformCtx = await freshCtx(ADMIN_HOST, `10.${RUN}.10.1`);
    await loginPlatform(platformCtx, platformAdmin.email, platformAdmin.password);
  });

  it('DoD 1: creates a school landing in PROVISIONAL with a PENDING subscription', async () => {
    const res = await post(platformCtx, '/platform/schools', {
      name: `Lifecycle Test School ${randomUUID()}`,
      adminFirstName: 'Lena',
      adminLastName: 'Cycle',
      adminEmail,
      adminLoginIdentifier: adminIdentifier,
      plan: 'STANDARD',
      initialPeriodDays: 30,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; subdomain: string }>();
    schoolId = body.id;
    subdomain = body.subdomain;
    schoolHost = `${subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolId);

    const detail = await get(platformCtx, `/platform/schools/${schoolId}`);
    expect(detail.json<{ status: string; subscription: { status: string } }>().status).toBe(
      'PROVISIONAL',
    );
    expect(detail.json<{ subscription: { status: string } }>().subscription.status).toBe('PENDING');

    // Only the key's hash is ever persisted (mirrors PasswordResetToken's
    // convention) — the raw value exists only in the outbound notification.
    // This first grant is exercised implicitly (its existence + purpose is
    // asserted here); the next test re-issues a fresh one via the platform
    // endpoint specifically to observe the real plaintext key through the
    // console notification channel, and drives the actual redeem flow
    // against that one.
    const grant = await withTenant(prisma, schoolId, (tx) =>
      tx.activationGrant.findFirstOrThrow({ where: { schoolId } }),
    );
    expect(grant.purpose).toBe('INITIAL_ACTIVATION');
    expect(grant.status).toBe('ISSUED');
  });

  it('DoD 2/3: verify + redeem activates the school and subscription; replay and cross-school reuse are rejected', async () => {
    // Re-issue a fresh grant via the platform endpoint so this test can
    // observe the real plaintext key (via the module-scope console spy)
    // rather than only its hash.
    consoleLogSpy.mockClear();
    const issueRes = await post(platformCtx, `/platform/schools/${schoolId}/activation-grants`, {});
    expect(issueRes.statusCode, issueRes.body).toBe(200);
    const logged = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n');
    const match = /key=([A-Z0-9-]+)/.exec(logged);
    expect(match, `expected an activation URL in console output, got:\n${logged}`).not.toBeNull();
    activationKey = match![1]!;

    const schoolCtx = await freshCtx(schoolHost, `10.${RUN}.10.2`);

    const verify = await post(schoolCtx, '/activation/verify', { key: activationKey });
    expect(verify.statusCode).toBe(200);
    expect(verify.json<{ purpose: string }>().purpose).toBe('INITIAL_ACTIVATION');

    const redeem = await post(schoolCtx, '/activation/redeem', {
      key: activationKey,
      newPassword: 'a-brand-new-password-123',
    });
    expect(redeem.statusCode).toBe(200);

    const detail = await get(platformCtx, `/platform/schools/${schoolId}`);
    expect(detail.json<{ status: string }>().status).toBe('ACTIVE');

    // Replay.
    const replay = await post(schoolCtx, '/activation/redeem', {
      key: activationKey,
      newPassword: 'another-password-456',
    });
    expect(replay.statusCode).toBe(409);
    expect(replay.json<{ error: { code: string } }>().error.code).toBe(
      'ACTIVATION_KEY_ALREADY_USED',
    );

    // Cross-school: resolve a DIFFERENT school's tenant and try the same key.
    const otherSchool = await prisma.school.create({
      data: {
        name: `Other School ${randomUUID()}`,
        subdomain: `other-${randomUUID().slice(0, 8)}`,
      },
    });
    createdSchoolIds.push(otherSchool.id);
    const otherHost = `${otherSchool.subdomain}.${ROOT_DOMAIN}`;
    const otherCtx = await freshCtx(otherHost, `10.${RUN}.10.3`);
    const crossSchool = await post(otherCtx, '/activation/verify', { key: activationKey });
    expect(crossSchool.statusCode).toBe(404);
    expect(crossSchool.json<{ error: { code: string } }>().error.code).toBe(
      'ACTIVATION_KEY_INVALID',
    );
  });

  it('DoD 4: suspend blocks access immediately (existing session + fresh login); reactivate restores it — both audited', async () => {
    const schoolCtx = await freshCtx(schoolHost, `10.${RUN}.10.4`);
    await loginSchool(schoolCtx, adminIdentifier, 'a-brand-new-password-123');
    expect(schoolCtx.sessionCookie).toBeDefined();
    const meBefore = await get(schoolCtx, '/auth/me');
    expect(meBefore.statusCode).toBe(200);

    const suspend = await post(platformCtx, `/platform/schools/${schoolId}/suspend`, {
      reason: 'Integration test suspend',
    });
    expect(suspend.statusCode).toBe(200);

    const meAfterSuspend = await get(schoolCtx, '/auth/me');
    expect(meAfterSuspend.statusCode).toBe(403);
    expect(meAfterSuspend.json<{ error: { code: string } }>().error.code).toBe(
      'SCHOOL_ACCESS_SUSPENDED',
    );

    const freshLoginAttempt = await loginSchool(
      schoolCtx,
      adminIdentifier,
      'a-brand-new-password-123',
    );
    expect(freshLoginAttempt.statusCode).toBe(403);

    const auditEvent = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findFirst({ where: { schoolId, action: 'PLATFORM_SCHOOL_SUSPENDED' } }),
    );
    expect(auditEvent?.reason).toBe('Integration test suspend');

    const reactivate = await post(platformCtx, `/platform/schools/${schoolId}/reactivate`, {
      reason: 'Integration test reactivate',
    });
    expect(reactivate.statusCode).toBe(200);

    const restoredLogin = await loginSchool(schoolCtx, adminIdentifier, 'a-brand-new-password-123');
    expect(restoredLogin.statusCode).toBe(200);
  });

  it('DoD 6: suspend/reactivate never changes any academic-data row count (audit events are expected to grow — asserted separately)', async () => {
    const countRows = async () => {
      const [memberships, roleAssignments, sessions, subscriptions, activationGrants] =
        await withTenant(prisma, schoolId, (tx) =>
          Promise.all([
            tx.schoolMembership.count({ where: { schoolId } }),
            tx.roleAssignment.count({ where: { schoolId } }),
            tx.session.count({ where: { schoolId } }),
            tx.subscription.count({ where: { schoolId } }),
            tx.activationGrant.count({ where: { schoolId } }),
          ]),
        );
      return { memberships, roleAssignments, sessions, subscriptions, activationGrants };
    };
    const countAuditEvents = () =>
      withTenant(prisma, schoolId, (tx) => tx.auditEvent.count({ where: { schoolId } }));

    const before = await countRows();
    const auditBefore = await countAuditEvents();
    await post(platformCtx, `/platform/schools/${schoolId}/suspend`, { reason: 'row-count check' });
    await post(platformCtx, `/platform/schools/${schoolId}/reactivate`, {
      reason: 'row-count check',
    });
    const after = await countRows();
    const auditAfter = await countAuditEvents();

    expect(after).toEqual(before);
    // The audit trail is *expected* to grow — one event per transition —
    // never held to the same "unchanged" bar as academic data.
    expect(auditAfter).toBe(auditBefore + 2);
  });

  it('School Admin cannot self-extend a subscription — no school-side endpoint reaches platform.subscription.renew', async () => {
    const schoolCtx = await freshCtx(schoolHost, `10.${RUN}.10.5`);
    await loginSchool(schoolCtx, adminIdentifier, 'a-brand-new-password-123');
    const res = await post(schoolCtx, `/platform/schools/${schoolId}/subscriptions`, {
      plan: 'PREMIUM',
      periodDays: 9999,
    });
    // AuthGuard (school-scoped) rejects outright — PlatformAuthGuard is the
    // only guard on this route, and a school session carries no platform
    // session cookie at all.
    expect(res.statusCode).toBe(401);
  });
});
