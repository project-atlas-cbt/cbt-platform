/**
 * ADR-0038 part 2 — student streams: the Stream list, a class's default
 * stream, each enrollment's stream, subjects offered to streams, and moving a
 * student between streams. Same HTTP harness as
 * subject-offering-kinds.integration.test.ts.
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
      await tx.classSubjectStream.deleteMany({ where: { schoolId } });
      await tx.classSubject.deleteMany({ where: { schoolId } });
      await tx.classGroup.deleteMany({ where: { schoolId } });
      await tx.stream.deleteMany({ where: { schoolId } });
      await tx.subject.deleteMany({ where: { schoolId } });
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

interface Registered {
  registrations: { subjectName: string; status: string }[];
}

describe('ADR-0038 student streams', () => {
  let schoolId: string;
  let admin: RequestCtx;
  let sessionId: string;
  let ss2aId: string;
  let science: { id: string; name: string; code: string };
  let business: { id: string; name: string; code: string };
  const subject: Record<string, string> = {};
  const offering: Record<string, string> = {};
  let ada: string; // joins through the class default, Science
  let bola: string; // enrolled into Business explicitly
  let chidi: string; // enrolled with no stream

  beforeAll(async () => {
    const school = await prisma.school.create({
      data: { name: `Streams ${randomUUID()}`, subdomain: `str-${randomUUID().slice(0, 8)}` },
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
    admin = await freshCtx(`${school.subdomain}.${ROOT_DOMAIN}`, `10.${RUN}.8.1`);
    await login(admin, 'admin01', 'a-real-password-123');

    sessionId = (
      await post(admin, '/academics/sessions', {
        name: `Streams ${randomUUID().slice(0, 8)}`,
        startDate: '2026-09-01',
        endDate: '2027-07-31',
      })
    ).json<{ id: string }>().id;

    for (const name of ['Mathematics', 'Physics', 'Commerce', 'Music']) {
      subject[name] = (
        await post(admin, '/academics/subjects', {
          name,
          code: `${name.slice(0, 3)}-${randomUUID().slice(0, 6)}`,
        })
      ).json<{ id: string }>().id;
    }
  });

  async function newStudent(first: string) {
    const res = await post(admin, '/students', {
      firstName: first,
      lastName: 'Test',
      studentId: `ST-${randomUUID().slice(0, 8)}`,
    });
    return res.json<{ studentProfileId: string }>().studentProfileId;
  }

  async function registeredSubjects(studentProfileId: string) {
    const res = await get(admin, `/students/${studentProfileId}/subject-registrations`);
    expect(res.statusCode).toBe(200);
    return res
      .json<Registered>()
      .registrations.filter((s) => s.status === 'REGISTERED')
      .map((s) => s.subjectName)
      .sort();
  }

  it('creates streams with upper-case codes and refuses a duplicate', async () => {
    const res = await post(admin, '/academics/streams', { name: 'Science', code: 'sci' });
    expect(res.statusCode).toBe(201);
    science = res.json<typeof science>();
    expect(science.code).toBe('SCI');
    business = (await post(admin, '/academics/streams', { name: 'Business', code: 'BUS' })).json<
      typeof business
    >();

    const dup = await post(admin, '/academics/streams', { name: 'Sciences', code: 'SCI' });
    expect(dup.statusCode).toBe(409);
  });

  it('gives a class a default stream and new students join it', async () => {
    const cls = await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      name: 'SS2A',
      level: 'SS2',
      arm: 'A',
      defaultStreamId: science.id,
    });
    expect(cls.statusCode).toBe(201);
    expect(cls.json<{ defaultStreamName: string }>().defaultStreamName).toBe('Science');
    ss2aId = cls.json<{ id: string }>().id;

    // The old class field is gone: sending it is a validation error.
    const legacy = await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      name: 'SS2Z',
      level: 'SS2',
      arm: 'Z',
      departmentId: randomUUID(),
    });
    expect(legacy.statusCode).toBe(400);

    ada = await newStudent('Ada');
    bola = await newStudent('Bola');
    chidi = await newStudent('Chidi');
    const enrolled = await post(admin, `/students/${ada}/enrollments`, {
      academicSessionId: sessionId,
      classId: ss2aId,
    });
    expect(enrolled.statusCode).toBe(200);
    expect(enrolled.json<{ streamId: string | null }>().streamId).toBe(science.id);
    await post(admin, `/students/${bola}/enrollments`, {
      academicSessionId: sessionId,
      classId: ss2aId,
      streamId: business.id,
    });
    await post(admin, `/students/${chidi}/enrollments`, {
      academicSessionId: sessionId,
      classId: ss2aId,
      streamId: null,
    });

    const roster = (await get(admin, `/classes/${ss2aId}/students`)).json<{
      students: { studentProfileId: string; streamName: string | null }[];
    }>().students;
    const streamOf = (id: string) => roster.find((s) => s.studentProfileId === id)?.streamName;
    expect(streamOf(ada)).toBe('Science');
    expect(streamOf(bola)).toBe('Business');
    expect(streamOf(chidi)).toBeNull();

    const list = (await get(admin, '/academics/streams')).json<{
      streams: { name: string; classCount: number; studentCount: number }[];
    }>().streams;
    expect(list.map((s) => [s.name, s.classCount, s.studentCount])).toEqual([
      ['Business', 0, 1],
      ['Science', 1, 1],
    ]);
  });

  it('registers a stream subject for that stream only', async () => {
    for (const [name, body] of [
      ['Mathematics', {}],
      ['Physics', { kind: 'ELECTIVE', streamIds: [science.id] }],
      ['Commerce', { kind: 'ELECTIVE', streamIds: [business.id] }],
      ['Music', { kind: 'ELECTIVE' }],
    ] as const) {
      const res = await post(admin, `/academics/classes/${ss2aId}/subjects`, {
        subjectId: subject[name],
        ...body,
      });
      expect(res.statusCode).toBe(201);
      offering[name] = res.json<{ id: string }>().id;
    }
    const offerings = (await get(admin, `/academics/classes/${ss2aId}/subjects`)).json<{
      offerings: { id: string; streamNames: string[] }[];
    }>().offerings;
    expect(offerings.find((o) => o.id === offering['Physics'])?.streamNames).toEqual(['Science']);

    expect(await registeredSubjects(ada)).toEqual(['Mathematics', 'Physics']);
    expect(await registeredSubjects(bola)).toEqual(['Commerce', 'Mathematics']);
    expect(await registeredSubjects(chidi)).toEqual(['Mathematics']);
  });

  it('lists a department’s classes through the subjects they offer', async () => {
    const dept = (
      await post(admin, '/academics/departments', {
        name: 'Sciences',
        code: `SC-${randomUUID().slice(0, 6)}`,
      })
    ).json<{ id: string }>();
    await send(admin, 'PATCH', `/academics/subjects/${subject['Physics']}`, {
      departmentId: dept.id,
    });
    const other = await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      name: 'SS2B',
      level: 'SS2',
      arm: 'B',
    });
    expect(other.statusCode).toBe(201);
    const res = await get(admin, `/academics/classes?departmentId=${dept.id}`);
    expect(res.json<{ classes: { name: string }[] }>().classes.map((c) => c.name)).toEqual([
      'SS2A',
    ]);
  });

  it('refuses streams on a compulsory subject', async () => {
    const res = await send(admin, 'PATCH', `/academics/class-subjects/${offering['Mathematics']}`, {
      streamIds: [science.id],
    });
    expect(res.statusCode).toBe(400);
  });

  it('adding a stream to an offering registers that stream’s students', async () => {
    const res = await send(admin, 'PATCH', `/academics/class-subjects/${offering['Music']}`, {
      kind: 'ELECTIVE',
      streamIds: [business.id],
    });
    expect(res.statusCode).toBe(200);
    expect(await registeredSubjects(bola)).toEqual(['Commerce', 'Mathematics', 'Music']);
    expect(await registeredSubjects(ada)).toEqual(['Mathematics', 'Physics']);
  });

  it('moving a student to another stream swaps the stream subjects and is in their history', async () => {
    const res = await send(admin, 'PUT', `/students/${ada}/stream`, { streamId: business.id });
    expect(res.statusCode).toBe(200);
    expect(await registeredSubjects(ada)).toEqual(['Commerce', 'Mathematics', 'Music']);

    const audits = await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.findMany({ where: { schoolId, action: 'STUDENT_STREAM_CHANGED' } }),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({
      fromStreamId: science.id,
      toStreamId: business.id,
    });

    const history = (await get(admin, `/students/${ada}/history`)).json<{
      sessions: { streamName: string | null; events: { kind: string; summary: string }[] }[];
    }>();
    const session = history.sessions[0]!;
    expect(session.streamName).toBe('Business');
    expect(session.events.find((e) => e.kind === 'STREAM_CHANGED')?.summary).toBe(
      'Stream changed: Science → Business',
    );

    // Out of every stream: the stream subjects go, the rest stay.
    await send(admin, 'PUT', `/students/${ada}/stream`, { streamId: null });
    expect(await registeredSubjects(ada)).toEqual(['Mathematics']);
  });

  it('giving a class a stream can place its students who have none', async () => {
    const cls = (
      await post(admin, '/academics/classes', {
        academicSessionId: sessionId,
        name: 'SS3A',
        level: 'SS3',
        arm: 'A',
      })
    ).json<{ id: string }>();
    await post(admin, `/academics/classes/${cls.id}/subjects`, {
      subjectId: subject['Commerce'],
      kind: 'ELECTIVE',
      streamIds: [business.id],
    });
    const dami = await newStudent('Dami');
    const efe = await newStudent('Efe');
    await post(admin, `/students/${dami}/enrollments`, {
      academicSessionId: sessionId,
      classId: cls.id,
    });
    await post(admin, `/students/${efe}/enrollments`, {
      academicSessionId: sessionId,
      classId: cls.id,
      streamId: science.id,
    });

    const res = await send(admin, 'PATCH', `/academics/classes/${cls.id}`, {
      defaultStreamId: business.id,
      placeStudentsWithoutStream: true,
    });
    expect(res.statusCode).toBe(200);
    const roster = (await get(admin, `/classes/${cls.id}/students`)).json<{
      students: { studentProfileId: string; streamName: string | null }[];
    }>().students;
    expect(roster.find((s) => s.studentProfileId === dami)?.streamName).toBe('Business');
    expect(roster.find((s) => s.studentProfileId === efe)?.streamName).toBe('Science');
    expect(await registeredSubjects(dami)).toEqual(['Commerce']);
    expect(await registeredSubjects(efe)).toEqual([]);
  });

  it('keeps a stream in use and lets it be deactivated instead', async () => {
    const refused = await del(admin, `/academics/streams/${science.id}`);
    expect(refused.statusCode).toBe(409);

    const off = await send(admin, 'PATCH', `/academics/streams/${science.id}`, {
      status: 'INACTIVE',
    });
    expect(off.statusCode).toBe(200);
    const pick = await send(admin, 'PUT', `/students/${chidi}/stream`, { streamId: science.id });
    expect(pick.statusCode).toBe(400);

    const unused = (await post(admin, '/academics/streams', { name: 'Arts', code: 'ART' })).json<{
      id: string;
    }>();
    expect((await del(admin, `/academics/streams/${unused.id}`)).statusCode).toBe(200);
  });
});
