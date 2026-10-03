/**
 * B21 (R-12, DoD 9): priority load shedding against the real AppModule —
 * reporting is shed first, admin CRUD only when saturation is severe, exam
 * execution and sign-in never; a shed request is refused before any
 * authentication work; new Control Center streams are refused (the client
 * falls back to polling); and in-process reporting consumers pause.
 *
 * Saturation is forced through LoadMonitorService's test seam — the
 * measured trip behaviour under real load is B21's harness evidence
 * (docs/performance/results/*-shed-*).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../app.module.js';
import { LoadMonitorService } from './load-monitor.service.js';

let app: NestFastifyApplication;
let monitor: LoadMonitorService;
const ip = `10.98.${Math.floor(Math.random() * 200) + 1}.1`;

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  monitor = app.get(LoadMonitorService);
});

afterAll(async () => {
  await app.close();
});

const get = (url: string) => app.inject({ method: 'GET', url, remoteAddress: ip });

describe('B21 load shedding (R-12)', () => {
  it('normally serves every tier (an unauthenticated reporting call is a 401, not a 503)', async () => {
    expect(monitor.level).toBe('none');
    expect((await get('/analytics/school')).statusCode).toBe(401);
  });

  it('sheds reporting with 503 SERVICE_UNAVAILABLE + Retry-After before any session work', async () => {
    monitor.forceForTests('deferrable', 2_000);
    for (const url of [
      '/analytics/school',
      `/analytics/exams/${randomUUID()}`,
      '/search?q=ab',
      '/exports',
    ]) {
      const res = await get(url);
      expect(res.statusCode).toBe(503);
      expect(res.json<{ error: { code: string; retryable: boolean } }>().error).toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
        retryable: true,
      });
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    }
    // Standard tier still served at this level.
    expect((await get('/notifications')).statusCode).not.toBe(503);
  });

  it('never sheds exam execution or sign-in, even at the severe level', async () => {
    monitor.forceForTests('standard', 2_000);
    const id = randomUUID();
    const critical = [
      await app.inject({ method: 'POST', url: `/attempts/${id}/heartbeat`, remoteAddress: ip }),
      await app.inject({
        method: 'POST',
        url: `/attempts/${id}/answers/batch`,
        remoteAddress: ip,
        payload: { answers: [] },
      }),
      await app.inject({ method: 'POST', url: `/exams/${id}/attempts`, remoteAddress: ip }),
      await get(`/attempts/${id}/status`),
      await get('/tenant/resolve'),
      await app.inject({ method: 'POST', url: '/auth/login', remoteAddress: ip, payload: {} }),
    ];
    for (const res of critical) expect(res.statusCode).not.toBe(503);
    // ...while standard (admin) traffic is now shed too.
    expect((await get('/notifications')).statusCode).toBe(503);
  });

  it('refuses new Control Center streams while shedding (clients fall back to polling)', async () => {
    monitor.forceForTests('deferrable', 2_000);
    const res = await get(`/exams/${randomUUID()}/control/stream`);
    expect(res.statusCode).toBe(503);
    // The polling endpoint itself is standard tier — still served.
    expect((await get(`/exams/${randomUUID()}/control`)).statusCode).not.toBe(503);
  });

  it('pauses in-process reporting consumers while shedding and resumes them after', async () => {
    const calls: string[] = [];
    monitor.pauseWhileShedding({
      name: 'probe',
      pause: () => {
        calls.push('pause');
        return Promise.resolve();
      },
      resume: () => {
        calls.push('resume');
      },
    });
    monitor.forceForTests('deferrable', 1_200);
    await new Promise((r) => setTimeout(r, 1_600));
    expect(calls).toContain('pause');
    await new Promise((r) => setTimeout(r, 2_500));
    expect(monitor.level).toBe('none');
    expect(calls.at(-1)).toBe('resume');
  });

  it('stops shedding when the hold expires', async () => {
    monitor.forceForTests('deferrable', 100);
    await new Promise((r) => setTimeout(r, 300));
    expect((await get('/analytics/school')).statusCode).toBe(401);
  });
});
