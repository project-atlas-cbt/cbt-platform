import { Worker, type ConnectionOptions, type Job, type Queue } from 'bullmq';
import { prisma, withTenant } from '@atlas/db';
import {
  resolveSchoolStatus,
  SUBSCRIPTION_EXPIRING_WINDOW_DAYS,
  SUBSCRIPTION_WARNING_THRESHOLD_DAYS,
  PLATFORM_METRICS_CACHE_KEY,
  type PlatformMetricsSnapshot,
} from '@atlas/domain';
import type { NotificationChannel } from '@atlas/notifications';
import { SUBSCRIPTION_WARNING_TEMPLATE_NAME } from './templates.js';

export const SUBSCRIPTION_EXPIRY_QUEUE_NAME = 'atlas-subscription-expiry-sweep';
// A stable jobId so re-scheduling on every process restart doesn't pile up
// duplicate repeatable jobs — BullMQ dedupes by (queue, jobId, repeat key).
const SWEEP_JOB_ID = 'sweep';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SubscriptionExpirySweepDeps {
  /** Already constructed with its own TemplateRegistry bound in — this
   * function only ever calls `.send()`, never renders a template directly. */
  notifications: NotificationChannel;
  redis: { set: (key: string, value: string) => Promise<unknown> };
  now?: () => Date;
}

/**
 * The actual sweep — a plain async function (not a class, no Nest DI: the
 * worker process has none) so it's directly unit/integration-testable
 * without standing up BullMQ at all. Combines two roadmap Background-jobs
 * bullets into one per-school pass rather than two separate full scans
 * ("Subscription expiry sweeper" and "Platform metric aggregation" both
 * need to iterate every school; doing so twice on every tick would be
 * wasteful) — found to be the natural design while implementing, not
 * pre-planned as two jobs.
 *
 * Iterates schools one at a time via `withTenant`, never a single global
 * query — `Subscription`/`RoleAssignment` are RLS-protected
 * (FORCE ROW LEVEL SECURITY), so `atlas_app` cannot see rows across
 * multiple schools in one unscoped query; this is a real constraint
 * discovered while implementing B3, not a stylistic choice. `School`
 * itself carries no RLS (it's the tenant root), so listing every school id
 * first is a single, ordinary query.
 */
export async function runSubscriptionExpirySweep(deps: SubscriptionExpirySweepDeps): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const schools = await prisma.school.findMany({ select: { id: true, platformOverride: true } });

  const metrics: PlatformMetricsSnapshot = {
    totalSchools: schools.length,
    activeSchools: 0,
    provisionalSchools: 0,
    suspendedSchools: 0,
    expiredSchools: 0,
    deactivatedSchools: 0,
    students: 0,
    teachers: 0,
    examsConducted: 0,
    attempts: 0,
    computedAt: now.toISOString(),
  };

  for (const school of schools) {
    const subscription = await withTenant(prisma, school.id, (tx) =>
      tx.subscription.findFirst({
        where: { schoolId: school.id, status: { in: ['PENDING', 'ACTIVE', 'EXPIRING'] } },
        orderBy: { createdAt: 'desc' },
      }),
    );

    let subscriptionStatus = subscription?.status ?? 'PENDING';

    // PENDING (never activated yet — no ActivationGrant redeemed) is
    // excluded from both time-based transitions and warning dispatch: it
    // hasn't started, so "expires soon" is meaningless and would otherwise
    // wrongly email a School Admin who is likely still INVITED with no
    // usable account yet.
    if (subscription && subscription.status !== 'PENDING') {
      const expiringAt = new Date(
        subscription.expiresAt.getTime() - SUBSCRIPTION_EXPIRING_WINDOW_DAYS * MS_PER_DAY,
      );

      if (subscription.status === 'ACTIVE' && now >= expiringAt) {
        subscriptionStatus = 'EXPIRING';
      }
      if (
        (subscription.status === 'ACTIVE' || subscription.status === 'EXPIRING') &&
        now >= subscription.expiresAt
      ) {
        subscriptionStatus = 'EXPIRED';
      }

      if (subscriptionStatus !== subscription.status) {
        await withTenant(prisma, school.id, (tx) =>
          tx.subscription.update({
            where: { id: subscription.id },
            data: { status: subscriptionStatus },
          }),
        );
      }

      await dispatchWarningIfDue(deps, school.id, subscription, now);
    }

    const derivedStatus = resolveSchoolStatus(subscriptionStatus, school.platformOverride);
    const currentSchool = await prisma.school.findUniqueOrThrow({
      where: { id: school.id },
      select: { status: true },
    });
    if (derivedStatus !== currentSchool.status) {
      await prisma.school.update({ where: { id: school.id }, data: { status: derivedStatus } });
    }

    switch (derivedStatus) {
      case 'ACTIVE':
        metrics.activeSchools += 1;
        break;
      case 'PROVISIONAL':
        metrics.provisionalSchools += 1;
        break;
      case 'SUSPENDED':
        metrics.suspendedSchools += 1;
        break;
      case 'EXPIRED':
        metrics.expiredSchools += 1;
        break;
      case 'DEACTIVATED':
        metrics.deactivatedSchools += 1;
        break;
    }

    const [students, teachers] = await Promise.all([
      withTenant(prisma, school.id, (tx) =>
        tx.roleAssignment.count({
          where: { schoolId: school.id, role: 'STUDENT', status: 'ACTIVE' },
        }),
      ),
      withTenant(prisma, school.id, (tx) =>
        tx.roleAssignment.count({
          where: { schoolId: school.id, role: 'TEACHER', status: 'ACTIVE' },
        }),
      ),
    ]);
    metrics.students += students;
    metrics.teachers += teachers;
  }

  await deps.redis.set(PLATFORM_METRICS_CACHE_KEY, JSON.stringify(metrics));
}

async function dispatchWarningIfDue(
  deps: SubscriptionExpirySweepDeps,
  schoolId: string,
  subscription: { id: string; expiresAt: Date; lastWarningThresholdDays: number | null },
  now: Date,
): Promise<void> {
  const daysRemaining = Math.ceil((subscription.expiresAt.getTime() - now.getTime()) / MS_PER_DAY);
  if (daysRemaining < 0) return;

  // Smallest (tightest/most urgent) threshold at or above daysRemaining,
  // e.g. [30,14,7,1] with 6 days remaining -> 7, not 30: 30 and 14 have
  // already been crossed on an earlier tick (or this is the first tick
  // ever, in which case only the tightest one reached matters — there is
  // no separate notion of "catching up" on the ones skipped in between).
  // Skips entirely if no threshold has been reached yet.
  const threshold = [...SUBSCRIPTION_WARNING_THRESHOLD_DAYS]
    .sort((a, b) => a - b)
    .find((t) => daysRemaining <= t);
  if (threshold === undefined) return;
  if (
    subscription.lastWarningThresholdDays !== null &&
    subscription.lastWarningThresholdDays <= threshold
  ) {
    return;
  }

  const admin = await withTenant(prisma, schoolId, (tx) =>
    tx.roleAssignment.findFirst({
      where: { schoolId, role: 'SCHOOL_ADMIN', status: 'ACTIVE' },
      include: { membership: { include: { user: true } } },
    }),
  );
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });

  if (admin?.membership.user.email) {
    await deps.notifications.send({
      to: admin.membership.user.email,
      template: SUBSCRIPTION_WARNING_TEMPLATE_NAME,
      variables: {
        displayName: admin.membership.user.displayName,
        schoolName: school.name,
        expiresAt: subscription.expiresAt.toISOString(),
        daysRemaining,
      },
    });
  }

  await withTenant(prisma, schoolId, (tx) =>
    tx.subscription.update({
      where: { id: subscription.id },
      data: { lastWarningThresholdDays: threshold },
    }),
  );
}

export function createSubscriptionExpiryWorker(
  connection: ConnectionOptions,
  deps: SubscriptionExpirySweepDeps,
): Worker {
  return new Worker(
    SUBSCRIPTION_EXPIRY_QUEUE_NAME,
    async (_job: Job) => {
      await runSubscriptionExpirySweep(deps);
    },
    { connection },
  );
}

/** Schedules the repeatable sweep via BullMQ 6's job-scheduler API —
 * `Queue.add`'s own `repeat` option was removed in this major version
 * (found while implementing: the plan's original sketch assumed the older
 * `queue.add(..., {repeat})` shape). `upsertJobScheduler` is inherently
 * idempotent by its stable `jobSchedulerId` — calling this again on every
 * process restart updates the existing schedule rather than creating a
 * second one. */
export async function scheduleSubscriptionExpirySweep(
  queue: Queue,
  everyMs: number,
): Promise<void> {
  await queue.upsertJobScheduler(
    SWEEP_JOB_ID,
    { every: everyMs },
    { opts: { removeOnComplete: true, removeOnFail: 10 } },
  );
}
