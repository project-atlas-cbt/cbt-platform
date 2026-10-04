/**
 * Boots the real Nest application (Fastify adapter) against docker-compose
 * infrastructure and hits the B0 health endpoints over HTTP, per the B0
 * Testing requirements table ("Integration | ... health endpoints").
 * Requires `docker compose up -d` and DATABASE_URL / REDIS_URL pointed at
 * it — see tests/integration/README.md.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../app.module.js';

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
