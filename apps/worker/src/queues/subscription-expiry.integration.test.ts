/**
 * B3 Testing requirements: "Failure | Expiry occurring while an attempt is
 * IN_PROGRESS follows the ADR-0015 profile exactly" (covered at the access-
 * gate-unit level in packages/domain) plus the roadmap's Background-jobs
 * scope: the sweeper itself transitions ACTIVE→EXPIRING→EXPIRED correctly,
 * dispatches warnings once per threshold, and never touches a PENDING
 * (not-yet-activated) subscription. Runs against real Postgres (RLS
 * included, via the shared `prisma` singleton — same convention as
 * apps/api's own *.integration.test.ts files, see identity.integration
 * .test.ts's own comment on why DATABASE_APP_URL is used directly rather
 * than a separate test connection).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { prisma, withTenant } from '@atlas/db';
import { runSubscriptionExpirySweep } from './subscription-expiry.queue.js';
import { PLATFORM_METRICS_CACHE_KEY, type PlatformMetricsSnapshot } from '@atlas/domain';
import { ownerPrisma } from '../test-support/owner-prisma.js';

const ownerDatabaseUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
const DAY_MS = 24 * 60 * 60 * 1000;

interface FixtureSchool {
  schoolId: string;
  adminEmail: string;
  subscriptionId: string;
}

async function createFixtureSchool(params: {
  status: 'PENDING' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED';
  expiresAt: Date;
  lastWarningThresholdDays?: number | null;
}): Promise<FixtureSchool> {
  const suffix = randomUUID();
  const school = await prisma.school.create({
    data: { name: `Sweep Test School ${suffix}`, subdomain: `sweep-${suffix}` },
  });

  return withTenant(prisma, school.id, async (tx) => {
    const adminEmail = `admin-${suffix}@example.com`;
    const admin = await tx.user.create({
      data: {
        firstName: 'Sweep',
        lastName: 'Admin',
        displayName: 'Sweep Admin',
        email: adminEmail,
        status: 'ACTIVE',
        credentialState: 'OK',
      },
    });
    const membership = await tx.schoolMembership.create({
      data: {
        schoolId: school.id,
        userId: admin.id,
        loginIdentifier: `sweep-admin-${suffix}`,
        status: 'ACTIVE',
      },
    });
    await tx.roleAssignment.create({
      data: { schoolId: school.id, membershipId: membership.id, role: 'SCHOOL_ADMIN' },
    });

    const subscription = await tx.subscription.create({
      data: {
        schoolId: school.id,
        plan: 'STANDARD',
        startAt: new Date(params.expiresAt.getTime() - 365 * DAY_MS),
        expiresAt: params.expiresAt,
        status: params.status,
        ...(params.lastWarningThresholdDays !== undefined
          ? { lastWarningThresholdDays: params.lastWarningThresholdDays }
          : {}),
      },
    });

    return { schoolId: school.id, adminEmail, subscriptionId: subscription.id };
  });
}

async function cleanupSchool(schoolId: string): Promise<void> {
  const membership = await withTenant(prisma, schoolId, (tx) =>
    tx.schoolMembership.findFirst({ where: { schoolId } }),
  );
  await withTenant(prisma, schoolId, async (tx) => {
    await tx.roleAssignment.deleteMany({ where: { schoolId } });
    await tx.subscription.deleteMany({ where: { schoolId } });
  });
  await ownerPrisma().school.delete({ where: { id: schoolId } });
  if (membership) await prisma.user.delete({ where: { id: membership.userId } });
}

/** B10: `SubscriptionExpirySweepDeps` now enqueues onto the shared
 * notification-dispatch retry queue instead of calling a `NotificationChannel`
 * directly — this fake records every `enqueueDispatch(...)` call the same
 * way the old `FakeNotificationChannel` recorded `.send(...)` calls. */
class FakeDispatchQueue {
  enqueued: Array<{
    payload: { to: string; template: string; variables?: Record<string, unknown> };
    jobId: string | undefined;
  }> = [];
  enqueueDispatch = (
    payload: { to: string; template: string; variables?: Record<string, unknown> },
    jobId?: string,
  ): Promise<void> => {
    this.enqueued.push({ payload, jobId });
    return Promise.resolve();
  };
}

class FakeRedis {
  store = new Map<string, string>();
  set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return Promise.resolve('OK');
  }
}

describe.skipIf(!ownerDatabaseUrl)('subscription-expiry sweep (B3)', () => {
  const schools: FixtureSchool[] = [];

  afterAll(async () => {
    for (const school of schools) {
      await cleanupSchool(school.schoolId).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('PENDING subscriptions are never transitioned or warned about', async () => {
    const school = await createFixtureSchool({
      status: 'PENDING',
      expiresAt: new Date(Date.now() + DAY_MS),
    });
    schools.push(school);

    const dispatch = new FakeDispatchQueue();
    const redis = new FakeRedis();
    await runSubscriptionExpirySweep({ enqueueDispatch: dispatch.enqueueDispatch, redis });

    const subscription = await withTenant(prisma, school.schoolId, (tx) =>
      tx.subscription.findUniqueOrThrow({ where: { id: school.subscriptionId } }),
    );
    expect(subscription.status).toBe('PENDING');
    expect(subscription.lastWarningThresholdDays).toBeNull();
    expect(dispatch.enqueued).toHaveLength(0);

    const schoolRow = await prisma.school.findUniqueOrThrow({ where: { id: school.schoolId } });
    expect(schoolRow.status).toBe('PROVISIONAL');
  });

  it('ACTIVE far from expiry stays ACTIVE, School.status stays ACTIVE', async () => {
    const school = await createFixtureSchool({
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 300 * DAY_MS),
    });
    schools.push(school);

    await runSubscriptionExpirySweep({
      enqueueDispatch: new FakeDispatchQueue().enqueueDispatch,
      redis: new FakeRedis(),
    });

    const subscription = await withTenant(prisma, school.schoolId, (tx) =>
      tx.subscription.findUniqueOrThrow({ where: { id: school.subscriptionId } }),
    );
    expect(subscription.status).toBe('ACTIVE');
    const schoolRow = await prisma.school.findUniqueOrThrow({ where: { id: school.schoolId } });
    expect(schoolRow.status).toBe('ACTIVE');
  });

  it('ACTIVE within the pre-expiry window transitions to EXPIRING; School.status stays ACTIVE (full access)', async () => {
    const school = await createFixtureSchool({
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 5 * DAY_MS),
    });
    schools.push(school);

    await runSubscriptionExpirySweep({
      enqueueDispatch: new FakeDispatchQueue().enqueueDispatch,
      redis: new FakeRedis(),
    });

    const subscription = await withTenant(prisma, school.schoolId, (tx) =>
      tx.subscription.findUniqueOrThrow({ where: { id: school.subscriptionId } }),
    );
    expect(subscription.status).toBe('EXPIRING');
    const schoolRow = await prisma.school.findUniqueOrThrow({ where: { id: school.schoolId } });
    expect(schoolRow.status).toBe('ACTIVE');
  });

  it('past expiresAt transitions straight to EXPIRED (even from ACTIVE, skipping a separate EXPIRING tick); School.status becomes EXPIRED', async () => {
    const school = await createFixtureSchool({
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() - DAY_MS),
    });
    schools.push(school);

    await runSubscriptionExpirySweep({
      enqueueDispatch: new FakeDispatchQueue().enqueueDispatch,
      redis: new FakeRedis(),
    });

    const subscription = await withTenant(prisma, school.schoolId, (tx) =>
      tx.subscription.findUniqueOrThrow({ where: { id: school.subscriptionId } }),
    );
    expect(subscription.status).toBe('EXPIRED');
    const schoolRow = await prisma.school.findUniqueOrThrow({ where: { id: school.schoolId } });
    expect(schoolRow.status).toBe('EXPIRED');
  });

  it('dispatches a warning once per threshold crossed, and never re-sends the same threshold', async () => {
    const school = await createFixtureSchool({
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 6 * DAY_MS),
    });
    schools.push(school);

    const dispatch = new FakeDispatchQueue();
    await runSubscriptionExpirySweep({
      enqueueDispatch: dispatch.enqueueDispatch,
      redis: new FakeRedis(),
    });

    expect(dispatch.enqueued).toHaveLength(1);
    expect(dispatch.enqueued[0]?.payload.to).toBe(school.adminEmail);
    expect(dispatch.enqueued[0]?.payload.template).toBe('platform-subscription-warning');
    // Real BullMQ retry dedup key, per SubscriptionExpirySweepDeps's own
    // doc comment — jobId, not a second in-app guard.
    expect(dispatch.enqueued[0]?.jobId).toBe(`subscription-warning-${school.subscriptionId}-7`);

    // B10: a real in-app Notification row for the School Admin, alongside
    // the enqueued out-of-band email.
    const notifications = await withTenant(prisma, school.schoolId, (tx) =>
      tx.notification.findMany({
        where: { schoolId: school.schoolId, type: 'SUBSCRIPTION_EXPIRING' },
      }),
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.status).toBe('UNREAD');

    const afterFirst = await withTenant(prisma, school.schoolId, (tx) =>
      tx.subscription.findUniqueOrThrow({ where: { id: school.subscriptionId } }),
    );
    expect(afterFirst.lastWarningThresholdDays).toBe(7);

    // A second sweep tick with no time having passed must not re-send.
    await runSubscriptionExpirySweep({
      enqueueDispatch: dispatch.enqueueDispatch,
      redis: new FakeRedis(),
    });
    expect(dispatch.enqueued).toHaveLength(1);
  });

  it('writes a platform metrics snapshot to the provided redis client', async () => {
    const redis = new FakeRedis();
    await runSubscriptionExpirySweep({
      enqueueDispatch: new FakeDispatchQueue().enqueueDispatch,
      redis,
    });

    const raw = redis.store.get(PLATFORM_METRICS_CACHE_KEY);
    expect(raw).toBeDefined();
    const snapshot = JSON.parse(raw!) as PlatformMetricsSnapshot;
    expect(snapshot.totalSchools).toBeGreaterThanOrEqual(schools.length);
    expect(snapshot.examsConducted).toBe(0);
    expect(snapshot.attempts).toBe(0);
    expect(typeof snapshot.computedAt).toBe('string');
  });

  it('B10 fix: a failed enqueue does not mark the threshold as handled — the next tick retries it', async () => {
    const school = await createFixtureSchool({
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 6 * DAY_MS),
    });
    schools.push(school);

    const failing = new FakeDispatchQueue();
    failing.enqueueDispatch = () => Promise.reject(new Error('simulated Redis outage'));
    await runSubscriptionExpirySweep({
      enqueueDispatch: failing.enqueueDispatch,
      redis: new FakeRedis(),
    });

    const afterFailedTick = await withTenant(prisma, school.schoolId, (tx) =>
      tx.subscription.findUniqueOrThrow({ where: { id: school.subscriptionId } }),
    );
    // The old bug: this would already be 7 here, even though the send/
    // enqueue never actually succeeded — silently losing the warning
    // forever. The in-app Notification, by contrast, is written
    // unconditionally regardless of enqueue outcome.
    expect(afterFailedTick.lastWarningThresholdDays).toBeNull();
    const notifications = await withTenant(prisma, school.schoolId, (tx) =>
      tx.notification.findMany({
        where: { schoolId: school.schoolId, type: 'SUBSCRIPTION_EXPIRING' },
      }),
    );
    expect(notifications).toHaveLength(1);

    // A later tick, once the queue is healthy again, successfully retries.
    const healthy = new FakeDispatchQueue();
    await runSubscriptionExpirySweep({
      enqueueDispatch: healthy.enqueueDispatch,
      redis: new FakeRedis(),
    });
    expect(healthy.enqueued).toHaveLength(1);
    const afterRetry = await withTenant(prisma, school.schoolId, (tx) =>
      tx.subscription.findUniqueOrThrow({ where: { id: school.subscriptionId } }),
    );
    expect(afterRetry.lastWarningThresholdDays).toBe(7);
  });

  it('B10 fix: one school throwing does not abort the sweep for the others', async () => {
    const failingSchool = await createFixtureSchool({
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 300 * DAY_MS),
    });
    schools.push(failingSchool);
    const healthySchool = await createFixtureSchool({
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() - DAY_MS),
    });
    schools.push(healthySchool);

    // Deterministically force one specific school's iteration to throw
    // partway through, without corrupting real fixture data — a spy on the
    // real `prisma.school.findUniqueOrThrow` (the same call every school's
    // iteration makes to re-read its derived status) that only misbehaves
    // for `failingSchool`.
    const originalFindUniqueOrThrow = prisma.school.findUniqueOrThrow.bind(prisma.school);
    const spy = vi
      .spyOn(prisma.school, 'findUniqueOrThrow')
      .mockImplementation((args: Parameters<typeof prisma.school.findUniqueOrThrow>[0]) => {
        const id = (args as { where?: { id?: string } })?.where?.id;
        if (id === failingSchool.schoolId) {
          throw new Error('simulated failure for this one school');
        }
        return originalFindUniqueOrThrow(args);
      });

    try {
      await runSubscriptionExpirySweep({
        enqueueDispatch: new FakeDispatchQueue().enqueueDispatch,
        redis: new FakeRedis(),
      });
    } finally {
      spy.mockRestore();
    }

    // The healthy school's own transition still ran, proving the loop
    // didn't abort when the other school's iteration threw.
    const healthySubscription = await withTenant(prisma, healthySchool.schoolId, (tx) =>
      tx.subscription.findUniqueOrThrow({ where: { id: healthySchool.subscriptionId } }),
    );
    expect(healthySubscription.status).toBe('EXPIRED');
  });
});
