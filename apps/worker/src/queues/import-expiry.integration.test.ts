/**
 * B7 Background jobs (A-17 staging expiry): "marks stale VALIDATED
 * ImportJobs EXPIRED." Runs against real Postgres (RLS included, via the
 * shared `prisma` singleton) — same convention as
 * orphan-media-report.integration.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@atlas/db';
import { runImportExpirySweep } from './import-expiry.queue.js';

const ownerDatabaseUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
const HOUR_MS = 60 * 60 * 1000;

async function createSchoolWithUploader() {
  const suffix = randomUUID();
  const school = await prisma.school.create({
    data: { name: `Import Expiry School ${suffix}`, subdomain: `impexp-${suffix}` },
  });
  const uploader = await prisma.user.create({
    data: { firstName: 'Expiry', lastName: 'Uploader', displayName: 'Expiry Uploader' },
  });
  return { schoolId: school.id, uploaderId: uploader.id };
}

async function createImportJob(params: {
  schoolId: string;
  uploaderId: string;
  status: 'VALIDATED' | 'IMPORTING' | 'COMPLETED';
  expiresAt: Date;
}) {
  return withTenant(prisma, params.schoolId, (tx) =>
    tx.importJob.create({
      data: {
        schoolId: params.schoolId,
        type: 'TEACHERS',
        status: params.status,
        sourceMediaAssetId: randomUUID(),
        uploaderUserId: params.uploaderId,
        uploaderRole: 'SCHOOL_ADMIN',
        templateVersion: 1,
        expiresAt: params.expiresAt,
      },
    }),
  );
}

async function cleanupSchool(schoolId: string, uploaderId: string): Promise<void> {
  await withTenant(prisma, schoolId, (tx) => tx.importJob.deleteMany({ where: { schoolId } }));
  await prisma.school.delete({ where: { id: schoolId } });
  await prisma.user.delete({ where: { id: uploaderId } });
}

describe.skipIf(!ownerDatabaseUrl)('import staging-expiry sweep (B7, A-17)', () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterAll(async () => {
    for (const fn of cleanup) await fn().catch(() => undefined);
    await prisma.$disconnect();
  });

  it('marks a stale VALIDATED job EXPIRED, but leaves one still within its window untouched', async () => {
    const { schoolId, uploaderId } = await createSchoolWithUploader();
    cleanup.push(() => cleanupSchool(schoolId, uploaderId));

    const stale = await createImportJob({
      schoolId,
      uploaderId,
      status: 'VALIDATED',
      expiresAt: new Date(Date.now() - HOUR_MS),
    });
    const fresh = await createImportJob({
      schoolId,
      uploaderId,
      status: 'VALIDATED',
      expiresAt: new Date(Date.now() + HOUR_MS),
    });

    await runImportExpirySweep();

    const [staleAfter, freshAfter] = await withTenant(prisma, schoolId, (tx) =>
      Promise.all([
        tx.importJob.findUniqueOrThrow({ where: { id: stale.id } }),
        tx.importJob.findUniqueOrThrow({ where: { id: fresh.id } }),
      ]),
    );
    expect(staleAfter.status).toBe('EXPIRED');
    expect(freshAfter.status).toBe('VALIDATED');
  });

  it('never touches a job already past VALIDATED (IMPORTING/COMPLETED)', async () => {
    const { schoolId, uploaderId } = await createSchoolWithUploader();
    cleanup.push(() => cleanupSchool(schoolId, uploaderId));

    const importing = await createImportJob({
      schoolId,
      uploaderId,
      status: 'IMPORTING',
      expiresAt: new Date(Date.now() - HOUR_MS),
    });
    const completed = await createImportJob({
      schoolId,
      uploaderId,
      status: 'COMPLETED',
      expiresAt: new Date(Date.now() - HOUR_MS),
    });

    await runImportExpirySweep();

    const [importingAfter, completedAfter] = await withTenant(prisma, schoolId, (tx) =>
      Promise.all([
        tx.importJob.findUniqueOrThrow({ where: { id: importing.id } }),
        tx.importJob.findUniqueOrThrow({ where: { id: completed.id } }),
      ]),
    );
    expect(importingAfter.status).toBe('IMPORTING');
    expect(completedAfter.status).toBe('COMPLETED');
  });
});
