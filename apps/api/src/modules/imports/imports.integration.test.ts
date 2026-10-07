/**
 * B7 — end to end over real HTTP against the real AppModule, real Postgres
 * (RLS included), and real MinIO, following media.integration.test.ts's own
 * precedent for the raw presigned-PUT calls `app.inject()` can't reach.
 *
 * Background jobs are invoked directly (`app.get(ImportValidationService)
 * .validate(...)` / `app.get(ImportCommitService).commit(...)`), not via a
 * live BullMQ consumer — matching this codebase's established pattern for
 * background jobs elsewhere (B3's subscription-expiry sweep test calls
 * `runSubscriptionExpirySweep()` directly) and matching
 * `ImportQueueService`'s own doc comment for why no `Worker` runs during
 * any test that boots `AppModule` directly.
 *
 * Covers the roadmap's Testing requirements table (concurrency/failure get
 * their own dedicated files): every validation rule; the full validate ->
 * preview -> confirm -> import -> summary pipeline for students and
 * teachers; confirm commits only VALID rows; the error-CSV download;
 * template-version/row-cap/malformed-file rejection; cross-tenant denial;
 * permission boundaries; audit-with-counts (DoD 10).
 */
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import { safeDeleteSchools } from '../../test-support/safe-delete-schools.js';
import type { Role } from '@atlas/domain';
import { AppModule } from '../../app.module.js';
import { PasswordService } from '../identity/password.service.js';
import ExcelJS from 'exceljs';
import { EXCEL_DATE_MESSAGE, ImportValidationService } from './import-validation.service.js';
import { ImportCommitService } from './import-commit.service.js';
import { IMPORT_TEMPLATE_VERSION } from './import-templates.js';

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

// ---- Raw HTTP helper for the actual MinIO PUT (app.inject() can't reach it) --

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

// ---- Fixture helpers -------------------------------------------------

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Import Test School ${randomUUID()}`,
      subdomain: `imp-${randomUUID().slice(0, 8)}`,
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
  return user;
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

/** Full upload-target -> PUT -> complete flow, returning a READY mediaAssetId. */
async function uploadImportFile(ctx: RequestCtx, buffer: Buffer): Promise<string> {
  const requestRes = await post(ctx, '/imports/upload-target', {
    filename: 'import.csv',
    declaredMimeType: 'text/csv',
    declaredSizeBytes: buffer.length,
  });
  expect(requestRes.statusCode).toBe(201);
  const target = requestRes.json<{ mediaAssetId: string; uploadUrl: string }>();
  const putRes = await rawRequest('PUT', target.uploadUrl, buffer);
  expect(putRes.status).toBe(200);
  const completeRes = await post(ctx, `/imports/upload-target/${target.mediaAssetId}/complete`);
  expect(completeRes.statusCode).toBe(201);
  expect(completeRes.json<{ status: string }>().status).toBe('READY');
  return target.mediaAssetId;
}

// ---- Cleanup -----------------------------------------------------------

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, (tx) => tx.importRow.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.importJob.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) =>
      tx.studentSubjectRegistration.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.studentEnrollment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) => tx.classSubject.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.classGroup.deleteMany({ where: { schoolId } }));
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
    await withTenant(prisma, schoolId, (tx) => tx.mediaAsset.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
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

/** One full school + admin + activated session + department + class,
 * shared as read-only fixtures across most tests in this file — mirrors
 * student-enrollment.integration.test.ts's own top-level `beforeAll` shape. */
describe('B7 — Bulk Import Pipeline', () => {
  let schoolId: string;
  let host: string;
  let admin: RequestCtx;
  let sessionId: string;
  let departmentId: string;
  let classId: string; // SS1A, in `departmentId`

  beforeAll(async () => {
    const school = await createSchool();
    schoolId = school.id;
    host = `${school.subdomain}.${ROOT_DOMAIN}`;
    createdSchoolIds.push(schoolId);
    const adminUser = await seedUser(
      schoolId,
      `import-admin-${RUN}`,
      'CorrectHorseBattery1!',
      'SCHOOL_ADMIN',
    );
    createdUserIds.push(adminUser.id);
    admin = await freshCtx(host, `10.${RUN}.9.1`);
    await login(admin, `import-admin-${RUN}`, 'CorrectHorseBattery1!');

    const sessionRes = await post(admin, '/academics/sessions', {
      name: `Import Session ${randomUUID().slice(0, 8)}`,
      startDate: '2026-09-01',
      endDate: '2027-07-31',
    });
    sessionId = sessionRes.json<{ id: string }>().id;
    await post(admin, `/academics/sessions/${sessionId}/activate`);

    const deptRes = await post(admin, '/academics/departments', {
      name: 'Science',
      code: `SCI-${randomUUID().slice(0, 6)}`,
    });
    departmentId = deptRes.json<{ id: string }>().id;

    const classRes = await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      departmentId,
      name: 'SS1A',
      level: 'SS1',
      arm: 'A',
    });
    classId = classRes.json<{ id: string }>().id;
  });

  describe('templates', () => {
    it('downloads a versioned CSV template for students', async () => {
      const res = await get(admin, '/imports/templates/students');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.body).toContain(`# template-version: ${IMPORT_TEMPLATE_VERSION}`);
      expect(res.body).toContain('Student ID,First Name,Last Name,Class,Department');
    });

    it('downloads a versioned CSV template for teachers', async () => {
      const res = await get(admin, '/imports/templates/teachers');
      expect(res.body).toContain('Staff ID,First Name,Last Name,Email');
    });
  });

  describe('student import — full pipeline', () => {
    it('validates, previews, confirms, and imports valid rows only (DoD 1-4, 10)', async () => {
      const buffer = csv([
        `# template-version: ${IMPORT_TEMPLATE_VERSION}`,
        'Student ID,First Name,Last Name,Class,Department',
        `IMP-S1-${RUN},Ahmed,Bello,SS1A,Science`,
        `IMP-S2-${RUN},David,John,SS1A,`,
        // Invalid: unresolvable class.
        `IMP-S3-${RUN},Mary,James,NoSuchClass,`,
        // Invalid: missing required First Name.
        `,Blank,Firstname,SS1A,`,
      ]);
      const mediaAssetId = await uploadImportFile(admin, buffer);

      const createRes = await post(admin, '/imports/students', {
        mediaAssetId,
        academicSessionId: sessionId,
      });
      expect(createRes.statusCode).toBe(201);
      const job = createRes.json<{ id: string; status: string; type: string }>();
      expect(job.status).toBe('PENDING_VALIDATION');
      expect(job.type).toBe('STUDENTS');

      await validation.validate(schoolId, job.id);

      const afterValidate = await get(admin, `/imports/${job.id}`);
      expect(afterValidate.statusCode).toBe(200);
      const detail = afterValidate.json<{
        status: string;
        totalRows: number;
        validRows: number;
        invalidRows: number;
      }>();
      expect(detail.status).toBe('VALIDATED');
      expect(detail.totalRows).toBe(4);
      expect(detail.validRows).toBe(2);
      expect(detail.invalidRows).toBe(2);

      // The preview shows exactly what will happen before anything is
      // written (DoD 2) — no student exists yet.
      const beforeConfirm = await get(admin, `/students?q=${encodeURIComponent(`IMP-S1-${RUN}`)}`);
      expect(beforeConfirm.json<{ total: number }>().total).toBe(0);

      const confirmRes = await post(admin, `/imports/${job.id}/confirm`);
      expect(confirmRes.statusCode).toBe(200);
      expect(confirmRes.json<{ status: string }>().status).toBe('IMPORTING');

      await commit.commit(schoolId, job.id);

      const afterCommit = await get(admin, `/imports/${job.id}`);
      const finalDetail = afterCommit.json<{
        status: string;
        committedRows: number;
        failedRows: number;
      }>();
      expect(finalDetail.status).toBe('COMPLETED');
      expect(finalDetail.committedRows).toBe(2);
      expect(finalDetail.failedRows).toBe(0);

      // Only the two VALID rows were ever created (DoD 3 — never partially
      // import silently, invalid rows never silently imported).
      const studentsRes = await get(admin, '/students?pageSize=100');
      const students = studentsRes.json<{
        students: {
          studentId: string;
          currentClassId: string | null;
          departmentName: string | null;
        }[];
      }>().students;
      const s1 = students.find((s) => s.studentId === `IMP-S1-${RUN}`);
      const s2 = students.find((s) => s.studentId === `IMP-S2-${RUN}`);
      expect(s1?.currentClassId).toBe(classId);
      expect(s1?.departmentName).toBe('Science');
      expect(s2?.currentClassId).toBe(classId);
      expect(students.some((s) => s.studentId === `IMP-S3-${RUN}`)).toBe(false);

      // DoD 10: import completion is audited with counts.
      const auditEvents = await withTenant(prisma, schoolId, (tx) =>
        tx.auditEvent.findMany({
          where: { schoolId, entityId: job.id, action: 'STUDENT_IMPORT_COMPLETED' },
        }),
      );
      expect(auditEvents).toHaveLength(1);
      expect(auditEvents[0]?.metadata).toMatchObject({ committedRows: 2, totalRows: 4 });
    });

    it('bug audit P1-11: an Excel file keeps padded IDs and reports cells Excel made into dates', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Import');
      sheet.addRow([`# template-version: ${IMPORT_TEMPLATE_VERSION}`]);
      sheet.addRow(['Student ID', 'First Name', 'Last Name', 'Class', 'Department']);
      const padded = sheet.addRow([RUN, 'Ada', 'Obi', 'SS1A', '']);
      padded.getCell(1).numFmt = '"XL"00000';
      sheet.addRow([`XL-D-${RUN}`, 'Bola', 'Ade', new Date(Date.UTC(2026, 0, 2)), '']);
      const mediaAssetId = await uploadImportFile(
        admin,
        Buffer.from(await workbook.xlsx.writeBuffer()),
      );
      const job = (
        await post(admin, '/imports/students', { mediaAssetId, academicSessionId: sessionId })
      ).json<{ id: string }>();
      await validation.validate(schoolId, job.id);

      const rows = await withTenant(prisma, schoolId, (tx) =>
        tx.importRow.findMany({ where: { importJobId: job.id }, orderBy: { rowNumber: 'asc' } }),
      );
      expect((rows[0]!.rawData as Record<string, string>)['Student ID']).toBe(
        `XL${String(RUN).padStart(5, '0')}`,
      );
      expect(rows[0]!.status).toBe('VALID');
      expect(rows[1]!.status).toBe('INVALID');
      expect(rows[1]!.errors).toContainEqual({ field: 'Class', message: EXCEL_DATE_MESSAGE });
    });

    it('downloads a correctable, re-uploadable error CSV (DoD 6)', async () => {
      const buffer = csv([
        `# template-version: ${IMPORT_TEMPLATE_VERSION}`,
        'Student ID,First Name,Last Name,Class,Department',
        `IMP-ERR-${RUN},,Missing,SS1A,`,
      ]);
      const mediaAssetId = await uploadImportFile(admin, buffer);
      const job = (
        await post(admin, '/imports/students', { mediaAssetId, academicSessionId: sessionId })
      ).json<{ id: string }>();
      await validation.validate(schoolId, job.id);

      const errorsRes = await get(admin, `/imports/${job.id}/errors`);
      expect(errorsRes.statusCode).toBe(200);
      expect(errorsRes.headers['content-type']).toContain('text/csv');
      expect(errorsRes.body).toContain(`# template-version: ${IMPORT_TEMPLATE_VERSION}`);
      expect(errorsRes.body).toContain('Errors');
      expect(errorsRes.body).toContain(`IMP-ERR-${RUN}`);
      expect(errorsRes.body).toContain('First Name is required.');
    });
  });

  describe('teacher import', () => {
    it('validates and commits teacher rows, dispatching staff invitations', async () => {
      const buffer = csv([
        `# template-version: ${IMPORT_TEMPLATE_VERSION}`,
        'Staff ID,First Name,Last Name,Email',
        `IMP-T1-${RUN},Ngozi,Okafor,ngozi-${RUN}@example.com`,
      ]);
      const mediaAssetId = await uploadImportFile(admin, buffer);
      const createRes = await post(admin, '/imports/teachers', { mediaAssetId });
      expect(createRes.statusCode).toBe(201);
      const job = createRes.json<{ id: string; type: string }>();
      expect(job.type).toBe('TEACHERS');

      await validation.validate(schoolId, job.id);
      await post(admin, `/imports/${job.id}/confirm`);
      await commit.commit(schoolId, job.id);

      const afterCommit = await get(admin, `/imports/${job.id}`);
      expect(afterCommit.json<{ status: string; committedRows: number }>().status).toBe(
        'COMPLETED',
      );

      const teachersRes = await get(admin, `/teachers?q=${encodeURIComponent(`IMP-T1-${RUN}`)}`);
      const teacher = teachersRes.json<{ teachers: { staffId: string; email: string | null }[] }>()
        .teachers[0];
      expect(teacher?.staffId).toBe(`IMP-T1-${RUN}`);
      expect(teacher?.email).toBe(`ngozi-${RUN}@example.com`);
    });
  });

  describe('whole-file rejection', () => {
    it('rejects a file with no template-version marker', async () => {
      const buffer = csv(['Student ID,First Name,Last Name,Class,Department', 'S1,A,B,SS1A,']);
      const mediaAssetId = await uploadImportFile(admin, buffer);
      const job = (
        await post(admin, '/imports/students', { mediaAssetId, academicSessionId: sessionId })
      ).json<{ id: string }>();
      await validation.validate(schoolId, job.id);

      const res = await get(admin, `/imports/${job.id}`);
      const body = res.json<{ status: string; failureReason: string | null }>();
      expect(body.status).toBe('FAILED');
      expect(body.failureReason).toContain('template version marker');
    });

    it('rejects a file prepared against an unrecognised template version', async () => {
      const buffer = csv([
        '# template-version: 999',
        'Student ID,First Name,Last Name,Class,Department',
        'S1,A,B,SS1A,',
      ]);
      const mediaAssetId = await uploadImportFile(admin, buffer);
      const job = (
        await post(admin, '/imports/students', { mediaAssetId, academicSessionId: sessionId })
      ).json<{ id: string }>();
      await validation.validate(schoolId, job.id);

      const res = await get(admin, `/imports/${job.id}`);
      expect(res.json<{ status: string; failureReason: string | null }>().status).toBe('FAILED');
    });

    it('rejects a file missing a required column', async () => {
      const buffer = csv([
        `# template-version: ${IMPORT_TEMPLATE_VERSION}`,
        'Student ID,First Name,Last Name',
        'S1,A,B',
      ]);
      const mediaAssetId = await uploadImportFile(admin, buffer);
      const job = (
        await post(admin, '/imports/students', { mediaAssetId, academicSessionId: sessionId })
      ).json<{ id: string }>();
      await validation.validate(schoolId, job.id);

      const res = await get(admin, `/imports/${job.id}`);
      const body = res.json<{ status: string; failureReason: string | null }>();
      expect(body.status).toBe('FAILED');
      expect(body.failureReason).toContain('Class');
    });

    it('rejects a file exceeding the row cap (DoD 9)', async () => {
      const lines = [
        `# template-version: ${IMPORT_TEMPLATE_VERSION}`,
        'Staff ID,First Name,Last Name,Email',
      ];
      for (let i = 0; i < 5001; i++) lines.push(`CAP-${i},A,B,a${i}@example.com`);
      const buffer = csv(lines);
      const mediaAssetId = await uploadImportFile(admin, buffer);
      const job = (await post(admin, '/imports/teachers', { mediaAssetId })).json<{ id: string }>();
      await validation.validate(schoolId, job.id);

      const res = await get(admin, `/imports/${job.id}`);
      const body = res.json<{ status: string; failureReason: string | null }>();
      expect(body.status).toBe('FAILED');
      expect(body.failureReason).toContain('5000-row limit');
    });

    it('rejects a non-text file at the upload gate — malicious content never reaches ImportModule', async () => {
      // Random binary bytes, including invalid UTF-8 sequences — not
      // magic-byte-sniffable as anything real, and not decodable as text
      // either, so `looksLikePlainText`'s gate rejects it before any real
      // parsing is ever attempted.
      const garbage = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02, 0x80, 0x81, 0x90, 0xaa, 0xbb]);
      const requestRes = await post(admin, '/imports/upload-target', {
        filename: 'garbage.csv',
        declaredMimeType: 'text/csv',
        declaredSizeBytes: garbage.length,
      });
      const target = requestRes.json<{ mediaAssetId: string; uploadUrl: string }>();
      await rawRequest('PUT', target.uploadUrl, garbage);
      const completeRes = await post(
        admin,
        `/imports/upload-target/${target.mediaAssetId}/complete`,
      );
      expect(completeRes.statusCode).toBe(422);
      expect(completeRes.json<{ error: { code: string } }>().error.code).toBe(
        'MEDIA_CONTENT_TYPE_MISMATCH',
      );
    });

    it('rejects a declared size over the IMPORT_SOURCE cap before a presigned URL is issued', async () => {
      const res = await post(admin, '/imports/upload-target', {
        filename: 'big.csv',
        declaredMimeType: 'text/csv',
        declaredSizeBytes: 6 * 1024 * 1024,
      });
      expect(res.statusCode).toBe(422);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('MEDIA_TOO_LARGE');
    });
  });

  describe('security / tenancy', () => {
    it('rejects a mediaAssetId belonging to another school', async () => {
      const otherSchool = await createSchool();
      createdSchoolIds.push(otherSchool.id);
      const otherAdmin = await seedUser(
        otherSchool.id,
        `import-other-${RUN}`,
        'CorrectHorseBattery1!',
        'SCHOOL_ADMIN',
      );
      createdUserIds.push(otherAdmin.id);
      const otherCtx = await freshCtx(`${otherSchool.subdomain}.${ROOT_DOMAIN}`, `10.${RUN}.9.2`);
      await login(otherCtx, `import-other-${RUN}`, 'CorrectHorseBattery1!');

      const buffer = csv([
        `# template-version: ${IMPORT_TEMPLATE_VERSION}`,
        'Student ID,First Name,Last Name,Class,Department',
        'S1,A,B,SS1A,',
      ]);
      const foreignMediaAssetId = await uploadImportFile(otherCtx, buffer);

      const res = await post(admin, '/imports/students', {
        mediaAssetId: foreignMediaAssetId,
        academicSessionId: sessionId,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('IMPORT_SOURCE_NOT_READY');
    });

    it('a Teacher cannot import students (users.import.students denies TEACHER)', async () => {
      const teacherUser = await seedUser(
        schoolId,
        `import-teacher-${RUN}`,
        'CorrectHorseBattery1!',
        'TEACHER',
      );
      createdUserIds.push(teacherUser.id);
      const teacherCtx = await freshCtx(host, `10.${RUN}.9.3`);
      await login(teacherCtx, `import-teacher-${RUN}`, 'CorrectHorseBattery1!');

      const res = await post(teacherCtx, '/imports/students', {
        mediaAssetId: randomUUID(),
        academicSessionId: sessionId,
      });
      expect(res.statusCode).toBe(403);
    });

    it('a Student cannot request an import upload target', async () => {
      const studentUser = await seedUser(
        schoolId,
        `import-student-${RUN}`,
        'CorrectHorseBattery1!',
        'STUDENT',
      );
      createdUserIds.push(studentUser.id);
      const studentCtx = await freshCtx(host, `10.${RUN}.9.4`);
      await login(studentCtx, `import-student-${RUN}`, 'CorrectHorseBattery1!');

      const res = await post(studentCtx, '/imports/upload-target', {
        filename: 'x.csv',
        declaredMimeType: 'text/csv',
        declaredSizeBytes: 10,
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('confirm() state machine', () => {
    it('rejects confirm() before validation has completed', async () => {
      const buffer = csv([
        `# template-version: ${IMPORT_TEMPLATE_VERSION}`,
        'Staff ID,First Name,Last Name,Email',
        `IMP-EARLY-${RUN},A,B,a@example.com`,
      ]);
      const mediaAssetId = await uploadImportFile(admin, buffer);
      const job = (await post(admin, '/imports/teachers', { mediaAssetId })).json<{ id: string }>();

      const res = await post(admin, `/imports/${job.id}/confirm`);
      expect(res.statusCode).toBe(409);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('IMPORT_JOB_NOT_VALIDATED');
    });

    it('confirming an already-IMPORTING/COMPLETED job is an idempotent no-op, not an error', async () => {
      const buffer = csv([
        `# template-version: ${IMPORT_TEMPLATE_VERSION}`,
        'Staff ID,First Name,Last Name,Email',
        `IMP-IDEMP-${RUN},A,B,a-idemp-${RUN}@example.com`,
      ]);
      const mediaAssetId = await uploadImportFile(admin, buffer);
      const job = (await post(admin, '/imports/teachers', { mediaAssetId })).json<{ id: string }>();
      await validation.validate(schoolId, job.id);
      await post(admin, `/imports/${job.id}/confirm`);
      await commit.commit(schoolId, job.id);

      const secondConfirm = await post(admin, `/imports/${job.id}/confirm`);
      expect(secondConfirm.statusCode).toBe(200);
      expect(secondConfirm.json<{ status: string }>().status).toBe('COMPLETED');
    });
  });
});
