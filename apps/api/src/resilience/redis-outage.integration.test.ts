/**
 * B22 DoD 4 / decision 3 (2026-10-04): Redis is cut out from under the
 * running API — through a TCP relay, so ioredis sees real connection resets
 * and refusals, not a mocked method — and the test proves:
 *
 * - every request fails fast instead of hanging (~73 s before B22);
 * - liveness stays 200; readiness stays 200 and reports Redis degraded;
 * - sign-in still works;
 * - brute force is still blocked: the per-process login lockout and the
 *   per-IP sign-in limit apply at no looser than the shared limits;
 * - once Redis is back, readiness reports it healthy again.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { TcpToggleProxy } from '../test-support/tcp-toggle-proxy.js';
import type * as FixtureModule from '../test-support/security-fixture.js';

const realRedis = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
const proxy = new TcpToggleProxy(realRedis.hostname, Number(realRedis.port) || 6379);

let app: NestFastifyApplication;
let fx: typeof FixtureModule;
let fixture: FixtureModule.SecurityFixture;
let school: FixtureModule.FixtureSchool;

/** Each request must answer well inside the old ~73 s hang. */
const FAST_MS = 3000;

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - started };
}

beforeAll(async () => {
  const port = await proxy.start();
  const url = new URL(realRedis.toString());
  url.port = String(port);
  url.hostname = '127.0.0.1';
  // Set before AppModule is first imported, so ConfigModule reads it.
  process.env.REDIS_URL = url.toString();
  process.env.RATE_LIMIT_FALLBACK_PROCESSES = '2';
  fx = await import('../test-support/security-fixture.js');
  app = await fx.bootSecurityApp();
  fixture = new fx.SecurityFixture();
  school = await fixture.createSchool('redis-outage');
}, 60_000);

afterAll(async () => {
  proxy.restore();
  await fixture?.cleanup?.();
  // A worker whose connection was cut can take up to WORKER_CLOSE_TIMEOUT_MS
  // to give up closing (see closeWorkerBounded).
  await app?.close();
  await proxy.stop();
}, 60_000);

describe('Redis outage (B22 DoD 4)', () => {
  it('signs in normally while Redis is up', async () => {
    const { status } = await fixture.loginIdentifier(
      app,
      school,
      school.users.STUDENT.identifier,
      fx.nextIp(),
    );
    expect(status).toBe(200);
  });

  it('liveness and readiness answer fast and report Redis degraded, not down', async () => {
    proxy.down();
    const live = await timed(() => app.inject({ method: 'GET', url: '/health' }));
    expect(live.value.statusCode).toBe(200);
    expect(live.ms).toBeLessThan(FAST_MS);

    const ready = await timed(() => app.inject({ method: 'GET', url: '/health/ready' }));
    expect(ready.ms).toBeLessThan(FAST_MS);
    expect(ready.value.statusCode).toBe(200);
    const body = ready.value.json<{
      status: string;
      checks: Array<{ name: string; ok: boolean }>;
    }>();
    expect(body.status).toBe('degraded');
    expect(body.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'database', ok: true }),
        expect.objectContaining({ name: 'redis', ok: false }),
      ]),
    );
  });

  it('a student whose browser crashed can sign back in, fast', async () => {
    proxy.down();
    const login = await timed(() =>
      fixture.loginIdentifier(app, school, school.users.STUDENT.identifier, fx.nextIp()),
    );
    expect(login.value.status).toBe(200);
    expect(login.ms).toBeLessThan(FAST_MS);

    // An authenticated request goes through the (fallback) rate limiter too.
    const me = await timed(() => fx.call(app, login.value.ctx, 'GET', '/auth/me'));
    expect(me.value.statusCode).toBe(200);
    expect(me.ms).toBeLessThan(FAST_MS);
  });

  it('the login lockout still blocks guessing: locked at max ÷ processes failures', async () => {
    proxy.down();
    // AUTH_LOCKOUT_MAX_ATTEMPTS defaults to 5; two processes → 2 per process.
    const target = school.users.TEACHER.identifier;
    const ip = fx.nextIp();
    for (let i = 0; i < 2; i += 1) {
      const wrong = await fixture.loginWithPassword(app, school, target, 'wrong-password', ip);
      expect(wrong.status).toBe(401);
    }
    // The right password is refused now — the account is locked out.
    const right = await fixture.loginIdentifier(app, school, target, ip);
    expect(right.status).toBe(401);
  });

  it('the per-IP sign-in limit still applies, at limit ÷ processes', async () => {
    proxy.down();
    // RATE_LIMIT_AUTH_IP_MAX defaults to 120 → 60 per process while degraded.
    const ip = fx.nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 61; i += 1) {
      const res = await fixture.loginWithPassword(app, school, `nobody-${i}`, 'x', ip);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 60).every((s) => s === 401)).toBe(true);
    expect(statuses[60]).toBe(429);
  }, 120_000);

  it('reports Redis healthy again once it is back', async () => {
    proxy.restore();
    let ok = false;
    for (let i = 0; i < 40 && !ok; i += 1) {
      const res = await app.inject({ method: 'GET', url: '/health/ready' });
      ok = res.json<{ status: string }>().status === 'ok';
      if (!ok) await new Promise((r) => setTimeout(r, 250));
    }
    expect(ok).toBe(true);
  });
});
