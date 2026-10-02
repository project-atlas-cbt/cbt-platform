/**
 * B20 DoD 2 ("the full tenant-isolation suite passes against every endpoint
 * in the product") — IDOR probes on every id-bearing route (07 §42
 * invariant 1; ADR-0023).
 *
 * School B is populated with real data, then every id it owns in every
 * school-owned table is harvested (owner connection). Signed in to school A
 * as the broadest role (SCHOOL_ADMIN) and as a STUDENT, every id-bearing
 * school route is called with every harvested school-B id. Three
 * independent assertions:
 *
 * 1. Indistinguishability: a school-B id gets exactly the response a
 *    never-existing id gets — same status, and the same body when it is a
 *    2xx (e.g. an empty child collection) — so the API is not even an
 *    existence oracle for another school's ids. No probe may 5xx.
 * 2. No response body — success or error — contains any school-B id other
 *    than the one the caller itself supplied (leak detector).
 * 3. School B's data is byte-for-byte unchanged afterwards (row count and
 *    newest updated_at per table) — catches a mutation that slipped through
 *    even if its response looked like a refusal.
 *
 * Plus list/search routes (no path id) are called by school A and checked
 * against the same leak detector, and a positive control proves the probe
 * would see a real resource: school A's own exam is readable at the same
 * route where school B's is not.
 */
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma, withTenant } from '@atlas/db';
import { ownerPrisma } from '../../test-support/owner-prisma.js';
import {
  fillPath,
  listRoutes,
  routeLabel,
  type RouteDescriptor,
} from '../../test-support/route-inventory.js';
import {
  bootSecurityApp,
  call,
  SecurityFixture,
  type Ctx,
  type FixtureSchool,
} from '../../test-support/security-fixture.js';

let app: NestFastifyApplication;
let routes: RouteDescriptor[];
const fixture = new SecurityFixture();
let schoolA: FixtureSchool;
let schoolB: FixtureSchool;
let adminA: Ctx;
let studentA: Ctx;
let poolB: string[];
const B_MARKER = 'idor-b';

async function tableFingerprint(schoolId: string): Promise<Record<string, string>> {
  const owner = ownerPrisma();
  const tables = await owner.$queryRaw<Array<{ table_name: string; has_updated: boolean }>>`
    SELECT c.table_name,
           EXISTS (SELECT 1 FROM information_schema.columns u
                   WHERE u.table_schema = 'public' AND u.table_name = c.table_name
                     AND u.column_name = 'updated_at') AS has_updated
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'school_id'
    ORDER BY c.table_name`;
  const out: Record<string, string> = {};
  for (const { table_name, has_updated } of tables) {
    if (!/^[a-z_]+$/u.test(table_name)) continue;
    const rows = await owner.$queryRawUnsafe<Array<{ n: bigint; u: Date | null }>>(
      `SELECT count(*)::bigint AS n, ${has_updated ? 'max(updated_at)' : 'NULL::timestamptz'} AS u
       FROM "${table_name}" WHERE school_id = $1::uuid`,
      schoolId,
    );
    out[table_name] = `${rows[0]!.n}|${rows[0]!.u?.toISOString() ?? '-'}`;
  }
  return out;
}

beforeAll(async () => {
  app = await bootSecurityApp();
  routes = listRoutes(app);
  schoolA = await fixture.createSchool('idor-a');
  schoolB = await fixture.createSchool('idor-b');
  await fixture.populate(schoolA);
  await fixture.populate(schoolB);
  const harvested = await fixture.harvestIds(schoolB.schoolId);
  poolB = [...new Set([...harvested.values()].flat())];
  adminA = await fixture.loginAs(app, schoolA, 'SCHOOL_ADMIN');
  studentA = await fixture.loginAs(app, schoolA, 'STUDENT');
});

afterAll(async () => {
  await app.close();
  await fixture.cleanup();
});

describe('IDOR probes — every id-bearing school route × every school-B id', () => {
  it('is indistinguishable from a nonexistent id, never crashes, never leaks, never changes school B', async () => {
    const before = await tableFingerprint(schoolB.schoolId);
    const idRoutes = routes.filter((r) => r.auth === 'SCHOOL' && r.params.length > 0);
    const failures: string[] = [];
    let probes = 0;

    const send = (ctx: Ctx, r: RouteDescriptor, id: string) =>
      call(
        app,
        ctx,
        r.method,
        fillPath(r, () => id),
        r.method === 'GET' ? undefined : {},
      );
    const normalise = (body: string, id: string) => body.split(id).join('<id>');

    for (const ctx of [adminA, studentA]) {
      for (const r of idRoutes) {
        // Baseline: an id that exists nowhere.
        const ghostId = uuidv7();
        const ghost = await send(ctx, r, ghostId);
        for (const foreignId of poolB) {
          probes += 1;
          const res = await send(ctx, r, foreignId);
          const label = `${routeLabel(r)} id=${foreignId}`;
          if (res.statusCode >= 500)
            failures.push(`${label} → ${res.statusCode} ${res.body.slice(0, 120)}`);
          if (res.statusCode !== ghost.statusCode) {
            failures.push(
              `${label} → ${res.statusCode}, but a nonexistent id → ${ghost.statusCode}`,
            );
          } else if (
            res.statusCode < 300 &&
            normalise(res.body, foreignId) !== normalise(ghost.body, ghostId)
          ) {
            failures.push(`${label} → 2xx body differs from a nonexistent id's`);
          }
          const leaked = poolB.find((id) => id !== foreignId && res.body.includes(id));
          if (leaked) failures.push(`${label} leaked ${leaked}`);
          // Every school-B name (school, users) carries the fixture label.
          if (res.body.includes(B_MARKER)) failures.push(`${label} leaked a school-B name`);
        }
      }
    }

    const after = await tableFingerprint(schoolB.schoolId);
    expect(probes).toBeGreaterThan(1000);
    expect(failures).toEqual([]);
    expect(after).toEqual(before);
  });

  it("list and search routes never return any of school B's ids", async () => {
    const listRoutesNoId = routes.filter(
      (r) => r.auth === 'SCHOOL' && r.params.length === 0 && r.method === 'GET',
    );
    const failures: string[] = [];
    for (const ctx of [adminA, studentA]) {
      for (const r of listRoutesNoId) {
        const res = await call(app, ctx, 'GET', r.path);
        if (res.statusCode >= 500) failures.push(`${routeLabel(r)} → ${res.statusCode}`);
        const leaked = poolB.find((id) => res.body.includes(id));
        if (leaked) failures.push(`${routeLabel(r)} leaked ${leaked}`);
        if (res.body.includes(B_MARKER)) failures.push(`${routeLabel(r)} leaked a school-B name`);
      }
    }
    expect(listRoutesNoId.length).toBeGreaterThan(20);
    expect(failures).toEqual([]);
  });

  it('positive control: the same route returns school A’s own exam but not school B’s', async () => {
    const [examA, examB] = await Promise.all(
      [schoolA, schoolB].map((s) =>
        withTenant(prisma, s.schoolId, (tx) =>
          tx.exam.findFirstOrThrow({ where: { schoolId: s.schoolId }, select: { id: true } }),
        ),
      ),
    );
    const own = await call(app, adminA, 'GET', `/exams/${examA!.id}`);
    const foreign = await call(app, adminA, 'GET', `/exams/${examB!.id}`);
    expect(own.statusCode).toBe(200);
    expect(foreign.statusCode).toBe(404);
  });
});
