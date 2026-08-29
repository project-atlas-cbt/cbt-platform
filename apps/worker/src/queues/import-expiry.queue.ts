import { Worker, type ConnectionOptions, type Job, type Queue } from 'bullmq';
import { prisma, withTenant } from '@atlas/db';

export const IMPORT_EXPIRY_QUEUE_NAME = 'atlas-import-expiry';
// A stable jobId so re-scheduling on every process restart doesn't pile up
// duplicate repeatable jobs — same convention as SUBSCRIPTION_EXPIRY's own
// SWEEP_JOB_ID.
const SWEEP_JOB_ID = 'sweep';

export interface ImportExpiryDeps {
  now?: () => Date;
}

/**
 * B7's A-17 "staging expiry" hygiene sweep — marks stale `VALIDATED`
 * `ImportJob`s `EXPIRED`. `POST /v1/imports/:id/confirm` (apps/api) already
 * lazily rejects an expired job on its own, even between sweeps — this is
 * the formal, eventual status transition for anything nobody ever tried to
 * confirm, mirroring `runOrphanMediaReport`'s own "report/transition only,
 * never delete the underlying data" shape. A plain async function, not a
 * class (this process has no Nest DI), directly unit/integration-testable
 * without standing up BullMQ — same shape as every other sweep here.
 *
 * Iterates schools one at a time via `withTenant`, never a single global
 * query — `import_jobs` is RLS-protected (`FORCE ROW LEVEL SECURITY`), the
 * same real constraint every prior cross-school sweep in this codebase
 * (subscription-expiry, orphan-media-report) already documents.
 */
export async function runImportExpirySweep(deps: ImportExpiryDeps = {}): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const schools = await prisma.school.findMany({ select: { id: true } });

  for (const school of schools) {
    await withTenant(prisma, school.id, (tx) =>
      tx.importJob.updateMany({
        where: { schoolId: school.id, status: 'VALIDATED', expiresAt: { lt: now } },
        data: { status: 'EXPIRED' },
      }),
    );
  }
}

export function createImportExpiryWorker(
  connection: ConnectionOptions,
  deps: ImportExpiryDeps,
): Worker {
  return new Worker(
    IMPORT_EXPIRY_QUEUE_NAME,
    async (_job: Job) => {
      await runImportExpirySweep(deps);
    },
    { connection },
  );
}

/** Same `upsertJobScheduler` convention as every other sweep here —
 * idempotent by its stable `jobSchedulerId`, safe to call on every process
 * restart. */
export async function scheduleImportExpirySweep(queue: Queue, everyMs: number): Promise<void> {
  await queue.upsertJobScheduler(
    SWEEP_JOB_ID,
    { every: everyMs },
    { opts: { removeOnComplete: true, removeOnFail: 10 } },
  );
}
