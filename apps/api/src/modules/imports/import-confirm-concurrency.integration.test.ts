/**
 * B7 roadmap Testing requirements table — Concurrency: "Two simultaneous
 * imports of the same file — no duplicate creation."
 *
 * Tests the actual mechanism directly against Postgres (mirroring
 * session-activation-concurrency.integration.test.ts's own choice to go
 * below the HTTP/service layer for a database-level guarantee) rather than
 * `pg_sleep`-forcing an interleaving: unlike that test's INSERT-vs-unique-
 * index race, `confirm()`'s guarantee is a plain single-row `UPDATE ...
 * WHERE status = 'VALIDATED'` — Postgres's own row-level locking
 * deterministically serializes two concurrent UPDATEs against the same row
 * regardless of exact timing, so the outcome (exactly one `count = 1`) is
 * guaranteed on every run, not just the run where a forced delay happens to
 * land correctly.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@atlas/db';
import { safeDeleteSchools } from '../../test-support/safe-delete-schools.js';

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Import Concurrency School ${randomUUID()}`,
      subdomain: `impc-${randomUUID().slice(0, 8)}`,
    },
  });
}

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, (tx) => tx.importJob.deleteMany({ where: { schoolId } }));
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await safeDeleteSchools(prisma, createdSchoolIds);
});

describe('B7 — concurrent confirm() (Testing table, Concurrency)', () => {
  it('exactly one of two concurrent VALIDATED -> IMPORTING updates succeeds', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const user = await prisma.user.create({
      data: {
        firstName: 'Confirm',
        lastName: 'Racer',
        displayName: 'Confirm Racer',
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(user.id);

    const job = await withTenant(prisma, school.id, (tx) =>
      tx.importJob.create({
        data: {
          schoolId: school.id,
          type: 'TEACHERS',
          status: 'VALIDATED',
          sourceMediaAssetId: randomUUID(),
          uploaderUserId: user.id,
          uploaderRole: 'SCHOOL_ADMIN',
          templateVersion: 1,
          totalRows: 1,
          validRows: 1,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      }),
    );

    // The exact statement imports.service.ts's confirm() issues, fired
    // twice concurrently — Promise.all gives genuine concurrent dispatch;
    // Postgres's own row lock (not test timing) is what guarantees the
    // outcome.
    const [resultA, resultB] = await Promise.all([
      withTenant(prisma, school.id, (tx) =>
        tx.importJob.updateMany({
          where: { id: job.id, schoolId: school.id, status: 'VALIDATED' },
          data: { status: 'IMPORTING' },
        }),
      ),
      withTenant(prisma, school.id, (tx) =>
        tx.importJob.updateMany({
          where: { id: job.id, schoolId: school.id, status: 'VALIDATED' },
          data: { status: 'IMPORTING' },
        }),
      ),
    ]);

    // Never both, never neither — exactly one caller is the one that
    // should go on to enqueue the commit job.
    expect(resultA.count + resultB.count).toBe(1);

    const finalJob = await withTenant(prisma, school.id, (tx) =>
      tx.importJob.findUniqueOrThrow({ where: { id: job.id } }),
    );
    expect(finalJob.status).toBe('IMPORTING');
  });
});
