import { Worker, type ConnectionOptions, type Job, type Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { prisma, withTenant } from '@atlas/db';

/** B17's scheduled cache-maintenance pass. Analytics responses remain
 * read-through and fully derivable; this job merely records that every
 * RLS-scoped tenant was visited so deployment monitoring can distinguish a
 * cold cache from a stalled refresh worker. */
export const ANALYTICS_REFRESH_QUEUE_NAME = 'atlas-analytics-refresh';
const SWEEP_JOB_ID = 'sweep';

export interface AnalyticsRefreshDeps {
  redis: Pick<Redis, 'set' | 'incr' | 'del'>;
  now?: () => Date;
}

export async function runAnalyticsRefresh(deps: AnalyticsRefreshDeps): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const schools = await prisma.school.findMany({ select: { id: true } });
  for (const school of schools) {
    try {
      // Read-through snapshots cannot be safely pre-warmed for every caller's
      // scope/filter combination. Bump this tenant namespace instead: the
      // next authorized request deterministically rebuilds from source.
      await withTenant(prisma, school.id, (tx) =>
        tx.result.count({ where: { schoolId: school.id } }),
      );
      await deps.redis.incr(`atlas:analytics:school:${school.id}:version`);
      await deps.redis.set(
        `atlas:analytics:school:${school.id}:refreshed-at`,
        now.toISOString(),
        'EX',
        900,
      );
    } catch (error) {
      console.error(`[analytics-refresh] failed for school ${school.id}:`, error);
    }
  }
  try {
    await deps.redis.del('atlas:analytics:platform:overview');
    await deps.redis.set('atlas:analytics:platform:refreshed-at', now.toISOString(), 'EX', 900);
  } catch (error) {
    // Redis is not authoritative; an unavailable cache cannot make the
    // RLS-safe sweep fail or prevent the next request from deriving source.
    console.error('[analytics-refresh] platform cache maintenance failed:', error);
  }
}

export function createAnalyticsRefreshWorker(
  connection: ConnectionOptions,
  deps: AnalyticsRefreshDeps,
): Worker {
  return new Worker(ANALYTICS_REFRESH_QUEUE_NAME, async (_job: Job) => runAnalyticsRefresh(deps), {
    connection,
  });
}

export async function scheduleAnalyticsRefresh(queue: Queue, everyMs: number): Promise<void> {
  await queue.upsertJobScheduler(
    SWEEP_JOB_ID,
    { every: everyMs },
    { opts: { removeOnComplete: true, removeOnFail: 10 } },
  );
}
