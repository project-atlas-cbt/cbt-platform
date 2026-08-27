import { Worker, type ConnectionOptions, type Job, type Queue } from 'bullmq';
import { prisma, withTenant } from '@atlas/db';
import { ORPHAN_MEDIA_REPORT_CACHE_KEY, type OrphanMediaReportSnapshot } from '@atlas/domain';

export const ORPHAN_MEDIA_REPORT_QUEUE_NAME = 'atlas-orphan-media-report';
// A stable jobId so re-scheduling on every process restart doesn't pile up
// duplicate repeatable jobs — same convention as SUBSCRIPTION_EXPIRY's own
// SWEEP_JOB_ID.
const SWEEP_JOB_ID = 'sweep';

export interface OrphanMediaReportDeps {
  redis: { set: (key: string, value: string) => Promise<unknown> };
  now?: () => Date;
}

/**
 * B4's "Orphan-media reporting" background job (backend-roadmap.md B4
 * Background jobs) — **report only, never deletes**; cleanup itself is a
 * future M-14 retention-policy job. A plain async function, not a class
 * (this process has no Nest DI), so it's directly unit/integration-
 * testable without standing up BullMQ — same shape as
 * runSubscriptionExpirySweep.
 *
 * Iterates schools one at a time via `withTenant`, never a single global
 * query — `media_assets` is RLS-protected (FORCE ROW LEVEL SECURITY), so
 * `atlas_app` cannot see rows across multiple schools in one unscoped
 * query (the same real constraint B3's sweeper already documented).
 *
 * `uncheckedReadyCount` exists so this report is honest about its own
 * coverage gap rather than silently overstating it — see
 * OrphanMediaReportSnapshot's own doc comment in @atlas/domain for why
 * READY question-media assets can't be classified as orphaned or not
 * until B8 gives them a real referencing entity.
 */
export async function runOrphanMediaReport(deps: OrphanMediaReportDeps): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const schools = await prisma.school.findMany({ select: { id: true, logoMediaId: true } });

  const snapshot: OrphanMediaReportSnapshot = {
    expiredPendingCount: 0,
    supersededLogoCount: 0,
    uncheckedReadyCount: 0,
    computedAt: now.toISOString(),
  };

  for (const school of schools) {
    const [expiredPending, readyLogos, uncheckedReady] = await Promise.all([
      withTenant(prisma, school.id, (tx) =>
        tx.mediaAsset.count({
          where: { schoolId: school.id, status: 'PENDING', uploadUrlExpiresAt: { lt: now } },
        }),
      ),
      withTenant(prisma, school.id, (tx) =>
        tx.mediaAsset.findMany({
          where: { schoolId: school.id, status: 'READY', type: 'SCHOOL_LOGO' },
          select: { id: true },
        }),
      ),
      withTenant(prisma, school.id, (tx) =>
        tx.mediaAsset.count({
          where: { schoolId: school.id, status: 'READY', type: { not: 'SCHOOL_LOGO' } },
        }),
      ),
    ]);

    snapshot.expiredPendingCount += expiredPending;
    snapshot.supersededLogoCount += readyLogos.filter((a) => a.id !== school.logoMediaId).length;
    snapshot.uncheckedReadyCount += uncheckedReady;
  }

  await deps.redis.set(ORPHAN_MEDIA_REPORT_CACHE_KEY, JSON.stringify(snapshot));
}

export function createOrphanMediaReportWorker(
  connection: ConnectionOptions,
  deps: OrphanMediaReportDeps,
): Worker {
  return new Worker(
    ORPHAN_MEDIA_REPORT_QUEUE_NAME,
    async (_job: Job) => {
      await runOrphanMediaReport(deps);
    },
    { connection },
  );
}

/** Same `upsertJobScheduler` convention as scheduleSubscriptionExpirySweep
 * — idempotent by its stable `jobSchedulerId`, safe to call on every
 * process restart. */
export async function scheduleOrphanMediaReport(queue: Queue, everyMs: number): Promise<void> {
  await queue.upsertJobScheduler(
    SWEEP_JOB_ID,
    { every: everyMs },
    { opts: { removeOnComplete: true, removeOnFail: 10 } },
  );
}
