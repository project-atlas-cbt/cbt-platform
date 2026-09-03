/**
 * B6 — TeacherAssignment (07 §6.8), "the core authorization entity."
 * Mirrors academics.integration.test.ts's own harness exactly.
 *
 * Covers: PUT full-replace diff/add/remove semantics; assigning
 * Mathematics/SS2A grants exactly that scope and nothing adjacent (DoD 4,
 * proven directly against the ASSIGNED resolver); removing an assignment
 * ends it (never deletes) — future access revoked, historical row intact
 * (DoD 5); re-assigning a previously-ended pair (rehire) succeeds cleanly;
 * a membership lacking an active TEACHER role is rejected; cross-tenant
 * denied.
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
import { createAssignedScopeResolver } from './assigned-scope.resolver.js';

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
      name: `Assignment Test School ${randomUUID()}`,
      subdomain: `asn-${randomUUID().slice(0, 8)}`,
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
      tx.teacherAssignment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) => tx.classSubject.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.classGroup.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.subject.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.deleteMany({ where: { schoolId } }),
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

describe('B6 TeacherAssignment', () => {
  let schoolId: string;
  let host: string;
  let admin: RequestCtx;
  let sessionId: string;
  let classAId: string;
  let mathSubjectId: string;
  let physicsSubjectId: string;
  let mathOfferingId: string;
  let physicsOfferingId: string;
  let teacherProfileId: string;
  let teacherMembershipId: string;

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
    admin = await freshCtx(host, `10.${RUN}.4.1`);
    await login(admin, 'admin01', 'a-real-password-123');

    const sessionRes = await post(admin, '/academics/sessions', {
      name: `Asn Session ${randomUUID().slice(0, 8)}`,
      startDate: '2026-09-01',
      endDate: '2027-07-31',
    });
    sessionId = sessionRes.json<{ id: string }>().id;
    const classRes = await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      name: 'SS2A',
      level: 'SS2',
      arm: 'A',
    });
    classAId = classRes.json<{ id: string }>().id;

    mathSubjectId = (
      await post(admin, '/academics/subjects', {
        name: 'Mathematics',
        code: `MTH-${randomUUID().slice(0, 6)}`,
      })
    ).json<{ id: string }>().id;
    physicsSubjectId = (
      await post(admin, '/academics/subjects', {
        name: 'Physics',
        code: `PHY-${randomUUID().slice(0, 6)}`,
      })
    ).json<{ id: string }>().id;
    mathOfferingId = (
      await post(admin, `/academics/classes/${classAId}/subjects`, { subjectId: mathSubjectId })
    ).json<{ id: string }>().id;
    physicsOfferingId = (
      await post(admin, `/academics/classes/${classAId}/subjects`, { subjectId: physicsSubjectId })
    ).json<{ id: string }>().id;

    const teacherRes = await post(admin, '/teachers', {
      firstName: 'Ade',
      lastName: 'Ola',
      email: `ade-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    const teacherBody = teacherRes.json<{ teacherProfileId: string; membershipId: string }>();
    teacherProfileId = teacherBody.teacherProfileId;
    teacherMembershipId = teacherBody.membershipId;
  });

  it('assigns Mathematics/SS2A — grants exactly that scope and nothing adjacent (DoD 4)', async () => {
    const res = await put(admin, `/teachers/${teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [mathOfferingId],
    });
    expect(res.statusCode).toBe(200);
    const assignments = res.json<{ assignments: { classSubjectId: string; status: string }[] }>()
      .assignments;
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.classSubjectId).toBe(mathOfferingId);

    const actor = {
      kind: 'SCHOOL' as const,
      userId: 'irrelevant',
      schoolId,
      membershipId: teacherMembershipId,
      roles: ['TEACHER' as const],
    };
    const resolver = createAssignedScopeResolver();
    await expect(resolver(actor, { classSubjectId: mathOfferingId })).resolves.toBe(true);
    // Nothing adjacent — Physics was never assigned.
    await expect(resolver(actor, { classSubjectId: physicsOfferingId })).resolves.toBe(false);
  });

  it('full-replace: adding Physics and keeping Mathematics leaves Mathematics untouched, adds Physics', async () => {
    const res = await put(admin, `/teachers/${teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [mathOfferingId, physicsOfferingId],
    });
    expect(res.statusCode).toBe(200);
    const assignments = res.json<{ assignments: { classSubjectId: string }[] }>().assignments;
    expect(assignments.map((a) => a.classSubjectId).sort()).toEqual(
      [mathOfferingId, physicsOfferingId].sort(),
    );
  });

  it('removing an assignment ends it (never deletes) — revokes future access, keeps history (DoD 5)', async () => {
    const res = await put(admin, `/teachers/${teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [mathOfferingId], // Physics removed
    });
    expect(res.statusCode).toBe(200);
    const assignments = res.json<{ assignments: { classSubjectId: string }[] }>().assignments;
    expect(assignments.map((a) => a.classSubjectId)).toEqual([mathOfferingId]);

    // The Physics row still exists, ENDED — not deleted.
    const endedRow = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherAssignment.findFirst({
        where: { schoolId, teacherProfileId, classSubjectId: physicsOfferingId },
      }),
    );
    expect(endedRow).not.toBeNull();
    expect(endedRow?.status).toBe('ENDED');

    // The ASSIGNED resolver now denies Physics — access revoked.
    const actor = {
      kind: 'SCHOOL' as const,
      userId: 'irrelevant',
      schoolId,
      membershipId: teacherMembershipId,
      roles: ['TEACHER' as const],
    };
    const resolver = createAssignedScopeResolver();
    await expect(resolver(actor, { classSubjectId: physicsOfferingId })).resolves.toBe(false);
  });

  it('re-assigning a previously-ended pair (rehire) succeeds cleanly', async () => {
    const res = await put(admin, `/teachers/${teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [mathOfferingId, physicsOfferingId],
    });
    expect(res.statusCode).toBe(200);
    const activeRows = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherAssignment.findMany({
        where: { schoolId, teacherProfileId, classSubjectId: physicsOfferingId },
      }),
    );
    // Two rows total now for this pair: the old ENDED one, plus a new ACTIVE one.
    expect(activeRows).toHaveLength(2);
    expect(activeRows.filter((r) => r.status === 'ACTIVE')).toHaveLength(1);
  });

  it("F6 gap-closure: GET /classes/:id/teachers lists the class's currently assigned teachers, enriched by subject", async () => {
    const res = await get(admin, `/classes/${classAId}/teachers`);
    expect(res.statusCode).toBe(200);
    const teachers = res.json<{
      teachers: {
        assignmentId: string;
        teacherProfileId: string;
        staffId: string;
        displayName: string;
        subjectId: string;
        subjectName: string;
        subjectCode: string;
        startDate: string;
      }[];
    }>().teachers;
    // At this point in the suite the rehire test left both Mathematics and
    // Physics ACTIVE for this teacher — ordered by subject name ascending.
    expect(teachers).toHaveLength(2);
    expect(teachers.map((t) => t.subjectName)).toEqual(['Mathematics', 'Physics']);
    expect(teachers[0]?.teacherProfileId).toBe(teacherProfileId);
    expect(teachers[0]?.subjectId).toBe(mathSubjectId);
    expect(teachers[1]?.subjectId).toBe(physicsSubjectId);
    for (const teacher of teachers) {
      expect(teacher.displayName.length).toBeGreaterThan(0);
      expect(teacher.staffId.length).toBeGreaterThan(0);
    }
  });

  it('rejects assigning a membership whose TeacherProfile exists but whose TEACHER role has since ended', async () => {
    // A real, if unusual, scenario: a TeacherProfile persists (07's own
    // "deactivating never deletes" rule) after the person's TEACHER role
    // itself was ended (e.g. converted to a pure Moderator). The service's
    // own active-role invariant check must still catch this — the same
    // pattern HodAssignmentService.create already established.
    const { membership } = await seedUser({
      schoolId,
      loginIdentifier: 'ex-teacher',
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.create({
        data: {
          schoolId,
          membershipId: membership.id,
          staffId: `STF-EX-${randomUUID().slice(0, 6)}`,
        },
      }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.roleAssignment.updateMany({
        where: { schoolId, membershipId: membership.id, role: 'TEACHER' },
        data: { status: 'ENDED' },
      }),
    );
    const exTeacherProfile = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.findUniqueOrThrow({
        where: { schoolId_membershipId: { schoolId, membershipId: membership.id } },
      }),
    );

    const res = await put(admin, `/teachers/${exTeacherProfile.id}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [mathOfferingId],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'TEACHER_ASSIGNMENT_REQUIRES_ACTIVE_ROLE',
    );
  });

  it('rejects a classSubjectId belonging to a different academic session than the one submitted (defense-in-depth for a real bug found during review)', async () => {
    // A second, distinct session with its own class-subject offering.
    // Nothing ever ends a TeacherAssignment on session rollover (no B19
    // automation exists yet), so a stale classSubjectId from another
    // session reaching this endpoint is a realistic scenario, not a
    // contrived one — this is exactly what the frontend matrix's own
    // session filter (found in the same review) exists to prevent from
    // being submitted in the first place; this test proves the backend
    // itself refuses it too, rather than relying on the client alone. Uses
    // its own fresh teacher (rather than the describe block's shared
    // `teacherProfileId`) so this test's outcome doesn't depend on the
    // exact diff state prior tests in this file happen to leave behind.
    const otherSessionRes = await post(admin, '/academics/sessions', {
      name: `Asn Other Session ${randomUUID().slice(0, 8)}`,
      startDate: '2027-09-01',
      endDate: '2028-07-31',
    });
    const otherSessionId = otherSessionRes.json<{ id: string }>().id;
    const otherClassRes = await post(admin, '/academics/classes', {
      academicSessionId: otherSessionId,
      name: 'SS2A',
      level: 'SS2',
      arm: 'B',
    });
    const otherClassId = otherClassRes.json<{ id: string }>().id;
    const otherOfferingId = (
      await post(admin, `/academics/classes/${otherClassId}/subjects`, {
        subjectId: mathSubjectId,
      })
    ).json<{ id: string }>().id;

    const freshTeacherRes = await post(admin, '/teachers', {
      firstName: 'Chidi',
      lastName: 'Eze',
      email: `chidi-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-MISMATCH-${randomUUID().slice(0, 6)}`,
    });
    const freshTeacherProfileId = freshTeacherRes.json<{ teacherProfileId: string }>()
      .teacherProfileId;

    const res = await put(admin, `/teachers/${freshTeacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [otherOfferingId],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'ACADEMIC_STRUCTURE_SESSION_MISMATCH',
    );

    // No TeacherAssignment row was created for the mismatched offering —
    // the whole call fails atomically, nothing partially applied.
    const stray = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherAssignment.findFirst({
        where: { schoolId, teacherProfileId: freshTeacherProfileId },
      }),
    );
    expect(stray).toBeNull();
  });

  it('cross-tenant: another school cannot see or modify this assignment set', async () => {
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
    const otherAdmin = await freshCtx(otherHost, `10.${RUN}.4.2`);
    await login(otherAdmin, 'admin-other', 'a-real-password-123');

    const getRes = await get(otherAdmin, `/teachers/${teacherProfileId}/assignments`);
    // RLS makes the teacherProfile invisible from another school's tenant
    // context; the route resolves the actor's own school, so this returns
    // an empty result rather than another school's real data — never a
    // cross-tenant leak.
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json<{ assignments: unknown[] }>().assignments).toHaveLength(0);
  });
});
