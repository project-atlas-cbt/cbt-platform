/**
 * B10 — `GET /v1/audit` (school-session-scoped, all six roles) and
 * `GET /v1/platform/audit` (Software-Admin-only, cross-school, served by
 * the privileged `atlas_audit_reader` connection). Real HTTP via
 * `app.inject()` against the real `AppModule` and real Postgres, mirroring
 * `question-review.integration.test.ts`'s/`platform.integration.test.ts`'s
 * own harness exactly.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { createPrismaClient, prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppModule } from '../../app.module.js';
import { PasswordService } from '../identity/password.service.js';
import {
  grantSoftwareAdmin,
  revokeSoftwareAdminFixtures,
} from '../../test-support/owner-prisma.js';

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
  const res = await app.inject({
    method: 'GET',
    url,
    headers: { host: ctx.host, cookie: cookieHeader(ctx) },
    remoteAddress: ctx.remoteAddress,
  });
  if (!url.startsWith('/audit')) return res;
  // B20: every sign-in now writes a USER_SIGNED_IN audit row, so the
  // actor's own login to make this request appears in their trail. These
  // tests are about which *seeded* events each role's scope admits — the
  // sign-in rows are filtered out of the view rather than every expected
  // count being bumped by the incidental login. (Sign-in auditing itself is
  // asserted in the B20 security suite.)
  const json = res.json.bind(res);
  return Object.assign(res, {
    json: <T>(): T => {
      const body = json<{ items?: { action: string }[]; total?: number }>();
      if (!Array.isArray(body.items)) return body as T;
      const items = body.items.filter((i) => i.action !== 'USER_SIGNED_IN');
      return {
        ...body,
        items,
        total: (body.total ?? 0) - (body.items.length - items.length),
      } as T;
    },
  });
}

async function loginSchool(ctx: RequestCtx, identifier: string, password: string) {
  const res = await post(ctx, '/auth/login', { identifier, password });
  if (res.statusCode === 200) {
    const sessionCookie = extractCookie(res.headers['set-cookie'], 'atlas_session');
    if (sessionCookie) ctx.sessionCookie = sessionCookie;
  }
  return res;
}

async function loginPlatform(ctx: RequestCtx, email: string, password: string) {
  const res = await post(ctx, '/platform/auth/login', { email, password });
  if (res.statusCode === 200) {
    const sessionCookie = extractCookie(res.headers['set-cookie'], 'atlas_platform_session');
    if (sessionCookie) ctx.platformSessionCookie = sessionCookie;
  }
  return res;
}

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];
const createdPlatformUserIds: string[] = [];

afterAll(async () => {
  // B10: audit_events is now append-only (unconditional trigger). A school
  // that ever wrote one — every fixture school in this file does, on
  // purpose — cannot be cleanly deleted; best-effort, matching every other
  // affected integration test file (see safe-delete-schools.ts).
  await prisma.school
    .deleteMany({ where: { id: { in: createdSchoolIds } } })
    .catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
  await prisma.platformSession
    .deleteMany({ where: { userId: { in: createdPlatformUserIds } } })
    .catch(() => undefined);
  await revokeSoftwareAdminFixtures(createdPlatformUserIds);
  await prisma.user
    .deleteMany({ where: { id: { in: createdPlatformUserIds } } })
    .catch(() => undefined);
});

async function createSchool() {
  const school = await prisma.school.create({
    data: {
      name: `Audit Test School ${randomUUID()}`,
      subdomain: `audit-${randomUUID().slice(0, 8)}`,
    },
  });
  createdSchoolIds.push(school.id);
  return school;
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
      email: `${opts.loginIdentifier}@example.com`,
      passwordHash,
      status: 'ACTIVE',
      credentialState: 'OK',
    },
  });
  createdUserIds.push(user.id);
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

async function seedPlatformAdmin(): Promise<{ email: string; password: string }> {
  const email = `platform-audit-${randomUUID().slice(0, 8)}@example.com`;
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
  return { email, password };
}

async function seedAuditEvent(
  schoolId: string,
  actorUserId: string,
  actorRole: Role,
  action: string,
  extra: { entityType?: string; entityId?: string } = {},
) {
  await withTenant(prisma, schoolId, (tx) =>
    tx.auditEvent.create({
      data: { schoolId, actorUserId, actorRole, action, ...extra },
    }),
  );
}

const ADMIN_HOST = `admin.${ROOT_DOMAIN}`;

describe('GET /v1/audit (B10)', () => {
  it('School Admin sees every audit event in their own school', async () => {
    const school = await createSchool();
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const { user: admin, membership } = await seedUser({
      schoolId: school.id,
      loginIdentifier: `sa-${RUN}`,
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    const teacher = await seedUser({
      schoolId: school.id,
      loginIdentifier: `t-${RUN}`,
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    await seedAuditEvent(school.id, admin.id, 'SCHOOL_ADMIN', 'CLASS_GROUP_CREATED');
    await seedAuditEvent(school.id, teacher.user.id, 'TEACHER', 'QUESTION_CREATED');
    void membership;

    const ctx = await freshCtx(host, `10.${RUN}.1.1`);
    await loginSchool(ctx, `sa-${RUN}`, 'a-real-password-123');
    const res = await get(ctx, '/audit');
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { action: string }[]; total: number }>();
    expect(body.total).toBe(2);
    expect(body.items.map((i) => i.action).sort()).toEqual(
      ['CLASS_GROUP_CREATED', 'QUESTION_CREATED'].sort(),
    );
  });

  it('Teacher sees only their own actions', async () => {
    const school = await createSchool();
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedUser({
      schoolId: school.id,
      loginIdentifier: `sa2-${RUN}`,
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    const teacher = await seedUser({
      schoolId: school.id,
      loginIdentifier: `t2-${RUN}`,
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    await seedAuditEvent(school.id, admin.user.id, 'SCHOOL_ADMIN', 'CLASS_GROUP_CREATED');
    await seedAuditEvent(school.id, teacher.user.id, 'TEACHER', 'QUESTION_CREATED');

    const ctx = await freshCtx(host, `10.${RUN}.1.2`);
    await loginSchool(ctx, `t2-${RUN}`, 'a-real-password-123');
    const res = await get(ctx, '/audit');
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { action: string; actorUserId: string }[]; total: number }>();
    expect(body.total).toBe(1);
    expect(body.items[0]?.action).toBe('QUESTION_CREATED');
    expect(body.items[0]?.actorUserId).toBe(teacher.user.id);
  });

  it('Student sees only their own account activity', async () => {
    const school = await createSchool();
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedUser({
      schoolId: school.id,
      loginIdentifier: `sa3-${RUN}`,
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    const student = await seedUser({
      schoolId: school.id,
      loginIdentifier: `stu3-${RUN}`,
      password: 'a-real-password-123',
      role: 'STUDENT',
    });
    await seedAuditEvent(school.id, admin.user.id, 'SCHOOL_ADMIN', 'STUDENT_CREATED');
    await seedAuditEvent(school.id, student.user.id, 'STUDENT', 'STUDENT_SUBJECT_DEREGISTERED');

    const ctx = await freshCtx(host, `10.${RUN}.1.3`);
    await loginSchool(ctx, `stu3-${RUN}`, 'a-real-password-123');
    const res = await get(ctx, '/audit');
    expect(res.statusCode).toBe(200);
    const body = res.json<{ total: number }>();
    expect(body.total).toBe(1);
  });

  it('Moderator sees every audit event in the school (full school-wide read)', async () => {
    const school = await createSchool();
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedUser({
      schoolId: school.id,
      loginIdentifier: `sa4-${RUN}`,
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    await seedUser({
      schoolId: school.id,
      loginIdentifier: `m4-${RUN}`,
      password: 'a-real-password-123',
      role: 'MODERATOR',
    });
    await seedAuditEvent(school.id, admin.user.id, 'SCHOOL_ADMIN', 'CLASS_GROUP_CREATED');

    const ctx = await freshCtx(host, `10.${RUN}.1.4`);
    await loginSchool(ctx, `m4-${RUN}`, 'a-real-password-123');
    const res = await get(ctx, '/audit');
    expect(res.statusCode).toBe(200);
    expect(res.json<{ total: number }>().total).toBe(1);
  });

  it('HOD sees own actions plus Question/QuestionRevision events in their department, nothing else', async () => {
    const school = await createSchool();
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedUser({
      schoolId: school.id,
      loginIdentifier: `sa5-${RUN}`,
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    const hod = await seedUser({
      schoolId: school.id,
      loginIdentifier: `h5-${RUN}`,
      password: 'a-real-password-123',
      role: 'HOD',
    });

    const session = await withTenant(prisma, school.id, (tx) =>
      tx.academicSession.create({
        data: {
          schoolId: school.id,
          name: `AuditHOD ${RUN}`,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
          status: 'CURRENT',
        },
      }),
    );
    const department = await withTenant(prisma, school.id, (tx) =>
      tx.department.create({
        data: { schoolId: school.id, name: `Dept ${RUN}`, code: `D${RUN}` },
      }),
    );
    await withTenant(prisma, school.id, (tx) =>
      tx.hODAssignment.create({
        data: {
          schoolId: school.id,
          departmentId: department.id,
          membershipId: hod.membership.id,
          academicSessionId: session.id,
          startDate: new Date(),
        },
      }),
    );
    const subject = await withTenant(prisma, school.id, (tx) =>
      tx.subject.create({
        data: {
          schoolId: school.id,
          name: `Subject ${RUN}`,
          code: `S${RUN}`,
          departmentId: department.id,
        },
      }),
    );
    const teacher = await seedUser({
      schoolId: school.id,
      loginIdentifier: `t5-${RUN}`,
      password: 'a-real-password-123',
      role: 'TEACHER',
    });
    const teacherProfile = await withTenant(prisma, school.id, (tx) =>
      tx.teacherProfile.create({
        data: { schoolId: school.id, membershipId: teacher.membership.id, staffId: `TS${RUN}` },
      }),
    );
    const question = await withTenant(prisma, school.id, (tx) =>
      tx.question.create({
        data: {
          schoolId: school.id,
          subjectId: subject.id,
          level: 'SS2',
          authorTeacherProfileId: teacherProfile.id,
        },
      }),
    );

    // In-department event (visible to the HOD), an own action (visible),
    // and an out-of-department event (never visible).
    await seedAuditEvent(school.id, teacher.user.id, 'TEACHER', 'QUESTION_CREATED', {
      entityType: 'Question',
      entityId: question.id,
    });
    await seedAuditEvent(school.id, hod.user.id, 'HOD', 'HOD_ASSIGNMENT_CREATED');
    await seedAuditEvent(school.id, admin.user.id, 'SCHOOL_ADMIN', 'CLASS_GROUP_CREATED');

    const ctx = await freshCtx(host, `10.${RUN}.1.5`);
    await loginSchool(ctx, `h5-${RUN}`, 'a-real-password-123');
    const res = await get(ctx, '/audit');
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: { action: string }[]; total: number }>();
    expect(body.total).toBe(2);
    expect(body.items.map((i) => i.action).sort()).toEqual(
      ['HOD_ASSIGNMENT_CREATED', 'QUESTION_CREATED'].sort(),
    );
  });

  it("cross-tenant: an actor never sees another school's audit events", async () => {
    const schoolA = await createSchool();
    const schoolB = await createSchool();
    const hostA = `${schoolA.subdomain}.${ROOT_DOMAIN}`;
    const adminA = await seedUser({
      schoolId: schoolA.id,
      loginIdentifier: `xa-${RUN}`,
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    const adminB = await seedUser({
      schoolId: schoolB.id,
      loginIdentifier: `xb-${RUN}`,
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    await seedAuditEvent(schoolA.id, adminA.user.id, 'SCHOOL_ADMIN', 'CLASS_GROUP_CREATED');
    await seedAuditEvent(schoolB.id, adminB.user.id, 'SCHOOL_ADMIN', 'CLASS_GROUP_CREATED');

    const ctx = await freshCtx(hostA, `10.${RUN}.1.6`);
    await loginSchool(ctx, `xa-${RUN}`, 'a-real-password-123');
    const res = await get(ctx, '/audit');
    expect(res.json<{ total: number }>().total).toBe(1);
  });

  it('the action filter narrows results', async () => {
    const school = await createSchool();
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedUser({
      schoolId: school.id,
      loginIdentifier: `f-${RUN}`,
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    await seedAuditEvent(school.id, admin.user.id, 'SCHOOL_ADMIN', 'CLASS_GROUP_CREATED');
    await seedAuditEvent(school.id, admin.user.id, 'SCHOOL_ADMIN', 'DEPARTMENT_CREATED');

    const ctx = await freshCtx(host, `10.${RUN}.1.7`);
    await loginSchool(ctx, `f-${RUN}`, 'a-real-password-123');
    const res = await get(ctx, '/audit?action=DEPARTMENT_CREATED');
    const body = res.json<{ items: { action: string }[]; total: number }>();
    expect(body.total).toBe(1);
    expect(body.items[0]?.action).toBe('DEPARTMENT_CREATED');
  });
});

describe('GET /v1/platform/audit (B10, privileged atlas_audit_reader connection)', () => {
  it('genuinely returns events from more than one school in a single call', async () => {
    const schoolA = await createSchool();
    const schoolB = await createSchool();
    const adminA = await seedUser({
      schoolId: schoolA.id,
      loginIdentifier: `pa-${RUN}`,
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    const adminB = await seedUser({
      schoolId: schoolB.id,
      loginIdentifier: `pb-${RUN}`,
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    // audit_events is now append-only (this phase's own trigger) — a
    // fixed literal action string would risk colliding with undeletable
    // debris left behind by an earlier run against this same persistent
    // dev database, so every action string in this describe block is
    // unique per test invocation.
    const actionA = `PLATFORM_TEST_EVENT_A_${RUN}_${randomUUID().slice(0, 8)}`;
    const actionB = `PLATFORM_TEST_EVENT_B_${RUN}_${randomUUID().slice(0, 8)}`;
    await seedAuditEvent(schoolA.id, adminA.user.id, 'SCHOOL_ADMIN', actionA);
    await seedAuditEvent(schoolB.id, adminB.user.id, 'SCHOOL_ADMIN', actionB);

    const platformAdmin = await seedPlatformAdmin();
    const ctx = await freshCtx(ADMIN_HOST, `10.${RUN}.2.1`);
    await loginPlatform(ctx, platformAdmin.email, platformAdmin.password);

    const res = await get(ctx, `/platform/audit?action=${actionA}&pageSize=1&page=1`);
    expect(res.statusCode).toBe(200);
    const resA = res.json<{ items: { schoolId: string }[]; total: number }>();
    expect(resA.total).toBe(1);
    expect(resA.items[0]?.schoolId).toBe(schoolA.id);

    const resBoth = await get(ctx, `/platform/audit?pageSize=100`);
    const bodyBoth = resBoth.json<{ items: { schoolId: string }[] }>();
    const schoolIds = new Set(bodyBoth.items.map((i) => i.schoolId));
    expect(schoolIds.has(schoolA.id)).toBe(true);
    expect(schoolIds.has(schoolB.id)).toBe(true);
  });

  it("the schoolId filter narrows to one school (powers F3's per-school tabs)", async () => {
    const schoolA = await createSchool();
    const schoolB = await createSchool();
    const adminA = await seedUser({
      schoolId: schoolA.id,
      loginIdentifier: `pc-${RUN}`,
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    const adminB = await seedUser({
      schoolId: schoolB.id,
      loginIdentifier: `pd-${RUN}`,
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    const scopedAction = `PLATFORM_SCOPED_EVENT_${RUN}_${randomUUID().slice(0, 8)}`;
    await seedAuditEvent(schoolA.id, adminA.user.id, 'SCHOOL_ADMIN', scopedAction);
    await seedAuditEvent(schoolB.id, adminB.user.id, 'SCHOOL_ADMIN', scopedAction);

    const platformAdmin = await seedPlatformAdmin();
    const ctx = await freshCtx(ADMIN_HOST, `10.${RUN}.2.2`);
    await loginPlatform(ctx, platformAdmin.email, platformAdmin.password);

    const res = await get(ctx, `/platform/audit?action=${scopedAction}&schoolId=${schoolA.id}`);
    const body = res.json<{ items: { schoolId: string }[]; total: number }>();
    expect(body.total).toBe(1);
    expect(body.items[0]?.schoolId).toBe(schoolA.id);
  });

  it('a school session cannot reach this endpoint at all (Software-Admin-only)', async () => {
    const school = await createSchool();
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    await seedUser({
      schoolId: school.id,
      loginIdentifier: `np-${RUN}`,
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    const ctx = await freshCtx(host, `10.${RUN}.2.3`);
    await loginSchool(ctx, `np-${RUN}`, 'a-real-password-123');
    const res = await get(ctx, '/platform/audit');
    expect(res.statusCode).toBe(401);
  });
});

describe('AuditEvent append-only enforcement (B10 DoD item 2)', () => {
  // Two independent, layered mechanisms, tested separately per the
  // migration's own "rejected by trigger or by restricted grants" wording:
  // atlas_app (the running application's only role) has no UPDATE/DELETE
  // grant on audit_events at all (REVOKE, belt-and-suspenders); the schema
  // owner ("atlas") *does* still have DML rights as table owner, so
  // testing through that connection is what actually proves the trigger
  // itself, independent of the grant.

  it('a direct raw-SQL UPDATE against audit_events is rejected at the grant level (atlas_app)', async () => {
    const school = await createSchool();
    const admin = await seedUser({
      schoolId: school.id,
      loginIdentifier: `imm-${RUN}`,
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    await seedAuditEvent(school.id, admin.user.id, 'SCHOOL_ADMIN', 'CLASS_GROUP_CREATED');

    await expect(
      withTenant(prisma, school.id, (tx) =>
        tx.$executeRawUnsafe(
          `UPDATE audit_events SET reason = 'tampered' WHERE school_id = '${school.id}'`,
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('a direct raw-SQL DELETE against audit_events is rejected at the grant level (atlas_app)', async () => {
    const school = await createSchool();
    const admin = await seedUser({
      schoolId: school.id,
      loginIdentifier: `imm2-${RUN}`,
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    await seedAuditEvent(school.id, admin.user.id, 'SCHOOL_ADMIN', 'CLASS_GROUP_CREATED');

    await expect(
      withTenant(prisma, school.id, (tx) =>
        tx.$executeRawUnsafe(`DELETE FROM audit_events WHERE school_id = '${school.id}'`),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('a direct raw-SQL UPDATE against audit_events is rejected by the trigger, even as the schema owner', async () => {
    // This file's own `prisma` singleton (via DATABASE_APP_URL) runs
    // against the real dev database, not a separate atlas_test one — same
    // established convention as every other apps/api *.integration.test.ts
    // file (identity.integration.test.ts's own precedent). The schema-
    // owner equivalent connection is DATABASE_URL, matching that same
    // database, not DATABASE_URL_TEST (a different, separately-migrated
    // database only tests/tenancy/rls.integration.test.ts targets).
    const ownerUrl = process.env.DATABASE_URL;
    if (!ownerUrl) return;
    const owner = createPrismaClient(ownerUrl);
    try {
      const school = await owner.school.create({
        data: {
          name: `Audit Trigger Test School ${randomUUID()}`,
          subdomain: `audit-trig-${randomUUID().slice(0, 8)}`,
        },
      });
      const user = await owner.user.create({
        data: { firstName: 'Trig', lastName: 'Owner', displayName: 'Trig Owner' },
      });
      const event = await withTenant(owner, school.id, (tx) =>
        tx.auditEvent.create({
          data: {
            schoolId: school.id,
            actorUserId: user.id,
            actorRole: 'SCHOOL_ADMIN',
            action: 'CLASS_GROUP_CREATED',
          },
        }),
      );

      await expect(
        withTenant(owner, school.id, (tx) =>
          tx.$executeRawUnsafe(
            `UPDATE audit_events SET reason = 'tampered' WHERE id = $1`,
            event.id,
          ),
        ),
      ).rejects.toThrow(/immutable/i);

      // Cleanup: best-effort — the row above is now genuinely, permanently
      // undeletable by design; the school cascade is left to fail quietly.
      await owner.school.delete({ where: { id: school.id } }).catch(() => undefined);
      await owner.user.delete({ where: { id: user.id } }).catch(() => undefined);
    } finally {
      await owner.$disconnect();
    }
  });
});
