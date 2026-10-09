/**
 * ADR-0038 amendment — the standard setup: preview, apply what is ticked,
 * place existing subjects that have no department, and never touch one that
 * already has a department. Same HTTP harness as streams.integration.test.ts.
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
import { safeDeleteSchools } from '../../test-support/safe-delete-schools.js';

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
    await withTenant(prisma, schoolId, async (tx) => {
      await tx.studentSubjectRegistration.deleteMany({ where: { schoolId } });
      await tx.studentEnrollment.deleteMany({ where: { schoolId } });
      await tx.classSubjectStream.deleteMany({ where: { schoolId } });
      await tx.classSubject.deleteMany({ where: { schoolId } });
      await tx.classGroup.deleteMany({ where: { schoolId } });
      await tx.stream.deleteMany({ where: { schoolId } });
      await tx.subject.deleteMany({ where: { schoolId } });
      await tx.subjectChoiceGroup.deleteMany({ where: { schoolId } });
      await tx.department.deleteMany({ where: { schoolId } });
      await tx.academicSession.deleteMany({ where: { schoolId } });
      await tx.studentProfile.deleteMany({ where: { schoolId } });
      await tx.roleAssignment.deleteMany({ where: { schoolId } });
      await tx.schoolMembership.deleteMany({ where: { schoolId } });
    });
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await safeDeleteSchools(prisma, createdSchoolIds);
});

interface Preview {
  departments: { code: string; name: string; status: string }[];
  streams: { code: string; status: string }[];
  subjects: { code: string; name: string; status: string; departmentName: string }[];
}

describe('ADR-0038 standard setup', () => {
  let schoolId: string;
  let admin: RequestCtx;
  let teacher: RequestCtx;
  let historyId: string;

  beforeAll(async () => {
    const school = await prisma.school.create({
      data: { name: `Standard ${randomUUID()}`, subdomain: `std-${randomUUID().slice(0, 8)}` },
    });
    schoolId = school.id;
    createdSchoolIds.push(schoolId);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    for (const [id, role] of [
      ['admin01', 'SCHOOL_ADMIN'],
      ['teach01', 'TEACHER'],
    ] as const) {
      const { user } = await seedUser({
        schoolId,
        loginIdentifier: id,
        password: 'a-real-password-123',
        role,
      });
      createdUserIds.push(user.id);
    }
    admin = await freshCtx(host, `10.${RUN}.9.1`);
    await login(admin, 'admin01', 'a-real-password-123');
    teacher = await freshCtx(host, `10.${RUN}.9.2`);
    await login(teacher, 'teach01', 'a-real-password-123');

    // The school already has a Mathematics with no department, a History
    // that sits in its own department, and a "Sciences" department.
    await post(admin, '/academics/subjects', { name: 'mathematics', code: 'MATHS' });
    const own = (
      await post(admin, '/academics/departments', { name: 'Social Sciences', code: 'SOC' })
    ).json<{ id: string }>().id;
    historyId = (
      await post(admin, '/academics/subjects', { name: 'History', code: 'HIST', departmentId: own })
    ).json<{ id: string }>().id;
    await post(admin, '/academics/departments', { name: 'Science', code: 'SCIENCE' });
  });

  it('previews what is new, what will be placed and what is already there', async () => {
    const res = await get(admin, '/academics/standard-setup');
    expect(res.statusCode).toBe(200);
    const preview = res.json<Preview>();
    expect(preview.departments.find((d) => d.code === 'SCI')).toMatchObject({
      name: 'Science',
      status: 'EXISTS',
    });
    expect(preview.departments.find((d) => d.code === 'BUS')?.status).toBe('NEW');
    expect(preview.streams.every((s) => s.status === 'NEW')).toBe(true);
    expect(preview.subjects.find((s) => s.code === 'MTH')).toMatchObject({
      name: 'mathematics',
      status: 'PLACE',
      departmentName: 'Science',
    });
    expect(preview.subjects.find((s) => s.code === 'HIS')?.status).toBe('EXISTS');
    expect(preview.subjects.find((s) => s.code === 'ENG')?.status).toBe('NEW');
  });

  it('is refused to a teacher', async () => {
    const res = await post(teacher, '/academics/standard-setup', {
      departmentCodes: ['SCI'],
      streamCodes: [],
      subjectCodes: [],
    });
    expect(res.statusCode).toBe(403);
  });

  it('refuses codes that are not in the standard setup', async () => {
    const res = await post(admin, '/academics/standard-setup', {
      departmentCodes: ['NOPE'],
      streamCodes: [],
      subjectCodes: [],
    });
    expect(res.statusCode).toBe(400);
  });

  it('applies only what was ticked, places the existing subject and leaves the rest', async () => {
    const res = await post(admin, '/academics/standard-setup', {
      departmentCodes: ['SCI', 'HUM'],
      streamCodes: ['SCI'],
      subjectCodes: ['MTH', 'ENG', 'HIS', 'CRS', 'ECO'],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      departmentsCreated: 1,
      streamsCreated: 1,
      subjectsCreated: 3,
      subjectsPlaced: 1,
      choiceGroupsCreated: 1,
    });

    const subjects = await withTenant(prisma, schoolId, (tx) =>
      tx.subject.findMany({
        where: { schoolId },
        include: { department: true, choiceGroup: true },
      }),
    );
    const byName = new Map(subjects.map((s) => [s.name, s]));
    expect(byName.get('mathematics')?.department?.name).toBe('Science');
    expect(byName.get('English Language')?.department?.name).toBe('Humanities');
    expect(byName.get('Christian Religious Studies')?.choiceGroup?.name).toBe('Religion');
    // Business was not ticked, so Economics has no department yet.
    expect(byName.get('Economics')?.departmentId).toBeNull();
    // History keeps the department the school gave it.
    expect(subjects.find((s) => s.id === historyId)?.department?.name).toBe('Social Sciences');

    const audit = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findFirst({ where: { schoolId, action: 'STANDARD_SETUP_APPLIED' } }),
    );
    expect(audit?.actorRole).toBe('SCHOOL_ADMIN');
  });

  it('applying again only adds what is still missing', async () => {
    const res = await post(admin, '/academics/standard-setup', {
      departmentCodes: ['SCI', 'BUS', 'HUM'],
      streamCodes: ['SCI'],
      subjectCodes: ['MTH', 'ENG'],
    });
    expect(res.json()).toMatchObject({
      departmentsCreated: 1,
      subjectsCreated: 0,
      subjectsPlaced: 0,
    });
  });
});
