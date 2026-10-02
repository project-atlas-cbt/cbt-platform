/**
 * SA-04 §8 gap-closure (the B3/F3 school-detail sub-screens): `GET
 * /platform/schools/:id`'s `usage` counts, `GET /platform/schools/:id/users`,
 * and `GET /platform/schools/:id/exams` — end to end over real HTTP against
 * the real AppModule and real Postgres (RLS included), following
 * platform.integration.test.ts's own precedent (boot AppModule, seed
 * directly via the shared `prisma` singleton inside `withTenant`, drive via
 * `app.inject()`).
 *
 * Fixtures write real academic rows (sessions/terms/subjects/classes/exams/
 * exam sessions/attempts) so the assertions that follow prove the endpoints
 * return *live* persisted data — a Usage tile that reports real Exam and
 * ExamAttempt counts instead of phantom `0`s, a users directory with real
 * memberships, and an exams directory with real exam rows — and that every
 * read stays inside its own school (ADR-0023's `FORCE ROW LEVEL SECURITY`).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { safeDeleteSchools } from '../../test-support/safe-delete-schools.js';
import { AppModule } from '../../app.module.js';
import { PasswordService } from '../identity/password.service.js';
import {
  grantSoftwareAdmin,
  ownerPrisma,
  revokeSoftwareAdminFixtures,
} from '../../test-support/owner-prisma.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
const ADMIN_HOST = `admin.${ROOT_DOMAIN}`;
const RUN = Math.floor(Math.random() * 200) + 1;

let app: NestFastifyApplication;
const passwords = new PasswordService();

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];
const createdPlatformUserIds: string[] = [];

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    // Best-effort per school: a leftover row that refuses deletion (e.g. a
    // B11 trigger) must never abort the rest of the teardown. Order matters —
    // `exam_class`/`exam` rows are locked once an exam leaves DRAFT; deleting
    // the exam first lets its own cascade clear the class rows (the trigger
    // explicitly allows that), while attempts/sessions go first because they
    // RESTRICT on the exam.
    try {
      // B20: atlas_app holds no DELETE on academic evidence (exam_attempts —
      // packages/db/src/privileges.ts); fixture teardown is an owner action.
      await ownerPrisma().$transaction(async (tx) => {
        await tx.examAttempt.deleteMany({ where: { schoolId } });
        await tx.examSession.deleteMany({ where: { schoolId } });
        await tx.exam.deleteMany({ where: { schoolId } });
        await tx.roleAssignment.deleteMany({ where: { schoolId } });
        await tx.schoolMembership.deleteMany({ where: { schoolId } });
      });
    } catch {
      // safeDeleteSchools below is the last line of defence.
    }
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.platformSession.deleteMany({ where: { userId: { in: createdPlatformUserIds } } });
  await revokeSoftwareAdminFixtures(createdPlatformUserIds);
  await prisma.user.deleteMany({ where: { id: { in: createdPlatformUserIds } } });
  await safeDeleteSchools(prisma, createdSchoolIds);
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
  platformSessionCookie?: string;
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
  if (ctx.platformSessionCookie) parts.push(`atlas_platform_session=${ctx.platformSessionCookie}`);
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
      'content-type': 'application/json',
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

async function loginPlatform(ctx: RequestCtx, email: string, password: string) {
  const res = await post(ctx, '/platform/auth/login', { email, password });
  if (res.statusCode === 200) {
    const sessionCookie = extractCookie(res.headers['set-cookie'], 'atlas_platform_session');
    if (sessionCookie) ctx.platformSessionCookie = sessionCookie;
  }
  return res;
}

async function seedPlatformAdmin(): Promise<{ userId: string; email: string; password: string }> {
  const email = `dir-platform-${randomUUID().slice(0, 8)}@example.com`;
  const password = 'a-real-platform-password-123';
  const passwordHash = await passwords.hash(password);
  const user = await prisma.user.create({
    data: {
      firstName: 'Platform',
      lastName: 'Admin',
      displayName: 'Platform Admin',
      email,
      passwordHash,
      status: 'ACTIVE',
      credentialState: 'OK',
    },
  });
  // B20: platform authority is owner-provisioned; atlas_app can't write it.
  await grantSoftwareAdmin(user.id);
  createdPlatformUserIds.push(user.id);
  return { userId: user.id, email, password };
}

async function createSchool(label: string): Promise<string> {
  const school = await prisma.school.create({
    data: {
      name: `${label} School ${randomUUID().slice(0, 8)}`,
      subdomain: `dir-${label}-${randomUUID().slice(0, 8)}`.toLowerCase(),
    },
  });
  createdSchoolIds.push(school.id);
  return school.id;
}

/** One member: a User (optionally with an email and a login-able password),
 * a SchoolMembership, and its RoleAssignment rows. Returns the membership id
 * (the exam `createdByMembershipId` / session `openedByMembershipId` target). */
async function addMember({
  schoolId,
  firstName,
  lastName,
  loginIdentifier,
  email,
  userStatus = 'ACTIVE',
  membershipStatus = 'ACTIVE',
  roles,
  joinedAt,
}: {
  schoolId: string;
  firstName: string;
  lastName: string;
  loginIdentifier: string;
  email?: string;
  userStatus?: 'INVITED' | 'ACTIVE';
  membershipStatus?: 'PENDING' | 'ACTIVE';
  roles: Role[];
  joinedAt?: Date;
}) {
  return withTenant(prisma, schoolId, async (tx) => {
    const user = await tx.user.create({
      data: {
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        ...(email ? { email } : {}),
        status: userStatus,
      },
    });
    createdUserIds.push(user.id);
    const membership = await tx.schoolMembership.create({
      data: {
        schoolId,
        userId: user.id,
        loginIdentifier,
        status: membershipStatus,
        joinedAt: joinedAt ?? new Date(),
      },
      include: { user: true },
    });
    for (const role of roles) {
      await tx.roleAssignment.create({ data: { schoolId, membershipId: membership.id, role } });
    }
    return membership.id;
  });
}

/** The directory fixture — live academic rows so usage/exams return real
 *  data. Creates session/term/subject/class/classSubject, N exams (with a
 *  session + 1 attempt against the final one), and returns the pieces tests
 *  need. */
async function seedAcademicData({
  schoolId,
  creatorMembershipId,
  studentMembershipId,
  exams,
  attemptCount = 1,
}: {
  schoolId: string;
  creatorMembershipId: string;
  studentMembershipId: string;
  exams: Array<{ title: string; status: 'DRAFT' | 'OPEN'; createdAt: Date }>;
  attemptCount?: number;
}) {
  return withTenant(prisma, schoolId, async (tx) => {
    const session = await tx.academicSession.create({
      data: {
        schoolId,
        name: '2026/2027',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-31'),
        status: 'CURRENT',
      },
    });
    const term = await tx.academicTerm.create({
      data: {
        schoolId,
        academicSessionId: session.id,
        name: 'Term 1',
        sequence: 1,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-18'),
      },
    });
    const subject = await tx.subject.create({
      data: { schoolId, name: 'Mathematics', code: `MATH-${randomUUID().slice(0, 4)}` },
    });
    const cls = await tx.classGroup.create({
      data: { schoolId, academicSessionId: session.id, name: 'SS2A', level: 'SS2', arm: 'A' },
    });
    const classSubject = await tx.classSubject.create({
      data: { schoolId, classId: cls.id, subjectId: subject.id, academicSessionId: session.id },
    });

    const studentProfile = await tx.studentProfile.create({
      data: {
        schoolId,
        membershipId: studentMembershipId,
        studentId: `ST-${randomUUID().slice(0, 8)}`,
      },
    });

    const rows: Array<{ id: string; title: string; status: string }> = [];
    for (const exam of exams) {
      // Created DRAFT so the B11 trigger that locks `exam_classes` once an
      // exam leaves DRAFT (DoD item 6 — "targeted classes are frozen at
      // publish") never fires; the OPEN fixtures are transitioned afterwards.
      const created = await tx.exam.create({
        data: {
          schoolId,
          academicSessionId: session.id,
          academicTermId: term.id,
          subjectId: subject.id,
          departmentId: null,
          title: exam.title,
          examType: 'TERM',
          durationSeconds: 1800,
          resultPolicy: 'AUTOMATIC',
          resultDetailVisibility: 'SCORE_ONLY',
          status: 'DRAFT',
          createdByMembershipId: creatorMembershipId,
          createdAt: exam.createdAt,
        },
      });
      await tx.examClass.create({
        data: { schoolId, examId: created.id, classSubjectId: classSubject.id },
      });
      if (exam.status === 'OPEN') {
        await tx.exam.update({
          where: { id: created.id },
          data: { status: 'OPEN', updatedAt: exam.createdAt },
        });
      }
      rows.push({ id: created.id, title: created.title, status: created.status });
    }

    const latest = rows[rows.length - 1]!;
    const examSession = await tx.examSession.create({
      data: {
        schoolId,
        examId: latest.id,
        openedByMembershipId: creatorMembershipId,
      },
    });
    for (let n = 1; n <= attemptCount; n++) {
      await tx.examAttempt.create({
        data: {
          schoolId,
          examId: latest.id,
          examSessionId: examSession.id,
          studentProfileId: studentProfile.id,
          attemptNumber: n,
          durationGrantedSeconds: 1800,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          // The B13 partial unique `exam_attempts_active_unique` permits only
          // one IN_PROGRESS attempt per (school, exam, student); extra
          // fixtures must be terminal (SUBMITTED) rows to sit alongside it.
          ...(n > 1 ? { state: 'SUBMITTED' as const, submittedAt: new Date() } : {}),
        },
      });
    }

    return { sessionId: session.id, termId: term.id, subjectId: subject.id, classId: cls.id };
  });
}

describe('Platform school directory — SA-04 §8 (B3/F3 gap closure)', () => {
  const run = `8${String(RUN).padStart(3, '0')}`;
  let platformCtx: RequestCtx;

  // School A: the "rich" directory fixture.
  let schoolAId: string;
  let adaMembershipId: string;
  let alanMembershipId: string;

  // School B: the isolation fixture (teacher + student, 1 exam, 1 attempt).
  let schoolBId: string;
  let bobMembershipId: string;

  beforeAll(async () => {
    // Deterministic timestamps so ordering assertions can't pass by accident
    // of insertion: exam E1 is a day older than E2, and members get distinct
    // joinedAt values for the default joinedAt-desc ordering.
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const halfHourAgo = new Date(now.getTime() - 30 * 60 * 1000);

    const platformAdmin = await seedPlatformAdmin();
    platformCtx = await freshCtx(ADMIN_HOST, `10.${run}.1`);
    await loginPlatform(platformCtx, platformAdmin.email, platformAdmin.password);

    schoolAId = await createSchool(`Alpha-${run}`);

    adaMembershipId = await addMember({
      schoolId: schoolAId,
      firstName: 'Ada',
      lastName: 'Lovelace',
      loginIdentifier: `ada-${run}`,
      email: `ada-${run}@example.com`,
      roles: ['TEACHER'],
      joinedAt: dayAgo,
    });
    await addMember({
      schoolId: schoolAId,
      firstName: 'Grace',
      lastName: 'Hopper',
      loginIdentifier: `grace-${run}`,
      email: `grace-${run}@example.com`,
      roles: ['TEACHER', 'HOD'],
      joinedAt: twoHoursAgo,
    });
    alanMembershipId = await addMember({
      schoolId: schoolAId,
      firstName: 'Alan',
      lastName: 'Turing',
      loginIdentifier: `alan-${run}`,
      roles: ['STUDENT'],
      joinedAt: oneHourAgo,
    });
    await addMember({
      schoolId: schoolAId,
      firstName: 'Linus',
      lastName: 'Torvalds',
      loginIdentifier: `linus-${run}`,
      email: `linus-${run}@example.com`,
      userStatus: 'INVITED',
      membershipStatus: 'PENDING',
      roles: ['SCHOOL_ADMIN'],
      joinedAt: halfHourAgo,
    });

    await seedAcademicData({
      schoolId: schoolAId,
      creatorMembershipId: adaMembershipId,
      studentMembershipId: alanMembershipId,
      exams: [
        { title: 'Midterm Mathematics', status: 'DRAFT', createdAt: dayAgo },
        { title: 'Final Examination', status: 'OPEN', createdAt: now },
      ],
      attemptCount: 2,
    });

    schoolBId = await createSchool(`Bravo-${run}`);
    bobMembershipId = await addMember({
      schoolId: schoolBId,
      firstName: 'Bob',
      lastName: 'Johnson',
      loginIdentifier: `bob-${run}`,
      email: `bob-${run}@example.com`,
      roles: ['TEACHER'],
    });
    const bCarol = await addMember({
      schoolId: schoolBId,
      firstName: 'Carol',
      lastName: 'Williams',
      loginIdentifier: `carol-${run}`,
      roles: ['STUDENT'],
    });
    await seedAcademicData({
      schoolId: schoolBId,
      creatorMembershipId: bobMembershipId,
      studentMembershipId: bCarol,
      exams: [{ title: 'Physics Quiz', status: 'OPEN', createdAt: now }],
    });
  });

  describe('detail — usage counts', () => {
    it('reports real Exam/ExamAttempt counts (and role counts), not phantom 0s', async () => {
      const res = await get(platformCtx, `/platform/schools/${schoolAId}`);
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        usage: { students: number; teachers: number; exams: number; attempts: number };
      }>();
      expect(body.usage).toEqual({ students: 1, teachers: 2, exams: 2, attempts: 2 });
    });

    it('is per-school — usage never bleeds across schools', async () => {
      const res = await get(platformCtx, `/platform/schools/${schoolBId}`);
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        usage: { students: number; teachers: number; exams: number; attempts: number };
      }>();
      expect(body.usage).toEqual({ students: 1, teachers: 1, exams: 1, attempts: 1 });
    });
  });

  describe('GET /platform/schools/:id/users', () => {
    it("returns every member once (multi-role members show all roles) and never leaks credential fields or another school's people", async () => {
      const res = await get(platformCtx, `/platform/schools/${schoolAId}/users`);
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        total: number;
        users: Array<Record<string, unknown>>;
      }>();
      expect(body.total).toBe(4);
      // Default ordering is joinedAt desc — fixture joinedAt values are
      // distinct (Linus newest, then Alan, Grace, Ada oldest).
      expect(body.users.map((u) => (u as { displayName: string }).displayName)).toEqual([
        'Linus Torvalds',
        'Alan Turing',
        'Grace Hopper',
        'Ada Lovelace',
      ]);
      for (const userRow of body.users) {
        // The safe-field contract: password/credential/session data is never
        // selected, period.
        expect(
          userRow,
          `row leaked restricted fields: ${JSON.stringify(userRow)}`,
        ).not.toHaveProperty('passwordHash');
        expect(userRow).not.toHaveProperty('credentialState');
        expect(userRow).not.toHaveProperty('sessions');
      }

      const grace = body.users.find(
        (u) => (u as { displayName: string }).displayName === 'Grace Hopper',
      );
      expect(grace).toBeDefined();
      expect((grace as { roles: string[] }).roles).toEqual(['TEACHER', 'HOD']);
      expect((grace as { email: string }).email).toContain('@example.com');

      // ADR-0019: students carry no institutional email.
      const alan = body.users.find(
        (u) => (u as { displayName: string }).displayName === 'Alan Turing',
      );
      expect((alan as { email: string | null }).email).toBeNull();

      // School B never leaks into A's directory.
      const bNames = body.users.map((u) => (u as { displayName: string }).displayName);
      expect(bNames).not.toContain('Bob Johnson');
      expect(bNames).not.toContain('Carol Williams');
    });

    it('filters by q case-insensitively across name and login identifier', async () => {
      const res = await get(platformCtx, `/platform/schools/${schoolAId}/users?q=hopper`);
      expect(res.statusCode).toBe(200);
      const body = res.json<{ total: number; users: Array<{ displayName: string }> }>();
      expect(body.total).toBe(1);
      expect(body.users[0]?.displayName).toBe('Grace Hopper');

      const byLogin = await get(platformCtx, `/platform/schools/${schoolAId}/users?q=linus`);
      const body2 = byLogin.json<{ total: number; users: Array<{ displayName: string }> }>();
      expect(body2.users[0]?.displayName).toBe('Linus Torvalds');
    });

    it('filters by role against ACTIVE role assignments only', async () => {
      const res = await get(platformCtx, `/platform/schools/${schoolAId}/users?role=TEACHER`);
      const body = res.json<{ total: number; users: Array<{ displayName: string }> }>();
      expect(body.total).toBe(2);
      // Default ordering (joinedAt desc): Grace joined after Ada.
      expect(body.users.map((u) => u.displayName)).toEqual(['Grace Hopper', 'Ada Lovelace']);

      const hod = await get(platformCtx, `/platform/schools/${schoolAId}/users?role=HOD`);
      const body2 = hod.json<{ total: number; users: Array<{ displayName: string }> }>();
      expect(body2.total).toBe(1);
      expect(body2.users[0]?.displayName).toBe('Grace Hopper');
    });

    it('filters by user status and reports membership status', async () => {
      const res = await get(platformCtx, `/platform/schools/${schoolAId}/users?status=INVITED`);
      const body = res.json<{
        users: Array<{ displayName: string; userStatus: string; membershipStatus: string }>;
      }>();
      expect(body.users).toHaveLength(1);
      expect(body.users[0]?.displayName).toBe('Linus Torvalds');
      expect(body.users[0]?.userStatus).toBe('INVITED');
      expect(body.users[0]?.membershipStatus).toBe('PENDING');

      const active = await get(platformCtx, `/platform/schools/${schoolAId}/users?status=ACTIVE`);
      const body2 = active.json<{ total: number }>();
      expect(body2.total).toBe(3);
    });

    it('paginates and sorts by lastName', async () => {
      const res = await get(
        platformCtx,
        `/platform/schools/${schoolAId}/users?pageSize=2&page=1&sortBy=lastName&sortDir=asc`,
      );
      const body = res.json<{
        page: number;
        pageSize: number;
        total: number;
        users: Array<{ displayName: string }>;
      }>();
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(2);
      expect(body.total).toBe(4);
      expect(body.users.map((u) => u.displayName)).toEqual(['Grace Hopper', 'Ada Lovelace']);

      const page2 = await get(
        platformCtx,
        `/platform/schools/${schoolAId}/users?pageSize=2&page=2&sortBy=lastName&sortDir=asc`,
      );
      const body2 = page2.json<{ users: Array<{ displayName: string }> }>();
      expect(body2.users.map((u) => u.displayName)).toEqual(['Linus Torvalds', 'Alan Turing']);
    });

    it('404s for an unknown school', async () => {
      const res = await get(platformCtx, `/platform/schools/${randomUUID()}/users`);
      expect(res.statusCode).toBe(404);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /platform/schools/:id/exams', () => {
    it("lists the school's real exams, newest first, with mapped session/term/subject/creator/classes", async () => {
      const res = await get(platformCtx, `/platform/schools/${schoolAId}/exams`);
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        total: number;
        exams: Array<{
          id: string;
          title: string;
          status: string;
          subjectName: string;
          sessionName: string;
          termName: string;
          createdByName: string;
          classes: Array<{ className: string }>;
          createdAt: string;
        }>;
      }>();
      expect(body.total).toBe(2);
      expect(body.exams.map((e) => e.title)).toEqual(['Final Examination', 'Midterm Mathematics']);
      const final = body.exams[0]!;
      expect(final.status).toBe('OPEN');
      expect(final.subjectName).toBe('Mathematics');
      expect(final.sessionName).toBe('2026/2027');
      expect(final.termName).toBe('Term 1');
      expect(final.createdByName).toBe('Ada Lovelace');
      expect(final.classes.map((c) => c.className)).toEqual(['SS2A']);
    });

    it('filters by status', async () => {
      const open = await get(platformCtx, `/platform/schools/${schoolAId}/exams?status=OPEN`);
      const body = open.json<{ total: number; exams: Array<{ title: string }> }>();
      expect(body.total).toBe(1);
      expect(body.exams[0]?.title).toBe('Final Examination');

      const draft = await get(platformCtx, `/platform/schools/${schoolAId}/exams?status=DRAFT`);
      const body2 = draft.json<{ total: number; exams: Array<{ title: string }> }>();
      expect(body2.total).toBe(1);
      expect(body2.exams[0]?.title).toBe('Midterm Mathematics');
    });

    it('paginates', async () => {
      const page1 = await get(
        platformCtx,
        `/platform/schools/${schoolAId}/exams?pageSize=1&page=1`,
      );
      const body1 = page1.json<{
        page: number;
        pageSize: number;
        total: number;
        exams: Array<{ title: string }>;
      }>();
      expect(body1.page).toBe(1);
      expect(body1.pageSize).toBe(1);
      expect(body1.total).toBe(2);
      expect(body1.exams[0]?.title).toBe('Final Examination');

      const page2 = await get(
        platformCtx,
        `/platform/schools/${schoolAId}/exams?pageSize=1&page=2`,
      );
      const body2 = page2.json<{ exams: Array<{ title: string }> }>();
      expect(body2.exams[0]?.title).toBe('Midterm Mathematics');
    });

    it('404s for an unknown school', async () => {
      const res = await get(platformCtx, `/platform/schools/${randomUUID()}/exams`);
      expect(res.statusCode).toBe(404);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
    });
  });

  describe('tenant isolation (ADR-0023)', () => {
    it('school A queries never return school B rows, and vice versa', async () => {
      const aUsers = await get(platformCtx, `/platform/schools/${schoolAId}/users`);
      const aBody = aUsers.json<{ users: Array<{ displayName: string }> }>();
      expect(aBody.users.map((u) => u.displayName)).not.toContain('Bob Johnson');

      const aExams = await get(platformCtx, `/platform/schools/${schoolAId}/exams`);
      const aExamBody = aExams.json<{ exams: Array<{ title: string }> }>();
      expect(aExamBody.exams.map((e) => e.title)).not.toContain('Physics Quiz');

      const bUsers = await get(platformCtx, `/platform/schools/${schoolBId}/users`);
      const bBody = bUsers.json<{ total: number; users: Array<{ displayName: string }> }>();
      expect(bBody.total).toBe(2);
      expect(bBody.users.map((u) => u.displayName)).not.toContain('Ada Lovelace');

      const bExams = await get(platformCtx, `/platform/schools/${schoolBId}/exams`);
      const bExamBody = bExams.json<{ exams: Array<{ title: string }> }>();
      expect(bExamBody.exams.map((e) => e.title)).toEqual(['Physics Quiz']);
    });

    it("usage counts are per-school (school B has 1 exam, not A's 2)", async () => {
      const res = await get(platformCtx, `/platform/schools/${schoolBId}`);
      const body = res.json<{ usage: { exams: number } }>();
      expect(body.usage.exams).toBe(1);
    });
  });

  describe('auth boundaries', () => {
    it('rejects unauthenticated requests', async () => {
      const ctx = await freshCtx(ADMIN_HOST, `10.${run}.2`);
      const usersRes = await get(ctx, `/platform/schools/${schoolAId}/users`);
      expect(usersRes.statusCode).toBe(401);
      const examsRes = await get(ctx, `/platform/schools/${schoolAId}/exams`);
      expect(examsRes.statusCode).toBe(401);
    });

    it('rejects a school-scoped session — PlatformAuthGuard only honors atom_platform_session', async () => {
      // Create a school whose admin has a real, login-able password and an
      // ACTIVE subscription, then log in as that school admin on the school
      // host to obtain a genuine school (atlas_session) cookie.
      const schoolId = await createSchool(`Charlie-${run}`);
      const host = `${(await prisma.school.findUniqueOrThrow({ where: { id: schoolId } })).subdomain}.${ROOT_DOMAIN}`;
      const password = 'school-admin-password-123';
      await withTenant(prisma, schoolId, async (tx) => {
        const admin = await tx.user.create({
          data: {
            firstName: 'Dora',
            lastName: 'Admin',
            displayName: 'Dora Admin',
            email: `dora-${run}@example.com`,
            passwordHash: await passwords.hash(password),
            status: 'ACTIVE',
            credentialState: 'OK',
          },
        });
        createdUserIds.push(admin.id);
        const membership = await tx.schoolMembership.create({
          data: {
            schoolId,
            userId: admin.id,
            loginIdentifier: `dora-${run}`,
            status: 'ACTIVE',
          },
        });
        await tx.roleAssignment.create({
          data: { schoolId, membershipId: membership.id, role: 'SCHOOL_ADMIN' },
        });
        await tx.subscription.create({
          data: {
            schoolId,
            plan: 'STANDARD',
            startAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: 'ACTIVE',
          },
        });
      });

      const schoolCtx = await freshCtx(host, `10.${run}.3`);
      const login = await post(schoolCtx, '/auth/login', {
        identifier: `dora-${run}`,
        password,
      });
      expect(login.statusCode, login.body).toBe(200);
      const sessionCookie = extractCookie(login.headers['set-cookie'], 'atlas_session');
      if (!sessionCookie) throw new Error('school login did not set an atlas_session cookie');

      // Present that genuine school session against the platform API — it
      // must be rejected (different cookie namespace, no platform session).
      const schoolCtxOnAdminHost: RequestCtx = {
        ...(await freshCtx(ADMIN_HOST, `10.${run}.4`)),
        sessionCookie,
      };
      const usersRes = await get(schoolCtxOnAdminHost, `/platform/schools/${schoolAId}/users`);
      expect(usersRes.statusCode).toBe(401);
      const examsRes = await get(schoolCtxOnAdminHost, `/platform/schools/${schoolAId}/exams`);
      expect(examsRes.statusCode).toBe(401);
    });
  });
});
