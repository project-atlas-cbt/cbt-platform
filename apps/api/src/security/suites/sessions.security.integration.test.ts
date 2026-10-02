/**
 * B20 security testing row: "session fixation, replay, and CSRF" — plus the
 * B20 session controls themselves (revocation on credential change, the
 * Software Admin cookie and idle timeout) and identity auditing.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma, withTenant } from '@atlas/db';
import {
  ADMIN_HOST,
  bootSecurityApp,
  call,
  csrfContext,
  extractCookie,
  SecurityFixture,
  type Ctx,
  type FixtureSchool,
} from '../../test-support/security-fixture.js';

// The console notification channel captures console.log by reference when
// the app is built — spy first, so reset links can be read back.
const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

let app: NestFastifyApplication;
const fixture = new SecurityFixture();
let school: FixtureSchool;
let otherSchool: FixtureSchool;

beforeAll(async () => {
  app = await bootSecurityApp();
  school = await fixture.createSchool('sess');
  otherSchool = await fixture.createSchool('sess-o');
});

afterAll(async () => {
  await app.close();
  await fixture.cleanup();
  consoleLog.mockRestore();
});

const me = (ctx: Ctx) => call(app, ctx, 'GET', '/auth/me');

async function auditActions(schoolId: string, entityId: string): Promise<string[]> {
  // atlas_app can INSERT audit rows but reads them only through RLS; the
  // fixture school's own tenant scope is exactly what the app would see.
  const rows = await withTenant(prisma, schoolId, (tx) =>
    tx.auditEvent.findMany({ where: { schoolId, entityId }, orderBy: { occurredAt: 'asc' } }),
  );
  return rows.map((r) => r.action);
}

describe('session fixation and replay', () => {
  it('login always mints a fresh token — a cookie presented at login is never adopted', async () => {
    const teacher = await fixture.loginAs(app, school, 'TEACHER');
    // The teacher's live cookie is "planted" on a browser where the
    // moderator then signs in.
    const planted = {
      ...(await csrfContext(app, school.host)),
      sessionCookieName: 'atlas_session' as const,
      sessionCookie: teacher.sessionCookie!,
    };
    const res = await call(app, planted, 'POST', '/auth/login', {
      identifier: school.users.MODERATOR.identifier,
      password: 'security-suite-password-123',
    });
    const issued = extractCookie(res.headers['set-cookie'], 'atlas_session');
    expect(res.statusCode).toBe(200);
    expect(issued).toBeDefined();
    expect(issued).not.toBe(teacher.sessionCookie);
    // The planted cookie still belongs to the teacher, never elevated.
    expect((await me(teacher)).json<{ user: { id: string } }>().user.id).toBe(
      school.users.TEACHER.userId,
    );
  });

  it('a logged-out session cannot be replayed', async () => {
    const ctx = await fixture.loginAs(app, school, 'TEACHER');
    expect((await call(app, ctx, 'POST', '/auth/logout')).statusCode).toBe(200);
    expect((await me(ctx)).statusCode).toBe(401);
  });

  it('a rotated (refreshed) session cannot be replayed; the new one works', async () => {
    const ctx = await fixture.loginAs(app, school, 'TEACHER');
    const res = await call(app, ctx, 'POST', '/auth/refresh');
    const rotated = extractCookie(res.headers['set-cookie'], 'atlas_session')!;
    expect((await me(ctx)).statusCode).toBe(401);
    expect((await me({ ...ctx, sessionCookie: rotated })).statusCode).toBe(200);
  });

  it('an expired session is rejected', async () => {
    const ctx = await fixture.loginAs(app, school, 'STUDENT');
    await withTenant(prisma, school.schoolId, (tx) =>
      tx.session.updateMany({
        where: { schoolId: school.schoolId, userId: school.users.STUDENT.userId, revokedAt: null },
        data: { expiresAt: new Date(Date.now() - 1000) },
      }),
    );
    expect((await me(ctx)).statusCode).toBe(401);
  });

  it('a session cookie with a forged signature is no session at all', async () => {
    const ctx = await fixture.loginAs(app, school, 'TEACHER');
    const forged = `${ctx.sessionCookie!.split('.')[0]}.forgedsignature`;
    expect((await me({ ...ctx, sessionCookie: forged })).statusCode).toBe(401);
  });
});

describe('B20: credential changes end other sessions, and are audited', () => {
  it('a password change revokes every other session but keeps the current one', async () => {
    const deviceA = await fixture.loginAs(app, school, 'HOD');
    const deviceB = await fixture.loginAs(app, school, 'HOD');
    const res = await call(app, deviceA, 'POST', '/auth/password/change', {
      currentPassword: 'security-suite-password-123',
      newPassword: 'security-suite-password-456',
    });
    expect(res.statusCode).toBe(200);
    expect((await me(deviceA)).statusCode).toBe(200);
    expect((await me(deviceB)).statusCode).toBe(401);
    expect(await auditActions(school.schoolId, school.users.HOD.membershipId)).toContain(
      'USER_PASSWORD_CHANGED',
    );
    // Restore the shared fixture password for later tests.
    await call(app, deviceA, 'POST', '/auth/password/change', {
      currentPassword: 'security-suite-password-456',
      newPassword: 'security-suite-password-123',
    });
  });

  it('a completed password reset revokes every session the user holds', async () => {
    const live = await fixture.loginAs(app, school, 'SCHOOL_ADMIN');
    consoleLog.mockClear();
    const anon = await csrfContext(app, school.host);
    await call(app, anon, 'POST', '/auth/password/reset/request', {
      identifier: school.users.SCHOOL_ADMIN.identifier,
    });
    const output = consoleLog.mock.calls.map((c) => String(c[0])).join('\n');
    const token = /reset-password\?token=([A-Za-z0-9_-]+)/u.exec(output)?.[1];
    expect(token).toBeDefined();
    const confirm = await call(app, anon, 'POST', '/auth/password/reset/confirm', {
      token,
      newPassword: 'security-suite-password-123',
    });
    expect(confirm.statusCode).toBe(200);
    expect((await me(live)).statusCode).toBe(401);
    expect(await auditActions(school.schoolId, school.users.SCHOOL_ADMIN.membershipId)).toContain(
      'USER_PASSWORD_RESET_COMPLETED',
    );
  });

  it('sign-ins and lockouts are audited (never the identifier typed)', async () => {
    await fixture.loginAs(app, school, 'MODERATOR');
    expect(await auditActions(school.schoolId, school.users.MODERATOR.membershipId)).toContain(
      'USER_SIGNED_IN',
    );
    const ctx = await csrfContext(app, school.host);
    for (let i = 0; i < 5; i += 1) {
      await call(app, ctx, 'POST', '/auth/login', {
        identifier: school.users.STUDENT.identifier,
        password: 'wrong-password-000',
      });
    }
    const locked = await withTenant(prisma, school.schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId: school.schoolId, action: 'USER_ACCOUNT_LOCKED' },
      }),
    );
    expect(locked).toHaveLength(1);
    expect(JSON.stringify(locked[0])).not.toContain(school.users.STUDENT.identifier);
  });
});

describe('CSRF (ADR-0022)', () => {
  it('a mutating request with a missing, forged or other-school token is refused', async () => {
    const ctx = await fixture.loginAs(app, school, 'SCHOOL_ADMIN');
    const other = await csrfContext(app, otherSchool.host);
    const body = { name: 'X', code: 'X1' };
    const missing = await app.inject({
      method: 'POST',
      url: '/academics/departments',
      headers: {
        host: ctx.host,
        cookie: `atlas_session=${ctx.sessionCookie}; _csrf=${ctx.csrfCookie}`,
        'content-type': 'application/json',
      },
      payload: body,
      remoteAddress: ctx.ip,
    });
    const forged = await call(
      app,
      { ...ctx, csrfToken: 'forged-token' },
      'POST',
      '/academics/departments',
      body,
    );
    const crossSchool = await call(
      app,
      { ...ctx, csrfCookie: other.csrfCookie, csrfToken: other.csrfToken },
      'POST',
      '/academics/departments',
      body,
    );
    for (const res of [missing, forged, crossSchool]) {
      expect(res.statusCode).toBe(403);
    }
  });
});

describe('B20: Software Admin session controls', () => {
  it('the platform cookie is host-only, HttpOnly and SameSite=Strict, with the short absolute lifetime', async () => {
    const admin = await fixture.createPlatformAdmin();
    const ctx = await csrfContext(app, ADMIN_HOST);
    const res = await call(app, ctx, 'POST', '/platform/auth/login', {
      email: admin.email,
      password: 'security-suite-password-123',
    });
    const header = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((h) => h.startsWith('atlas_platform_session='))!;
    expect(header).toMatch(/HttpOnly/iu);
    expect(header).toMatch(/SameSite=Strict/iu);
    expect(header).not.toMatch(/Domain=/iu);
    const session = await prisma.platformSession.findFirstOrThrow({
      where: { userId: admin.userId },
      orderBy: { createdAt: 'desc' },
    });
    const lifetimeH = (session.expiresAt.getTime() - session.createdAt.getTime()) / 3_600_000;
    expect(lifetimeH).toBeLessThanOrEqual(8.01);
  });

  it('an idle platform session expires and is revoked', async () => {
    const admin = await fixture.createPlatformAdmin();
    const ctx = await fixture.loginPlatform(app, admin.email);
    expect((await call(app, ctx, 'GET', '/platform/auth/me')).statusCode).toBe(200);
    await prisma.platformSession.updateMany({
      where: { userId: admin.userId, revokedAt: null },
      data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) },
    });
    expect((await call(app, ctx, 'GET', '/platform/auth/me')).statusCode).toBe(401);
    const revoked = await prisma.platformSession.count({
      where: { userId: admin.userId, revokedAt: { not: null } },
    });
    expect(revoked).toBeGreaterThan(0);
  });
});
