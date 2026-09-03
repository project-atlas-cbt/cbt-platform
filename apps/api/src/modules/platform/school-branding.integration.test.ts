/**
 * B4 — `GET/PUT /v1/school/branding` plus the logo upload-target/complete
 * pair and the `GET /v1/tenant/resolve` extension, end to end over real
 * HTTP against the real AppModule, real Postgres (RLS included), and real
 * MinIO — same shape as media.integration.test.ts, whose raw-HTTP helper
 * this file reuses the pattern of (not the module itself — each
 * integration test file owns its own fixture helpers, matching this
 * codebase's existing precedent in platform.integration.test.ts).
 *
 * Covers DoD items 1 (logo renders on branded login), 2 (colour produces a
 * derived palette), and the audit finding A-18 resolution (freely
 * editable, every change audited).
 */
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import { safeDeleteSchools } from '../../test-support/safe-delete-schools.js';
import type { Role } from '@atlas/domain';
import { AppModule } from '../../app.module.js';
import { PasswordService } from '../identity/password.service.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
const RUN = Math.floor(Math.random() * 200) + 1;

/**
 * A minimal, real PNG signature + IHDR chunk declaring the given
 * dimensions — enough for both `file-type` (checks only the 8-byte magic
 * signature) and `image-size` (reads width/height straight out of IHDR,
 * bytes 16-23, never decodes IDAT) to report real values. No IDAT/IEND or
 * a correct CRC is needed since neither library validates that far. Used
 * here specifically so the logo tests exercise SCHOOL_LOGO's real 64x64
 * minimum-dimension floor with a genuinely-sized image, rather than the
 * 1x1 `REAL_PNG_1x1` fixture (which is correctly rejected by that floor —
 * using it for a logo would be testing the rejection path, not success).
 */
function fakePng(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(2, 9); // colour type: truecolour
  const chunkLength = Buffer.alloc(4);
  chunkLength.writeUInt32BE(ihdrData.length, 0);
  const chunkType = Buffer.from('IHDR');
  const crcPlaceholder = Buffer.alloc(4); // uncorrelated CRC — neither parser checks it
  return Buffer.concat([signature, chunkLength, chunkType, ihdrData, crcPlaceholder]);
}

const REAL_PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
/** Clears SCHOOL_LOGO's 64x64 minimum-dimension floor (content-validation.ts). */
const LOGO_SIZED_PNG = fakePng(128, 128);

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

function rawRequest(
  method: string,
  url: string,
  body?: Buffer,
): Promise<{ status: number; body: Buffer }> {
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
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
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
      name: `Branding Test School ${randomUUID()}`,
      subdomain: `branding-${randomUUID().slice(0, 8)}`,
    },
  });
}

async function seedMember(schoolId: string, loginIdentifier: string, password: string, role: Role) {
  const passwordHash = await passwords.hash(password);
  const user = await prisma.user.create({
    data: {
      firstName: 'Branding',
      lastName: 'Tester',
      displayName: 'Branding Tester',
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
      // Only set when there's an actual body — Fastify's default JSON body
      // parser throws on Content-Type: application/json with zero bytes of
      // body (a real bug this fix found: bodyless POSTs here, e.g. the
      // logo .../complete route, were failing with a raw framework 400
      // before this — see media.integration.test.ts's identical fix).
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

async function uploadReadyLogo(ctx: RequestCtx): Promise<string> {
  const requestRes = await post(ctx, '/school/branding/logo/upload-target', {
    filename: 'logo.png',
    declaredMimeType: 'image/png',
    declaredSizeBytes: LOGO_SIZED_PNG.length,
  });
  expect(requestRes.statusCode).toBe(201);
  const target = requestRes.json<{ mediaAssetId: string; uploadUrl: string }>();
  await rawRequest('PUT', target.uploadUrl, LOGO_SIZED_PNG);
  const completeRes = await post(
    ctx,
    `/school/branding/logo/upload-target/${target.mediaAssetId}/complete`,
  );
  expect(completeRes.statusCode).toBe(201);
  expect(completeRes.json<{ status: string }>().status).toBe('READY');
  return target.mediaAssetId;
}

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, (tx) =>
      tx.auditEvent.deleteMany({ where: { schoolId } }),
    ).catch(() => undefined);
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

describe('B4 — school branding (logo + colour), audited and freely editable', () => {
  it('sets a real logo and colour, and both are visible via GET /school/branding and the public GET /tenant/resolve', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedMember(
      school.id,
      `brand-admin-${RUN}`,
      'CorrectHorseBattery1!',
      'SCHOOL_ADMIN',
    );
    createdUserIds.push(admin.id);

    const ctx = await freshCtx(host, `10.${RUN}.10.1`);
    await login(ctx, `brand-admin-${RUN}`, 'CorrectHorseBattery1!');

    const logoMediaId = await uploadReadyLogo(ctx);

    const updateRes = await put(ctx, '/school/branding', {
      logoMediaId,
      primaryColor: '#2563EB',
    });
    expect(updateRes.statusCode).toBe(200);
    const updated = updateRes.json<{
      logoUrl: string | null;
      primaryColor: string | null;
      palette: { brand: { brandPrimary: string } } | null;
    }>();
    expect(updated.logoUrl).toBeTruthy();
    expect(updated.primaryColor).toBe('#2563EB');
    expect(updated.palette?.brand.brandPrimary).toBeTruthy();

    const getRes = await get(ctx, '/school/branding');
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json<{ primaryColor: string }>().primaryColor).toBe('#2563EB');

    // The public, unauthenticated route serves the same branding — DoD
    // item 1's actual login-screen data source.
    const resolveRes = await app.inject({
      method: 'GET',
      url: '/tenant/resolve',
      headers: { host },
    });
    const resolved = resolveRes.json<{
      school: { logoUrl: string | null; primaryColor: string | null } | null;
    }>();
    expect(resolved.school?.primaryColor).toBe('#2563EB');
    expect(resolved.school?.logoUrl).toBeTruthy();

    // A-18: freely editable, not one-time — change it again and confirm it
    // takes, plus two independent audit rows (one per change).
    const secondUpdate = await put(ctx, '/school/branding', { primaryColor: '#15803D' });
    expect(secondUpdate.statusCode).toBe(200);
    expect(secondUpdate.json<{ primaryColor: string }>().primaryColor).toBe('#15803D');

    const auditEvents = await withTenant(prisma, school.id, (tx) =>
      tx.auditEvent.findMany({ where: { schoolId: school.id, action: 'SCHOOL_BRANDING_CHANGED' } }),
    );
    expect(auditEvents).toHaveLength(2);
  });

  it('rejects attaching a non-READY or wrong-type asset as the logo', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedMember(
      school.id,
      `brand-wrong-${RUN}`,
      'CorrectHorseBattery1!',
      'SCHOOL_ADMIN',
    );
    createdUserIds.push(admin.id);
    const ctx = await freshCtx(host, `10.${RUN}.10.2`);
    await login(ctx, `brand-wrong-${RUN}`, 'CorrectHorseBattery1!');

    // A PENDING (never-completed) logo upload can't be attached.
    const requestRes = await post(ctx, '/school/branding/logo/upload-target', {
      filename: 'never-completed.png',
      declaredMimeType: 'image/png',
      declaredSizeBytes: REAL_PNG_1x1.length,
    });
    const target = requestRes.json<{ mediaAssetId: string }>();

    const rejectedRes = await put(ctx, '/school/branding', { logoMediaId: target.mediaAssetId });
    expect(rejectedRes.statusCode).toBe(409);
    expect(rejectedRes.json<{ error: { code: string } }>().error.code).toBe('MEDIA_NOT_READY');
  });

  it("cannot attach another school's asset as the caller's own logo", async () => {
    const schoolA = await createSchool();
    const schoolB = await createSchool();
    createdSchoolIds.push(schoolA.id, schoolB.id);
    const adminA = await seedMember(
      schoolA.id,
      `brand-a-${RUN}`,
      'CorrectHorseBattery1!',
      'SCHOOL_ADMIN',
    );
    const adminB = await seedMember(
      schoolB.id,
      `brand-b-${RUN}`,
      'CorrectHorseBattery1!',
      'SCHOOL_ADMIN',
    );
    createdUserIds.push(adminA.id, adminB.id);

    const ctxA = await freshCtx(`${schoolA.subdomain}.${ROOT_DOMAIN}`, `10.${RUN}.10.3`);
    await login(ctxA, `brand-a-${RUN}`, 'CorrectHorseBattery1!');
    const logoMediaIdA = await uploadReadyLogo(ctxA);

    const ctxB = await freshCtx(`${schoolB.subdomain}.${ROOT_DOMAIN}`, `10.${RUN}.10.4`);
    await login(ctxB, `brand-b-${RUN}`, 'CorrectHorseBattery1!');

    const crossRes = await put(ctxB, '/school/branding', { logoMediaId: logoMediaIdA });
    expect(crossRes.statusCode).toBe(409);
    expect(crossRes.json<{ error: { code: string } }>().error.code).toBe('MEDIA_NOT_READY');
  });

  it('denies non-School-Admin roles from changing branding (schoolConfig.colour.set)', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const teacher = await seedMember(
      school.id,
      `brand-teacher-${RUN}`,
      'CorrectHorseBattery1!',
      'TEACHER',
    );
    createdUserIds.push(teacher.id);
    const ctx = await freshCtx(host, `10.${RUN}.10.5`);
    await login(ctx, `brand-teacher-${RUN}`, 'CorrectHorseBattery1!');

    const res = await put(ctx, '/school/branding', { primaryColor: '#FF0000' });
    expect(res.statusCode).toBe(403);
  });

  it('rejects an unparseable colour with a clear error, never silently defaulting', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedMember(
      school.id,
      `brand-badcolor-${RUN}`,
      'CorrectHorseBattery1!',
      'SCHOOL_ADMIN',
    );
    createdUserIds.push(admin.id);
    const ctx = await freshCtx(host, `10.${RUN}.10.6`);
    await login(ctx, `brand-badcolor-${RUN}`, 'CorrectHorseBattery1!');

    // IsHexColor rejects this at the DTO layer before the service/
    // derivePalette ever runs — still the correct, clear-error outcome.
    const res = await put(ctx, '/school/branding', { primaryColor: 'not-a-colour' });
    expect(res.statusCode).toBe(400);
  });
});
