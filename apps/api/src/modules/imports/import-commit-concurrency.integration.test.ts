/**
 * Review follow-up (2026-08-29): `ImportCommitService.commit()`'s own
 * `WHERE status = 'VALID'` row fetch has no row-level locking, so two
 * overlapping executions of the *same* job (e.g. a BullMQ stalled-lock
 * redelivery landing on a second worker while the first is still genuinely
 * alive) could both fetch and process the same batch of rows. Fixed with
 * `ImportJob.processingClaimedAt` — an atomic claim/release lease, the same
 * conditional-updateMany idiom `import-confirm-concurrency.integration
 * .test.ts` already proves for `confirm()`'s own `VALIDATED -> IMPORTING`
 * transition (see that file's own doc comment).
 *
 * Two cases here: (1) a second `commit()` call while a claim is fresh is a
 * pure no-op — the row is left untouched, never double-processed; (2) a
 * second `commit()` call after the previous claim has gone stale (the
 * holder presumably crashed) is honoured — this is the self-healing half of
 * the design, proven directly rather than only asserted in a comment.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma, withTenant } from '@atlas/db';
import { AppModule } from '../../app.module.js';
import { ImportCommitService } from './import-commit.service.js';

let app: NestFastifyApplication;
let commit: ImportCommitService;

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  commit = app.get(ImportCommitService);
});

afterAll(async () => {
  await app.close();
});

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Import Commit Concurrency School ${randomUUID()}`,
      subdomain: `impcc-${randomUUID().slice(0, 8)}`,
    },
  });
}

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, (tx) => tx.importRow.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.importJob.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.roleAssignment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.deleteMany({ where: { schoolId } }),
    );
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
});

async function seedJobWithOneTeacherRow(schoolId: string, uploaderUserId: string) {
  const job = await withTenant(prisma, schoolId, (tx) =>
    tx.importJob.create({
      data: {
        schoolId,
        type: 'TEACHERS',
        status: 'IMPORTING',
        sourceMediaAssetId: randomUUID(),
        uploaderUserId,
        uploaderRole: 'SCHOOL_ADMIN',
        templateVersion: 1,
        totalRows: 1,
        validRows: 1,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    }),
  );
  const staffId = `CC-${randomUUID().slice(0, 8)}`;
  const row = await withTenant(prisma, schoolId, (tx) =>
    tx.importRow.create({
      data: {
        schoolId,
        importJobId: job.id,
        rowNumber: 1,
        status: 'VALID',
        rawData: {
          'Staff ID': staffId,
          'First Name': 'Concurrency',
          'Last Name': 'Test',
          Email: `${staffId.toLowerCase()}@example.com`,
        },
      },
    }),
  );
  return { job, row };
}

describe('B7 review follow-up — ImportCommitService.commit() single-runner claim', () => {
  it('a second commit() call is a no-op while the first run holds a fresh claim', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const user = await prisma.user.create({
      data: {
        firstName: 'Claim',
        lastName: 'Holder',
        displayName: 'Claim Holder',
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(user.id);

    const { job, row } = await seedJobWithOneTeacherRow(school.id, user.id);

    // Simulate an active, in-progress run: claim the job right now, exactly
    // as commit()'s own claim step would, but without releasing it — the
    // shape of "another worker is genuinely still processing this."
    await withTenant(prisma, school.id, (tx) =>
      tx.importJob.update({ where: { id: job.id }, data: { processingClaimedAt: new Date() } }),
    );

    await commit.commit(school.id, job.id);

    // The row must be untouched — a real, unclaimed run would have moved it
    // to COMMITTED or FAILED; a correctly-skipped run leaves it exactly as
    // it was, since commit() returned before ever querying VALID rows.
    const untouchedRow = await withTenant(prisma, school.id, (tx) =>
      tx.importRow.findUniqueOrThrow({ where: { id: row.id } }),
    );
    expect(untouchedRow.status).toBe('VALID');

    // The job must still show the simulated holder's claim, not this call's
    // own (it never got to overwrite it) — and must not have advanced past
    // IMPORTING.
    const untouchedJob = await withTenant(prisma, school.id, (tx) =>
      tx.importJob.findUniqueOrThrow({ where: { id: job.id } }),
    );
    expect(untouchedJob.status).toBe('IMPORTING');
    expect(untouchedJob.processingClaimedAt).not.toBeNull();
  });

  it('commit() proceeds and self-heals once a prior claim has gone stale', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const user = await prisma.user.create({
      data: {
        firstName: 'Stale',
        lastName: 'Holder',
        displayName: 'Stale Holder',
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(user.id);

    const { job, row } = await seedJobWithOneTeacherRow(school.id, user.id);

    // Simulate a crashed prior run: a claim well past CLAIM_STALE_MS
    // (10 minutes) with no release — the only way a claim legitimately
    // outlives that window is the process that held it having died.
    await withTenant(prisma, school.id, (tx) =>
      tx.importJob.update({
        where: { id: job.id },
        data: { processingClaimedAt: new Date(Date.now() - 15 * 60 * 1000) },
      }),
    );

    await commit.commit(school.id, job.id);

    const finishedRow = await withTenant(prisma, school.id, (tx) =>
      tx.importRow.findUniqueOrThrow({ where: { id: row.id } }),
    );
    expect(finishedRow.status).toBe('COMMITTED');

    const finishedJob = await withTenant(prisma, school.id, (tx) =>
      tx.importJob.findUniqueOrThrow({ where: { id: job.id } }),
    );
    expect(finishedJob.status).toBe('COMPLETED');
    expect(finishedJob.committedRows).toBe(1);
    // Released on the way out, not left behind for the next run to trip
    // over.
    expect(finishedJob.processingClaimedAt).toBeNull();
  });
});
