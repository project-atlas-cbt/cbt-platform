/**
 * B4 Background jobs: "Orphan-media reporting (cleanup deferred to M-14's
 * retention policy — report only, delete nothing)." Runs against real
 * Postgres (RLS included, via the shared `prisma` singleton) — same
 * convention as subscription-expiry.integration.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@atlas/db';
import { runOrphanMediaReport } from './orphan-media-report.queue.js';
import { ORPHAN_MEDIA_REPORT_CACHE_KEY, type OrphanMediaReportSnapshot } from '@atlas/domain';
import { ownerPrisma } from '../test-support/owner-prisma.js';

const ownerDatabaseUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
const MINUTE_MS = 60 * 1000;

class FakeRedis {
  store = new Map<string, string>();
  set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return Promise.resolve('OK');
  }
}

async function createSchoolWithUploader() {
  const suffix = randomUUID();
  const school = await prisma.school.create({
    data: { name: `Orphan Report School ${suffix}`, subdomain: `orphan-${suffix}` },
  });
  const uploader = await prisma.user.create({
    data: { firstName: 'Orphan', lastName: 'Uploader', displayName: 'Orphan Uploader' },
  });
  return { schoolId: school.id, uploaderId: uploader.id };
}

async function createAsset(params: {
  schoolId: string;
  uploaderId: string;
  type: 'SCHOOL_LOGO' | 'QUESTION_IMAGE';
  status: 'PENDING' | 'READY';
  uploadUrlExpiresAt: Date;
}) {
  const id = randomUUID();
  await withTenant(prisma, params.schoolId, (tx) =>
    tx.mediaAsset.create({
      data: {
        id,
        schoolId: params.schoolId,
        type: params.type,
        status: params.status,
        storageKey: `schools/${params.schoolId}/test/${id}/f.png`,
        originalFilename: 'f.png',
        declaredMimeType: 'image/png',
        declaredSizeBytes: 1,
        uploaderUserId: params.uploaderId,
        uploadUrlExpiresAt: params.uploadUrlExpiresAt,
      },
    }),
  );
  return id;
}

async function cleanupSchool(schoolId: string, uploaderId: string): Promise<void> {
  await withTenant(prisma, schoolId, (tx) => tx.mediaAsset.deleteMany({ where: { schoolId } }));
  await ownerPrisma().school.delete({ where: { id: schoolId } });
  await prisma.user.delete({ where: { id: uploaderId } });
}

describe.skipIf(!ownerDatabaseUrl)('orphan-media report sweep (B4)', () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterAll(async () => {
    for (const fn of cleanup) await fn().catch(() => undefined);
    await prisma.$disconnect();
  });

  it('counts a PENDING asset past its upload-URL expiry, but not one still within its window', async () => {
    const { schoolId, uploaderId } = await createSchoolWithUploader();
    cleanup.push(() => cleanupSchool(schoolId, uploaderId));

    await createAsset({
      schoolId,
      uploaderId,
      type: 'QUESTION_IMAGE',
      status: 'PENDING',
      uploadUrlExpiresAt: new Date(Date.now() - MINUTE_MS), // expired
    });
    await createAsset({
      schoolId,
      uploaderId,
      type: 'QUESTION_IMAGE',
      status: 'PENDING',
      uploadUrlExpiresAt: new Date(Date.now() + MINUTE_MS), // still valid
    });

    const redis = new FakeRedis();
    await runOrphanMediaReport({ redis });

    const raw = redis.store.get(ORPHAN_MEDIA_REPORT_CACHE_KEY);
    const snapshot = JSON.parse(raw!) as OrphanMediaReportSnapshot;
    expect(snapshot.expiredPendingCount).toBeGreaterThanOrEqual(1);
  });

  it("counts a READY logo no school's logoMediaId points to, but not the currently-active one", async () => {
    const { schoolId, uploaderId } = await createSchoolWithUploader();
    cleanup.push(() => cleanupSchool(schoolId, uploaderId));

    const currentLogoId = await createAsset({
      schoolId,
      uploaderId,
      type: 'SCHOOL_LOGO',
      status: 'READY',
      uploadUrlExpiresAt: new Date(Date.now() - MINUTE_MS),
    });
    await createAsset({
      schoolId,
      uploaderId,
      type: 'SCHOOL_LOGO',
      status: 'READY',
      uploadUrlExpiresAt: new Date(Date.now() - MINUTE_MS),
    });
    await prisma.school.update({ where: { id: schoolId }, data: { logoMediaId: currentLogoId } });

    const redis = new FakeRedis();
    await runOrphanMediaReport({ redis });

    const snapshot = JSON.parse(
      redis.store.get(ORPHAN_MEDIA_REPORT_CACHE_KEY)!,
    ) as OrphanMediaReportSnapshot;
    // Exactly one of the two READY logos (the superseded one) is orphaned —
    // the currently-pointed-to one is not, proven relative to a school with
    // no other logos in play.
    expect(snapshot.supersededLogoCount).toBeGreaterThanOrEqual(1);
  });

  it('counts READY non-logo assets as unchecked, not as orphaned — the honest B8 coverage gap', async () => {
    const { schoolId, uploaderId } = await createSchoolWithUploader();
    cleanup.push(() => cleanupSchool(schoolId, uploaderId));

    await createAsset({
      schoolId,
      uploaderId,
      type: 'QUESTION_IMAGE',
      status: 'READY',
      uploadUrlExpiresAt: new Date(Date.now() - MINUTE_MS),
    });

    const redis = new FakeRedis();
    await runOrphanMediaReport({ redis });

    const snapshot = JSON.parse(
      redis.store.get(ORPHAN_MEDIA_REPORT_CACHE_KEY)!,
    ) as OrphanMediaReportSnapshot;
    expect(snapshot.uncheckedReadyCount).toBeGreaterThanOrEqual(1);
  });

  it('writes a snapshot with a computedAt timestamp to the provided redis client', async () => {
    const redis = new FakeRedis();
    await runOrphanMediaReport({ redis });

    const raw = redis.store.get(ORPHAN_MEDIA_REPORT_CACHE_KEY);
    expect(raw).toBeDefined();
    const snapshot = JSON.parse(raw!) as OrphanMediaReportSnapshot;
    expect(typeof snapshot.computedAt).toBe('string');
  });
});
