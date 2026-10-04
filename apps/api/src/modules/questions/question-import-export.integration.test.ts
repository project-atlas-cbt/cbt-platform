/**
 * B8 — question bulk import (extends B7's pipeline) and export. Mirrors
 * `imports.integration.test.ts`'s own harness exactly, including its
 * "background jobs invoked directly, not via a live BullMQ consumer"
 * precedent.
 *
 * Covers: the full validate -> confirm -> commit pipeline creating real
 * DRAFT questions; per-row validation (insufficient options, bad
 * difficulty/marks, unresolvable subject/class, out-of-scope); topic
 * auto-create on import; `QUESTION_IMPORT_REQUIRES_TEACHER_PROFILE` for an
 * uploader with no `TeacherProfile`; and the question-bank export's CSV
 * shape (via B18's `POST /v1/exports`, which replaced `GET /questions/export`).
 */
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppModule } from '../../app.module.js';
import { PasswordService } from '../identity/password.service.js';
import { ImportValidationService } from '../imports/import-validation.service.js';
import { ImportCommitService } from '../imports/import-commit.service.js';
import { IMPORT_TEMPLATE_VERSION } from '../imports/import-templates.js';
import {
  EXPORT_CLAIM_STALE_MS,
  ExportClaimHeldError,
  ExportService,
} from '../reports/export.service.js';
import { ownerPrisma } from '../../test-support/owner-prisma.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
const RUN = Math.floor(Math.random() * 200) + 1;

let app: NestFastifyApplication;
let validation: ImportValidationService;
let commit: ImportCommitService;
const passwords = new PasswordService();

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  validation = app.get(ImportValidationService);
  commit = app.get(ImportCommitService);
});

afterAll(async () => {
  await app.close();
});

function rawRequest(method: string, url: string, body?: Buffer): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method,
        headers: body
          ? { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length }
          : {},
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Question Import Test School ${randomUUID()}`,
      subdomain: `qbi-${randomUUID().slice(0, 8)}`,
    },
  });
}

async function seedUser(schoolId: string, loginIdentifier: string, password: string, role: Role) {
  const passwordHash = await passwords.hash(password);
  const user = await prisma.user.create({
    data: {
      firstName: 'Test',
      lastName: 'User',
      displayName: `Test User ${loginIdentifier}`,
      passwordHash,
      status: 'ACTIVE',
      credentialState: 'OK',
    },
  });
  const membership = await withTenant(prisma, schoolId, (tx) =>
    tx.schoolMembership.create({
      data: { schoolId, userId: user.id, loginIdentifier, status: 'ACTIVE' },
    }),
  );
  await withTenant(prisma, schoolId, (tx) =>
    tx.roleAssignment.create({ data: { schoolId, membershipId: membership.id, role } }),
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
  const sessionCookie = extractCookie(res.headers['set-cookie'], 'atlas_session');
  if (sessionCookie) ctx.sessionCookie = sessionCookie;
  return res;
}

function csv(lines: string[]): Buffer {
  return Buffer.from(lines.join('\r\n') + '\r\n', 'utf-8');
}

/** Uses the QUESTIONS-specific upload-target pair (`questionBank.import`),
 * not the generic `/imports/upload-target` (`users.import.students`) —
 * Teacher/HOD hold the former but not the latter. See
 * `imports.controller.ts`'s own doc comment on this route pair. */
async function uploadImportFile(ctx: RequestCtx, buffer: Buffer): Promise<string> {
  const requestRes = await post(ctx, '/imports/questions/upload-target', {
    filename: 'questions.csv',
    declaredMimeType: 'text/csv',
    declaredSizeBytes: buffer.length,
  });
  expect(requestRes.statusCode).toBe(201);
  const target = requestRes.json<{ mediaAssetId: string; uploadUrl: string }>();
  const putRes = await rawRequest('PUT', target.uploadUrl, buffer);
  expect(putRes.status).toBe(200);
  const completeRes = await post(
    ctx,
    `/imports/questions/upload-target/${target.mediaAssetId}/complete`,
  );
  expect(completeRes.statusCode).toBe(201);
  return target.mediaAssetId;
}

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, (tx) => tx.importRow.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.importJob.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) =>
      tx.question.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) => tx.topic.deleteMany({ where: { schoolId } })).catch(
      () => undefined,
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.teacherAssignment.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.classSubject.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.classGroup.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.subject.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.mediaAsset.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.roleAssignment.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
    await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
  await prisma.school
    .deleteMany({ where: { id: { in: createdSchoolIds } } })
    .catch(() => undefined);
});

describe('B8 — question import/export', () => {
  let schoolId: string;
  let host: string;
  let admin: RequestCtx;
  let teacher: RequestCtx;
  let sessionId: string;
  let classId: string; // SS2A
  let mathSubjectId: string;

  beforeAll(async () => {
    const school = await createSchool();
    schoolId = school.id;
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolId);
    const { user: adminUser } = await seedUser(
      schoolId,
      `qimp-admin-${RUN}`,
      'CorrectHorseBattery1!',
      'SCHOOL_ADMIN',
    );
    createdUserIds.push(adminUser.id);
    admin = await freshCtx(host, `10.${RUN}.10.1`);
    await login(admin, `qimp-admin-${RUN}`, 'CorrectHorseBattery1!');

    const sessionRes = await post(admin, '/academics/sessions', {
      name: `QImp Session ${randomUUID().slice(0, 8)}`,
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
    classId = classRes.json<{ id: string }>().id;
    mathSubjectId = (
      await post(admin, '/academics/subjects', {
        name: 'Mathematics',
        code: `MTH-${randomUUID().slice(0, 6)}`,
      })
    ).json<{ id: string }>().id;
    const offeringId = (
      await post(admin, `/academics/classes/${classId}/subjects`, { subjectId: mathSubjectId })
    ).json<{ id: string }>().id;

    const teacherRes = await post(admin, '/teachers', {
      firstName: 'Ade',
      lastName: 'Ola',
      email: `ade-${randomUUID().slice(0, 8)}@example.com`,
      staffId: `STF-${randomUUID().slice(0, 8)}`,
    });
    const teacherBody = teacherRes.json<{
      teacherProfileId: string;
      membershipId: string;
      loginIdentifier: string;
    }>();
    await put(admin, `/teachers/${teacherBody.teacherProfileId}/assignments`, {
      academicSessionId: sessionId,
      classSubjectIds: [offeringId],
    });
    const teacherPasswordHash = await passwords.hash('CorrectHorseBattery1!');
    const membershipRow = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findUniqueOrThrow({ where: { id: teacherBody.membershipId } }),
    );
    await prisma.user.update({
      where: { id: membershipRow.userId },
      data: { passwordHash: teacherPasswordHash, credentialState: 'OK', status: 'ACTIVE' },
    });
    teacher = await freshCtx(host, `10.${RUN}.10.2`);
    await login(teacher, teacherBody.loginIdentifier, 'CorrectHorseBattery1!');
  });

  it('QUESTION_IMPORT_REQUIRES_TEACHER_PROFILE: a School Admin (no TeacherProfile) cannot import', async () => {
    const buffer = csv([
      `# template-version: ${IMPORT_TEMPLATE_VERSION}`,
      'Question,Option A,Option B,Option C,Option D,Correct Answer,Subject,Class,Topic,Difficulty,Marks',
      'irrelevant,A,B,,,A,Mathematics,SS2A,,EASY,1',
    ]);
    const mediaAssetId = await uploadImportFile(admin, buffer);
    const res = await post(admin, '/imports/questions', { mediaAssetId });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'QUESTION_IMPORT_REQUIRES_TEACHER_PROFILE',
    );
  });

  it('validates, confirms, and commits — creating real DRAFT questions, auto-creating topics, per-row errors', async () => {
    const buffer = csv([
      `# template-version: ${IMPORT_TEMPLATE_VERSION}`,
      'Question,Option A,Option B,Option C,Option D,Correct Answer,Subject,Class,Topic,Difficulty,Marks',
      `What is 2+2 ${RUN}?,3,4,5,,B,Mathematics,SS2A,Addition,EASY,2`,
      // Invalid: no correct answer.
      `Bad row ${RUN},A,B,,,,Mathematics,SS2A,,EASY,1`,
      // Invalid: unresolvable subject.
      `Bad row 2 ${RUN},A,B,,,A,NoSuchSubject,SS2A,,EASY,1`,
      // Invalid: bad difficulty.
      `Bad row 3 ${RUN},A,B,,,A,Mathematics,SS2A,,WRONG,1`,
    ]);
    const mediaAssetId = await uploadImportFile(teacher, buffer);

    const createRes = await post(teacher, '/imports/questions', { mediaAssetId });
    expect(createRes.statusCode).toBe(201);
    const job = createRes.json<{ id: string; status: string; type: string }>();
    expect(job.type).toBe('QUESTIONS');

    await validation.validate(schoolId, job.id);
    const afterValidate = await get(teacher, `/imports/${job.id}`);
    const detail = afterValidate.json<{
      status: string;
      totalRows: number;
      validRows: number;
      invalidRows: number;
    }>();
    expect(detail.status).toBe('VALIDATED');
    expect(detail.totalRows).toBe(4);
    expect(detail.validRows).toBe(1);
    expect(detail.invalidRows).toBe(3);

    const confirmRes = await post(teacher, `/imports/${job.id}/confirm`);
    expect(confirmRes.statusCode).toBe(200);
    await commit.commit(schoolId, job.id);

    const afterCommit = await get(teacher, `/imports/${job.id}`);
    const finalDetail = afterCommit.json<{
      status: string;
      committedRows: number;
      failedRows: number;
    }>();
    expect(finalDetail.status).toBe('COMPLETED');
    expect(finalDetail.committedRows).toBe(1);
    expect(finalDetail.failedRows).toBe(0);

    const listRes = await get(teacher, `/questions?subjectId=${mathSubjectId}`);
    const created = listRes
      .json<{ questions: { id: string; topicName: string | null; currentStatus: string }[] }>()
      .questions.find((q) => q.topicName === 'Addition');
    expect(created).toBeDefined();
    expect(created?.currentStatus).toBe('DRAFT');

    const detailRes = await get(teacher, `/questions/${created!.id}`);
    const revisions = detailRes.json<{
      revisions: { options: { content: string; correctFlag: boolean }[] }[];
    }>().revisions;
    const correct = revisions[0]!.options.find((o) => o.correctFlag);
    expect(correct?.content).toBe('4'); // "Correct Answer: B" -> Option B's content
  });

  // B18 replaced `GET /questions/export` with the reports module's async
  // export (`POST /exports` type QUESTION_BANK → background job → tokened
  // download). Same CSV builder, so the re-importable template shape is
  // asserted here, through the route that actually ships. The app's own
  // BullMQ export worker may pick the job up first (it did in CI), so the
  // test runs it directly only while it is still waiting, per this file's
  // "background jobs invoked directly" precedent, then waits for completion.
  it('the QUESTION_BANK export produces a re-importable, template-shaped CSV', async () => {
    await post(teacher, '/questions', {
      subjectId: mathSubjectId,
      level: 'SS2',
      questionType: 'SINGLE_CHOICE',
      content: 'Export me',
      difficulty: 'EASY',
      marks: 3,
      options: [
        { content: 'X', correctFlag: false },
        { content: 'Y', correctFlag: true },
      ],
    });
    const created = await post(teacher, '/exports', {
      type: 'QUESTION_BANK',
      scope: { subjectId: mathSubjectId, level: 'SS2' },
    });
    expect(created.statusCode).toBe(202);
    const jobId = created.json<{ id: string }>().id;
    // The in-process export worker may have claimed the job first: then
    // generate() leaves it to that run (B22: by asking to be retried).
    await app
      .get(ExportService)
      .generate(schoolId, jobId)
      .catch((err: unknown) => {
        if (!(err instanceof ExportClaimHeldError)) throw err;
      });
    let job: { status: string; downloadUrl?: string } = { status: 'PENDING' };
    for (let i = 0; i < 50 && job.status !== 'COMPLETED' && job.status !== 'FAILED'; i++) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 200));
      const status = await get(teacher, `/exports/${jobId}`);
      expect(status.statusCode).toBe(200);
      job = status.json<{ status: string; downloadUrl?: string }>();
    }
    expect(job.status).toBe('COMPLETED');
    const downloadUrl = job.downloadUrl ?? '';
    const res = await get(teacher, downloadUrl.replace(/^\/v1/, ''));
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body).toContain(`# template-version: ${IMPORT_TEMPLATE_VERSION}`);
    expect(res.body).toContain(
      'Question,Option A,Option B,Option C,Option D,Correct Answer,Subject,Class,Topic,Difficulty,Marks,Status',
    );
    expect(res.body).toContain('Export me');

    // B22: a worker killed mid-generation leaves the export PROCESSING. Once
    // that claim is stale, the redelivered job takes it over and finishes
    // it, instead of finding nothing to claim and stranding it.
    await ownerPrisma().$executeRaw`
      UPDATE export_jobs
         SET status = 'PROCESSING',
             updated_at = now() - make_interval(secs => ${EXPORT_CLAIM_STALE_MS / 1000 + 60})
       WHERE id = ${jobId}::uuid`;
    await app.get(ExportService).generate(schoolId, jobId);
    const retaken = await get(teacher, `/exports/${jobId}`);
    expect(retaken.json<{ status: string }>().status).toBe('COMPLETED');
  });

  // Regression: `assertCanAccessJob` used to narrow every non-admin role
  // (Teacher *and* HOD alike) down to "only a job they themselves
  // uploaded" — denying an HOD real DEPARTMENT-scoped oversight of a
  // colleague teacher's QUESTIONS import job within their own department,
  // contrary to `questionBank.import`'s own declared `HOD: DEPARTMENT`
  // grant. A same-school, different-department HOD must still be denied —
  // this proves the join is real department scoping, not a blanket
  // "any HOD" bypass.
  describe("HOD DEPARTMENT-scoped access to a colleague's QUESTIONS import job", () => {
    let colleagueJobId: string;
    let inDepartmentHod: RequestCtx;
    let outOfDepartmentHod: RequestCtx;

    beforeAll(async () => {
      const deptRes = await post(admin, '/academics/departments', {
        name: `Sciences ${randomUUID().slice(0, 6)}`,
        code: `SCI-${randomUUID().slice(0, 6)}`,
      });
      const departmentId = deptRes.json<{ id: string }>().id;
      await patch(admin, `/academics/subjects/${mathSubjectId}`, { departmentId });

      const otherDeptRes = await post(admin, '/academics/departments', {
        name: `Arts ${randomUUID().slice(0, 6)}`,
        code: `ART-${randomUUID().slice(0, 6)}`,
      });
      const otherDepartmentId = otherDeptRes.json<{ id: string }>().id;

      // The HOD who genuinely manages mathSubjectId's department — promoted
      // from a fresh teacher (not `teacher`, so this stays independent of
      // the colleague uploader below).
      const hodTeacherRes = await post(admin, '/teachers', {
        firstName: 'Hodo',
        lastName: 'Manager',
        email: `hod-${randomUUID().slice(0, 8)}@example.com`,
        staffId: `STF-${randomUUID().slice(0, 8)}`,
      });
      const hodTeacherBody = hodTeacherRes.json<{
        membershipId: string;
        loginIdentifier: string;
      }>();
      const hodPasswordHash = await passwords.hash('CorrectHorseBattery1!');
      const hodMembership = await withTenant(prisma, schoolId, (tx) =>
        tx.schoolMembership.findUniqueOrThrow({ where: { id: hodTeacherBody.membershipId } }),
      );
      await prisma.user.update({
        where: { id: hodMembership.userId },
        data: { passwordHash: hodPasswordHash, credentialState: 'OK', status: 'ACTIVE' },
      });
      await post(admin, '/hods', { membershipId: hodTeacherBody.membershipId });
      await put(admin, `/hods/${hodTeacherBody.membershipId}/department`, {
        departmentId,
        academicSessionId: sessionId,
      });
      inDepartmentHod = await freshCtx(host, `10.${RUN}.10.3`);
      await login(inDepartmentHod, hodTeacherBody.loginIdentifier, 'CorrectHorseBattery1!');

      // An HOD of a *different* department — must not gain access merely
      // by being an HOD somewhere.
      const otherHodTeacherRes = await post(admin, '/teachers', {
        firstName: 'Other',
        lastName: 'Hod',
        email: `otherhod-${randomUUID().slice(0, 8)}@example.com`,
        staffId: `STF-${randomUUID().slice(0, 8)}`,
      });
      const otherHodTeacherBody = otherHodTeacherRes.json<{
        membershipId: string;
        loginIdentifier: string;
      }>();
      const otherHodPasswordHash = await passwords.hash('CorrectHorseBattery1!');
      const otherHodMembership = await withTenant(prisma, schoolId, (tx) =>
        tx.schoolMembership.findUniqueOrThrow({ where: { id: otherHodTeacherBody.membershipId } }),
      );
      await prisma.user.update({
        where: { id: otherHodMembership.userId },
        data: { passwordHash: otherHodPasswordHash, credentialState: 'OK', status: 'ACTIVE' },
      });
      await post(admin, '/hods', { membershipId: otherHodTeacherBody.membershipId });
      await put(admin, `/hods/${otherHodTeacherBody.membershipId}/department`, {
        departmentId: otherDepartmentId,
        academicSessionId: sessionId,
      });
      outOfDepartmentHod = await freshCtx(host, `10.${RUN}.10.4`);
      await login(outOfDepartmentHod, otherHodTeacherBody.loginIdentifier, 'CorrectHorseBattery1!');

      // `teacher` (seeded in the outer beforeAll, assigned to
      // mathSubjectId/SS2A — now under `departmentId`) uploads the job this
      // test's HODs contend over.
      const buffer = csv([
        `# template-version: ${IMPORT_TEMPLATE_VERSION}`,
        'Question,Option A,Option B,Option C,Option D,Correct Answer,Subject,Class,Topic,Difficulty,Marks',
        `Department scope regression ${RUN},A,B,,,A,Mathematics,SS2A,,EASY,1`,
      ]);
      const mediaAssetId = await uploadImportFile(teacher, buffer);
      const jobRes = await post(teacher, '/imports/questions', { mediaAssetId });
      expect(jobRes.statusCode).toBe(201);
      colleagueJobId = jobRes.json<{ id: string }>().id;
    });

    it("an HOD who manages the uploader's department can view the job", async () => {
      const res = await get(inDepartmentHod, `/imports/${colleagueJobId}`);
      expect(res.statusCode).toBe(200);
    });

    it('an HOD of an unrelated department is still denied', async () => {
      const res = await get(outOfDepartmentHod, `/imports/${colleagueJobId}`);
      expect(res.statusCode).toBe(403);
    });
  });
});
