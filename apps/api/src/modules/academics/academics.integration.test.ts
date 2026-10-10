/**
 * B5 — Academic Structure. End-to-end over real HTTP against the real
 * AppModule and real Postgres (RLS included), following
 * identity.integration.test.ts / platform.integration.test.ts's own
 * precedent: boot AppModule, seed fixtures directly via the shared
 * `prisma` singleton, drive requests via Fastify's `app.inject()`.
 *
 * Covers the roadmap's Testing requirements table: full structure creation;
 * activation switching (including cascaded term closure); archival with
 * dependents; cross-tenant structure access denied; teacher cannot mutate
 * structure; HODAssignment's active-role invariant (DoD item 8); and
 * `GET /academics/context` for every role (DoD item 10). The concurrent-
 * activation race (DoD item 2) has its own file,
 * session-activation-concurrency.integration.test.ts, since it needs a
 * genuinely different mechanism (two overlapping raw connections) than
 * ordinary sequential `app.inject()` calls can exercise.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

// ---- Fixture helpers (mirrors identity.integration.test.ts) -------------

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Academics Test School ${randomUUID()}`,
      subdomain: `acad-${randomUUID().slice(0, 8)}`,
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

// Content-Type is only set when a payload is actually sent — the exact
// bug CLAUDE.md's B4 entry already documented once (an unconditional
// `application/json` header on a bodyless POST makes Fastify's JSON body
// parser throw, surfacing as a generic 400 VALIDATION_ERROR indistinguishable
// from a real product bug). Several of B5's own action endpoints
// (activate/archive/deactivate/end) are bodyless POSTs, so this would
// otherwise reproduce that exact class of bug here too.
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

async function del(ctx: RequestCtx, url: string) {
  return app.inject({
    method: 'DELETE',
    url,
    headers: { host: ctx.host, cookie: cookieHeader(ctx), 'x-csrf-token': ctx.csrfToken },
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
      tx.hODAssignment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) => tx.classSubject.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.classGroup.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.subject.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.department.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.academicTerm.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.deleteMany({ where: { schoolId } }),
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

// ---------------------------------------------------------------------

describe('B5 Academic Structure — full structure creation, activation, archival (DoD 1-5, 7)', () => {
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
    admin = await freshCtx(host, `10.${RUN}.1.1`);
    await login(admin, 'admin01', 'a-real-password-123');
  });

  let sessionAId: string;
  let sessionBId: string;
  let termId: string;
  let departmentId: string;
  let classId: string;
  let subjectId: string;
  let classSubjectId: string;

  it('creates a full academic structure: session, term, department, class, subject, offering', async () => {
    const sessionRes = await post(admin, '/academics/sessions', {
      name: `${randomUUID().slice(0, 8)} Session A`,
      startDate: '2026-09-01',
      endDate: '2027-07-31',
    });
    expect(sessionRes.statusCode).toBe(201);
    sessionAId = sessionRes.json<{ id: string }>().id;

    const sessionBRes = await post(admin, '/academics/sessions', {
      name: `${randomUUID().slice(0, 8)} Session B`,
      startDate: '2027-09-01',
      endDate: '2028-07-31',
    });
    expect(sessionBRes.statusCode).toBe(201);
    sessionBId = sessionBRes.json<{ id: string }>().id;

    const termRes = await post(admin, `/academics/sessions/${sessionAId}/terms`, {
      name: 'First Term',
      sequence: 1,
      startDate: '2026-09-01',
      endDate: '2026-12-15',
    });
    expect(termRes.statusCode).toBe(201);
    termId = termRes.json<{ id: string }>().id;

    const deptRes = await post(admin, '/academics/departments', {
      name: 'Science',
      code: `SCI-${randomUUID().slice(0, 6)}`,
    });
    expect(deptRes.statusCode).toBe(201);
    departmentId = deptRes.json<{ id: string }>().id;

    const classRes = await post(admin, '/academics/classes', {
      academicSessionId: sessionAId,
      name: 'SS2A',
      level: 'SS2',
      arm: 'A',
    });
    expect(classRes.statusCode).toBe(201);
    classId = classRes.json<{ id: string }>().id;

    const subjectRes = await post(admin, '/academics/subjects', {
      name: 'Mathematics',
      code: `MTH-${randomUUID().slice(0, 6)}`,
      departmentId,
    });
    expect(subjectRes.statusCode).toBe(201);
    subjectId = subjectRes.json<{ id: string }>().id;

    const offeringRes = await post(admin, `/academics/classes/${classId}/subjects`, { subjectId });
    expect(offeringRes.statusCode).toBe(201);
    classSubjectId = offeringRes.json<{ id: string; subjectName: string }>().id;
    expect(offeringRes.json<{ subjectName: string }>().subjectName).toBe('Mathematics');

    const offeringsList = await get(admin, `/academics/classes/${classId}/subjects`);
    expect(offeringsList.statusCode).toBe(200);
    expect(offeringsList.json<{ offerings: unknown[] }>().offerings).toHaveLength(1);
  });

  it('unique class identity within (school, session): duplicate level+arm in the same session is rejected', async () => {
    const res = await post(admin, '/academics/classes', {
      academicSessionId: sessionAId,
      name: 'SS2A duplicate',
      level: 'SS2',
      arm: 'A',
    });
    expect(res.statusCode).toBe(409);
  });

  it('"SS2A" in two different sessions are distinct entities (DoD item 3)', async () => {
    const res = await post(admin, '/academics/classes', {
      academicSessionId: sessionBId,
      name: 'SS2A',
      level: 'SS2',
      arm: 'A',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ id: string }>().id).not.toBe(classId);
  });

  it('activating session A closes no other session (first activation) and makes it CURRENT', async () => {
    const res = await post(admin, `/academics/sessions/${sessionAId}/activate`);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ status: string }>().status).toBe('CURRENT');
  });

  it('activating the term makes it CURRENT within its session', async () => {
    const res = await post(admin, `/academics/terms/${termId}/activate`);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ status: string }>().status).toBe('CURRENT');
  });

  it('activating session B closes session A and cascades to close its CURRENT term', async () => {
    const res = await post(admin, `/academics/sessions/${sessionBId}/activate`);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ status: string }>().status).toBe('CURRENT');

    const sessionA = await get(admin, `/academics/sessions/${sessionAId}`);
    expect(sessionA.json<{ status: string }>().status).toBe('CLOSED');

    const closedTerm = await withTenant(prisma, schoolId, (tx) =>
      tx.academicTerm.findUnique({ where: { id: termId } }),
    );
    expect(closedTerm?.status).toBe('CLOSED');

    // Reactivate session A for the rest of this describe block's tests.
    await post(admin, `/academics/sessions/${sessionAId}/activate`);
  });

  it('deactivating a subject/department/class with dependents leaves them intact and readable (DoD item 4)', async () => {
    const deactivateSubject = await post(admin, `/academics/subjects/${subjectId}/deactivate`);
    expect(deactivateSubject.statusCode).toBe(200);
    expect(deactivateSubject.json<{ status: string }>().status).toBe('INACTIVE');

    const offerings = await get(admin, `/academics/classes/${classId}/subjects`);
    expect(offerings.json<{ offerings: unknown[] }>().offerings).toHaveLength(1);

    const deactivateDept = await post(admin, `/academics/departments/${departmentId}/deactivate`);
    expect(deactivateDept.statusCode).toBe(200);

    const classStillThere = await get(admin, `/academics/classes/${classId}`);
    expect(classStillThere.statusCode).toBe(200);
    expect(classStillThere.json<{ status: string }>().status).toBe('ACTIVE');
  });

  it('destructive deletion is refused where dependents exist, with a clear error (DoD item 5)', async () => {
    const res = await del(admin, `/academics/departments/${departmentId}`);
    expect(res.statusCode).toBe(409);
    const body = res.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe('ACADEMIC_STRUCTURE_HAS_DEPENDENTS');
    expect(body.error.message).toMatch(/subject|class/i);
  });

  it('deleting the offering, then the subject/class, succeeds once no dependents remain', async () => {
    const removeOffering = await del(admin, `/academics/class-subjects/${classSubjectId}`);
    expect(removeOffering.statusCode).toBe(200);

    const deleteSubject = await del(admin, `/academics/subjects/${subjectId}`);
    expect(deleteSubject.statusCode).toBe(200);
  });
});

describe('B5 Academic Structure — authorization (DoD item 9, teacher/student cannot mutate)', () => {
  let schoolId: string;
  let host: string;
  let admin: RequestCtx;
  let teacher: RequestCtx;
  let student: RequestCtx;
  let hod: RequestCtx;

  beforeAll(async () => {
    const school = await createSchool();
    schoolId = school.id;
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolId);

    const users = await Promise.all([
      seedUser({
        schoolId,
        loginIdentifier: 'admin02',
        password: 'a-real-password-123',
        role: 'SCHOOL_ADMIN',
      }),
      seedUser({
        schoolId,
        loginIdentifier: 'teacher02',
        password: 'a-real-password-123',
        role: 'TEACHER',
      }),
      seedUser({
        schoolId,
        loginIdentifier: 'student02',
        password: 'a-real-password-123',
        role: 'STUDENT',
      }),
      seedUser({
        schoolId,
        loginIdentifier: 'hod02',
        password: 'a-real-password-123',
        role: 'HOD',
      }),
    ]);
    createdUserIds.push(...users.map((u) => u.user.id));

    admin = await freshCtx(host, `10.${RUN}.2.1`);
    await login(admin, 'admin02', 'a-real-password-123');
    teacher = await freshCtx(host, `10.${RUN}.2.2`);
    await login(teacher, 'teacher02', 'a-real-password-123');
    student = await freshCtx(host, `10.${RUN}.2.3`);
    await login(student, 'student02', 'a-real-password-123');
    hod = await freshCtx(host, `10.${RUN}.2.4`);
    await login(hod, 'hod02', 'a-real-password-123');
  });

  it('teacher cannot create a department (403)', async () => {
    const res = await post(teacher, '/academics/departments', { name: 'X', code: 'X1' });
    expect(res.statusCode).toBe(403);
  });

  it('student cannot create a department (403)', async () => {
    const res = await post(student, '/academics/departments', { name: 'X', code: 'X2' });
    expect(res.statusCode).toBe(403);
  });

  it('HOD can read the department list but cannot create one', async () => {
    const readRes = await get(hod, '/academics/departments');
    expect(readRes.statusCode).toBe(200);
    const writeRes = await post(hod, '/academics/departments', { name: 'X', code: 'X3' });
    expect(writeRes.statusCode).toBe(403);
  });

  it('school admin can create a department', async () => {
    const res = await post(admin, '/academics/departments', {
      name: 'Humanities',
      code: `HUM-${randomUUID().slice(0, 6)}`,
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('B5 Academic Structure — cross-tenant isolation (DoD item 9)', () => {
  let schoolAId: string;
  let schoolBId: string;
  let hostA: string;
  let hostB: string;
  let adminA: RequestCtx;
  let adminB: RequestCtx;
  let departmentInA: string;

  beforeAll(async () => {
    const [schoolA, schoolB] = await Promise.all([createSchool(), createSchool()]);
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;
    hostA = `${schoolA.subdomain}.${ROOT_DOMAIN}`;
    hostB = `${schoolB.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolAId, schoolBId);

    const [userA, userB] = await Promise.all([
      seedUser({
        schoolId: schoolAId,
        loginIdentifier: 'adminA',
        password: 'a-real-password-123',
        role: 'SCHOOL_ADMIN',
      }),
      seedUser({
        schoolId: schoolBId,
        loginIdentifier: 'adminB',
        password: 'a-real-password-123',
        role: 'SCHOOL_ADMIN',
      }),
    ]);
    createdUserIds.push(userA.user.id, userB.user.id);

    adminA = await freshCtx(hostA, `10.${RUN}.3.1`);
    await login(adminA, 'adminA', 'a-real-password-123');
    adminB = await freshCtx(hostB, `10.${RUN}.3.2`);
    await login(adminB, 'adminB', 'a-real-password-123');

    const deptRes = await post(adminA, '/academics/departments', {
      name: 'School A Dept',
      code: `SAD-${randomUUID().slice(0, 6)}`,
    });
    departmentInA = deptRes.json<{ id: string }>().id;
  });

  it("school B cannot read school A's department (404, RLS-backed)", async () => {
    const res = await get(adminB, `/academics/departments/${departmentInA}`);
    expect(res.statusCode).toBe(404);
  });

  it("school B cannot mutate school A's department (404)", async () => {
    const res = await patch(adminB, `/academics/departments/${departmentInA}`, {
      name: 'Hijacked',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('B5 HODAssignment — active-HOD-role invariant (DoD item 8)', () => {
  let schoolId: string;
  let host: string;
  let admin: RequestCtx;
  let departmentId: string;
  let sessionId: string;
  let teacherMembershipId: string;
  let hodMembershipId: string;

  beforeAll(async () => {
    const school = await createSchool();
    schoolId = school.id;
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolId);

    const { user: adminUser } = await seedUser({
      schoolId,
      loginIdentifier: 'admin03',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(adminUser.id);
    const { user: teacherUser, membership: teacherMembership } = await seedUser({
      schoolId,
      loginIdentifier: 'teacher03',
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    createdUserIds.push(teacherUser.id);
    teacherMembershipId = teacherMembership.id;
    const { user: hodUser, membership: hodMembership } = await seedUser({
      schoolId,
      loginIdentifier: 'hod03',
      password: 'a-real-password-123',
      role: 'HOD',
    });
    createdUserIds.push(hodUser.id);
    hodMembershipId = hodMembership.id;

    admin = await freshCtx(host, `10.${RUN}.4.1`);
    await login(admin, 'admin03', 'a-real-password-123');

    const deptRes = await post(admin, '/academics/departments', {
      name: 'Science',
      code: `SCI-${randomUUID().slice(0, 6)}`,
    });
    departmentId = deptRes.json<{ id: string }>().id;
    const sessionRes = await post(admin, '/academics/sessions', {
      name: `${randomUUID().slice(0, 8)}`,
      startDate: '2026-09-01',
      endDate: '2027-07-31',
    });
    sessionId = sessionRes.json<{ id: string }>().id;
  });

  it('rejects a membership with no active HOD role assignment', async () => {
    const res = await post(admin, '/academics/hod-assignments', {
      membershipId: teacherMembershipId,
      departmentId,
      academicSessionId: sessionId,
      startDate: '2026-09-01',
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('HOD_ASSIGNMENT_REQUIRES_ACTIVE_ROLE');
  });

  it('succeeds for a membership holding an active HOD role assignment', async () => {
    const res = await post(admin, '/academics/hod-assignments', {
      membershipId: hodMembershipId,
      departmentId,
      academicSessionId: sessionId,
      startDate: '2026-09-01',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ status: string }>().status).toBe('ACTIVE');

    const listRes = await get(admin, `/academics/departments/${departmentId}/hod-assignments`);
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json<{ assignments: unknown[] }>().assignments).toHaveLength(1);
  });

  it("marks only the HOD's own department as headedByMe (P1-12)", async () => {
    // An alphabetically earlier department the HOD does not head: the HOD
    // screens used to open the first department in the list.
    await post(admin, '/academics/departments', {
      name: 'Arts',
      code: `ART-${randomUUID().slice(0, 6)}`,
    });
    const hod = await freshCtx(host, `10.${RUN}.4.2`);
    await login(hod, 'hod03', 'a-real-password-123');

    const res = await get(hod, '/academics/departments');
    expect(res.statusCode).toBe(200);
    const { departments } = res.json<{
      departments: { id: string; name: string; headedByMe?: boolean }[];
    }>();
    expect(departments[0]?.name).toBe('Arts');
    expect(departments.filter((d) => d.headedByMe).map((d) => d.id)).toEqual([departmentId]);

    const adminRes = await get(admin, '/academics/departments');
    const adminDepartments = adminRes.json<{ departments: { headedByMe?: boolean }[] }>();
    expect(adminDepartments.departments.some((d) => d.headedByMe)).toBe(false);
  });
});

describe('B5 GET /academics/context — every role (DoD item 10)', () => {
  let schoolId: string;
  let host: string;
  let sessionId: string;
  let termId: string;

  beforeAll(async () => {
    const school = await createSchool();
    schoolId = school.id;
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolId);

    const roles: Role[] = ['SCHOOL_ADMIN', 'MODERATOR', 'HOD', 'TEACHER', 'STUDENT'];
    const users = await Promise.all(
      roles.map((role) =>
        seedUser({
          schoolId,
          loginIdentifier: `ctx-${role.toLowerCase()}`,
          password: 'a-real-password-123',
          role,
        }),
      ),
    );
    createdUserIds.push(...users.map((u) => u.user.id));

    const admin = await freshCtx(host, `10.${RUN}.5.1`);
    await login(admin, 'ctx-school_admin', 'a-real-password-123');
    const sessionRes = await post(admin, '/academics/sessions', {
      name: `${randomUUID().slice(0, 8)}`,
      startDate: '2026-09-01',
      endDate: '2027-07-31',
    });
    sessionId = sessionRes.json<{ id: string }>().id;
    await post(admin, `/academics/sessions/${sessionId}/activate`);
    const termRes = await post(admin, `/academics/sessions/${sessionId}/terms`, {
      name: 'First Term',
      sequence: 1,
      startDate: '2026-09-01',
      endDate: '2026-12-15',
    });
    termId = termRes.json<{ id: string }>().id;
    await post(admin, `/academics/terms/${termId}/activate`);
  });

  it.each(['school_admin', 'moderator', 'hod', 'teacher', 'student'])(
    'returns the correct school/session/term for %s',
    async (roleSlug) => {
      const ctx = await freshCtx(host, `10.${RUN}.5.${roleSlug.length}`);
      await login(ctx, `ctx-${roleSlug}`, 'a-real-password-123');
      const res = await get(ctx, '/academics/context');
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        schoolId: string;
        session: { id: string } | null;
        term: { id: string } | null;
      }>();
      expect(body.schoolId).toBe(schoolId);
      expect(body.session?.id).toBe(sessionId);
      expect(body.term?.id).toBe(termId);
    },
  );
});
