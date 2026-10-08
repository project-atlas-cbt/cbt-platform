/**
 * Passwordless student sign-in (owner decision 2026-10-08) — end to end
 * over real HTTP against the real AppModule, Postgres (RLS) and Redis.
 * Same fixture style as identity.integration.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import { safeDeleteSchools } from '../../test-support/safe-delete-schools.js';
import { AppModule } from '../../app.module.js';
import { PasswordService } from './password.service.js';
import { nameMatches } from './student-passwordless.service.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
// Randomised per run so a long-lived local Redis never carries over
// throttle/lockout counters (see identity.integration.test.ts).
const RUN = Math.floor(Math.random() * 200) + 1;
let ipSeq = 0;
const nextIp = () => `10.${RUN}.${200 + Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

let app: NestFastifyApplication;
const passwords = new PasswordService();
const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, async (tx) => {
      await tx.session.deleteMany({ where: { schoolId } });
      await tx.studentEnrollment.deleteMany({ where: { schoolId } });
      await tx.studentProfile.deleteMany({ where: { schoolId } });
      await tx.roleAssignment.deleteMany({ where: { schoolId } });
      await tx.schoolMembership.deleteMany({ where: { schoolId } });
    });
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await safeDeleteSchools(prisma, createdSchoolIds);
  await app.close();
});

// ---- helpers ------------------------------------------------------------

function extractCookie(setCookie: string | string[] | undefined, name: string) {
  const headers = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const header of headers) {
    const value = parseCookie(header.split(';')[0] ?? '')[name];
    if (value) return value;
  }
  return undefined;
}

interface Ctx {
  host: string;
  ip: string;
  csrfCookie: string;
  csrfToken: string;
  sessionCookie?: string;
}

async function resolveTenant(host: string, ip: string) {
  return app.inject({
    method: 'GET',
    url: '/tenant/resolve',
    headers: { host },
    remoteAddress: ip,
  });
}

async function freshCtx(host: string): Promise<Ctx> {
  const ip = nextIp();
  const res = await resolveTenant(host, ip);
  const csrfCookie = extractCookie(res.headers['set-cookie'], '_csrf');
  if (!csrfCookie) throw new Error('no _csrf cookie');
  return { host, ip, csrfCookie, csrfToken: res.json<{ csrfToken: string }>().csrfToken };
}

function headers(ctx: Ctx) {
  const cookie = [`_csrf=${ctx.csrfCookie}`];
  if (ctx.sessionCookie) cookie.push(`atlas_session=${ctx.sessionCookie}`);
  return {
    host: ctx.host,
    cookie: cookie.join('; '),
    'x-csrf-token': ctx.csrfToken,
    'content-type': 'application/json',
  };
}

async function send(ctx: Ctx, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) {
  const res = await app.inject({
    method,
    url,
    headers: headers(ctx),
    remoteAddress: ctx.ip,
    ...(method !== 'GET' ? { payload: (payload ?? {}) as Record<string, unknown> } : {}),
  });
  const session = extractCookie(res.headers['set-cookie'], 'atlas_session');
  if (res.statusCode === 200 && session) ctx.sessionCookie = session;
  return res;
}

async function studentSignIn(host: string, identifier: string, name: string) {
  const ctx = await freshCtx(host);
  const res = await send(ctx, 'POST', '/auth/student-sign-in', { identifier, name });
  return { ctx, res };
}

async function passwordSignIn(host: string, identifier: string, password: string) {
  const ctx = await freshCtx(host);
  const res = await send(ctx, 'POST', '/auth/login', { identifier, password });
  expect(res.statusCode).toBe(200);
  return ctx;
}

// ---- fixture ------------------------------------------------------------

interface Fixture {
  schoolId: string;
  host: string;
  classA: string;
  classB: string;
}

async function seedMember(
  schoolId: string,
  loginIdentifier: string,
  role: 'STUDENT' | 'TEACHER' | 'MODERATOR' | 'SCHOOL_ADMIN',
  name: { firstName: string; lastName: string },
  password?: string,
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' = 'ACTIVE',
) {
  const user = await prisma.user.create({
    data: {
      firstName: name.firstName,
      lastName: name.lastName,
      displayName: `${name.firstName} ${name.lastName}`,
      status,
      passwordHash: password ? await passwords.hash(password) : await passwords.hash(randomUUID()),
      credentialState: password ? 'OK' : 'MUST_CHANGE_PASSWORD',
    },
  });
  createdUserIds.push(user.id);
  return withTenant(prisma, schoolId, async (tx) => {
    const membership = await tx.schoolMembership.create({
      data: { schoolId, userId: user.id, loginIdentifier, status: 'ACTIVE' },
    });
    await tx.roleAssignment.create({ data: { schoolId, membershipId: membership.id, role } });
    return membership;
  });
}

async function seedStudent(
  f: Fixture,
  loginIdentifier: string,
  classId: string,
  name: { firstName: string; lastName: string },
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' = 'ACTIVE',
) {
  const membership = await seedMember(
    f.schoolId,
    loginIdentifier,
    'STUDENT',
    name,
    undefined,
    status,
  );
  await withTenant(prisma, f.schoolId, async (tx) => {
    const cls = await tx.classGroup.findUniqueOrThrow({ where: { id: classId } });
    const profile = await tx.studentProfile.create({
      data: { schoolId: f.schoolId, membershipId: membership.id, studentId: loginIdentifier },
    });
    await tx.studentEnrollment.create({
      data: {
        schoolId: f.schoolId,
        studentProfileId: profile.id,
        academicSessionId: cls.academicSessionId,
        classId,
        startDate: new Date('2026-09-01'),
      },
    });
  });
}

async function createFixture(): Promise<Fixture> {
  const school = await prisma.school.create({
    data: { name: `Passwordless ${randomUUID()}`, subdomain: `pl-${randomUUID().slice(0, 8)}` },
  });
  createdSchoolIds.push(school.id);
  const { classA, classB } = await withTenant(prisma, school.id, async (tx) => {
    const session = await tx.academicSession.create({
      data: {
        schoolId: school.id,
        name: '2026/2027',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        status: 'CURRENT',
      },
    });
    const a = await tx.classGroup.create({
      data: {
        schoolId: school.id,
        academicSessionId: session.id,
        name: 'SS2A',
        level: 'SS2',
        arm: 'A',
      },
    });
    const b = await tx.classGroup.create({
      data: {
        schoolId: school.id,
        academicSessionId: session.id,
        name: 'SS2B',
        level: 'SS2',
        arm: 'B',
      },
    });
    return { classA: a.id, classB: b.id };
  });
  const f = { schoolId: school.id, host: `${school.subdomain}.${ROOT_DOMAIN}`, classA, classB };
  await seedStudent(f, 'OLA/001', classA, { firstName: 'Funmilayo', lastName: 'Adebayo' });
  await seedStudent(f, 'OLA/002', classB, { firstName: 'Chiamaka', lastName: 'Okafor' });
  await seedMember(
    f.schoolId,
    'admin',
    'SCHOOL_ADMIN',
    { firstName: 'Ada', lastName: 'Admin' },
    'admin-password-123',
  );
  await seedMember(
    f.schoolId,
    'mod',
    'MODERATOR',
    { firstName: 'Mo', lastName: 'Derator' },
    'mod-password-123',
  );
  await seedMember(
    f.schoolId,
    'teach',
    'TEACHER',
    { firstName: 'Tee', lastName: 'Cher' },
    'teach-password-123',
  );
  return f;
}

async function setSettings(f: Fixture, actor: string, password: string, body: unknown) {
  const ctx = await passwordSignIn(f.host, actor, password);
  return send(ctx, 'PUT', '/school/student-passwordless-sign-in', body);
}

// ---- tests --------------------------------------------------------------

describe('nameMatches', () => {
  const record = {
    firstName: 'Funmilayo',
    lastName: 'Adebayo',
    displayName: 'Funmilayo Grace Adebayo',
  };
  it('accepts first name and surname in any order and case, with optional middle name', () => {
    expect(nameMatches('Funmilayo Adebayo', record)).toBe(true);
    expect(nameMatches('ADEBAYO funmilayo', record)).toBe(true);
    expect(nameMatches('  adebayo,  Funmilayo ', record)).toBe(true);
    expect(nameMatches('Adebayo Grace Funmilayo', record)).toBe(true);
  });
  it('rejects a missing name part or an extra word', () => {
    expect(nameMatches('Funmilayo', record)).toBe(false);
    expect(nameMatches('Adebayo', record)).toBe(false);
    expect(nameMatches('Funmilayo Adebayo Okafor', record)).toBe(false);
    expect(nameMatches('', record)).toBe(false);
  });
});

describe('Passwordless student sign-in', () => {
  let f: Fixture;
  beforeAll(async () => {
    f = await createFixture();
  });

  it('is refused while switched off, and the sign-in page does not offer it', async () => {
    const { res } = await studentSignIn(f.host, 'OLA/001', 'Funmilayo Adebayo');
    expect(res.statusCode).toBe(401);
    const tenant = await resolveTenant(f.host, nextIp());
    expect(
      tenant.json<{ school: { studentPasswordlessSignIn: boolean } }>().school
        .studentPasswordlessSignIn,
    ).toBe(false);
  });

  it('cannot be switched on by a teacher', async () => {
    const res = await setSettings(f, 'teach', 'teach-password-123', {
      allStudents: true,
      classIds: [],
    });
    expect(res.statusCode).toBe(403);
  });

  it('a Moderator switches one class on; only that class signs in, with name + ID', async () => {
    const put = await setSettings(f, 'mod', 'mod-password-123', {
      allStudents: false,
      classIds: [f.classA],
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ allStudents: false, classIds: [f.classA] });

    const tenant = await resolveTenant(f.host, nextIp());
    expect(
      tenant.json<{ school: { studentPasswordlessSignIn: boolean } }>().school
        .studentPasswordlessSignIn,
    ).toBe(true);

    const ok = await studentSignIn(f.host, 'ola/001', 'adebayo FUNMILAYO');
    expect(ok.res.statusCode).toBe(200);
    // Forced first password change does not apply to this session.
    const me = await send(ok.ctx, 'GET', '/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json<{ passwordless: boolean }>().passwordless).toBe(true);

    expect((await studentSignIn(f.host, 'OLA/001', 'Funmilayo')).res.statusCode).toBe(401);
    expect((await studentSignIn(f.host, 'OLA/001', 'Chiamaka Okafor')).res.statusCode).toBe(401);
    // Class B is not switched on.
    expect((await studentSignIn(f.host, 'OLA/002', 'Chiamaka Okafor')).res.statusCode).toBe(401);
  });

  it('admits a student whose password slip was never generated, and activates them', async () => {
    await seedStudent(f, 'OLA/003', f.classA, { firstName: 'Bisi', lastName: 'Ola' }, 'INVITED');
    await seedStudent(f, 'OLA/004', f.classA, { firstName: 'Kemi', lastName: 'Ade' }, 'SUSPENDED');

    const ok = await studentSignIn(f.host, 'OLA/003', 'Bisi Ola');
    expect(ok.res.statusCode).toBe(200);
    expect((await send(ok.ctx, 'GET', '/auth/me')).statusCode).toBe(200);
    const user = await withTenant(prisma, f.schoolId, (tx) =>
      tx.schoolMembership.findFirstOrThrow({
        where: { schoolId: f.schoolId, loginIdentifier: 'OLA/003' },
        select: { userId: true },
      }),
    );
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).status).toBe(
      'ACTIVE',
    );

    // A suspended account stays refused.
    expect((await studentSignIn(f.host, 'OLA/004', 'Kemi Ade')).res.statusCode).toBe(401);
  });

  it('never lets a passwordless session set a password', async () => {
    const { ctx } = await studentSignIn(f.host, 'OLA/001', 'Funmilayo Adebayo');
    const res = await send(ctx, 'POST', '/auth/password/change', { newPassword: 'taken-over-123' });
    expect(res.statusCode).toBe(403);
  });

  it('keeps the session passwordless across a refresh', async () => {
    const { ctx } = await studentSignIn(f.host, 'OLA/001', 'Funmilayo Adebayo');
    expect((await send(ctx, 'POST', '/auth/refresh')).statusCode).toBe(200);
    const me = await send(ctx, 'GET', '/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json<{ passwordless: boolean }>().passwordless).toBe(true);
  });

  it('never admits staff, even with the whole school switched on', async () => {
    const put = await setSettings(f, 'admin', 'admin-password-123', {
      allStudents: true,
      classIds: [f.classA],
    });
    expect(put.statusCode).toBe(200);
    expect((await studentSignIn(f.host, 'OLA/002', 'Okafor Chiamaka')).res.statusCode).toBe(200);
    expect((await studentSignIn(f.host, 'teach', 'Tee Cher')).res.statusCode).toBe(401);
    expect((await studentSignIn(f.host, 'admin', 'Ada Admin')).res.statusCode).toBe(401);
  });

  it('switching off signs passwordless students out and records the change', async () => {
    const { ctx } = await studentSignIn(f.host, 'OLA/001', 'Funmilayo Adebayo');
    expect((await send(ctx, 'GET', '/auth/me')).statusCode).toBe(200);

    const put = await setSettings(f, 'admin', 'admin-password-123', {
      allStudents: false,
      classIds: [],
    });
    expect(put.statusCode).toBe(200);
    expect((await send(ctx, 'GET', '/auth/me')).statusCode).toBe(401);
    expect((await studentSignIn(f.host, 'OLA/001', 'Funmilayo Adebayo')).res.statusCode).toBe(401);

    const audits = await withTenant(prisma, f.schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId: f.schoolId, action: 'STUDENT_PASSWORDLESS_SIGN_IN_CHANGED' },
      }),
    );
    expect(audits.length).toBe(3);
  });

  it('rejects a class from another school', async () => {
    const other = await createFixture();
    const res = await setSettings(f, 'admin', 'admin-password-123', {
      allStudents: false,
      classIds: [other.classA],
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('Student lockout visibility', () => {
  let f: Fixture;
  beforeAll(async () => {
    f = await createFixture();
    const put = await setSettings(f, 'admin', 'admin-password-123', {
      allStudents: true,
      classIds: [],
    });
    expect(put.statusCode).toBe(200);
  });

  it('says so on the failure that locks, and on every try after it', async () => {
    const max = Number(process.env.AUTH_LOCKOUT_MAX_ATTEMPTS ?? 5);
    for (let i = 0; i < max - 1; i++) {
      const { res } = await studentSignIn(f.host, 'OLA/001', 'Wrong Name');
      expect(res.statusCode).toBe(401);
    }
    const locking = await studentSignIn(f.host, 'OLA/001', 'Wrong Name');
    expect(locking.res.statusCode).toBe(403);
    expect(locking.res.json<{ error: { code: string } }>().error.code).toBe(
      'STUDENT_SIGN_IN_LOCKED',
    );
    // Even the right name is refused while locked, with the same message.
    const after = await studentSignIn(f.host, 'ola/001', 'Funmilayo Adebayo');
    expect(after.res.statusCode).toBe(403);
    expect(after.res.json<{ error: { code: string } }>().error.code).toBe('STUDENT_SIGN_IN_LOCKED');
    // Another student is unaffected.
    expect((await studentSignIn(f.host, 'OLA/002', 'Chiamaka Okafor')).res.statusCode).toBe(200);
  });

  it('lists locked-out students for staff, and Unlock removes them', async () => {
    const admin = await passwordSignIn(f.host, 'admin', 'admin-password-123');
    const list = await send(admin, 'GET', '/students/locked-out');
    expect(list.statusCode).toBe(200);
    const students = list.json<{
      students: Array<{ studentProfileId: string; loginIdentifier: string }>;
    }>().students;
    expect(students.map((s) => s.loginIdentifier)).toEqual(['OLA/001']);

    expect(
      (await send(admin, 'POST', `/students/${students[0]!.studentProfileId}/unlock-sign-in`))
        .statusCode,
    ).toBe(204);
    const after = await send(admin, 'GET', '/students/locked-out');
    expect(after.json<{ students: unknown[] }>().students).toEqual([]);
    expect((await studentSignIn(f.host, 'OLA/001', 'Funmilayo Adebayo')).res.statusCode).toBe(200);
  });

  it('is not available to a teacher', async () => {
    const teacher = await passwordSignIn(f.host, 'teach', 'teach-password-123');
    expect((await send(teacher, 'GET', '/students/locked-out')).statusCode).toBe(403);
  });
});
