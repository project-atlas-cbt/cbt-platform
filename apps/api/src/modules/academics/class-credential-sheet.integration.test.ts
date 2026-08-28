/**
 * F7 gap-closure 2 — `POST /v1/classes/:id/credential-sheet`. End-to-end
 * over real HTTP against the real AppModule and real Postgres, mirroring
 * `users.integration.test.ts`'s own fixture/helper shapes exactly (same
 * Content-Type-only-when-payload fix for bodyless POSTs — this route
 * itself is bodyless too).
 *
 * Covers: full-class regenerate (CSV shape — header + one row per active
 * roster student, correct headers), zero-student class (header-only CSV,
 * 200 not an error), cross-tenant class id rejected (404, no roster leak),
 * permission boundary (Teacher denied).
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
      name: `Credential Sheet Test School ${randomUUID()}`,
      subdomain: `credsheet-${randomUUID().slice(0, 8)}`,
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
      tx.studentSubjectRegistration.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.studentEnrollment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) => tx.classSubject.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.classGroup.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.deleteMany({ where: { schoolId } }),
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

describe('F7 gap-closure 2 — class credential sheet', () => {
  let schoolId: string;
  let host: string;
  let admin: RequestCtx;
  let sessionId: string;

  beforeAll(async () => {
    const school = await createSchool();
    schoolId = school.id;
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolId);
    const { user } = await seedUser({
      schoolId,
      loginIdentifier: 'credsheet-admin',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(user.id);
    admin = await freshCtx(host, `10.${RUN}.4.1`);
    await login(admin, 'credsheet-admin', 'a-real-password-123');

    const sessionRes = await post(admin, '/academics/sessions', {
      name: `CredSheet Session ${randomUUID().slice(0, 6)}`,
      startDate: '2026-09-01',
      endDate: '2027-07-31',
    });
    sessionId = sessionRes.json<{ id: string }>().id;
  });

  // Class identity is unique per (session, level, arm) — this file creates
  // several classes within the same session, so each needs its own arm.
  let armCounter = 0;
  async function createClass(name: string): Promise<string> {
    armCounter += 1;
    const res = await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      name,
      level: 'SS2',
      arm: `A${armCounter}`,
    });
    return res.json<{ id: string }>().id;
  }

  it('regenerates and downloads a CSV credential sheet for every active student in the class', async () => {
    const classId = await createClass('Sheet Class');
    const studentIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const studentRes = await post(admin, '/students', {
        firstName: `Sheet${i}`,
        lastName: 'Student',
        studentId: `SHEET-${i}-${randomUUID().slice(0, 6)}`,
      });
      const studentProfileId = studentRes.json<{ studentProfileId: string }>().studentProfileId;
      studentIds.push(studentProfileId);
      await post(admin, `/students/${studentProfileId}/enrollments`, {
        academicSessionId: sessionId,
        classId,
      });
    }

    const res = await post(admin, `/classes/${classId}/credential-sheet`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('.csv');

    const lines = res.payload.trim().split('\r\n');
    expect(lines[0]).toBe('"Student ID","Name","Login Identifier","Initial Password"');
    // header + 3 students
    expect(lines).toHaveLength(4);

    const events = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId, action: 'CLASS_CREDENTIAL_SHEET_ISSUED', entityId: classId },
      }),
    );
    expect(events).toHaveLength(1); // one event for the class-level action, not one per student
  });

  it('returns a header-only CSV for a class with no active enrollment (skip gracefully)', async () => {
    const emptyClassId = await createClass('Empty Class');
    const res = await post(admin, `/classes/${emptyClassId}/credential-sheet`);
    expect(res.statusCode).toBe(200);
    const lines = res.payload.trim().split('\r\n');
    expect(lines).toHaveLength(1);
  });

  it("rejects a cross-tenant class id as 404, never leaking another school's roster", async () => {
    const otherSchool = await createSchool();
    createdSchoolIds.push(otherSchool.id);
    const { user } = await seedUser({
      schoolId: otherSchool.id,
      loginIdentifier: 'credsheet-other-admin',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(user.id);
    const otherHost = `${otherSchool.subdomain}.${ROOT_DOMAIN}`;
    const otherAdmin = await freshCtx(otherHost, `10.${RUN}.4.2`);
    await login(otherAdmin, 'credsheet-other-admin', 'a-real-password-123');

    const classId = await createClass('Cross Tenant Class');
    const res = await post(otherAdmin, `/classes/${classId}/credential-sheet`);
    expect(res.statusCode).toBe(404);
  });

  it('denies a Teacher (permission boundary)', async () => {
    const classId = await createClass('Security Class');
    const { user } = await seedUser({
      schoolId,
      loginIdentifier: 'credsheet-teacher-sec',
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    createdUserIds.push(user.id);
    const teacherCtx = await freshCtx(host, `10.${RUN}.4.3`);
    await login(teacherCtx, 'credsheet-teacher-sec', 'a-real-password-123');

    const res = await post(teacherCtx, `/classes/${classId}/credential-sheet`);
    expect(res.statusCode).toBe(403);
  });
});
