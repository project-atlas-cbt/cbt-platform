/**
 * B20 DoD 2 + 3 (backend-roadmap B20 "privilege escalation across all six
 * roles"; "full tenant-isolation suite across every endpoint").
 *
 * Every route comes from the running app's own metadata (route-inventory),
 * and every expectation is derived from PERMISSION_TABLE — nothing here is
 * a hand-kept list, so a route or rule added later is covered on its first
 * run:
 *
 * 1. Unauthenticated: every non-public route answers 401.
 * 2. Privilege escalation: for every school route, every school role whose
 *    grant for the route's permission is not GRANTED is refused with 403
 *    — at the guard, before any handler or body validation runs.
 * 3. Cross-kind: a school session never reaches a platform route, and a
 *    Software Admin session never reaches a school route.
 * 4. Cross-tenant session replay: a valid school-A session presented on
 *    school B's host is not a session at all (401) — on every school route.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { findPermissionRule } from '@atlas/domain';
import {
  fillPath,
  listRoutes,
  routeLabel,
  type RouteDescriptor,
} from '../../test-support/route-inventory.js';
import {
  ADMIN_HOST,
  bootSecurityApp,
  call,
  csrfContext,
  SCHOOL_ROLES,
  SecurityFixture,
  type Ctx,
  type FixtureSchool,
} from '../../test-support/security-fixture.js';

const PLACEHOLDER_ID = '0190a7c0-0000-7000-8000-000000000000';

let app: NestFastifyApplication;
let routes: RouteDescriptor[];
const fixture = new SecurityFixture();
let schoolA: FixtureSchool;
let schoolB: FixtureSchool;
const sessions = {} as Record<(typeof SCHOOL_ROLES)[number], Ctx>;
let platform: Ctx;

beforeAll(async () => {
  app = await bootSecurityApp();
  routes = listRoutes(app);
  schoolA = await fixture.createSchool('authz-a');
  schoolB = await fixture.createSchool('authz-b');
  for (const role of SCHOOL_ROLES) sessions[role] = await fixture.loginAs(app, schoolA, role);
  const admin = await fixture.createPlatformAdmin();
  platform = await fixture.loginPlatform(app, admin.email);
});

afterAll(async () => {
  await app.close();
  await fixture.cleanup();
});

const url = (r: RouteDescriptor) => fillPath(r, () => PLACEHOLDER_ID);

describe('route inventory', () => {
  it('finds the whole API surface and every non-public route declares a permission', () => {
    expect(routes.length).toBeGreaterThan(150);
    for (const r of routes.filter((x) => x.auth !== 'PUBLIC')) {
      expect(r.permissionId, routeLabel(r)).not.toBeNull();
      expect(findPermissionRule(r.permissionId!), routeLabel(r)).toBeDefined();
    }
  });
});

describe('unauthenticated access', () => {
  it('every non-public route answers 401 without a session', async () => {
    const failures: string[] = [];
    for (const r of routes.filter((x) => x.auth !== 'PUBLIC')) {
      const host = r.auth === 'PLATFORM' ? ADMIN_HOST : schoolA.host;
      const ctx = await csrfContext(app, host);
      const res = await call(app, ctx, r.method, url(r));
      if (res.statusCode !== 401) failures.push(`${routeLabel(r)} → ${res.statusCode}`);
    }
    expect(failures).toEqual([]);
  });
});

describe('privilege escalation (all five school roles × every school route)', () => {
  it('a role without a GRANTED grant is refused (403) on every school route', async () => {
    const failures: string[] = [];
    let probes = 0;
    for (const r of routes.filter((x) => x.auth === 'SCHOOL')) {
      const rule = findPermissionRule(r.permissionId!)!;
      for (const role of SCHOOL_ROLES) {
        if (rule.grants[role].kind === 'GRANTED') continue;
        probes += 1;
        const res = await call(app, sessions[role], r.method, url(r));
        if (res.statusCode !== 403) {
          failures.push(`${role} ${routeLabel(r)} [${rule.grants[role].kind}] → ${res.statusCode}`);
        }
      }
    }
    expect(probes).toBeGreaterThan(100);
    expect(failures).toEqual([]);
  });

  // The cross-kind and cross-tenant probes below carry a *valid* CSRF
  // context for the host they target — so CSRF can't be what refuses them,
  // and the 401 proves the authentication layer itself rejects the foreign
  // session on every route, mutations included.
  const foreignSession = async (session: Ctx, host: string): Promise<Ctx> => ({
    ...(await csrfContext(app, host)),
    sessionCookieName: session.sessionCookieName!,
    sessionCookie: session.sessionCookie!,
  });

  it('a school session of any role never reaches a platform route (401)', async () => {
    const failures: string[] = [];
    for (const role of SCHOOL_ROLES) {
      const ctx = await foreignSession(sessions[role], ADMIN_HOST);
      for (const r of routes.filter((x) => x.auth === 'PLATFORM')) {
        const res = await call(app, ctx, r.method, url(r));
        if (res.statusCode !== 401) failures.push(`${role} ${routeLabel(r)} → ${res.statusCode}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('a Software Admin session never reaches a school route (401) — break-glass is a separate, audited path', async () => {
    const failures: string[] = [];
    const ctx = await foreignSession(platform, schoolA.host);
    for (const r of routes.filter((x) => x.auth === 'SCHOOL')) {
      const res = await call(app, ctx, r.method, url(r));
      if (res.statusCode !== 401) failures.push(`${routeLabel(r)} → ${res.statusCode}`);
    }
    expect(failures).toEqual([]);
  });
});

describe('cross-tenant session replay', () => {
  it("a valid school-A session on school B's host is rejected (401) on every school route", async () => {
    const failures: string[] = [];
    // School A's SCHOOL_ADMIN cookie with a genuine school-B CSRF context.
    const ctxOnB: Ctx = {
      ...(await csrfContext(app, schoolB.host)),
      sessionCookieName: 'atlas_session',
      sessionCookie: sessions.SCHOOL_ADMIN.sessionCookie!,
    };
    for (const r of routes.filter((x) => x.auth === 'SCHOOL')) {
      const res = await call(app, ctxOnB, r.method, url(r));
      if (res.statusCode !== 401) failures.push(`${routeLabel(r)} → ${res.statusCode}`);
    }
    expect(failures).toEqual([]);
  });
});
