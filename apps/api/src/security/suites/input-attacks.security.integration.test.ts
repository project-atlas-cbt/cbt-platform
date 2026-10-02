/**
 * B20 security testing row: "injection across all input surfaces; upload
 * attacks". Generic over the API surface:
 *
 * - every free-text query parameter in the committed OpenAPI document gets
 *   SQL-injection payloads (no 5xx, no credential material, no other
 *   school's data in any response);
 * - every route that accepts a body gets prototype-pollution payloads (never
 *   a 2xx/5xx, and Object.prototype stays clean);
 * - oversized and malformed bodies are refused at the framework edge;
 * - uploads: script-bearing SVG/HTML disguised as images, path-traversal
 *   filenames, and type smuggling are all refused or neutralised.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { v7 as uuidv7 } from 'uuid';
import { prisma, withTenant } from '@atlas/db';
import { fillPath, listRoutes, routeLabel } from '../../test-support/route-inventory.js';
import {
  bootSecurityApp,
  call,
  SecurityFixture,
  type Ctx,
  type FixtureSchool,
} from '../../test-support/security-fixture.js';

const here = dirname(fileURLToPath(import.meta.url));
const openapi = JSON.parse(readFileSync(resolve(here, '../../../openapi.json'), 'utf8')) as {
  paths: Record<
    string,
    Record<
      string,
      {
        parameters?: Array<{
          in: string;
          name: string;
          schema?: { type?: string; enum?: unknown; format?: string };
        }>;
      }
    >
  >;
};

const SQLI = [
  `' OR '1'='1`,
  `'; DROP TABLE users; --`,
  `%' UNION SELECT password_hash, email FROM users --`,
  `\\'; SELECT pg_sleep(0); --`,
  `${'a'.repeat(5000)}`,
];

let app: NestFastifyApplication;
const fixture = new SecurityFixture();
let schoolA: FixtureSchool;
let schoolB: FixtureSchool;
let adminA: Ctx;
let platform: Ctx;

beforeAll(async () => {
  app = await bootSecurityApp();
  schoolA = await fixture.createSchool('inj-a');
  schoolB = await fixture.createSchool('inj-b');
  await fixture.populate(schoolA);
  await fixture.populate(schoolB);
  adminA = await fixture.loginAs(app, schoolA, 'SCHOOL_ADMIN');
  const sa = await fixture.createPlatformAdmin();
  platform = await fixture.loginPlatform(app, sa.email);
});

afterAll(async () => {
  await app.close();
  await fixture.cleanup();
});

describe('SQL injection through every free-text query parameter', () => {
  it('never errors, never returns credential material, never crosses a school boundary', async () => {
    const usersBefore = await prisma.user.count();
    const failures: string[] = [];
    let probes = 0;
    for (const [path, ops] of Object.entries(openapi.paths)) {
      const get = ops.get;
      if (!get) continue;
      const params = (get.parameters ?? []).filter(
        (p) =>
          p.in === 'query' && p.schema?.type === 'string' && !p.schema.enum && !p.schema.format,
      );
      if (params.length === 0) continue;
      const route = path.replace(/^\/v1/u, '').replace(/\{[^}]+\}/gu, uuidv7());
      const ctx = route.startsWith('/platform') ? platform : adminA;
      for (const p of params) {
        for (const payload of SQLI) {
          probes += 1;
          const res = await call(
            app,
            ctx,
            'GET',
            `${route}?${p.name}=${encodeURIComponent(payload)}`,
          );
          const label = `GET ${path} ?${p.name}=${payload.slice(0, 30)}`;
          if (res.statusCode >= 500) failures.push(`${label} → ${res.statusCode}`);
          if (/\$argon2/u.test(res.body)) failures.push(`${label} returned a password hash`);
          if (!route.startsWith('/platform') && res.body.includes(schoolB.subdomain)) {
            failures.push(`${label} returned school-B data`);
          }
        }
      }
    }
    expect(probes).toBeGreaterThan(100);
    expect(failures).toEqual([]);
    expect(await prisma.user.count()).toBe(usersBefore);
  });
});

describe('malformed ids in every path parameter', () => {
  it('a non-UUID id is a clean 4xx on every id-bearing route, never a 5xx', async () => {
    const failures: string[] = [];
    const routes = listRoutes(app).filter((r) => r.params.length > 0 && r.auth !== 'PUBLIC');
    for (const r of routes) {
      for (const bad of [`' OR 1=1 --`, 'not-a-uuid', '1', '../../etc/passwd']) {
        const ctx = r.auth === 'PLATFORM' ? platform : adminA;
        const res = await call(
          app,
          ctx,
          r.method,
          fillPath(r, () => bad),
          r.method === 'GET' ? undefined : {},
        );
        if (res.statusCode >= 500)
          failures.push(`${routeLabel(r)} with ${bad} → ${res.statusCode}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('prototype pollution and unexpected fields on every body-accepting route', () => {
  it('is refused everywhere, and Object.prototype is untouched', async () => {
    const routes = listRoutes(app).filter(
      (r) => r.method !== 'GET' && r.method !== 'DELETE' && r.auth === 'SCHOOL',
    );
    const failures: string[] = [];
    const payload = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},"unexpected<script>":"x"}',
    ) as Record<string, unknown>;
    for (const r of routes) {
      const res = await call(
        app,
        adminA,
        r.method,
        fillPath(r, () => uuidv7()),
        payload,
      );
      if (res.statusCode >= 500) failures.push(`${routeLabel(r)} → ${res.statusCode}`);
      if (res.statusCode >= 200 && res.statusCode < 300)
        failures.push(`${routeLabel(r)} accepted it (${res.statusCode})`);
    }
    expect(routes.length).toBeGreaterThan(80);
    expect(failures).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('an oversized body is refused at the edge (413) and malformed JSON is a clean 400', async () => {
    const big = await call(app, adminA, 'POST', '/academics/departments', {
      name: 'x'.repeat(2 * 1024 * 1024),
      code: 'BIG',
    });
    expect(big.statusCode).toBe(413);
    const malformed = await app.inject({
      method: 'POST',
      url: '/academics/departments',
      headers: {
        host: adminA.host,
        cookie: `_csrf=${adminA.csrfCookie}; atlas_session=${adminA.sessionCookie}`,
        'x-csrf-token': adminA.csrfToken,
        'content-type': 'application/json',
      },
      payload: '{"name": "x", ',
      remoteAddress: adminA.ip,
    });
    expect(malformed.statusCode).toBe(400);
  });
});

describe('upload attacks', () => {
  function put(url: string, body: Buffer): Promise<number> {
    return new Promise((resolvePut, reject) => {
      const target = new URL(url);
      const req = http.request(
        {
          hostname: target.hostname,
          port: target.port,
          path: target.pathname + target.search,
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolvePut(res.statusCode ?? 0));
        },
      );
      req.on('error', reject);
      req.end(body);
    });
  }

  async function uploadAs(declaredMimeType: string, filename: string, content: Buffer) {
    const req = await call(app, adminA, 'POST', '/media/uploads', {
      type: 'QUESTION_IMAGE',
      filename,
      declaredMimeType,
      declaredSizeBytes: content.length,
    });
    if (req.statusCode !== 201 && req.statusCode !== 200) return { requested: req.statusCode };
    const { mediaAssetId, uploadUrl } = req.json<{ mediaAssetId: string; uploadUrl: string }>();
    await put(uploadUrl, content);
    const done = await call(app, adminA, 'POST', `/media/uploads/${mediaAssetId}/complete`);
    return {
      requested: req.statusCode,
      mediaAssetId,
      completed: done.statusCode,
      body: done.json<{ status?: string }>(),
    };
  }

  it('a script-bearing SVG disguised as a PNG never becomes servable', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>',
    );
    const r = await uploadAs('image/png', 'diagram.png', svg);
    expect(r.body?.status).not.toBe('READY');
  });

  it('HTML disguised as a JPEG never becomes servable', async () => {
    const html = Buffer.from('<!doctype html><html><script>fetch("/steal")</script></html>');
    const r = await uploadAs('image/jpeg', 'photo.jpg', html);
    expect(r.body?.status).not.toBe('READY');
  });

  it('a non-image declared type is refused before any upload URL is issued', async () => {
    const res = await call(app, adminA, 'POST', '/media/uploads', {
      type: 'QUESTION_IMAGE',
      filename: 'x.svg',
      declaredMimeType: 'image/svg+xml',
      declaredSizeBytes: 100,
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('a path-traversal filename is confined to the school’s own storage prefix', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const r = await uploadAs('image/png', '../../../schools/other/evil.png', png);
    const asset = await withTenant(prisma, schoolA.schoolId, (tx) =>
      tx.mediaAsset.findUniqueOrThrow({ where: { id: r.mediaAssetId! } }),
    );
    expect(asset.storageKey.startsWith(`schools/${schoolA.schoolId}/`)).toBe(true);
    expect(asset.storageKey).not.toContain('..');
  });
});
