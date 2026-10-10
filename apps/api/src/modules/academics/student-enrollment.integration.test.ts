/**
 * B6 — StudentEnrollment / StudentSubjectRegistration (ADR-0011). Mirrors
 * academics.integration.test.ts's own harness exactly.
 *
 * Covers: enroll into a session (DoD 2); move within a session preserves
 * the original enrollment, which a "historical exam" (proxied here by the
 * enrollment row itself, since no exam module exists yet) still reports
 * (DoD 3, 07 §35's worked example); a student cannot be enrolled twice
 * concurrently in one session — the sequential-request case (DoD 9; the
 * genuine concurrent-race case has its own file); auto-registration on
 * enroll and reconciliation on move (ADR-0011, DoD 10); deregister/
 * re-register; the roster endpoint; and ClassGroupService.delete()'s B6
 * extension (a class with a live enrollment cannot be hard-deleted).
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
import { registerEnrolledStudentsForOfferings } from './subject-registration-sync.util.js';

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
      name: `Enrollment Test School ${randomUUID()}`,
      subdomain: `enr-${randomUUID().slice(0, 8)}`,
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
      tx.studentSubjectRegistration.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.studentEnrollment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) => tx.classSubject.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.classGroup.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.subject.deleteMany({ where: { schoolId } }));
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
  // B10: audit_events (now append-only) cascades from School — this
  // module's own real endpoints write several action strings, so the
  // fixture schools here are genuinely, permanently undeletable. Best-
  // effort, matching every other affected file (safe-delete-schools.ts).
  await safeDeleteSchools(prisma, createdSchoolIds);
});

describe('B6 StudentEnrollment / StudentSubjectRegistration', () => {
  let schoolId: string;
  let host: string;
  let admin: RequestCtx;
  let sessionId: string;
  let classAId: string;
  let classBId: string;
  let mathSubjectId: string;
  let furtherMathSubjectId: string;
  let classAMathOfferingId: string;
  let classAFurtherMathOfferingId: string;
  let classBMathOfferingId: string;
  let studentProfileId: string;

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
    admin = await freshCtx(host, `10.${RUN}.3.1`);
    await login(admin, 'admin01', 'a-real-password-123');

    const sessionRes = await post(admin, '/academics/sessions', {
      name: `Enroll Session ${randomUUID().slice(0, 8)}`,
      startDate: '2026-09-01',
      endDate: '2027-07-31',
    });
    sessionId = sessionRes.json<{ id: string }>().id;

    const classARes = await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      name: 'SS2A',
      level: 'SS2',
      arm: 'A',
    });
    classAId = classARes.json<{ id: string }>().id;
    const classBRes = await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      name: 'SS2B',
      level: 'SS2',
      arm: 'B',
    });
    classBId = classBRes.json<{ id: string }>().id;

    const mathRes = await post(admin, '/academics/subjects', {
      name: 'Mathematics',
      code: `MTH-${randomUUID().slice(0, 6)}`,
    });
    mathSubjectId = mathRes.json<{ id: string }>().id;
    const furtherMathRes = await post(admin, '/academics/subjects', {
      name: 'Further Mathematics',
      code: `FMT-${randomUUID().slice(0, 6)}`,
    });
    furtherMathSubjectId = furtherMathRes.json<{ id: string }>().id;

    classAMathOfferingId = (
      await post(admin, `/academics/classes/${classAId}/subjects`, { subjectId: mathSubjectId })
    ).json<{ id: string }>().id;
    // Elective: SS2A offers Further Maths, SS2B does not — the exact ADR-0011 scenario.
    classAFurtherMathOfferingId = (
      await post(admin, `/academics/classes/${classAId}/subjects`, {
        subjectId: furtherMathSubjectId,
      })
    ).json<{ id: string }>().id;
    classBMathOfferingId = (
      await post(admin, `/academics/classes/${classBId}/subjects`, { subjectId: mathSubjectId })
    ).json<{ id: string }>().id;

    const studentRes = await post(admin, '/students', {
      firstName: 'Ahmed',
      lastName: 'Bello',
      studentId: `ST-${randomUUID().slice(0, 8)}`,
    });
    studentProfileId = studentRes.json<{ studentProfileId: string }>().studentProfileId;
  });

  let originalEnrollmentId: string;

  it('enrolls a student into a class for a session — session-scoped (DoD 2)', async () => {
    const res = await post(admin, `/students/${studentProfileId}/enrollments`, {
      academicSessionId: sessionId,
      classId: classAId,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ id: string; classId: string; status: string }>();
    originalEnrollmentId = body.id;
    expect(body.classId).toBe(classAId);
    expect(body.status).toBe('ACTIVE');
  });

  it('auto-registers the student for every ACTIVE ClassSubject of the class (ADR-0011)', async () => {
    const res = await get(admin, `/students/${studentProfileId}/subject-registrations`);
    expect(res.statusCode).toBe(200);
    const registrations = res.json<{
      registrations: { classSubjectId: string; status: string }[];
    }>().registrations;
    const classSubjectIds = registrations.map((r) => r.classSubjectId).sort();
    expect(classSubjectIds).toEqual([classAFurtherMathOfferingId, classAMathOfferingId].sort());
    expect(registrations.every((r) => r.status === 'REGISTERED')).toBe(true);
  });

  it('a re-submit of the same enrollment is idempotent, not a conflict', async () => {
    const res = await post(admin, `/students/${studentProfileId}/enrollments`, {
      academicSessionId: sessionId,
      classId: classAId,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }>().id).toBe(originalEnrollmentId);
  });

  it('appears on the class roster', async () => {
    const res = await get(admin, `/classes/${classAId}/students`);
    expect(res.statusCode).toBe(200);
    const students = res.json<{ students: { studentProfileId: string }[] }>().students;
    expect(students.some((s) => s.studentProfileId === studentProfileId)).toBe(true);
  });

  it('deregisters and re-registers the student from the elective (ADR-0011)', async () => {
    const deregisterRes = await post(
      admin,
      `/students/${studentProfileId}/subject-registrations/${classAFurtherMathOfferingId}/deregister`,
    );
    expect(deregisterRes.statusCode).toBe(200);
    expect(deregisterRes.json<{ status: string }>().status).toBe('DEREGISTERED');

    const listRes = await get(admin, `/students/${studentProfileId}/subject-registrations`);
    const registrations = listRes.json<{
      registrations: { classSubjectId: string; status: string }[];
    }>().registrations;
    expect(
      registrations.find((r) => r.classSubjectId === classAFurtherMathOfferingId)?.status,
    ).toBe('DEREGISTERED');

    const reRegisterRes = await post(
      admin,
      `/students/${studentProfileId}/subject-registrations/${classAFurtherMathOfferingId}/re-register`,
    );
    expect(reRegisterRes.statusCode).toBe(200);
    expect(reRegisterRes.json<{ status: string }>().status).toBe('REGISTERED');
  });

  it("moving to another class preserves the original enrollment — 07 §35's worked example (DoD 3)", async () => {
    const moveRes = await post(admin, `/students/${studentProfileId}/enrollments`, {
      academicSessionId: sessionId,
      classId: classBId,
    });
    expect(moveRes.statusCode).toBe(200);
    const newEnrollment = moveRes.json<{ id: string; classId: string; status: string }>();
    expect(newEnrollment.classId).toBe(classBId);
    expect(newEnrollment.id).not.toBe(originalEnrollmentId);

    // The old enrollment is never overwritten — it's closed, not deleted,
    // and still reports the original class.
    const original = await withTenant(prisma, schoolId, (tx) =>
      tx.studentEnrollment.findUnique({ where: { id: originalEnrollmentId } }),
    );
    expect(original?.status).toBe('TRANSFERRED');
    expect(original?.classId).toBe(classAId);

    // The roster for the OLD class still lists the student for historical
    // purposes via that closed enrollment row — it simply never shows in
    // the CURRENT roster query (ACTIVE only).
    const oldRoster = await get(admin, `/classes/${classAId}/students`);
    expect(
      oldRoster
        .json<{ students: { studentProfileId: string }[] }>()
        .students.some((s) => s.studentProfileId === studentProfileId),
    ).toBe(false);
    const newRoster = await get(admin, `/classes/${classBId}/students`);
    expect(
      newRoster
        .json<{ students: { studentProfileId: string }[] }>()
        .students.some((s) => s.studentProfileId === studentProfileId),
    ).toBe(true);
  });

  it("reconciles registrations on move: new class's offerings only, old registrations untouched (ADR-0011)", async () => {
    const listRes = await get(admin, `/students/${studentProfileId}/subject-registrations`);
    const registrations = listRes.json<{
      registrations: { classSubjectId: string; status: string }[];
    }>().registrations;
    // The new (SS2B) enrollment only offers Mathematics — no Further Maths
    // registration exists for it (SS2B doesn't offer that subject).
    expect(registrations.map((r) => r.classSubjectId)).toEqual([classBMathOfferingId]);

    // The OLD enrollment's own registrations (including the re-registered
    // Further Maths one) are still there, historically, tied to the old
    // enrollment row — never deleted, never rewritten.
    const oldRegistrations = await withTenant(prisma, schoolId, (tx) =>
      tx.studentSubjectRegistration.findMany({
        where: { schoolId, studentEnrollmentId: originalEnrollmentId },
      }),
    );
    expect(oldRegistrations).toHaveLength(2);
  });

  it('a student cannot be enrolled twice concurrently in one session — sequential case (DoD 9)', async () => {
    const otherStudentRes = await post(admin, '/students', {
      firstName: 'Bola',
      lastName: 'Ade',
      studentId: `ST-${randomUUID().slice(0, 8)}`,
    });
    const otherStudentProfileId = otherStudentRes.json<{ studentProfileId: string }>()
      .studentProfileId;
    const first = await post(admin, `/students/${otherStudentProfileId}/enrollments`, {
      academicSessionId: sessionId,
      classId: classAId,
    });
    expect(first.statusCode).toBe(200);
    // Same student, same session, different class, WITHOUT going through
    // the normal move logic — simulated directly at the DB layer by
    // creating a second raw ACTIVE row, to prove the partial unique index
    // itself (not just the service's own move logic) rejects it.
    await expect(
      withTenant(prisma, schoolId, (tx) =>
        tx.studentEnrollment.create({
          data: {
            schoolId,
            studentProfileId: otherStudentProfileId,
            academicSessionId: sessionId,
            classId: classBId,
            startDate: new Date(),
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('a subject offered after students are enrolled registers those students (ADR-0011)', async () => {
    const classRes = await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      name: 'SS2C',
      level: 'SS2',
      arm: 'C',
    });
    const classCId = classRes.json<{ id: string }>().id;
    const studentRes = await post(admin, '/students', {
      firstName: 'Chidi',
      lastName: 'Okeke',
      studentId: `ST-${randomUUID().slice(0, 8)}`,
    });
    const lateStudentProfileId = studentRes.json<{ studentProfileId: string }>().studentProfileId;
    const enrollRes = await post(admin, `/students/${lateStudentProfileId}/enrollments`, {
      academicSessionId: sessionId,
      classId: classCId,
    });
    expect(enrollRes.statusCode).toBe(200);

    // Enrolled into a class with no subjects yet: nothing to register.
    const before = await get(admin, `/students/${lateStudentProfileId}/subject-registrations`);
    expect(before.json<{ registrations: unknown[] }>().registrations).toEqual([]);

    const offeringRes = await post(admin, `/academics/classes/${classCId}/subjects`, {
      subjectId: mathSubjectId,
    });
    expect(offeringRes.statusCode).toBe(201);
    const offeringId = offeringRes.json<{ id: string }>().id;

    const after = await get(admin, `/students/${lateStudentProfileId}/subject-registrations`);
    const registrations = after.json<{
      registrations: { classSubjectId: string; status: string }[];
    }>().registrations;
    expect(registrations).toEqual([
      expect.objectContaining({ classSubjectId: offeringId, status: 'REGISTERED' }),
    ]);
  });

  it('the registration backfill fills gaps but leaves a deregistration standing', async () => {
    const classRes = await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      name: 'SS2D',
      level: 'SS2',
      arm: 'D',
    });
    const classDId = classRes.json<{ id: string }>().id;
    const mathOfferingId = (
      await post(admin, `/academics/classes/${classDId}/subjects`, { subjectId: mathSubjectId })
    ).json<{ id: string }>().id;
    const furtherMathOfferingId = (
      await post(admin, `/academics/classes/${classDId}/subjects`, {
        subjectId: furtherMathSubjectId,
      })
    ).json<{ id: string }>().id;
    const studentRes = await post(admin, '/students', {
      firstName: 'Dayo',
      lastName: 'Ige',
      studentId: `ST-${randomUUID().slice(0, 8)}`,
    });
    const profileId = studentRes.json<{ studentProfileId: string }>().studentProfileId;
    await post(admin, `/students/${profileId}/enrollments`, {
      academicSessionId: sessionId,
      classId: classDId,
    });
    await post(
      admin,
      `/students/${profileId}/subject-registrations/${furtherMathOfferingId}/deregister`,
    );
    // Simulate the pre-fix gap: the Mathematics registration was never written.
    await withTenant(prisma, schoolId, (tx) =>
      tx.studentSubjectRegistration.deleteMany({
        where: { schoolId, classSubjectId: mathOfferingId },
      }),
    );

    const created = await withTenant(prisma, schoolId, (tx) =>
      registerEnrolledStudentsForOfferings(tx, schoolId),
    );
    expect(created).toBe(1);
    const again = await withTenant(prisma, schoolId, (tx) =>
      registerEnrolledStudentsForOfferings(tx, schoolId),
    );
    expect(again).toBe(0);

    const res = await get(admin, `/students/${profileId}/subject-registrations`);
    const byOffering = Object.fromEntries(
      res
        .json<{ registrations: { classSubjectId: string; status: string }[] }>()
        .registrations.map((r) => [r.classSubjectId, r.status]),
    );
    expect(byOffering).toEqual({
      [mathOfferingId]: 'REGISTERED',
      [furtherMathOfferingId]: 'DEREGISTERED',
    });
  });

  it("ClassGroupService.delete()'s B6 extension: a class with a live enrollment cannot be hard-deleted", async () => {
    const res = await del(admin, `/academics/classes/${classBId}`);
    expect(res.statusCode).toBe(409);
    const body = res.json<{ error: { details?: { dependents?: Record<string, number> } } }>();
    expect(body.error.details?.dependents?.['student enrollment']).toBeGreaterThan(0);
  });
});
