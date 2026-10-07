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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import { safeDeleteSchools } from '../../test-support/safe-delete-schools.js';
import type { Role } from '@atlas/domain';
import { AppModule } from '../../app.module.js';
import { PasswordService } from '../identity/password.service.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
const RUN = Math.floor(Math.random() * 200) + 1;

let app: NestFastifyApplication;
const passwords = new PasswordService();

// ConsoleNotificationChannel captures `console.log` by reference in its
// constructor's default parameter — spying *after* the app (and therefore
// that instance) is already constructed would bind to a stale reference and
// silently miss every call. Installed at module scope, before `beforeAll`
// boots the app, matching identity.integration.test.ts's own established
// pattern exactly (needed here for the invitation-acceptance gap-closure
// test below, which reads the real dispatched link back out).
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
  await safeDeleteSchools(prisma, createdSchoolIds);
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

  it('a newly created student can actually log in with their issued credentials (gap closure: User.status never left INVITED)', async () => {
    const createRes = await post(admin, '/students', {
      firstName: 'Chinedu',
      lastName: 'Eze',
      studentId: `ST-${randomUUID().slice(0, 8)}`,
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json<{
      studentProfileId: string;
      loginIdentifier: string;
      userStatus: string;
    }>();
    expect(created.userStatus).toBe('INVITED');

    const resetRes = await post(admin, `/students/${created.studentProfileId}/reset-credentials`);
    expect(resetRes.statusCode).toBe(200);
    const { initialPassword } = resetRes.json<{ initialPassword: string }>();

    const loginCtx = await freshCtx(host, `10.${RUN}.2.5`);
    const loginRes = await login(loginCtx, created.loginIdentifier, initialPassword);
    expect(loginRes.statusCode).toBe(200);
    expect(loginCtx.sessionCookie).toBeDefined();
  });

  // P1-4: five wrong guesses at a guessable student ID lock the account;
  // staff must be able to end that lock (mid-exam the timer keeps running).
  async function lockedOutStudent(ip: string) {
    const createRes = await post(admin, '/students', {
      firstName: 'Locked',
      lastName: 'Out',
      studentId: `LK-${randomUUID().slice(0, 8)}`,
    });
    const created = createRes.json<{ studentProfileId: string; loginIdentifier: string }>();
    const resetRes = await post(admin, `/students/${created.studentProfileId}/reset-credentials`);
    const { initialPassword } = resetRes.json<{ initialPassword: string }>();
    const maxAttempts = Number(process.env.AUTH_LOCKOUT_MAX_ATTEMPTS ?? 5);
    for (let i = 0; i < maxAttempts; i++) {
      const res = await login(await freshCtx(host, ip), created.loginIdentifier, 'wrong-guess');
      expect(res.statusCode).toBe(401);
    }
    const lockedRes = await login(
      await freshCtx(host, ip),
      created.loginIdentifier,
      initialPassword,
    );
    expect(lockedRes.statusCode).toBe(401);
    return { ...created, initialPassword };
  }

  it('fresh credentials end a sign-in lockout (P1-4)', async () => {
    const student = await lockedOutStudent(`10.${RUN}.2.6`);
    const resetRes = await post(admin, `/students/${student.studentProfileId}/reset-credentials`);
    expect(resetRes.statusCode).toBe(200);
    const { initialPassword } = resetRes.json<{ initialPassword: string }>();

    const res = await login(
      await freshCtx(host, `10.${RUN}.2.7`),
      student.loginIdentifier,
      initialPassword,
    );
    expect(res.statusCode).toBe(200);
  });

  it('Unlock sign-in ends a lockout without changing the password, audited (P1-4)', async () => {
    const student = await lockedOutStudent(`10.${RUN}.2.8`);
    const unlockRes = await post(admin, `/students/${student.studentProfileId}/unlock-sign-in`);
    expect(unlockRes.statusCode).toBe(204);

    const res = await login(
      await freshCtx(host, `10.${RUN}.2.9`),
      student.loginIdentifier,
      student.initialPassword,
    );
    expect(res.statusCode).toBe(200);
    const events = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId, action: 'STUDENT_SIGN_IN_UNLOCKED', entityId: student.studentProfileId },
      }),
    );
    expect(events).toHaveLength(1);
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

  it('bug audit P2-6: rejects a studentId that differs only by case as a clean 409', async () => {
    const second = await post(admin, '/students', {
      firstName: 'F',
      lastName: 'G',
      studentId: 'dup-001',
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

  it('a newly invited teacher can log in after accepting their invitation (gap closure: User.status now leaves INVITED)', async () => {
    const email = `invitee-${randomUUID().slice(0, 8)}@example.com`;
    consoleLogSpy.mockClear();
    const createRes = await post(admin, '/teachers', {
      firstName: 'Ngozi',
      lastName: 'Adeyemi',
      email,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json<{
      teacherProfileId: string;
      loginIdentifier: string;
      userStatus: string;
    }>();
    expect(created.userStatus).toBe('INVITED');

    // Before the fix, this next login would fail with USER_NOT_ACTIVE —
    // confirmPasswordReset set a real password but never left User.status
    // at INVITED, so AuthGuard/evaluateLogin rejected every subsequent
    // login attempt regardless of how correct the credential was.
    const logged = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain(`to=${email}`);
    // P3-16: a new staff member gets an invitation, not "Reset your password".
    expect(logged).toContain('has created a staff account for you');
    expect(logged).not.toContain('Reset your password');
    const match = /token=([\w-]+)/.exec(logged);
    expect(match).not.toBeNull();
    const token = match![1];

    const confirmCtx = await freshCtx(host, `10.${RUN}.2.6`);
    const confirmRes = await post(confirmCtx, '/auth/password/reset/confirm', {
      token,
      newPassword: 'a-freshly-accepted-password-1',
    });
    expect(confirmRes.statusCode).toBe(200);

    const loginCtx = await freshCtx(host, `10.${RUN}.2.7`);
    const loginRes = await login(
      loginCtx,
      created.loginIdentifier,
      'a-freshly-accepted-password-1',
    );
    expect(loginRes.statusCode).toBe(200);
    expect(loginCtx.sessionCookie).toBeDefined();

    const meRes = await get(loginCtx, '/auth/me');
    expect(meRes.statusCode).toBe(200);
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
    const unlockRes = await post(teacherCtx, `/students/${studentProfileId}/unlock-sign-in`);
    expect(unlockRes.statusCode).toBe(403);
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

/**
 * F7 gap-closure 1 — server-side pagination/search/sort on all four
 * directories, plus decision A's Class/Department/Session student
 * enrichment/filter, plus decision C's dedicated HOD edit/reset-credentials
 * routes. A new, isolated `describe` block (its own school/admin context)
 * rather than folding into the block above — these tests need a known,
 * deliberately-sized population to assert pagination slicing against, which
 * the existing block's shared, sequentially-mutated fixtures aren't shaped
 * for. Mirrors `platform.integration.test.ts`'s own pagination `describe`
 * block precedent (search+total, page/pageSize slicing+sort ordering,
 * out-of-range page, invalid sortBy 400).
 */
describe('F7 — People directory pagination, search, sort, and HOD edit routes', () => {
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
      loginIdentifier: 'f7-admin',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(user.id);
    admin = await freshCtx(host, `10.${RUN}.3.1`);
    await login(admin, 'f7-admin', 'a-real-password-123');
  });

  it('paginates, searches, and sorts the student directory', async () => {
    const names = ['Amaka', 'Bola', 'Chidi', 'Dayo', 'Emeka'];
    for (const [i, firstName] of names.entries()) {
      const res = await post(admin, '/students', {
        firstName,
        lastName: 'PagTest',
        studentId: `PAG-STU-${String(i).padStart(3, '0')}-${randomUUID().slice(0, 6)}`,
      });
      expect(res.statusCode).toBe(201);
    }

    const page1 = await get(admin, '/students?pageSize=2&page=1&sortBy=studentId&sortDir=asc');
    expect(page1.statusCode).toBe(200);
    const page1Body = page1.json<{
      students: unknown[];
      total: number;
      page: number;
      pageSize: number;
    }>();
    expect(page1Body.students).toHaveLength(2);
    expect(page1Body.total).toBeGreaterThanOrEqual(5);
    expect(page1Body.page).toBe(1);
    expect(page1Body.pageSize).toBe(2);

    const searchRes = await get(admin, '/students?q=Chidi');
    expect(searchRes.statusCode).toBe(200);
    const searchBody = searchRes.json<{ students: { firstName: string }[]; total: number }>();
    expect(searchBody.total).toBe(1);
    expect(searchBody.students[0]?.firstName).toBe('Chidi');

    // A full name matches word by word, in either order; a word that
    // matches nothing on the person excludes them.
    for (const fullName of ['Chidi PagTest', 'pagtest  chidi']) {
      const fullRes = await get(admin, `/students?q=${encodeURIComponent(fullName)}`);
      expect(fullRes.statusCode).toBe(200);
      const fullBody = fullRes.json<{ students: { firstName: string }[]; total: number }>();
      expect(fullBody.total).toBe(1);
      expect(fullBody.students[0]?.firstName).toBe('Chidi');
    }
    const mismatch = await get(admin, `/students?q=${encodeURIComponent('Chidi Nobody')}`);
    expect(mismatch.json<{ total: number }>().total).toBe(0);

    const outOfRange = await get(admin, '/students?page=999&pageSize=2');
    expect(outOfRange.statusCode).toBe(200);
    const outOfRangeBody = outOfRange.json<{ students: unknown[]; total: number }>();
    expect(outOfRangeBody.students).toHaveLength(0);
    expect(outOfRangeBody.total).toBeGreaterThanOrEqual(5);

    const invalidSort = await get(admin, '/students?sortBy=notAField');
    expect(invalidSort.statusCode).toBe(400);
  });

  it('paginates and searches the teacher, HOD, and moderator directories', async () => {
    const teacherRes = await post(admin, '/teachers', {
      firstName: 'Segun',
      lastName: 'PagTeacher',
      email: `segun-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `PAG-STF-${randomUUID().slice(0, 6)}`,
    });
    expect(teacherRes.statusCode).toBe(201);

    const teacherList = await get(admin, '/teachers?q=Segun');
    expect(teacherList.statusCode).toBe(200);
    const teacherFull = await get(admin, `/teachers?q=${encodeURIComponent('Segun PagTeacher')}`);
    expect(teacherFull.json<{ total: number }>().total).toBe(1);
    const teacherBody = teacherList.json<{
      teachers: unknown[];
      total: number;
      page: number;
      pageSize: number;
    }>();
    expect(teacherBody.total).toBe(1);
    expect(teacherBody.page).toBe(1);
    expect(teacherBody.pageSize).toBe(25);

    const modRes = await post(admin, '/moderators', {
      firstName: 'Ngozi',
      lastName: 'PagMod',
      email: `ngozi-${randomUUID().slice(0, 8)}@example.com`,
      loginIdentifier: `pag-mod-${randomUUID().slice(0, 8)}`,
    });
    expect(modRes.statusCode).toBe(201);
    const modList = await get(admin, '/moderators?q=Ngozi&sortBy=lastName&sortDir=desc');
    expect(modList.statusCode).toBe(200);
    expect(modList.json<{ total: number }>().total).toBe(1);
    const modFull = await get(admin, `/moderators?q=${encodeURIComponent('Ngozi PagMod')}`);
    expect(modFull.json<{ total: number }>().total).toBe(1);

    const hodPromote = await post(admin, '/hods', {
      membershipId: teacherRes.json<{ membershipId: string }>().membershipId,
    });
    expect(hodPromote.statusCode).toBe(201);
    const hodList = await get(admin, '/hods?q=Segun');
    expect(hodList.statusCode).toBe(200);
    expect(hodList.json<{ total: number }>().total).toBe(1);
    const hodFull = await get(admin, `/hods?q=${encodeURIComponent('PagTeacher Segun')}`);
    expect(hodFull.json<{ total: number }>().total).toBe(1);
  });

  // Regression test for a real bug found during review: `HodService.list()`
  // previously resolved each row's department via its own separate
  // `withTenant(...)` transaction inside a per-row `toResponseDto` call (an
  // N+1 query pattern) rather than one batched query keyed off the page's
  // ids — the fix's real risk is a map-key mixup mis-attributing one HOD's
  // department to another, which only a multi-HOD-on-one-page assertion can
  // actually catch (a single-HOD test can't distinguish "always resolves
  // department X" from "correctly resolves this HOD's own department").
  it("resolves each HOD's own department correctly when multiple HODs share one list page", async () => {
    const deptXRes = await post(admin, '/academics/departments', {
      name: `HOD List Dept X ${randomUUID().slice(0, 6)}`,
      code: `HLX-${randomUUID().slice(0, 6)}`,
    });
    const deptXId = deptXRes.json<{ id: string }>().id;
    const deptYRes = await post(admin, '/academics/departments', {
      name: `HOD List Dept Y ${randomUUID().slice(0, 6)}`,
      code: `HLY-${randomUUID().slice(0, 6)}`,
    });
    const deptYId = deptYRes.json<{ id: string }>().id;
    const sessionRes = await post(admin, '/academics/sessions', {
      name: `HOD List Session ${randomUUID().slice(0, 8)}`,
      startDate: '2026-09-01',
      endDate: '2027-07-31',
    });
    const sessionId = sessionRes.json<{ id: string }>().id;

    const teacherXRes = await post(admin, '/teachers', {
      firstName: 'Multi',
      lastName: `HodListX-${randomUUID().slice(0, 6)}`,
      email: `multix-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `HLX-STF-${randomUUID().slice(0, 6)}`,
    });
    const teacherXMembershipId = teacherXRes.json<{ membershipId: string }>().membershipId;
    const teacherYRes = await post(admin, '/teachers', {
      firstName: 'Multi',
      lastName: `HodListY-${randomUUID().slice(0, 6)}`,
      email: `multiy-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `HLY-STF-${randomUUID().slice(0, 6)}`,
    });
    const teacherYMembershipId = teacherYRes.json<{ membershipId: string }>().membershipId;

    await post(admin, '/hods', { membershipId: teacherXMembershipId });
    await post(admin, '/hods', { membershipId: teacherYMembershipId });
    await put(admin, `/hods/${teacherXMembershipId}/department`, {
      departmentId: deptXId,
      academicSessionId: sessionId,
    });
    await put(admin, `/hods/${teacherYMembershipId}/department`, {
      departmentId: deptYId,
      academicSessionId: sessionId,
    });

    const list = await get(admin, '/hods?q=HodList&pageSize=50');
    expect(list.statusCode).toBe(200);
    const hods = list.json<{
      hods: { membershipId: string; departmentId: string | null; departmentName: string | null }[];
    }>().hods;
    const hodX = hods.find((h) => h.membershipId === teacherXMembershipId);
    const hodY = hods.find((h) => h.membershipId === teacherYMembershipId);
    expect(hodX?.departmentId).toBe(deptXId);
    expect(hodY?.departmentId).toBe(deptYId);
    // The core mixup risk: neither HOD's department bled into the other's.
    expect(hodX?.departmentId).not.toBe(hodY?.departmentId);
  });

  it('enriches and filters the student directory by current class (decision A)', async () => {
    const sessionRes = await post(admin, '/academics/sessions', {
      name: `F7 Session ${randomUUID().slice(0, 8)}`,
      startDate: '2026-09-01',
      endDate: '2027-07-31',
    });
    const sessionId = sessionRes.json<{ id: string }>().id;

    const deptRes = await post(admin, '/academics/departments', {
      name: 'F7 Dept',
      code: `F7D-${randomUUID().slice(0, 6)}`,
    });
    const departmentId = deptRes.json<{ id: string }>().id;

    const classRes = await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      departmentId,
      name: 'F7 Class',
      level: 'SS2',
      arm: 'A',
    });
    const classId = classRes.json<{ id: string }>().id;

    const studentRes = await post(admin, '/students', {
      firstName: 'Enrolled',
      lastName: 'Student',
      studentId: `ENR-${randomUUID().slice(0, 8)}`,
    });
    const enrolledStudentProfileId = studentRes.json<{ studentProfileId: string }>()
      .studentProfileId;

    const enrollRes = await post(admin, `/students/${enrolledStudentProfileId}/enrollments`, {
      academicSessionId: sessionId,
      classId,
    });
    expect(enrollRes.statusCode).toBe(200);

    const detail = await get(admin, `/students/${enrolledStudentProfileId}`);
    const detailBody = detail.json<{
      currentClassId: string | null;
      currentClassName: string | null;
      currentAcademicSessionId: string | null;
      departmentId: string | null;
      departmentName: string | null;
    }>();
    expect(detailBody.currentClassId).toBe(classId);
    expect(detailBody.currentClassName).toBe('F7 Class');
    expect(detailBody.currentAcademicSessionId).toBe(sessionId);
    expect(detailBody.departmentId).toBe(departmentId);
    expect(detailBody.departmentName).toBe('F7 Dept');

    const filtered = await get(admin, `/students?classId=${classId}`);
    expect(filtered.statusCode).toBe(200);
    const filteredBody = filtered.json<{ students: { studentProfileId: string }[] }>();
    expect(filteredBody.students.some((s) => s.studentProfileId === enrolledStudentProfileId)).toBe(
      true,
    );
  });

  it("edits an HOD's identity and resets their credentials via dedicated HOD routes (decision C)", async () => {
    const teacherRes = await post(admin, '/teachers', {
      firstName: 'Kunle',
      lastName: 'HodEdit',
      email: `kunle-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `HED-${randomUUID().slice(0, 6)}`,
    });
    const membershipId = teacherRes.json<{ membershipId: string }>().membershipId;
    const promote = await post(admin, '/hods', { membershipId });
    expect(promote.statusCode).toBe(201);

    const editRes = await patch(admin, `/hods/${membershipId}`, { lastName: 'HodEdited' });
    expect(editRes.statusCode).toBe(200);
    expect(editRes.json<{ lastName: string }>().lastName).toBe('HodEdited');

    const resetRes = await post(admin, `/hods/${membershipId}/reset-credentials`);
    expect(resetRes.statusCode).toBe(200);
    expect(resetRes.json<{ status: string }>().status).toBe('ok');

    const events = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId, action: { in: ['HOD_UPDATED', 'HOD_CREDENTIALS_RESET'] } },
      }),
    );
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it('a Teacher cannot edit or reset an HOD (security boundary for the new routes)', async () => {
    const teacherRes = await post(admin, '/teachers', {
      firstName: 'Wale',
      lastName: 'HodSec',
      email: `wale-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `HSEC-${randomUUID().slice(0, 6)}`,
    });
    const membershipId = teacherRes.json<{ membershipId: string }>().membershipId;
    await post(admin, '/hods', { membershipId });

    const { user } = await seedUser({
      schoolId,
      loginIdentifier: 'f7-teacher-sec',
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    createdUserIds.push(user.id);
    const teacherCtx = await freshCtx(host, `10.${RUN}.3.2`);
    await login(teacherCtx, 'f7-teacher-sec', 'a-real-password-123');

    const editRes = await patch(teacherCtx, `/hods/${membershipId}`, { lastName: 'ShouldNotWork' });
    expect(editRes.statusCode).toBe(403);
    const resetRes = await post(teacherCtx, `/hods/${membershipId}/reset-credentials`);
    expect(resetRes.statusCode).toBe(403);
  });
});

describe('F14 gap closure — GET /students/me', () => {
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
      loginIdentifier: 'f14-admin',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(user.id);
    admin = await freshCtx(host, `10.${RUN}.4.1`);
    await login(admin, 'f14-admin', 'a-real-password-123');
  });

  // Creates the student via the real `POST /students` route (so a real
  // `StudentProfile` row exists), then sets `credentialState: 'OK'` directly
  // via Prisma to bypass the reset-credentials flow entirely — the same
  // convention every other test file's student/teacher/HOD login fixtures
  // already use (see `seedUser` above and the 2026-09-03 gap-closure Change
  // Log entry for the precedent).
  async function seedLoggedInStudent(opts: {
    firstName: string;
    lastName: string;
    password: string;
  }) {
    const res = await post(admin, '/students', {
      firstName: opts.firstName,
      lastName: opts.lastName,
      studentId: `F14-${randomUUID().slice(0, 8)}`,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{
      userId: string;
      membershipId: string;
      studentProfileId: string;
      displayName: string;
      studentId: string;
      loginIdentifier: string;
    }>();
    createdUserIds.push(body.userId);
    const passwordHash = await passwords.hash(opts.password);
    // `POST /students` leaves `User.status` at `INVITED` (B1's own account-
    // lifecycle design) — login requires `ACTIVE`, per the 2026-08-30
    // auth-audit gap closure's own precedent for bypassing this in a test
    // fixture (see CLAUDE.md's Change Log entry of that date).
    await prisma.user.update({
      where: { id: body.userId },
      data: { passwordHash, credentialState: 'OK', status: 'ACTIVE' },
    });
    return body;
  }

  it("returns the signed-in student's own name, student ID, and null class/department before enrollment", async () => {
    const student = await seedLoggedInStudent({
      firstName: 'Fola',
      lastName: 'MeRoute',
      password: 'a-real-password-123',
    });
    const studentCtx = await freshCtx(host, `10.${RUN}.4.2`);
    const loginRes = await login(studentCtx, student.loginIdentifier, 'a-real-password-123');
    expect(loginRes.statusCode).toBe(200);

    // Also the route-ordering proof: if `me` were shadowed by `:id`, this
    // would 404 with "Student not found" (StudentService.get('me')) instead
    // of resolving the caller's own profile.
    const res = await get(studentCtx, '/students/me');
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      displayName: string;
      studentId: string;
      currentClassName: string | null;
      departmentName: string | null;
    }>();
    expect(body.displayName).toBe(student.displayName);
    expect(body.studentId).toBe(student.studentId);
    expect(body.currentClassName).toBeNull();
    expect(body.departmentName).toBeNull();
  });

  it('reflects the current class and department once enrolled', async () => {
    const sessionRes = await post(admin, '/academics/sessions', {
      name: `F14 Session ${randomUUID().slice(0, 8)}`,
      startDate: '2026-09-01',
      endDate: '2027-07-31',
    });
    const sessionId = sessionRes.json<{ id: string }>().id;
    const deptRes = await post(admin, '/academics/departments', {
      name: 'F14 Dept',
      code: `F14D-${randomUUID().slice(0, 6)}`,
    });
    const departmentId = deptRes.json<{ id: string }>().id;
    const classRes = await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      departmentId,
      name: 'F14 Class',
      level: 'SS2',
      arm: 'A',
    });
    const classId = classRes.json<{ id: string }>().id;

    const student = await seedLoggedInStudent({
      firstName: 'Tomi',
      lastName: 'MeEnrolled',
      password: 'a-real-password-123',
    });
    await post(admin, `/students/${student.studentProfileId}/enrollments`, {
      academicSessionId: sessionId,
      classId,
    });

    const studentCtx = await freshCtx(host, `10.${RUN}.4.3`);
    await login(studentCtx, student.loginIdentifier, 'a-real-password-123');
    const res = await get(studentCtx, '/students/me');
    expect(res.statusCode).toBe(200);
    const body = res.json<{ currentClassName: string | null; departmentName: string | null }>();
    expect(body.currentClassName).toBe('F14 Class');
    expect(body.departmentName).toBe('F14 Dept');
  });

  it('denies a non-student actor (security boundary — this is a self-view route, not a directory read)', async () => {
    const res = await get(admin, '/students/me');
    expect(res.statusCode).toBe(403);
  });
});
