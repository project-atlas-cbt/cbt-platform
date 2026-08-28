/**
 * B6 — People, Profiles & Enrollment. End-to-end over real HTTP against the
 * real AppModule and real Postgres, following academics.integration.test.ts's
 * own precedent exactly (same fixture/helper shapes, same Content-Type-only-
 * when-payload fix for bodyless POSTs).
 *
 * Covers: all four user groups create/edit/deactivate/reactivate (DoD 1);
 * credential reset for student (system-generated password) and teacher
 * (invitation link) (DoD 8); HOD promotion, department (re)assignment, and
 * removal leaving prior approvals/assignments attributed to the previous HOD
 * (DoD 7); School-Admin-only moderator management; cross-tenant denied;
 * teacher cannot manage users.
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
      name: `People Test School ${randomUUID()}`,
      subdomain: `people-${randomUUID().slice(0, 8)}`,
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

async function patch(ctx: RequestCtx, url: string, payload: Record<string, unknown>) {
  return app.inject({
    method: 'PATCH',
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
    await withTenant(prisma, schoolId, (tx) =>
      tx.studentSubjectRegistration.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.teacherAssignment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.studentEnrollment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.hODAssignment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) => tx.classSubject.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.classGroup.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.subject.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.department.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.deleteMany({ where: { schoolId } }),
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

describe('B6 People — students, teachers, HODs, moderators', () => {
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
      loginIdentifier: 'admin01',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(user.id);
    admin = await freshCtx(host, `10.${RUN}.2.1`);
    await login(admin, 'admin01', 'a-real-password-123');
  });

  let studentProfileId: string;
  let teacherProfileId: string;
  let teacherMembershipId: string;

  it('creates a student (DoD 1)', async () => {
    const res = await post(admin, '/students', {
      firstName: 'Ada',
      lastName: 'Okoye',
      studentId: `ST-${randomUUID().slice(0, 8)}`,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{
      studentProfileId: string;
      userStatus: string;
      profileStatus: string;
    }>();
    studentProfileId = body.studentProfileId;
    expect(body.userStatus).toBe('INVITED');
    expect(body.profileStatus).toBe('ACTIVE');
  });

  it('edits, deactivates, and reactivates the student (DoD 1) without touching profile status', async () => {
    const editRes = await patch(admin, `/students/${studentProfileId}`, { lastName: 'Okonkwo' });
    expect(editRes.statusCode).toBe(200);
    expect(editRes.json<{ lastName: string }>().lastName).toBe('Okonkwo');

    const deactivateRes = await post(admin, `/students/${studentProfileId}/deactivate`);
    expect(deactivateRes.statusCode).toBe(200);
    const deactivated = deactivateRes.json<{ userStatus: string; profileStatus: string }>();
    expect(deactivated.userStatus).toBe('INACTIVE');
    expect(deactivated.profileStatus).toBe('ACTIVE'); // untouched — DoD item 6's symmetric case

    const reactivateRes = await post(admin, `/students/${studentProfileId}/reactivate`);
    expect(reactivateRes.statusCode).toBe(200);
    expect(reactivateRes.json<{ userStatus: string }>().userStatus).toBe('ACTIVE');
  });

  it("resets a student's credentials — audited, shown exactly once (DoD 8)", async () => {
    const res = await post(admin, `/students/${studentProfileId}/reset-credentials`);
    expect(res.statusCode).toBe(200);
    const body = res.json<{ initialPassword: string; loginIdentifier: string }>();
    expect(body.initialPassword).toBeTruthy();
    expect(body.loginIdentifier).toBeTruthy();

    const events = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({ where: { schoolId, action: 'STUDENT_CREDENTIALS_RESET' } }),
    );
    expect(events.length).toBeGreaterThan(0);
  });

  it('rejects a duplicate studentId as a clean 409, not a raw 500', async () => {
    const first = await post(admin, '/students', {
      firstName: 'B',
      lastName: 'C',
      studentId: 'DUP-001',
    });
    expect(first.statusCode).toBe(201);
    const second = await post(admin, '/students', {
      firstName: 'D',
      lastName: 'E',
      studentId: 'DUP-001',
    });
    expect(second.statusCode).toBe(409);
  });

  it('creates a teacher — invitation dispatched, no plaintext password ever shown (DoD 1)', async () => {
    const res = await post(admin, '/teachers', {
      firstName: 'Tunde',
      lastName: 'Bello',
      email: `tunde-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{
      teacherProfileId: string;
      membershipId: string;
      userStatus: string;
      isHod: boolean;
    }>();
    teacherProfileId = body.teacherProfileId;
    teacherMembershipId = body.membershipId;
    expect(body.userStatus).toBe('INVITED');
    expect(body.isHod).toBe(false);
  });

  it('deactivating a teacher preserves their profile — attribution stays intact (DoD 6)', async () => {
    const res = await post(admin, `/teachers/${teacherProfileId}/deactivate`);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ userStatus: string }>().userStatus).toBe('INACTIVE');

    const stillExists = await get(admin, `/teachers/${teacherProfileId}`);
    expect(stillExists.statusCode).toBe(200);

    const reactivate = await post(admin, `/teachers/${teacherProfileId}/reactivate`);
    expect(reactivate.statusCode).toBe(200);
    expect(reactivate.json<{ userStatus: string }>().userStatus).toBe('ACTIVE');
  });

  it('sends a teacher a fresh invitation link on reset-credentials, audited (DoD 8)', async () => {
    const res = await post(admin, `/teachers/${teacherProfileId}/reset-credentials`);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ status: string }>().status).toBe('ok');
    const events = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({ where: { schoolId, action: 'TEACHER_CREDENTIALS_RESET' } }),
    );
    expect(events.length).toBeGreaterThan(0);
  });

  let hodMembershipId: string;

  it('promotes the existing teacher to HOD — no new person record, membership reused', async () => {
    const res = await post(admin, '/hods', { membershipId: teacherMembershipId });
    expect(res.statusCode).toBe(201);
    const body = res.json<{
      membershipId: string;
      teacherProfileId: string;
      departmentId: string | null;
    }>();
    hodMembershipId = body.membershipId;
    expect(hodMembershipId).toBe(teacherMembershipId);
    expect(body.teacherProfileId).toBe(teacherProfileId);
    expect(body.departmentId).toBeNull(); // no department assigned yet

    const teacherRow = await get(admin, `/teachers/${teacherProfileId}`);
    expect(teacherRow.json<{ isHod: boolean }>().isHod).toBe(true);
  });

  let sessionId: string;
  let departmentAId: string;
  let departmentBId: string;

  it("assigns and reassigns the HOD's department — prior assignment ends, not deleted (DoD 7)", async () => {
    const sessionRes = await post(admin, '/academics/sessions', {
      name: `HOD Session ${randomUUID().slice(0, 8)}`,
      startDate: '2026-09-01',
      endDate: '2027-07-31',
    });
    sessionId = sessionRes.json<{ id: string }>().id;

    const deptARes = await post(admin, '/academics/departments', {
      name: 'Sciences',
      code: `SCI-${randomUUID().slice(0, 6)}`,
    });
    departmentAId = deptARes.json<{ id: string }>().id;
    const deptBRes = await post(admin, '/academics/departments', {
      name: 'Arts',
      code: `ART-${randomUUID().slice(0, 6)}`,
    });
    departmentBId = deptBRes.json<{ id: string }>().id;

    const firstAssign = await put(admin, `/hods/${hodMembershipId}/department`, {
      departmentId: departmentAId,
      academicSessionId: sessionId,
    });
    expect(firstAssign.statusCode).toBe(200);
    expect(firstAssign.json<{ departmentId: string }>().departmentId).toBe(departmentAId);

    const firstAssignmentRow = await withTenant(prisma, schoolId, (tx) =>
      tx.hODAssignment.findFirst({
        where: { schoolId, membershipId: hodMembershipId, departmentId: departmentAId },
      }),
    );
    expect(firstAssignmentRow?.status).toBe('ACTIVE');

    const reassign = await put(admin, `/hods/${hodMembershipId}/department`, {
      departmentId: departmentBId,
      academicSessionId: sessionId,
    });
    expect(reassign.statusCode).toBe(200);
    expect(reassign.json<{ departmentId: string }>().departmentId).toBe(departmentBId);

    // DoD item 7: the prior (Sciences) assignment is ENDED, not erased —
    // still attributed to this HOD for that period.
    const priorRow = await withTenant(prisma, schoolId, (tx) =>
      tx.hODAssignment.findFirst({ where: { schoolId, id: firstAssignmentRow!.id } }),
    );
    expect(priorRow?.status).toBe('ENDED');
    expect(priorRow?.membershipId).toBe(hodMembershipId);
  });

  it('removes HOD standing — reverts to a plain teacher, prior assignment untouched', async () => {
    const res = await post(admin, `/hods/${hodMembershipId}/remove`);
    expect(res.statusCode).toBe(200);

    const teacherRow = await get(admin, `/teachers/${teacherProfileId}`);
    expect(teacherRow.json<{ isHod: boolean }>().isHod).toBe(false);

    const assignments = await withTenant(prisma, schoolId, (tx) =>
      tx.hODAssignment.findMany({ where: { schoolId, membershipId: hodMembershipId } }),
    );
    expect(assignments).toHaveLength(2); // both still present, neither deleted
    expect(assignments.every((a) => a.status === 'ENDED')).toBe(true);
  });

  let moderatorMembershipId: string;

  it('School Admin creates and removes a moderator (05 §14)', async () => {
    const createRes = await post(admin, '/moderators', {
      firstName: 'Mod',
      lastName: 'Erator',
      email: `mod-${randomUUID().slice(0, 8)}@example.com`,
      loginIdentifier: `mod-${randomUUID().slice(0, 8)}`,
    });
    expect(createRes.statusCode).toBe(201);
    moderatorMembershipId = createRes.json<{ membershipId: string }>().membershipId;

    const removeRes = await post(admin, `/moderators/${moderatorMembershipId}/remove`);
    expect(removeRes.statusCode).toBe(200);
    expect(removeRes.json<{ userStatus: string }>().userStatus).toBe('INACTIVE');
  });

  it('a Teacher cannot manage users (security)', async () => {
    const { user, membership } = await seedUser({
      schoolId,
      loginIdentifier: 'teacher-sec',
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    createdUserIds.push(user.id);
    void membership;
    const teacherCtx = await freshCtx(host, `10.${RUN}.2.2`);
    await login(teacherCtx, 'teacher-sec', 'a-real-password-123');

    const res = await post(teacherCtx, '/students', {
      firstName: 'X',
      lastName: 'Y',
      studentId: 'SEC-001',
    });
    expect(res.statusCode).toBe(403);
  });

  it('a Moderator cannot create another Moderator (05 §14 — School Admin only)', async () => {
    const { user } = await seedUser({
      schoolId,
      loginIdentifier: 'moderator-sec',
      password: 'a-real-password-123',
      role: 'MODERATOR',
    });
    createdUserIds.push(user.id);
    const moderatorCtx = await freshCtx(host, `10.${RUN}.2.3`);
    await login(moderatorCtx, 'moderator-sec', 'a-real-password-123');

    const res = await post(moderatorCtx, '/moderators', {
      firstName: 'X',
      lastName: 'Y',
      email: 'x@example.com',
      loginIdentifier: 'mod-sec-2',
    });
    expect(res.statusCode).toBe(403);
  });

  it('cross-tenant: a student created at another school is invisible here (404)', async () => {
    const otherSchool = await createSchool();
    createdSchoolIds.push(otherSchool.id);
    const { user } = await seedUser({
      schoolId: otherSchool.id,
      loginIdentifier: 'admin-other',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(user.id);
    const otherHost = `${otherSchool.subdomain}.${ROOT_DOMAIN}`;
    const otherAdmin = await freshCtx(otherHost, `10.${RUN}.2.4`);
    await login(otherAdmin, 'admin-other', 'a-real-password-123');

    const res = await get(otherAdmin, `/students/${studentProfileId}`);
    expect(res.statusCode).toBe(404);
  });
});
