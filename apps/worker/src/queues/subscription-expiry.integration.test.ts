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
import { afterAll, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@atlas/db';
import { runSubscriptionExpirySweep } from './subscription-expiry.queue.js';
import { PLATFORM_METRICS_CACHE_KEY, type PlatformMetricsSnapshot } from '@atlas/domain';

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
  await prisma.school.delete({ where: { id: schoolId } });
  if (membership) await prisma.user.delete({ where: { id: membership.userId } });
}

class FakeNotificationChannel {
  sent: Array<{ to: string; template: string; variables?: Record<string, unknown> }> = [];
  send(message: {
    to: string;
    template: string;
    variables?: Record<string, unknown>;
  }): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
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

    const notifications = new FakeNotificationChannel();
    const redis = new FakeRedis();
    await runSubscriptionExpirySweep({ notifications, redis });

    const subscription = await withTenant(prisma, school.schoolId, (tx) =>
      tx.subscription.findUniqueOrThrow({ where: { id: school.subscriptionId } }),
    );
    expect(subscription.status).toBe('PENDING');
    expect(subscription.lastWarningThresholdDays).toBeNull();
    expect(notifications.sent).toHaveLength(0);

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
      notifications: new FakeNotificationChannel(),
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
      notifications: new FakeNotificationChannel(),
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
      notifications: new FakeNotificationChannel(),
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

    const notifications = new FakeNotificationChannel();
    await runSubscriptionExpirySweep({ notifications, redis: new FakeRedis() });

    expect(notifications.sent).toHaveLength(1);
    expect(notifications.sent[0]?.to).toBe(school.adminEmail);
    expect(notifications.sent[0]?.template).toBe('platform-subscription-warning');

    const afterFirst = await withTenant(prisma, school.schoolId, (tx) =>
      tx.subscription.findUniqueOrThrow({ where: { id: school.subscriptionId } }),
    );
    expect(afterFirst.lastWarningThresholdDays).toBe(7);

    // A second sweep tick with no time having passed must not re-send.
    await runSubscriptionExpirySweep({ notifications, redis: new FakeRedis() });
    expect(notifications.sent).toHaveLength(1);
  });

  it('writes a platform metrics snapshot to the provided redis client', async () => {
    const redis = new FakeRedis();
    await runSubscriptionExpirySweep({ notifications: new FakeNotificationChannel(), redis });

    const raw = redis.store.get(PLATFORM_METRICS_CACHE_KEY);
    expect(raw).toBeDefined();
    const snapshot = JSON.parse(raw!) as PlatformMetricsSnapshot;
    expect(snapshot.totalSchools).toBeGreaterThanOrEqual(schools.length);
    expect(snapshot.examsConducted).toBe(0);
    expect(snapshot.attempts).toBe(0);
    expect(typeof snapshot.computedAt).toBe('string');
  });
});
