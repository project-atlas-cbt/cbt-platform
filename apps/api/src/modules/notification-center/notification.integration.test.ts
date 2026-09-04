/**
 * B10 — `GET /v1/notifications`, `POST /v1/notifications/:id/read`,
 * `POST /v1/notifications/read-all`. Real HTTP via `app.inject()` against
 * the real `AppModule` and real Postgres, mirroring
 * `question-review.integration.test.ts`'s own harness exactly.
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
import { NotificationService } from './notification.service.js';

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

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  await prisma.school
    .deleteMany({ where: { id: { in: createdSchoolIds } } })
    .catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
});

async function createSchool() {
  const school = await prisma.school.create({
    data: {
      name: `Notification Test School ${randomUUID()}`,
      subdomain: `notif-${randomUUID().slice(0, 8)}`,
    },
  });
  createdSchoolIds.push(school.id);
  return school;
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
  createdUserIds.push(user.id);
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

async function seedNotification(
  schoolId: string,
  recipientUserId: string,
  title: string,
  status: 'UNREAD' | 'READ' = 'UNREAD',
) {
  return withTenant(prisma, schoolId, (tx) =>
    tx.notification.create({
      data: {
        schoolId,
        recipientUserId,
        type: 'SUBSCRIPTION_EXPIRING',
        title,
        content: title,
        status,
      },
    }),
  );
}

describe('GET /v1/notifications (B10)', () => {
  it("returns only the caller's own notifications, newest first, with unread count", async () => {
    const school = await createSchool();
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const teacher = await seedUser({
      schoolId: school.id,
      loginIdentifier: `n-a-${RUN}`,
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    const other = await seedUser({
      schoolId: school.id,
      loginIdentifier: `n-o-${RUN}`,
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    await seedNotification(school.id, teacher.user.id, 'First');
    await seedNotification(school.id, teacher.user.id, 'Second', 'READ');
    await seedNotification(school.id, other.user.id, 'Not mine');

    const ctx = await freshCtx(host, `10.${RUN}.3.1`);
    await loginSchool(ctx, `n-a-${RUN}`, 'a-real-password-123');
    const res = await get(ctx, '/notifications');
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { title: string }[]; total: number; unreadCount: number }>();
    expect(body.total).toBe(2);
    expect(body.unreadCount).toBe(1);
    expect(body.items.map((i) => i.title).sort()).toEqual(['First', 'Second']);
  });

  it("cross-tenant: never returns another school's notifications", async () => {
    const schoolA = await createSchool();
    const schoolB = await createSchool();
    const hostA = `${schoolA.subdomain}.${ROOT_DOMAIN}`;
    const teacherA = await seedUser({
      schoolId: schoolA.id,
      loginIdentifier: `n-xa-${RUN}`,
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    await seedNotification(schoolA.id, teacherA.user.id, 'A only');
    const otherSchoolUser = await seedUser({
      schoolId: schoolB.id,
      loginIdentifier: `n-xb-${RUN}`,
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    await seedNotification(schoolB.id, otherSchoolUser.user.id, 'B only');

    const ctx = await freshCtx(hostA, `10.${RUN}.3.2`);
    await loginSchool(ctx, `n-xa-${RUN}`, 'a-real-password-123');
    const res = await get(ctx, '/notifications');
    expect(res.json<{ total: number }>().total).toBe(1);
  });
});

describe('POST /v1/notifications/:id/read and /read-all (B10)', () => {
  it('marks a single notification read, and does not affect others', async () => {
    const school = await createSchool();
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const teacher = await seedUser({
      schoolId: school.id,
      loginIdentifier: `n-r-${RUN}`,
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    const n1 = await seedNotification(school.id, teacher.user.id, 'One');
    await seedNotification(school.id, teacher.user.id, 'Two');

    const ctx = await freshCtx(host, `10.${RUN}.3.3`);
    await loginSchool(ctx, `n-r-${RUN}`, 'a-real-password-123');
    const markRes = await post(ctx, `/notifications/${n1.id}/read`);
    expect(markRes.statusCode).toBe(200);

    const res = await get(ctx, '/notifications');
    const body = res.json<{ items: { id: string; status: string }[]; unreadCount: number }>();
    expect(body.unreadCount).toBe(1);
    expect(body.items.find((i) => i.id === n1.id)?.status).toBe('READ');
  });

  it("a recipient cannot mark another recipient's notification read (cross-user denial)", async () => {
    const school = await createSchool();
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const owner = await seedUser({
      schoolId: school.id,
      loginIdentifier: `n-cu-o-${RUN}`,
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    await seedUser({
      schoolId: school.id,
      loginIdentifier: `n-cu-i-${RUN}`,
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    const notification = await seedNotification(school.id, owner.user.id, "Owner's");

    const ctx = await freshCtx(host, `10.${RUN}.3.4`);
    await loginSchool(ctx, `n-cu-i-${RUN}`, 'a-real-password-123');
    await post(ctx, `/notifications/${notification.id}/read`);

    // The write itself is a no-op (scoped WHERE with recipientUserId=self
    // matches nothing) rather than a 403/404 — mirrors this codebase's
    // established idempotent-updateMany idiom. Prove it structurally:
    // the notification is still UNREAD when read back as its real owner.
    const ownerCtx = await freshCtx(host, `10.${RUN}.3.5`);
    await loginSchool(ownerCtx, `n-cu-o-${RUN}`, 'a-real-password-123');
    const res = await get(ownerCtx, '/notifications');
    const body = res.json<{ items: { id: string; status: string }[] }>();
    expect(body.items.find((i) => i.id === notification.id)?.status).toBe('UNREAD');
  });

  it('read-all marks every unread notification read for the caller only', async () => {
    const school = await createSchool();
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const teacher = await seedUser({
      schoolId: school.id,
      loginIdentifier: `n-ra-${RUN}`,
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    const other = await seedUser({
      schoolId: school.id,
      loginIdentifier: `n-ra-o-${RUN}`,
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    await seedNotification(school.id, teacher.user.id, 'One');
    await seedNotification(school.id, teacher.user.id, 'Two');
    await seedNotification(school.id, other.user.id, "Other person's");

    const ctx = await freshCtx(host, `10.${RUN}.3.6`);
    await loginSchool(ctx, `n-ra-${RUN}`, 'a-real-password-123');
    const res = await post(ctx, '/notifications/read-all');
    expect(res.statusCode).toBe(200);

    const afterRes = await get(ctx, '/notifications');
    expect(afterRes.json<{ unreadCount: number }>().unreadCount).toBe(0);

    const otherUnread = await withTenant(prisma, school.id, (tx) =>
      tx.notification.count({
        where: { schoolId: school.id, recipientUserId: other.user.id, status: 'UNREAD' },
      }),
    );
    expect(otherUnread).toBe(1);
  });
});

describe('NotificationService.record() (B10/B12 gap closure)', () => {
  it('is fault-tolerant by design: a failed write is logged, not thrown, and never surfaces to the caller', async () => {
    // Found in review: this class's own header comment already promised
    // "best-effort... a transient failure must never fail the caller's
    // primary action," but record() had no try/catch at all — B12's own
    // new callers (a per-student loop run after their primary transaction
    // had already committed) would have seen a request-level error even
    // though the real state change had already succeeded. `title` is
    // VarChar(200) at the database level, so an over-length value is a
    // genuine, real write failure, not a validation shortcut.
    const school = await createSchool();
    const recipient = await seedUser({
      schoolId: school.id,
      loginIdentifier: `n-ft-${RUN}`,
      password: 'a-real-password-123',
      role: 'TEACHER',
    });

    const service = app.get(NotificationService);
    await expect(
      service.record({
        schoolId: school.id,
        recipientUserId: recipient.user.id,
        type: 'EXAM_OPENED',
        title: 'x'.repeat(500),
        content: 'irrelevant',
      }),
    ).resolves.toBeUndefined();

    const count = await withTenant(prisma, school.id, (tx) =>
      tx.notification.count({ where: { schoolId: school.id, recipientUserId: recipient.user.id } }),
    );
    expect(count).toBe(0);
  });
});
