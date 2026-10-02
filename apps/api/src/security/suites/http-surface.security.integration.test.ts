/**
 * B20: the API's HTTP surface — security headers and CSP (DoD 1, "security
 * headers, CORS lockdown"), and rate limits that bound abuse without ever
 * throttling legitimate exam traffic (DoD 8; R-09's lab profile: ~40
 * students behind one NAT address). B21 re-validates the limits under its
 * measured load profile; this suite pins the shape.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { v7 as uuidv7 } from 'uuid';
import { registerHttpSecurity } from '../http-security.js';
import {
  bootSecurityApp,
  call,
  ROOT_DOMAIN,
  SecurityFixture,
  type FixtureSchool,
} from '../../test-support/security-fixture.js';

let app: NestFastifyApplication;
const fixture = new SecurityFixture();
let school: FixtureSchool;

beforeAll(async () => {
  app = await bootSecurityApp();
  school = await fixture.createSchool('http');
});

afterAll(async () => {
  await app.close();
  await fixture.cleanup();
});

describe('security headers', () => {
  @Controller()
  class ProbeController {
    @Get('probe')
    probe() {
      return { ok: true };
    }
  }
  @Module({ controllers: [ProbeController] })
  class ProbeModule {}

  it('development posture: nosniff, no framing, no referrer, restrictive CSP, no HSTS', async () => {
    const res = await app.inject({ method: 'GET', url: '/health', headers: { host: school.host } });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(String(res.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it("production posture: HSTS with subdomains, and a CSP of default-src 'none'", async () => {
    const prod = await NestFactory.create<NestFastifyApplication>(
      ProbeModule,
      new FastifyAdapter(),
      {
        logger: false,
      },
    );
    await registerHttpSecurity(prod, {
      isProduction: true,
      webOrigin: 'https://app.example.ng',
      rootDomain: 'example.ng',
    });
    await prod.init();
    await prod.getHttpAdapter().getInstance().ready();
    try {
      const res = await prod.inject({ method: 'GET', url: '/probe' });
      expect(res.headers['strict-transport-security']).toMatch(
        /max-age=31536000; includeSubDomains/u,
      );
      const csp = String(res.headers['content-security-policy']);
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
    } finally {
      await prod.close();
    }
  });
});

describe('CORS lockdown', () => {
  const preflight = (origin: string) =>
    app.inject({
      method: 'OPTIONS',
      url: '/auth/login',
      headers: {
        host: school.host,
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-csrf-token',
      },
    });

  it("allows a school's own origin, with credentials", async () => {
    // Outside production the http:// form of a school subdomain is allowed
    // for local browser testing (F1); production requires https.
    const res = await preflight(`http://${school.subdomain}.${ROOT_DOMAIN}`);
    expect(res.headers['access-control-allow-origin']).toBe(
      `http://${school.subdomain}.${ROOT_DOMAIN}`,
    );
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('refuses foreign, look-alike and nested origins', async () => {
    for (const origin of [
      'https://evil.example.com',
      `https://not${ROOT_DOMAIN}`,
      `https://attacker.${school.subdomain}.${ROOT_DOMAIN}`,
    ]) {
      const res = await preflight(origin);
      expect(res.headers['access-control-allow-origin'], origin).toBeUndefined();
    }
  });
});

describe('rate limits — the R-09 lab profile', () => {
  const LAB_IP = `10.250.${Math.floor(Math.random() * 200) + 1}.9`;
  let lab: string[];

  beforeAll(async () => {
    lab = await fixture.addStudents(school, 40);
  });

  it('40 students sign in from one NAT address within a minute — none is throttled', async () => {
    const statuses = [];
    for (const identifier of lab) {
      statuses.push((await fixture.loginIdentifier(app, school, identifier, LAB_IP)).status);
    }
    expect(statuses.filter((s) => s === 429)).toEqual([]);
    expect(statuses.every((s) => s === 200)).toBe(true);
  });

  it('the same 40 students on the answer path from that one address are never throttled; a single runaway client is', async () => {
    const sessions = [];
    for (const identifier of lab) {
      sessions.push((await fixture.loginIdentifier(app, school, identifier, LAB_IP)).ctx);
    }
    // ~20 answer-path calls each — far above a real minute's cadence, and
    // 800 requests from one IP (the pre-B20 per-IP default was 300/min).
    let throttled = 0;
    for (let round = 0; round < 20; round += 1) {
      for (const ctx of sessions) {
        const res = await call(app, ctx, 'POST', `/attempts/${uuidv7()}/heartbeat`);
        if (res.statusCode === 429) throttled += 1;
      }
    }
    expect(throttled).toBe(0);

    // One session hammering the same route is bounded (RATE_LIMIT_ANSWER_MAX).
    const runaway = sessions[0]!;
    const attemptId = uuidv7();
    let last = 0;
    for (let i = 0; i < 620; i += 1) {
      last = (await call(app, runaway, 'POST', `/attempts/${attemptId}/heartbeat`)).statusCode;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });

  it('guessing one account is cut off quickly; spraying many accounts from one address is cut off too', async () => {
    const guessIp = `10.251.${Math.floor(Math.random() * 200) + 1}.7`;
    let firstThrottled = -1;
    for (let i = 0; i < 12; i += 1) {
      const res = await fixture.loginIdentifier(
        app,
        school,
        school.users.TEACHER.identifier,
        guessIp,
      );
      if (res.status === 429) {
        firstThrottled = i;
        break;
      }
    }
    // 10 per account per minute (RATE_LIMIT_AUTH_IDENTIFIER_MAX).
    expect(firstThrottled).toBe(10);

    const sprayIp = `10.252.${Math.floor(Math.random() * 200) + 1}.7`;
    let sprayThrottledAt = -1;
    for (let i = 0; i < 130; i += 1) {
      const res = await fixture.loginIdentifier(app, school, `nobody-${i}-${uuidv7()}`, sprayIp);
      if (res.status === 429) {
        sprayThrottledAt = i;
        break;
      }
    }
    // 120 per address per minute (RATE_LIMIT_AUTH_IP_MAX) — high enough for
    // a full lab sign-in, low enough to bound credential stuffing.
    expect(sprayThrottledAt).toBeGreaterThanOrEqual(60);
    expect(sprayThrottledAt).toBeLessThanOrEqual(120);
  });
});
