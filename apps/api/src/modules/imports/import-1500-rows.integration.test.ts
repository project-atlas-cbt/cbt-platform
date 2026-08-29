/**
 * B7 roadmap Definition of Done item 1: "A 1,500-row student file uploads,
 * validates in the background, and reports valid and invalid counts
 * matching a hand-checked fixture," and the Exit criteria's "a 1,500-row
 * import completes within an agreed time budget." Row counts mirror `01
 * §7`'s own worked example numbers (1,487 valid / 13 needing correction)
 * rather than an arbitrary split, so this test's "hand-checked fixture" is
 * literally the spec's own.
 *
 * A heavier, slower test than this file's siblings — chunked commit means
 * roughly 1,487 sequential per-row transactions, not one bulk write (the
 * same tradeoff DoD item 8's resumability structurally requires). Given
 * generous headroom rather than the suite's default timeout, matching this
 * codebase's own established practice for a correct-but-heavy test
 * (structure-creation.integration.test.tsx's own precedent).
 */
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import { AppModule } from '../../app.module.js';
import { PasswordService } from '../identity/password.service.js';
import { ImportValidationService } from './import-validation.service.js';
import { ImportCommitService } from './import-commit.service.js';
import { IMPORT_TEMPLATE_VERSION } from './import-templates.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
const VALID_ROW_COUNT = 1487;
const INVALID_ROW_COUNT = 13;
const TOTAL_ROW_COUNT = VALID_ROW_COUNT + INVALID_ROW_COUNT;

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
    await withTenant(prisma, schoolId, (tx) => tx.importRow.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.importJob.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.classGroup.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) => tx.mediaAsset.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) =>
      tx.roleAssignment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.deleteMany({ where: { schoolId } }),
    );
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
}, 60_000);

describe('B7 — 1,500-row student import (DoD item 1, Exit criteria)', () => {
  it('validates a 1,500-row file in the background and reports valid/invalid counts matching the fixture', async () => {
    const school = await prisma.school.create({
      data: {
        name: `1500 Row School ${randomUUID()}`,
        subdomain: `imp1500-${randomUUID().slice(0, 8)}`,
      },
    });
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const passwordHash = await passwords.hash('CorrectHorseBattery1!');
    const adminUser = await prisma.user.create({
      data: {
        firstName: '1500',
        lastName: 'Admin',
        displayName: '1500 Admin',
        passwordHash,
        status: 'ACTIVE',
        credentialState: 'OK',
      },
    });
    createdUserIds.push(adminUser.id);
    const membership = await withTenant(prisma, school.id, (tx) =>
      tx.schoolMembership.create({
        data: {
          schoolId: school.id,
          userId: adminUser.id,
          loginIdentifier: 'admin1500',
          status: 'ACTIVE',
        },
      }),
    );
    await withTenant(prisma, school.id, (tx) =>
      tx.roleAssignment.create({
        data: { schoolId: school.id, membershipId: membership.id, role: 'SCHOOL_ADMIN' },
      }),
    );

    const admin = await freshCtx(host, '10.150.0.1');
    await login(admin, 'admin1500', 'CorrectHorseBattery1!');

    const sessionRes = await post(admin, '/academics/sessions', {
      name: `1500 Session ${randomUUID().slice(0, 8)}`,
      startDate: '2026-09-01',
      endDate: '2027-07-31',
    });
    const sessionId = sessionRes.json<{ id: string }>().id;
    const classRes = await post(admin, '/academics/classes', {
      academicSessionId: sessionId,
      name: 'SS1A',
      level: 'SS1',
      arm: 'A',
    });
    const classId = classRes.json<{ id: string }>().id;

    const lines = [
      `# template-version: ${IMPORT_TEMPLATE_VERSION}`,
      'Student ID,First Name,Last Name,Class,Department',
    ];
    for (let i = 0; i < VALID_ROW_COUNT; i++) {
      lines.push(`BULK1500-V${i},First${i},Last${i},SS1A,`);
    }
    for (let i = 0; i < INVALID_ROW_COUNT; i++) {
      // A real mix of the validation catalogue's own failure modes, not
      // one repeated case — missing name, invalid class, and (the last
      // three) duplicate IDs against valid rows already in the file.
      if (i < 5) {
        lines.push(`BULK1500-I${i},,LastOnly${i},SS1A,`); // missing First Name
      } else if (i < 10) {
        lines.push(`BULK1500-I${i},First${i},Last${i},NoSuchClass,`); // invalid class
      } else {
        // Three rows sharing one ID *among themselves*, distinct from
        // every valid row's own ID — all three land INVALID for
        // "appears more than once," without ever touching a valid row's
        // count (see import-row-validator.test.ts's own coverage of
        // this rule; borrowing a valid row's ID here would incorrectly
        // flag that valid row too, which is the validator working
        // correctly, not a bug — just the wrong fixture for this count).
        lines.push(`BULK1500-DUP,Dup${i},Dup${i},SS1A,`);
      }
    }
    const buffer = Buffer.from(lines.join('\r\n') + '\r\n', 'utf-8');
    expect(lines.length - 2).toBe(TOTAL_ROW_COUNT); // sanity: fixture really is 1,500 data rows

    const requestRes = await post(admin, '/imports/upload-target', {
      filename: '1500-students.csv',
      declaredMimeType: 'text/csv',
      declaredSizeBytes: buffer.length,
    });
    const target = requestRes.json<{ mediaAssetId: string; uploadUrl: string }>();

    const putUrl = new URL(target.uploadUrl);
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          hostname: putUrl.hostname,
          port: putUrl.port,
          path: putUrl.pathname + putUrl.search,
          method: 'PUT',
          headers: { 'Content-Type': 'text/csv', 'Content-Length': buffer.length },
        },
        (res) => {
          res.on('data', () => {});
          res.on('end', () =>
            res.statusCode === 200 ? resolve() : reject(new Error(`PUT failed: ${res.statusCode}`)),
          );
        },
      );
      req.on('error', reject);
      req.write(buffer);
      req.end();
    });

    const completeRes = await post(admin, `/imports/upload-target/${target.mediaAssetId}/complete`);
    expect(completeRes.json<{ status: string }>().status).toBe('READY');

    const createRes = await post(admin, '/imports/students', {
      mediaAssetId: target.mediaAssetId,
      academicSessionId: sessionId,
    });
    const job = createRes.json<{ id: string }>();

    const validateStart = Date.now();
    await validation.validate(school.id, job.id);
    const validateMs = Date.now() - validateStart;

    const afterValidate = await get(admin, `/imports/${job.id}`);
    const detail = afterValidate.json<{
      status: string;
      totalRows: number;
      validRows: number;
      invalidRows: number;
    }>();
    expect(detail.status).toBe('VALIDATED');
    expect(detail.totalRows).toBe(TOTAL_ROW_COUNT);
    expect(detail.validRows).toBe(VALID_ROW_COUNT);
    expect(detail.invalidRows).toBe(INVALID_ROW_COUNT);
    // An "agreed time budget" for validation — generous, since this is a
    // single-process local test environment, not a tuned production one.
    expect(validateMs).toBeLessThan(30_000);

    // Exit criteria: the import actually completes, not merely validates.
    await post(admin, `/imports/${job.id}/confirm`);
    const commitStart = Date.now();
    await commit.commit(school.id, job.id);
    const commitMs = Date.now() - commitStart;

    const finalRes = await get(admin, `/imports/${job.id}`);
    const finalDetail = finalRes.json<{
      status: string;
      committedRows: number;
      failedRows: number;
    }>();
    expect(finalDetail.status).toBe('COMPLETED');
    expect(finalDetail.committedRows).toBe(VALID_ROW_COUNT);
    expect(finalDetail.failedRows).toBe(0);
    expect(commitMs).toBeLessThan(90_000);

    const rosterRes = await get(admin, `/classes/${classId}/students`);
    expect(rosterRes.json<{ students: unknown[] }>().students).toHaveLength(VALID_ROW_COUNT);
  }, 120_000);
});
