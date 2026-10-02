import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppModule } from '../app.module.js';
import { PasswordService } from '../modules/identity/password.service.js';
import { registerHttpSecurity } from '../security/http-security.js';
import { grantSoftwareAdmin, ownerPrisma, revokeSoftwareAdminFixtures } from './owner-prisma.js';
import { safeDeleteSchools } from './safe-delete-schools.js';

/**
 * B20 shared fixture for the security suites (tenant isolation, privilege
 * escalation, sessions, injection, uploads) — one place that knows how to
 * build a realistic school, sign in as each of the six roles, and harvest
 * every id a second school owns. Previously every integration file grew its
 * own seedUser/login helpers; the security suites need all of them at once.
 */
export const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
export const ADMIN_HOST = `admin.${ROOT_DOMAIN}`;
export const SCHOOL_ROLES: Exclude<Role, 'SOFTWARE_ADMIN'>[] = [
  'SCHOOL_ADMIN',
  'MODERATOR',
  'HOD',
  'TEACHER',
  'STUDENT',
];
const PASSWORD = 'security-suite-password-123';
const passwords = new PasswordService();

/** Random per process — the fake client IPs never collide with a previous
 * run's throttle counters in a long-lived dev Redis. */
const RUN = Math.floor(Math.random() * 200) + 1;
let ipCounter = 1;
export const nextIp = () =>
  `10.${RUN}.${Math.floor(ipCounter / 250) % 250}.${(ipCounter++ % 250) + 1}`;

export async function bootSecurityApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await registerHttpSecurity(app, {
    isProduction: false,
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    rootDomain: ROOT_DOMAIN,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export function extractCookie(
  setCookie: string | string[] | undefined,
  name: string,
): string | undefined {
  const headers = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const header of headers) {
    const value = parseCookie(header.split(';')[0] ?? '')[name];
    if (value) return value;
  }
  return undefined;
}

export interface RoleUser {
  userId: string;
  membershipId: string;
  identifier: string;
}

export interface FixtureSchool {
  schoolId: string;
  subdomain: string;
  host: string;
  users: Record<Exclude<Role, 'SOFTWARE_ADMIN'>, RoleUser>;
}

/** A request context: everything needed to call the API as one principal. */
export interface Ctx {
  host: string;
  ip: string;
  csrfCookie: string;
  csrfToken: string;
  sessionCookieName?: 'atlas_session' | 'atlas_platform_session';
  sessionCookie?: string;
}

export function cookieHeader(ctx: Ctx): string {
  const parts = [`_csrf=${ctx.csrfCookie}`];
  if (ctx.sessionCookie && ctx.sessionCookieName) {
    parts.push(`${ctx.sessionCookieName}=${ctx.sessionCookie}`);
  }
  return parts.join('; ');
}

export async function csrfContext(app: NestFastifyApplication, host: string): Promise<Ctx> {
  const ip = nextIp();
  const res = await app.inject({
    method: 'GET',
    url: '/tenant/resolve',
    headers: { host },
    remoteAddress: ip,
  });
  const csrfCookie = extractCookie(res.headers['set-cookie'], '_csrf');
  const csrfToken = res.json<{ csrfToken: string }>().csrfToken;
  if (!csrfCookie || !csrfToken) throw new Error(`no CSRF context for ${host}`);
  return { host, ip, csrfCookie, csrfToken };
}

export async function call(
  app: NestFastifyApplication,
  ctx: Ctx,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
) {
  return app.inject({
    method,
    url,
    headers: {
      host: ctx.host,
      cookie: cookieHeader(ctx),
      'x-csrf-token': ctx.csrfToken,
      ...(payload !== undefined && { 'content-type': 'application/json' }),
    },
    ...(payload !== undefined && { payload: payload as Record<string, unknown> }),
    remoteAddress: ctx.ip,
  });
}

export class SecurityFixture {
  readonly schoolIds: string[] = [];
  readonly userIds: string[] = [];
  readonly platformUserIds: string[] = [];

  async createSchool(label: string): Promise<FixtureSchool> {
    const suffix = randomUUID().slice(0, 8);
    const subdomain = `sec-${label}-${suffix}`;
    const school = await prisma.school.create({
      data: { name: `Security ${label} ${suffix}`, subdomain },
    });
    this.schoolIds.push(school.id);
    const passwordHash = await passwords.hash(PASSWORD);

    const users = {} as FixtureSchool['users'];
    for (const role of SCHOOL_ROLES) {
      const identifier = `${role.toLowerCase()}-${suffix}`;
      const user = await prisma.user.create({
        data: {
          firstName: role,
          lastName: label,
          displayName: `${role} ${label}`,
          ...(role !== 'STUDENT' && { email: `${identifier}@example.test` }),
          passwordHash,
          status: 'ACTIVE',
          credentialState: 'OK',
        },
      });
      this.userIds.push(user.id);
      const membershipId = await withTenant(prisma, school.id, async (tx) => {
        const membership = await tx.schoolMembership.create({
          data: {
            schoolId: school.id,
            userId: user.id,
            loginIdentifier: identifier,
            status: 'ACTIVE',
          },
        });
        await tx.roleAssignment.create({
          data: { schoolId: school.id, membershipId: membership.id, role },
        });
        if (role === 'STUDENT') {
          await tx.studentProfile.create({
            data: { schoolId: school.id, membershipId: membership.id, studentId: `ST-${suffix}` },
          });
        } else if (role === 'TEACHER' || role === 'HOD') {
          await tx.teacherProfile.create({
            data: {
              schoolId: school.id,
              membershipId: membership.id,
              staffId: `SF-${role}-${suffix}`,
            },
          });
        }
        return membership.id;
      });
      users[role] = { userId: user.id, membershipId, identifier };
    }
    return { schoolId: school.id, subdomain, host: `${subdomain}.${ROOT_DOMAIN}`, users };
  }

  async loginAs(
    app: NestFastifyApplication,
    school: FixtureSchool,
    role: Exclude<Role, 'SOFTWARE_ADMIN'>,
  ): Promise<Ctx> {
    const ctx = await csrfContext(app, school.host);
    const res = await call(app, ctx, 'POST', '/auth/login', {
      identifier: school.users[role].identifier,
      password: PASSWORD,
    });
    const session = extractCookie(res.headers['set-cookie'], 'atlas_session');
    if (res.statusCode !== 200 || !session) {
      throw new Error(`login as ${role} failed: ${res.statusCode} ${res.body}`);
    }
    return { ...ctx, sessionCookieName: 'atlas_session', sessionCookie: session };
  }

  /** `n` extra students (a school lab), each signable-in with the shared
   * fixture password. Returns their login identifiers. */
  async addStudents(school: FixtureSchool, n: number): Promise<string[]> {
    const passwordHash = await passwords.hash(PASSWORD);
    const identifiers: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const identifier = `lab-${i}-${randomUUID().slice(0, 6)}`;
      const user = await prisma.user.create({
        data: {
          firstName: 'Lab',
          lastName: `Student ${i}`,
          displayName: `Lab Student ${i}`,
          passwordHash,
          status: 'ACTIVE',
          credentialState: 'OK',
        },
      });
      this.userIds.push(user.id);
      await withTenant(prisma, school.schoolId, async (tx) => {
        const membership = await tx.schoolMembership.create({
          data: {
            schoolId: school.schoolId,
            userId: user.id,
            loginIdentifier: identifier,
            status: 'ACTIVE',
          },
        });
        await tx.roleAssignment.create({
          data: { schoolId: school.schoolId, membershipId: membership.id, role: 'STUDENT' },
        });
      });
      identifiers.push(identifier);
    }
    return identifiers;
  }

  /** Signs in by identifier from a caller-chosen client IP (lab NAT). */
  async loginIdentifier(
    app: NestFastifyApplication,
    school: FixtureSchool,
    identifier: string,
    ip: string,
  ): Promise<{ status: number; ctx: Ctx }> {
    const base = { ...(await csrfContext(app, school.host)), ip };
    const res = await call(app, base, 'POST', '/auth/login', { identifier, password: PASSWORD });
    const session = extractCookie(res.headers['set-cookie'], 'atlas_session');
    return {
      status: res.statusCode,
      ctx: session ? { ...base, sessionCookieName: 'atlas_session', sessionCookie: session } : base,
    };
  }

  async createPlatformAdmin(): Promise<{ userId: string; email: string }> {
    const email = `sec-admin-${randomUUID().slice(0, 8)}@example.test`;
    const user = await prisma.user.create({
      data: {
        firstName: 'Sec',
        lastName: 'Admin',
        displayName: 'Sec Admin',
        email,
        passwordHash: await passwords.hash(PASSWORD),
        status: 'ACTIVE',
        credentialState: 'OK',
      },
    });
    await grantSoftwareAdmin(user.id);
    this.platformUserIds.push(user.id);
    return { userId: user.id, email };
  }

  async loginPlatform(app: NestFastifyApplication, email: string): Promise<Ctx> {
    const ctx = await csrfContext(app, ADMIN_HOST);
    const res = await call(app, ctx, 'POST', '/platform/auth/login', { email, password: PASSWORD });
    const session = extractCookie(res.headers['set-cookie'], 'atlas_platform_session');
    if (res.statusCode !== 200 || !session) {
      throw new Error(`platform login failed: ${res.statusCode} ${res.body}`);
    }
    return { ...ctx, sessionCookieName: 'atlas_platform_session', sessionCookie: session };
  }

  /**
   * Gives a school real data in the main resource families the id-bearing
   * routes act on — academic structure, a subject offering, a question, an
   * exam with a session, a submitted attempt with snapshot and answer,
   * a notification, a media asset, an import job. The probe pool is then
   * harvested from the database, so anything else that exists is included
   * without this function having to know about it.
   */
  async populate(school: FixtureSchool): Promise<void> {
    const sid = school.schoolId;
    const suffix = randomUUID().slice(0, 6);
    await withTenant(prisma, sid, async (tx) => {
      const session = await tx.academicSession.create({
        data: {
          schoolId: sid,
          name: `Sec ${suffix}`,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
        },
      });
      const term = await tx.academicTerm.create({
        data: {
          schoolId: sid,
          academicSessionId: session.id,
          name: 'First Term',
          sequence: 1,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-04-30'),
        },
      });
      const department = await tx.department.create({
        data: { schoolId: sid, name: `Sciences ${suffix}`, code: `SCI-${suffix}` },
      });
      const subject = await tx.subject.create({
        data: {
          schoolId: sid,
          name: 'Mathematics',
          code: `M-${suffix}`,
          departmentId: department.id,
        },
      });
      await tx.topic
        .create({ data: { schoolId: sid, subjectId: subject.id, name: 'Algebra' } })
        .catch(() => undefined);
      const exam = await tx.exam.create({
        data: {
          schoolId: sid,
          academicSessionId: session.id,
          academicTermId: term.id,
          subjectId: subject.id,
          title: `Sec Exam ${suffix}`,
          examType: 'Test',
          durationSeconds: 3600,
          resultPolicy: 'TEACHER',
          resultDetailVisibility: 'SCORE_ONLY',
          createdByMembershipId: school.users.TEACHER.membershipId,
        },
      });
      const examSession = await tx.examSession.create({
        data: {
          schoolId: sid,
          examId: exam.id,
          openedByMembershipId: school.users.TEACHER.membershipId,
        },
      });
      const studentProfile = await tx.studentProfile.findFirstOrThrow({
        where: { schoolId: sid, membershipId: school.users.STUDENT.membershipId },
      });
      const attempt = await tx.examAttempt.create({
        data: {
          schoolId: sid,
          examId: exam.id,
          examSessionId: examSession.id,
          studentProfileId: studentProfile.id,
          attemptNumber: 1,
          state: 'IN_PROGRESS',
          durationGrantedSeconds: 3600,
          expiresAt: new Date(Date.now() + 3600 * 1000),
        },
      });
      const examQuestionId = randomUUID();
      await tx.attemptQuestionSnapshot.create({
        data: {
          schoolId: sid,
          attemptId: attempt.id,
          seed: 'sec',
          document: {
            version: 1,
            seed: 'sec',
            questions: [
              {
                examQuestionId,
                questionRevisionId: 'rev',
                displaySequence: 1,
                marks: 1,
                questionType: 'SINGLE_CHOICE',
                content: 'q',
                explanation: null,
                options: [],
                media: [],
              },
            ],
          },
        },
      });
      await tx.notification.create({
        data: {
          schoolId: sid,
          recipientUserId: school.users.TEACHER.userId,
          type: 'QUESTION_APPROVED',
          title: 'Sec notice',
          content: 'Sec notice body',
        },
      });
      await tx.importJob.create({
        data: {
          schoolId: sid,
          type: 'TEACHERS',
          sourceMediaAssetId: randomUUID(),
          uploaderUserId: school.users.SCHOOL_ADMIN.userId,
          uploaderRole: 'SCHOOL_ADMIN',
          templateVersion: 1,
          expiresAt: new Date(Date.now() + 3600 * 1000),
        },
      });
    });
  }

  /**
   * Every id the school owns, across every table carrying `school_id` —
   * read through the owner connection (the probe needs to *know* B's ids;
   * the app role under A's tenant is what must not see them). Up to
   * `perTable` per table keeps the probe matrix bounded.
   */
  async harvestIds(schoolId: string, perTable = 3): Promise<Map<string, string[]>> {
    const owner = ownerPrisma();
    const tables = await owner.$queryRaw<Array<{ table_name: string }>>`
      SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.columns idc
        ON idc.table_name = c.table_name AND idc.table_schema = c.table_schema AND idc.column_name = 'id'
      WHERE c.table_schema = 'public' AND c.column_name = 'school_id'
      ORDER BY c.table_name`;
    const pool = new Map<string, string[]>();
    for (const { table_name } of tables) {
      if (!/^[a-z_]+$/u.test(table_name)) continue;
      const rows = await owner.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id::text AS id FROM "${table_name}" WHERE school_id = $1::uuid LIMIT ${perTable}`,
        schoolId,
      );
      if (rows.length)
        pool.set(
          table_name,
          rows.map((r) => r.id),
        );
    }
    pool.set('schools', [schoolId]);
    return pool;
  }

  async cleanup(): Promise<void> {
    await revokeSoftwareAdminFixtures(this.platformUserIds);
    await prisma.platformSession
      .deleteMany({ where: { userId: { in: this.platformUserIds } } })
      .catch(() => undefined);
    await safeDeleteSchools(prisma, this.schoolIds);
    await prisma.user
      .deleteMany({ where: { id: { in: [...this.userIds, ...this.platformUserIds] } } })
      .catch(() => undefined);
  }
}
