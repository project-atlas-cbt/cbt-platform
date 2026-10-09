/**
 * ADR-0038 — offering kinds (compulsory / elective), choice groups, the
 * class subject grid, and carrying a student's subjects across a class
 * move. Same HTTP harness as student-enrollment.integration.test.ts.
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

async function send(
  ctx: RequestCtx,
  method: 'PUT' | 'PATCH',
  url: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method,
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

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, async (tx) => {
      await tx.studentSubjectRegistration.deleteMany({ where: { schoolId } });
      await tx.studentEnrollment.deleteMany({ where: { schoolId } });
      await tx.classSubject.deleteMany({ where: { schoolId } });
      await tx.classGroup.deleteMany({ where: { schoolId } });
      await tx.subject.deleteMany({ where: { schoolId } });
      await tx.subjectChoiceGroup.deleteMany({ where: { schoolId } });
      await tx.academicSession.deleteMany({ where: { schoolId } });
      await tx.studentProfile.deleteMany({ where: { schoolId } });
      await tx.roleAssignment.deleteMany({ where: { schoolId } });
      await tx.schoolMembership.deleteMany({ where: { schoolId } });
    });
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await safeDeleteSchools(prisma, createdSchoolIds);
});

interface Grid {
  offerings: {
    classSubjectId: string;
    subjectName: string;
    kind: string;
    choiceGroupName: string | null;
  }[];
  students: {
    enrollmentId: string;
    studentProfileId: string;
    registeredClassSubjectIds: string[];
    warnings: { choiceGroupId: string; message: string }[];
  }[];
}

describe('ADR-0038 offering kinds and the class subject grid', () => {
  let schoolId: string;
  let admin: RequestCtx;
  let sessionId: string;
  let ss1aId: string;
  let ss1bId: string;
  const subject: Record<string, string> = {};
  const ss1a: Record<string, string> = {};
  const ss1b: Record<string, string> = {};
  const students: string[] = [];
  let religionGroupId: string;

  beforeAll(async () => {
    const school = await prisma.school.create({
      data: {
        name: `Offering Kinds ${randomUUID()}`,
        subdomain: `ofk-${randomUUID().slice(0, 8)}`,
      },
    });
    schoolId = school.id;
    createdSchoolIds.push(schoolId);
    const { user } = await seedUser({
      schoolId,
      loginIdentifier: 'admin01',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(user.id);
    admin = await freshCtx(`${school.subdomain}.${ROOT_DOMAIN}`, `10.${RUN}.7.1`);
    await login(admin, 'admin01', 'a-real-password-123');

    sessionId = (
      await post(admin, '/academics/sessions', {
        name: `Kinds ${randomUUID().slice(0, 8)}`,
        startDate: '2026-09-01',
        endDate: '2027-07-31',
      })
    ).json<{ id: string }>().id;
    ss1aId = (
      await post(admin, '/academics/classes', {
        academicSessionId: sessionId,
        name: 'SS1A',
        level: 'SS1',
        arm: 'A',
      })
    ).json<{ id: string }>().id;
    ss1bId = (
      await post(admin, '/academics/classes', {
        academicSessionId: sessionId,
        name: 'SS1B',
        level: 'SS1',
        arm: 'B',
      })
    ).json<{ id: string }>().id;

    const group = await post(admin, '/academics/subject-choice-groups', {
      name: 'Religion',
      minChoices: 1,
      maxChoices: 1,
    });
    expect(group.statusCode).toBe(201);
    religionGroupId = group.json<{ id: string }>().id;

    for (const name of ['Mathematics', 'Physics', 'CRS', 'IRS']) {
      const res = await post(admin, '/academics/subjects', {
        name,
        code: `${name.slice(0, 3)}-${randomUUID().slice(0, 6)}`,
        ...(name === 'CRS' || name === 'IRS' ? { choiceGroupId: religionGroupId } : {}),
      });
      expect(res.statusCode).toBe(201);
      subject[name] = res.json<{ id: string }>().id;
    }

    for (let i = 0; i < 2; i += 1) {
      const res = await post(admin, '/students', {
        firstName: `Student${i}`,
        lastName: 'Test',
        studentId: `ST-${randomUUID().slice(0, 8)}`,
      });
      const id = res.json<{ studentProfileId: string }>().studentProfileId;
      students.push(id);
      await post(admin, `/students/${id}/enrollments`, {
        academicSessionId: sessionId,
        classId: ss1aId,
      });
    }

    // Offered after enrollment, so this also covers the "offer later" path.
    for (const name of ['Mathematics', 'Physics', 'CRS', 'IRS']) {
      const res = await post(admin, `/academics/classes/${ss1aId}/subjects`, {
        subjectId: subject[name],
        ...(name === 'Mathematics' ? {} : { kind: 'ELECTIVE' }),
      });
      expect(res.statusCode).toBe(201);
      ss1a[name] = res.json<{ id: string }>().id;
    }
    for (const name of ['Mathematics', 'Physics']) {
      ss1b[name] = (
        await post(admin, `/academics/classes/${ss1bId}/subjects`, {
          subjectId: subject[name],
          kind: name === 'Physics' ? 'ELECTIVE' : 'COMPULSORY',
        })
      ).json<{ id: string }>().id;
    }
  });

  const grid = async (classId: string) =>
    (await get(admin, `/academics/classes/${classId}/subject-registrations`)).json<Grid>();

  it('registers everyone for a compulsory subject and nobody for an elective', async () => {
    const g = await grid(ss1aId);
    expect(g.offerings.map((o) => [o.subjectName, o.kind])).toEqual([
      ['CRS', 'ELECTIVE'],
      ['IRS', 'ELECTIVE'],
      ['Mathematics', 'COMPULSORY'],
      ['Physics', 'ELECTIVE'],
    ]);
    expect(g.offerings.find((o) => o.subjectName === 'CRS')?.choiceGroupName).toBe('Religion');
    for (const s of g.students) expect(s.registeredClassSubjectIds).toEqual([ss1a['Mathematics']]);
  });

  it('warns, never blocks, when a choice rule is not met', async () => {
    const g = await grid(ss1aId);
    for (const s of g.students) {
      expect(s.warnings).toEqual([
        expect.objectContaining({
          choiceGroupId: religionGroupId,
          message: 'Religion: choose 1, 0 chosen.',
        }),
      ]);
    }
  });

  it('saves grid ticks, creating registrations for electives, and clears the warning', async () => {
    const before = await grid(ss1aId);
    const [first, second] = before.students;
    const res = await send(admin, 'PUT', `/academics/classes/${ss1aId}/subject-registrations`, {
      changes: [
        { enrollmentId: first!.enrollmentId, classSubjectId: ss1a['Physics'], registered: true },
        { enrollmentId: first!.enrollmentId, classSubjectId: ss1a['CRS'], registered: true },
        { enrollmentId: second!.enrollmentId, classSubjectId: ss1a['IRS'], registered: true },
        // No-op: already registered.
        {
          enrollmentId: second!.enrollmentId,
          classSubjectId: ss1a['Mathematics'],
          registered: true,
        },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ changed: number }>().changed).toBe(3);
    const after = await grid(ss1aId);
    const a = after.students.find((s) => s.enrollmentId === first!.enrollmentId)!;
    expect(new Set(a.registeredClassSubjectIds)).toEqual(
      new Set([ss1a['Mathematics'], ss1a['Physics'], ss1a['CRS']]),
    );
    expect(a.warnings).toEqual([]);

    const audits = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.count({ where: { schoolId, action: 'STUDENT_SUBJECT_REGISTERED' } }),
    );
    expect(audits).toBe(3);
  });

  it('warns when too many choices are made', async () => {
    const g = await grid(ss1aId);
    const first = g.students[0]!;
    await send(admin, 'PUT', `/academics/classes/${ss1aId}/subject-registrations`, {
      changes: [
        { enrollmentId: first.enrollmentId, classSubjectId: ss1a['IRS'], registered: true },
      ],
    });
    const after = (await grid(ss1aId)).students.find((s) => s.enrollmentId === first.enrollmentId)!;
    expect(after.warnings[0]?.message).toBe('Religion: choose 1, 2 chosen.');
    await send(admin, 'PUT', `/academics/classes/${ss1aId}/subject-registrations`, {
      changes: [
        { enrollmentId: first.enrollmentId, classSubjectId: ss1a['IRS'], registered: false },
      ],
    });
  });

  it('refuses the whole save if one change names another class', async () => {
    const g = await grid(ss1aId);
    const res = await send(admin, 'PUT', `/academics/classes/${ss1aId}/subject-registrations`, {
      changes: [
        {
          enrollmentId: g.students[1]!.enrollmentId,
          classSubjectId: ss1a['Physics'],
          registered: true,
        },
        {
          enrollmentId: g.students[1]!.enrollmentId,
          classSubjectId: ss1b['Physics'],
          registered: true,
        },
      ],
    });
    expect(res.statusCode).toBe(400);
    const after = (await grid(ss1aId)).students[1]!;
    expect(after.registeredClassSubjectIds).not.toContain(ss1a['Physics']);
  });

  it("lists a student's electives they don't take, and registers them from the profile", async () => {
    // The second grid row: Maths and IRS only.
    const id = (await grid(ss1aId)).students[1]!.studentProfileId;
    const list = (await get(admin, `/students/${id}/subject-registrations`)).json<{
      availableOfferings: { classSubjectId: string; kind: string }[];
      warnings: unknown[];
    }>();
    expect(list.availableOfferings.map((o) => o.classSubjectId).sort()).toEqual(
      [ss1a['Physics'], ss1a['CRS']].sort(),
    );
    expect(list.warnings).toEqual([]);
    const res = await post(
      admin,
      `/students/${id}/subject-registrations/${ss1a['Physics']}/re-register`,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json<{ status: string; kind: string }>()).toMatchObject({
      status: 'REGISTERED',
      kind: 'ELECTIVE',
    });
  });

  it('keeps registrations when an offering becomes elective, and registers everyone when it becomes compulsory', async () => {
    let res = await send(admin, 'PATCH', `/academics/class-subjects/${ss1a['Mathematics']}`, {
      kind: 'ELECTIVE',
    });
    expect(res.statusCode).toBe(200);
    for (const s of (await grid(ss1aId)).students)
      expect(s.registeredClassSubjectIds).toContain(ss1a['Mathematics']);

    res = await send(admin, 'PATCH', `/academics/class-subjects/${ss1a['CRS']}`, {
      kind: 'COMPULSORY',
    });
    expect(res.json<{ kind: string }>().kind).toBe('COMPULSORY');
    for (const s of (await grid(ss1aId)).students)
      expect(s.registeredClassSubjectIds).toContain(ss1a['CRS']);
    await send(admin, 'PATCH', `/academics/class-subjects/${ss1a['Mathematics']}`, {
      kind: 'COMPULSORY',
    });
  });

  it("carries a student's subjects across a class move where the new class offers them", async () => {
    const id = (await grid(ss1aId)).students[0]!.studentProfileId; // Maths, Physics, CRS.
    const res = await post(admin, `/students/${id}/enrollments`, {
      academicSessionId: sessionId,
      classId: ss1bId,
    });
    expect(res.statusCode).toBe(200);
    const g = await grid(ss1bId);
    expect(new Set(g.students[0]!.registeredClassSubjectIds)).toEqual(
      new Set([ss1b['Mathematics'], ss1b['Physics']]),
    );
  });

  it('does not let a group be deleted while subjects are in it', async () => {
    const res = await del(admin, `/academics/subject-choice-groups/${religionGroupId}`);
    expect(res.statusCode).toBe(409);
    const bad = await post(admin, '/academics/subject-choice-groups', {
      name: 'Broken',
      minChoices: 3,
      maxChoices: 1,
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('ADR-0038 amendment: teachers set registrations, form teachers, history', () => {
  let schoolId: string;
  let admin: RequestCtx;
  let teacher: RequestCtx;
  let teacherProfileId: string;
  let sessionId: string;
  let classAId: string;
  let classBId: string;
  const off: Record<string, string> = {};
  const studentIds: string[] = [];

  beforeAll(async () => {
    const school = await prisma.school.create({
      data: { name: `Teacher Regs ${randomUUID()}`, subdomain: `trg-${randomUUID().slice(0, 8)}` },
    });
    schoolId = school.id;
    createdSchoolIds.push(schoolId);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const a = await seedUser({
      schoolId,
      loginIdentifier: 'admin01',
      password: 'a-real-password-123',
      role: 'SCHOOL_ADMIN',
    });
    createdUserIds.push(a.user.id);
    admin = await freshCtx(host, `10.${RUN}.8.1`);
    await login(admin, 'admin01', 'a-real-password-123');

    const t = await seedUser({
      schoolId,
      loginIdentifier: 'teach01',
      password: 'a-real-password-456',
      role: 'TEACHER',
    });
    createdUserIds.push(t.user.id);
    teacherProfileId = (
      await withTenant(prisma, schoolId, (tx) =>
        tx.teacherProfile.create({
          data: { schoolId, membershipId: t.membership.id, staffId: 'STF-T1' },
        }),
      )
    ).id;
    teacher = await freshCtx(host, `10.${RUN}.8.2`);
    await login(teacher, 'teach01', 'a-real-password-456');

    sessionId = (
      await post(admin, '/academics/sessions', {
        name: `Regs ${randomUUID().slice(0, 8)}`,
        startDate: '2026-09-01',
        endDate: '2027-07-31',
      })
    ).json<{ id: string }>().id;
    const makeClass = async (arm: string) =>
      (
        await post(admin, '/academics/classes', {
          academicSessionId: sessionId,
          name: `SS1${arm}`,
          level: 'SS1',
          arm,
        })
      ).json<{ id: string }>().id;
    classAId = await makeClass('A');
    classBId = await makeClass('B');

    for (const [name, kind] of [
      ['Mathematics', 'COMPULSORY'],
      ['Agric', 'ELECTIVE'],
      ['French', 'ELECTIVE'],
    ] as const) {
      const subjectId = (
        await post(admin, '/academics/subjects', {
          name,
          code: `${name.slice(0, 3)}-${randomUUID().slice(0, 6)}`,
        })
      ).json<{ id: string }>().id;
      off[`A:${name}`] = (
        await post(admin, `/academics/classes/${classAId}/subjects`, { subjectId, kind })
      ).json<{ id: string }>().id;
      if (name !== 'French') {
        off[`B:${name}`] = (
          await post(admin, `/academics/classes/${classBId}/subjects`, { subjectId, kind })
        ).json<{ id: string }>().id;
      }
    }

    for (let i = 0; i < 2; i += 1) {
      const id = (
        await post(admin, '/students', {
          firstName: `Pupil${i}`,
          lastName: 'Test',
          studentId: `PU-${randomUUID().slice(0, 8)}`,
        })
      ).json<{ studentProfileId: string }>().studentProfileId;
      studentIds.push(id);
      await post(admin, `/students/${id}/enrollments`, {
        academicSessionId: sessionId,
        classId: classAId,
      });
    }

    // The teacher teaches Agric in SS1A (an elective) and Maths (compulsory).
    const res = await send(admin, 'PUT', `/teachers/${teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [off['A:Agric'], off['A:Mathematics']],
    });
    expect(res.statusCode).toBe(200);
  });

  afterAll(async () => {
    await withTenant(prisma, schoolId, async (tx) => {
      await tx.formTeacherAssignment.deleteMany({ where: { schoolId } });
      await tx.teacherAssignment.deleteMany({ where: { schoolId } });
      await tx.teacherProfile.deleteMany({ where: { schoolId } });
    });
  });

  const enrollmentOf = async (ctx: RequestCtx, classId: string, i: number) =>
    (await get(ctx, `/academics/classes/${classId}/subject-registrations`)).json<Grid>().students[
      i
    ]!.enrollmentId;

  it('shows a subject teacher only the electives they teach, and lets them set those', async () => {
    const g = await get(teacher, `/academics/classes/${classAId}/subject-registrations`);
    expect(g.statusCode).toBe(200);
    expect(g.json<Grid>().offerings.map((o) => o.subjectName)).toEqual(['Agric']);

    const enrollmentId = await enrollmentOf(teacher, classAId, 0);
    const ok = await send(teacher, 'PUT', `/academics/classes/${classAId}/subject-registrations`, {
      changes: [{ enrollmentId, classSubjectId: off['A:Agric'], registered: true }],
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<{ changed: number }>().changed).toBe(1);
  });

  it('refuses a subject teacher compulsory subjects and electives they do not teach', async () => {
    const enrollmentId = await enrollmentOf(admin, classAId, 0);
    for (const classSubjectId of [off['A:Mathematics'], off['A:French']]) {
      const res = await send(
        teacher,
        'PUT',
        `/academics/classes/${classAId}/subject-registrations`,
        {
          changes: [{ enrollmentId, classSubjectId, registered: false }],
        },
      );
      expect(res.statusCode).toBe(403);
    }
    // A class they have no elective in at all.
    expect(
      (await get(teacher, `/academics/classes/${classBId}/subject-registrations`)).statusCode,
    ).toBe(403);
  });

  it('lets a form teacher set every elective of their class, and only that class', async () => {
    const assign = await send(admin, 'PUT', `/academics/classes/${classAId}/form-teachers`, {
      teacherProfileIds: [teacherProfileId],
    });
    expect(assign.statusCode).toBe(200);
    expect(assign.json<{ formTeachers: { teacherProfileId: string }[] }>().formTeachers).toEqual([
      expect.objectContaining({ teacherProfileId }),
    ]);
    const mine = (await get(teacher, '/teachers/me/form-classes')).json<{
      classes: { classId: string }[];
    }>();
    expect(mine.classes.map((c) => c.classId)).toEqual([classAId]);

    const g = (
      await get(teacher, `/academics/classes/${classAId}/subject-registrations`)
    ).json<Grid>();
    expect(g.offerings.map((o) => o.subjectName)).toEqual(['Agric', 'French']);
    const enrollmentId = g.students[0]!.enrollmentId;
    const res = await send(teacher, 'PUT', `/academics/classes/${classAId}/subject-registrations`, {
      changes: [{ enrollmentId, classSubjectId: off['A:French'], registered: true }],
    });
    expect(res.statusCode).toBe(200);
    // Still never compulsory subjects.
    const maths = await send(
      teacher,
      'PUT',
      `/academics/classes/${classAId}/subject-registrations`,
      {
        changes: [{ enrollmentId, classSubjectId: off['A:Mathematics'], registered: false }],
      },
    );
    expect(maths.statusCode).toBe(403);
    // The form teacher can now view the class roster.
    expect((await get(teacher, `/classes/${classAId}/students`)).statusCode).toBe(200);
  });

  it('ends a removed form teacher rather than deleting them', async () => {
    const res = await send(admin, 'PUT', `/academics/classes/${classAId}/form-teachers`, {
      teacherProfileIds: [],
    });
    expect(res.json<{ formTeachers: unknown[] }>().formTeachers).toEqual([]);
    const rows = await withTenant(prisma, schoolId, (tx) =>
      tx.formTeacherAssignment.findMany({ where: { schoolId, classId: classAId } }),
    );
    expect(rows.map((r) => r.status)).toEqual(['ENDED']);
    const g = (
      await get(teacher, `/academics/classes/${classAId}/subject-registrations`)
    ).json<Grid>();
    expect(g.offerings.map((o) => o.subjectName)).toEqual(['Agric']);
    // A teacher can't set form teachers.
    const denied = await send(teacher, 'PUT', `/academics/classes/${classAId}/form-teachers`, {
      teacherProfileIds: [teacherProfileId],
    });
    expect(denied.statusCode).toBe(403);
  });

  it('tells the story in the student history: enrolled, subject changes by whom, moved, not carried', async () => {
    const id = (
      await get(admin, `/academics/classes/${classAId}/subject-registrations`)
    ).json<Grid>().students[0]!.studentProfileId;
    // Student 0 takes Maths, Agric (by the teacher) and French (by the form teacher).
    await post(admin, `/students/${id}/enrollments`, {
      academicSessionId: sessionId,
      classId: classBId,
    });
    const history = (await get(admin, `/students/${id}/history`)).json<{
      sessions: {
        className: string;
        subjects: string[];
        events: {
          kind: string;
          summary: string;
          detail: string | null;
          actorRole: string | null;
        }[];
      }[];
      accountEvents: { summary: string }[];
    }>();
    expect(history.sessions).toHaveLength(1);
    const s = history.sessions[0]!;
    expect(s.className).toBe('SS1B');
    expect(s.subjects).toEqual(['Agric', 'Mathematics']);
    const summaries = s.events.map((e) => e.summary);
    expect(summaries[0]).toBe('Moved SS1A → SS1B');
    expect(s.events[0]!.detail).toBe('2 subjects; not offered here: French');
    expect(s.events[0]!.actorRole).toBe('SCHOOL_ADMIN');
    expect(summaries).toContain('Agric added');
    expect(summaries).toContain('French added');
    expect(summaries.at(-1)).toBe('Enrolled in SS1A');
    expect(s.events.find((e) => e.summary === 'Agric added')!.actorRole).toBe('TEACHER');
    expect(history.accountEvents.map((e) => e.summary)).toContain('Account created');
  });
});
