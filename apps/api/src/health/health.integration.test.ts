/**
 * Boots the real Nest application (Fastify adapter) against docker-compose
 * infrastructure and hits the B0 health endpoints over HTTP, per the B0
 * Testing requirements table ("Integration | ... health endpoints").
 * Requires `docker compose up -d` and DATABASE_URL / REDIS_URL pointed at
 * it — see tests/integration/README.md.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma } from '@atlas/db';
import { AppModule } from '../app.module.js';
import { ownerPrisma } from '../test-support/owner-prisma.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';

let app: NestFastifyApplication;

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

describe('health endpoints', () => {
  it('GET /health returns 200 liveness', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready reports database, redis and storage reachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    const body: { status: string; checks: Array<{ name: string; ok: boolean }> } = res.json();
    expect(body.status).toBe('ok');
    expect(body.checks).toEqual(
      expect.arrayContaining([
        { name: 'database', ok: true, critical: true },
        { name: 'redis', ok: true, critical: false },
        { name: 'storage', ok: true, critical: false },
      ]),
    );
  });
});

describe('on-demand TLS check', () => {
  let school: { id: string; subdomain: string };

  beforeAll(async () => {
    school = await prisma.school.create({
      data: { name: `TLS Ask Test School ${randomUUID()}`, subdomain: `tls-${Date.now()}` },
    });
  });

  afterAll(async () => {
    await ownerPrisma().school.delete({ where: { id: school.id } });
  });

  const ask = (domain: string) =>
    app.inject({ method: 'GET', url: '/health/tls-ask', query: { domain } });

  it("allows an existing school's web and API hosts", async () => {
    expect((await ask(`${school.subdomain}.${ROOT_DOMAIN}`)).statusCode).toBe(200);
    expect((await ask(`${school.subdomain}.api.${ROOT_DOMAIN}`)).statusCode).toBe(200);
    expect((await ask(`${school.subdomain.toUpperCase()}.${ROOT_DOMAIN}`)).statusCode).toBe(200);
  });

  it('refuses unknown schools, reserved labels, deeper names and other domains', async () => {
    for (const domain of [
      `no-such-school-${Date.now()}.${ROOT_DOMAIN}`,
      `admin.${ROOT_DOMAIN}`,
      `api.${ROOT_DOMAIN}`,
      ROOT_DOMAIN,
      `a.${school.subdomain}.${ROOT_DOMAIN}`,
      `${school.subdomain}.example.com`,
      '',
    ]) {
      const res = await ask(domain);
      expect(res.statusCode, domain).toBe(404);
      expect(res.json<{ error: { code: string } }>().error.code, domain).toBe('NOT_FOUND');
    }
  });

  it('refuses a request with no domain', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/tls-ask' });
    expect(res.statusCode).toBe(404);
  });
});
