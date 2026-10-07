/**
 * B4 — end to end over real HTTP against the real AppModule, real Postgres
 * (RLS included), and real MinIO (S3-compatible), following
 * identity.integration.test.ts/platform.integration.test.ts's precedent:
 * boot AppModule, seed fixtures via the shared `prisma` singleton, drive
 * API requests via Fastify's `app.inject()`. The actual object-storage PUT/
 * GET calls (`app.inject()` can't reach MinIO — it's a separate process)
 * go through Node's raw `http`/`https`, mirroring the manual verification
 * script this phase was built and proven against live.
 *
 * Covers the roadmap's Testing requirements table: upload → register →
 * signed URL → fetch; cross-school media fetch denied; malicious/oversized/
 * wrong-type upload rejected; direct bucket access denied.
 */
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import { safeDeleteSchools } from '../../test-support/safe-delete-schools.js';
import { AppModule } from '../../app.module.js';
import { PasswordService } from '../identity/password.service.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
const RUN = Math.floor(Math.random() * 200) + 1;

// 1x1 red pixel PNG — real magic bytes, real (trivial) dimensions.
const REAL_PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

let app: NestFastifyApplication;
const passwords = new PasswordService();
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
  consoleLogSpy.mockRestore();
});

// ---- Raw HTTP helper for the actual object-storage calls -----------------
// (fetch silently drops a custom Host header, irrelevant here, but more to
// the point app.inject() only reaches the Nest app, never MinIO.)

function rawRequest(
  method: string,
  url: string,
  body?: Buffer,
  contentType = 'application/octet-stream',
): Promise<{ status: number; body: Buffer; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method,
        headers: body ? { 'Content-Type': contentType, 'Content-Length': body.length } : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks),
            headers: res.headers,
          }),
        );
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---- Fixture helpers (mirrors identity.integration.test.ts) --------------

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Media Test School ${randomUUID()}`,
      subdomain: `media-${randomUUID().slice(0, 8)}`,
    },
  });
}

async function seedSchoolAdmin(schoolId: string, loginIdentifier: string, password: string) {
  const passwordHash = await passwords.hash(password);
  const user = await prisma.user.create({
    data: {
      firstName: 'Media',
      lastName: 'Admin',
      displayName: 'Media Admin',
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
    tx.roleAssignment.create({
      data: { schoolId, membershipId: membership.id, role: 'SCHOOL_ADMIN' },
    }),
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
      // Only set when there's an actual body — Fastify's default JSON body
      // parser throws on Content-Type: application/json with zero bytes of
      // body (a real bug this fix found: several bodyless POSTs here, e.g.
      // .../complete, were failing with a raw framework 400 before this).
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

// ---- Cleanup tracking ------------------------------------------------

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, (tx) => tx.mediaAsset.deleteMany({ where: { schoolId } }));
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

describe('B4 — media upload/validate/sign pipeline (real MinIO)', () => {
  it('uploads a real question image, validates it, and it is retrievable only via a signed URL', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedSchoolAdmin(school.id, `media-admin-${RUN}`, 'CorrectHorseBattery1!');
    createdUserIds.push(admin.id);

    const ctx = await freshCtx(host, `10.${RUN}.1.1`);
    await login(ctx, `media-admin-${RUN}`, 'CorrectHorseBattery1!');

    const requestRes = await post(ctx, '/media/uploads', {
      type: 'QUESTION_IMAGE',
      filename: 'q1.png',
      declaredMimeType: 'image/png',
      declaredSizeBytes: REAL_PNG_1x1.length,
    });
    expect(requestRes.statusCode).toBe(201);
    const target = requestRes.json<{ mediaAssetId: string; uploadUrl: string }>();

    const putRes = await rawRequest('PUT', target.uploadUrl, REAL_PNG_1x1);
    expect(putRes.status).toBe(200);

    const completeRes = await post(ctx, `/media/uploads/${target.mediaAssetId}/complete`);
    expect(completeRes.statusCode).toBe(201);
    const summary = completeRes.json<{ status: string; sniffedMimeType: string }>();
    expect(summary.status).toBe('READY');
    expect(summary.sniffedMimeType).toBe('image/png');

    const urlRes = await get(ctx, `/media/${target.mediaAssetId}/url`);
    expect(urlRes.statusCode).toBe(200);
    const signed = urlRes.json<{ url: string }>();

    const fetched = await rawRequest('GET', signed.url);
    expect(fetched.status).toBe(200);
    expect(fetched.body.equals(REAL_PNG_1x1)).toBe(true);
    // P0-1: the link forces the sniffed type, whatever the uploader sent.
    expect(fetched.headers['content-type']).toBe('image/png');

    // DoD item 4, live: the raw bucket object with no signature is denied.
    const rawObjectUrl = new URL(signed.url);
    const unsigned = await rawRequest(
      'GET',
      `${rawObjectUrl.protocol}//${rawObjectUrl.host}${rawObjectUrl.pathname}`,
    );
    expect(unsigned.status).toBe(403);
  });

  it('B22: an upload that landed inside its window completes even when complete() arrives after it (a retry through an outage)', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedSchoolAdmin(school.id, `media-late-${RUN}`, 'CorrectHorseBattery1!');
    createdUserIds.push(admin.id);
    const ctx = await freshCtx(host, `10.${RUN}.1.7`);
    await login(ctx, `media-late-${RUN}`, 'CorrectHorseBattery1!');

    const upload = async () => {
      const res = await post(ctx, '/media/uploads', {
        type: 'QUESTION_IMAGE',
        filename: 'late.png',
        declaredMimeType: 'image/png',
        declaredSizeBytes: REAL_PNG_1x1.length,
      });
      return res.json<{ mediaAssetId: string; uploadUrl: string }>();
    };
    const expireWindow = (id: string) =>
      withTenant(prisma, school.id, (tx) =>
        tx.mediaAsset.update({
          where: { id },
          data: { uploadUrlExpiresAt: new Date(Date.now() - 60_000) },
        }),
      );

    // Uploaded in time; the complete() call is late.
    const landed = await upload();
    expect((await rawRequest('PUT', landed.uploadUrl, REAL_PNG_1x1)).status).toBe(200);
    await expireWindow(landed.mediaAssetId);
    const completed = await post(ctx, `/media/uploads/${landed.mediaAssetId}/complete`);
    expect(completed.statusCode).toBe(201);
    expect(completed.json<{ status: string }>().status).toBe('READY');

    // Nothing uploaded and the window is over: still expired.
    const never = await upload();
    await expireWindow(never.mediaAssetId);
    const late = await post(ctx, `/media/uploads/${never.mediaAssetId}/complete`);
    expect(late.json<{ error: { code: string } }>().error.code).toBe('MEDIA_UPLOAD_EXPIRED');
  });

  it('rejects content by sniffing, not extension — fake bytes uploaded as a PNG never reach READY', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedSchoolAdmin(
      school.id,
      `media-admin-fake-${RUN}`,
      'CorrectHorseBattery1!',
    );
    createdUserIds.push(admin.id);
    const ctx = await freshCtx(host, `10.${RUN}.2.1`);
    await login(ctx, `media-admin-fake-${RUN}`, 'CorrectHorseBattery1!');

    const fakeContent = Buffer.from('definitely not an image');
    const requestRes = await post(ctx, '/media/uploads', {
      type: 'OTHER',
      filename: 'fake.png',
      declaredMimeType: 'image/png',
      declaredSizeBytes: fakeContent.length,
    });
    const target = requestRes.json<{ mediaAssetId: string; uploadUrl: string }>();
    // Content-Length is a signed header on the presigned PUT — it must
    // match declaredSizeBytes exactly, or the PUT itself fails signature
    // verification and the object never lands (found by this test: a
    // stale hardcoded declaredSizeBytes here previously mismatched the
    // real buffer length, so the PUT silently 403'd and complete() then
    // correctly-but-misleadingly reported MEDIA_UPLOAD_NOT_RECEIVED rather
    // than exercising the content-sniffing rejection this test is for).
    const putRes = await rawRequest('PUT', target.uploadUrl, fakeContent);
    expect(putRes.status).toBe(200);

    const completeRes = await post(ctx, `/media/uploads/${target.mediaAssetId}/complete`);
    expect(completeRes.statusCode).toBe(422);
    expect(completeRes.json<{ error: { code: string } }>().error.code).toBe(
      'MEDIA_CONTENT_TYPE_MISMATCH',
    );
  });

  it('rejects a declared size over the type limit before a presigned URL is even issued', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedSchoolAdmin(
      school.id,
      `media-admin-big-${RUN}`,
      'CorrectHorseBattery1!',
    );
    createdUserIds.push(admin.id);
    const ctx = await freshCtx(host, `10.${RUN}.3.1`);
    await login(ctx, `media-admin-big-${RUN}`, 'CorrectHorseBattery1!');

    const res = await post(ctx, '/media/uploads', {
      type: 'QUESTION_IMAGE',
      filename: 'big.png',
      declaredMimeType: 'image/png',
      declaredSizeBytes: 6 * 1024 * 1024, // QUESTION_IMAGE's limit is 5 MB
    });
    expect(res.statusCode).toBe(422);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('MEDIA_TOO_LARGE');
  });

  it('P0-1: an import upload refuses an HTML declared type, and an import file never gets a link', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedSchoolAdmin(school.id, `media-html-${RUN}`, 'CorrectHorseBattery1!');
    createdUserIds.push(admin.id);
    const ctx = await freshCtx(host, `10.${RUN}.1.9`);
    await login(ctx, `media-html-${RUN}`, 'CorrectHorseBattery1!');

    const page = Buffer.from('<html><script>alert(document.cookie)</script></html>');
    const html = await post(ctx, '/imports/questions/upload-target', {
      filename: 'questions.csv',
      declaredMimeType: 'text/html',
      declaredSizeBytes: page.length,
    });
    expect(html.json<{ error: { code: string } }>().error.code).toBe('MEDIA_CONTENT_TYPE_MISMATCH');

    // Declared as CSV, stored as text/html by the PUT, accepted as text: the
    // file is usable by the import job, but no link to it is ever issued.
    const csv = await post(ctx, '/imports/questions/upload-target', {
      filename: 'questions.csv',
      declaredMimeType: 'text/csv',
      declaredSizeBytes: page.length,
    });
    expect(csv.statusCode).toBe(201);
    const target = csv.json<{ mediaAssetId: string; uploadUrl: string }>();
    expect((await rawRequest('PUT', target.uploadUrl, page, 'text/html')).status).toBe(200);
    const done = await post(
      ctx,
      `/imports/questions/upload-target/${target.mediaAssetId}/complete`,
    );
    expect(done.statusCode).toBe(201);
    const urlRes = await get(ctx, `/media/${target.mediaAssetId}/url`);
    expect(urlRes.statusCode).toBe(404);
  });

  it('a cross-school media fetch returns 404, even by primary key', async () => {
    const schoolA = await createSchool();
    const schoolB = await createSchool();
    createdSchoolIds.push(schoolA.id, schoolB.id);
    const adminA = await seedSchoolAdmin(schoolA.id, `media-a-${RUN}`, 'CorrectHorseBattery1!');
    const adminB = await seedSchoolAdmin(schoolB.id, `media-b-${RUN}`, 'CorrectHorseBattery1!');
    createdUserIds.push(adminA.id, adminB.id);

    const ctxA = await freshCtx(`${schoolA.subdomain}.${ROOT_DOMAIN}`, `10.${RUN}.4.1`);
    await login(ctxA, `media-a-${RUN}`, 'CorrectHorseBattery1!');
    const requestRes = await post(ctxA, '/media/uploads', {
      type: 'QUESTION_IMAGE',
      filename: 'a.png',
      declaredMimeType: 'image/png',
      declaredSizeBytes: REAL_PNG_1x1.length,
    });
    const target = requestRes.json<{ mediaAssetId: string; uploadUrl: string }>();
    await rawRequest('PUT', target.uploadUrl, REAL_PNG_1x1);
    await post(ctxA, `/media/uploads/${target.mediaAssetId}/complete`);

    const ctxB = await freshCtx(`${schoolB.subdomain}.${ROOT_DOMAIN}`, `10.${RUN}.4.2`);
    await login(ctxB, `media-b-${RUN}`, 'CorrectHorseBattery1!');

    const crossFetch = await get(ctxB, `/media/${target.mediaAssetId}/url`);
    expect(crossFetch.statusCode).toBe(404);

    const crossComplete = await post(ctxB, `/media/uploads/${target.mediaAssetId}/complete`);
    expect(crossComplete.statusCode).toBe(404);
  });

  it('a Student cannot request a media upload (media.upload denies STUDENT)', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const passwordHash = await passwords.hash('CorrectHorseBattery1!');
    const user = await prisma.user.create({
      data: {
        firstName: 'Student',
        lastName: 'User',
        displayName: 'Student User',
        passwordHash,
        status: 'ACTIVE',
        credentialState: 'OK',
      },
    });
    createdUserIds.push(user.id);
    const membership = await withTenant(prisma, school.id, (tx) =>
      tx.schoolMembership.create({
        data: {
          schoolId: school.id,
          userId: user.id,
          loginIdentifier: `student-${RUN}`,
          status: 'ACTIVE',
        },
      }),
    );
    await withTenant(prisma, school.id, (tx) =>
      tx.roleAssignment.create({
        data: { schoolId: school.id, membershipId: membership.id, role: 'STUDENT' },
      }),
    );

    const ctx = await freshCtx(`${school.subdomain}.${ROOT_DOMAIN}`, `10.${RUN}.5.1`);
    await login(ctx, `student-${RUN}`, 'CorrectHorseBattery1!');

    const res = await post(ctx, '/media/uploads', {
      type: 'QUESTION_IMAGE',
      filename: 'x.png',
      declaredMimeType: 'image/png',
      declaredSizeBytes: REAL_PNG_1x1.length,
    });
    expect(res.statusCode).toBe(403);
  });
});
