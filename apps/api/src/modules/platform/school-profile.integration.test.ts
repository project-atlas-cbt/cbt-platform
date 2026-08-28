/**
 * F5 gap-closure — `GET/PATCH /v1/school/profile`'s new `name` field (02's
 * matrix grants School Admin "Full" edit of "school name/details," but the
 * DTO never actually carried `name` until this fix). Same fixture-helper
 * shape as `school-branding.integration.test.ts` (each integration test
 * file owns its own fixture helpers, this codebase's established
 * convention).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseCookie } from 'cookie';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppModule } from '../../app.module.js';
import { PasswordService } from '../identity/password.service.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
const RUN = Math.floor(Math.random() * 200) + 1;

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

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Profile Test School ${randomUUID()}`,
      subdomain: `profile-${randomUUID().slice(0, 8)}`,
    },
  });
}

async function seedMember(schoolId: string, loginIdentifier: string, password: string, role: Role) {
  const passwordHash = await passwords.hash(password);
  const user = await prisma.user.create({
    data: {
      firstName: 'Profile',
      lastName: 'Tester',
      displayName: 'Profile Tester',
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
      tx.roleAssignment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.deleteMany({ where: { schoolId } }),
    );
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
});

describe('F5 gap-closure — PATCH /v1/school/profile now accepts name', () => {
  it('School Admin can rename the school, and the change is reflected immediately', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const host = `${school.subdomain}.${ROOT_DOMAIN}`;
    const admin = await seedMember(
      school.id,
      `profile-name-${RUN}`,
      'CorrectHorseBattery1!',
      'SCHOOL_ADMIN',
    );
    createdUserIds.push(admin.id);
    const ctx = await freshCtx(host, `10.${RUN}.21.1`);
    await login(ctx, `profile-name-${RUN}`, 'CorrectHorseBattery1!');

    const newName = `Renamed Academy ${randomUUID().slice(0, 8)}`;
    const res = await patch(ctx, '/school/profile', { name: newName });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ name: string }>().name).toBe(newName);

    const getRes = await app.inject({
      method: 'GET',
      url: '/school/profile',
      headers: { host, cookie: cookieHeader(ctx) },
      remoteAddress: ctx.remoteAddress,
    });
    expect(getRes.json<{ name: string }>().name).toBe(newName);
  });
});
