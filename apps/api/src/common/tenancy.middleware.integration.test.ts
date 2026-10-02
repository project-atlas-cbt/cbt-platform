/**
 * ADR-0005: proves TenancyMiddleware resolves a real School row from a
 * Host header against a live database — "Host-header-based resolution
 * that integration tests can drive directly" (no real DNS or browser
 * involved; the middleware is called directly with a crafted Host value,
 * exactly as Fastify would hand it one).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@atlas/db';
import { TenancyMiddleware } from './tenancy.middleware.js';
import { TenancyContextService, type TenancyStore } from './tenancy-context.service.js';
import { ownerPrisma } from '../test-support/owner-prisma.js';

const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';

function fakeConfig(rootDomain: string) {
  return { get: () => rootDomain } as unknown as ConstructorParameters<typeof TenancyMiddleware>[1];
}

function fakeReq(host: string | undefined) {
  return { headers: { host } } as unknown as Parameters<TenancyMiddleware['use']>[0];
}

describe('TenancyMiddleware (ADR-0005)', () => {
  let school: { id: string; subdomain: string };

  beforeAll(async () => {
    school = await prisma.school.create({
      data: {
        name: `Tenancy Middleware Test School ${randomUUID()}`,
        subdomain: `tmw-${Date.now()}`,
      },
    });
  });

  afterAll(async () => {
    await ownerPrisma().school.delete({ where: { id: school.id } });
  });

  // Deliberately resolves with a plain SNAPSHOT of the store, captured
  // from *inside* the `next()` callback — TenancyContextService's
  // AsyncLocalStorage-backed getters only return a value while genuinely
  // inside the active `.run()` call chain (exactly the property that lets
  // the real request pipeline read it downstream). Reading the live
  // service *after* this promise resolves, outside that chain, would
  // always see the "no active store" default (null/null) regardless of
  // what was actually resolved — which is precisely the bug this
  // rewritten helper avoids reintroducing.
  function run(host: string | undefined): Promise<TenancyStore> {
    return new Promise((resolve, reject) => {
      const tenancy = new TenancyContextService();
      const middleware = new TenancyMiddleware(tenancy, fakeConfig(ROOT_DOMAIN));
      try {
        middleware.use(fakeReq(host), undefined as never, () => {
          resolve({ schoolId: tenancy.schoolId, subdomain: tenancy.subdomain });
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  it('resolves a real school id from its subdomain', async () => {
    const resolved = await run(`${school.subdomain}.${ROOT_DOMAIN}`);
    expect(resolved.schoolId).toBe(school.id);
    expect(resolved.subdomain).toBe(school.subdomain);
  });

  it('is case-insensitive and tolerates a port on the Host header', async () => {
    const resolved = await run(`${school.subdomain.toUpperCase()}.${ROOT_DOMAIN}:3001`);
    expect(resolved.schoolId).toBe(school.id);
  });

  it('resolves no school for an unrecognised subdomain, but still records the parsed label', async () => {
    const resolved = await run(`no-such-school-${randomUUID()}.${ROOT_DOMAIN}`);
    expect(resolved.schoolId).toBeNull();
    expect(resolved.subdomain).not.toBeNull();
  });

  it('resolves no tenant context for the bare root domain (platform host)', async () => {
    const resolved = await run(ROOT_DOMAIN);
    expect(resolved.schoolId).toBeNull();
    expect(resolved.subdomain).toBeNull();
  });

  it('resolves no tenant context for a reserved platform label', async () => {
    const resolved = await run(`admin.${ROOT_DOMAIN}`);
    expect(resolved.schoolId).toBeNull();
    expect(resolved.subdomain).toBeNull();
  });

  it('resolves no tenant context for a host outside the root domain (plain local dev)', async () => {
    const resolved = await run('localhost:3001');
    expect(resolved.schoolId).toBeNull();
    expect(resolved.subdomain).toBeNull();
  });
});
