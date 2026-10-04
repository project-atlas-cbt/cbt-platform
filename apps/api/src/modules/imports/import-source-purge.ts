import { prisma, withTenant, type Prisma } from '@atlas/db';
import { retentionRule } from '@atlas/domain';
import type { ObjectStorageService } from '../../storage/object-storage.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const FINISHED = ['COMPLETED', 'FAILED', 'EXPIRED'] as const;

/** What the purge needs from object storage — nothing else. */
export type ImportSourceStorage = Pick<ObjectStorageService, 'deleteObject'>;

interface SourceFile {
  jobId: string;
  storageKey: string;
}

/**
 * B22 (ADR-0028; project-owner decision 6A, 2026-10-04): an uploaded import
 * spreadsheet is the same personal data as `import_rows.raw_data`, so it
 * follows the same 90-day clock (`import-source-files` in the retention
 * schedule) and goes at once when anyone it created is redacted.
 *
 * Runs in apps/api, not the worker's retention sweep: object storage stays
 * behind the API's abstraction (B18 export / F20 pre-cache precedent).
 *
 * The object is deleted first and `source_purged_at` set after. If the
 * second step fails, the next pass deletes again — deleting a missing key
 * succeeds — so a crash between them never leaves a file marked gone that
 * still exists. With bucket versioning on (B22) the delete leaves a
 * noncurrent version that the bucket's lifecycle rule expires at 35 days
 * (`object-noncurrent-versions`).
 */
async function purge(
  storage: ImportSourceStorage,
  schoolId: string,
  files: SourceFile[],
): Promise<number> {
  for (const file of files) await storage.deleteObject(file.storageKey);
  if (files.length === 0) return 0;
  await withTenant(prisma, schoolId, (tx) =>
    tx.importJob.updateMany({
      where: { schoolId, id: { in: files.map((f) => f.jobId) }, sourcePurgedAt: null },
      data: { sourcePurgedAt: new Date() },
    }),
  );
  return files.length;
}

async function sourceFiles(
  schoolId: string,
  where: Prisma.ImportJobWhereInput,
  take?: number,
): Promise<SourceFile[]> {
  return withTenant(prisma, schoolId, async (tx) => {
    const jobs = await tx.importJob.findMany({
      where: { ...where, schoolId, sourcePurgedAt: null },
      select: { id: true, sourceMediaAssetId: true },
      orderBy: { updatedAt: 'asc' },
      ...(take !== undefined && { take }),
    });
    if (jobs.length === 0) return [];
    const assets = await tx.mediaAsset.findMany({
      where: { schoolId, id: { in: jobs.map((j) => j.sourceMediaAssetId) } },
      select: { id: true, storageKey: true },
    });
    const keyById = new Map(assets.map((a) => [a.id, a.storageKey]));
    return jobs.flatMap((j) => {
      const storageKey = keyById.get(j.sourceMediaAssetId);
      return storageKey ? [{ jobId: j.id, storageKey }] : [];
    });
  });
}

/** The hourly pass: every finished job older than the retention period.
 * Bounded per school per pass; one school's failure never stops the rest. */
export async function purgeExpiredImportSources(
  storage: ImportSourceStorage,
  opts: { now?: Date; perSchool?: number } = {},
): Promise<{ purged: number; schoolsFailed: number }> {
  const now = opts.now ?? new Date();
  const afterDays = retentionRule('import-source-files').afterDays ?? 90;
  const cutoff = new Date(now.getTime() - afterDays * DAY_MS);
  const schools = await prisma.school.findMany({ select: { id: true } });
  let purged = 0;
  let schoolsFailed = 0;
  for (const { id: schoolId } of schools) {
    try {
      const files = await sourceFiles(
        schoolId,
        { status: { in: [...FINISHED] }, updatedAt: { lt: cutoff } },
        opts.perSchool ?? 200,
      );
      purged += await purge(storage, schoolId, files);
    } catch {
      schoolsFailed += 1;
    }
  }
  return { purged, schoolsFailed };
}

/** Redaction (decision 6A, "delete whole file"): every source file that
 * created this person, whole — the file also holds other people's rows,
 * which can't be cut out of an uploaded spreadsheet. */
export async function importSourcesForMembership(
  schoolId: string,
  membershipId: string,
): Promise<SourceFile[]> {
  return sourceFiles(schoolId, { rows: { some: { schoolId, resultMembershipId: membershipId } } });
}

export async function purgeImportSources(
  storage: ImportSourceStorage,
  schoolId: string,
  files: SourceFile[],
): Promise<number> {
  return purge(storage, schoolId, files);
}
