import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@atlas/db';
import { runRetentionSweep } from './retention.queue.js';

const ownerDatabaseUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
const DAY_MS = 24 * 60 * 60 * 1000;

describe.skipIf(!ownerDatabaseUrl)('B20 safe retention sweep', () => {
  const schoolIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    for (const schoolId of schoolIds) {
      await withTenant(prisma, schoolId, async (tx) => {
        await tx.passwordResetToken.deleteMany({ where: { schoolId } });
        await tx.session.deleteMany({ where: { schoolId } });
        await tx.academicSession.deleteMany({ where: { schoolId } });
      }).catch(() => undefined);
      await prisma.school.delete({ where: { id: schoolId } }).catch(() => undefined);
    }
    await prisma.platformSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('deletes expired auth artefacts while preserving fresh sessions and academic records', async () => {
    const suffix = randomUUID();
    const now = new Date('2026-09-27T12:00:00.000Z');
    const school = await prisma.school.create({
      data: { name: `Retention School ${suffix}`, subdomain: `ret-${suffix}` },
    });
    schoolIds.push(school.id);
    const user = await prisma.user.create({
      data: { firstName: 'Retention', lastName: 'Fixture', displayName: 'Retention Fixture' },
    });
    userIds.push(user.id);

    const seeded = await withTenant(prisma, school.id, async (tx) => {
      const academicSession = await tx.academicSession.create({
        data: {
          schoolId: school.id,
          name: 'Protected historical session',
          startDate: new Date('2025-09-01T00:00:00.000Z'),
          endDate: new Date('2026-07-31T00:00:00.000Z'),
          status: 'ARCHIVED',
        },
      });
      const expiredSession = await tx.session.create({
        data: {
          schoolId: school.id,
          userId: user.id,
          tokenHash: 'a'.repeat(64),
          expiresAt: new Date(now.getTime() - 60 * DAY_MS),
        },
      });
      const freshSession = await tx.session.create({
        data: {
          schoolId: school.id,
          userId: user.id,
          tokenHash: 'b'.repeat(64),
          expiresAt: new Date(now.getTime() + DAY_MS),
        },
      });
      const expiredReset = await tx.passwordResetToken.create({
        data: {
          schoolId: school.id,
          userId: user.id,
          tokenHash: 'c'.repeat(64),
          expiresAt: new Date(now.getTime() - 60 * DAY_MS),
        },
      });
      return { academicSession, expiredSession, freshSession, expiredReset };
    });

    const expiredPlatformSession = await prisma.platformSession.create({
      data: {
        userId: user.id,
        tokenHash: 'd'.repeat(64),
        expiresAt: new Date(now.getTime() - 60 * DAY_MS),
      },
    });

    const result = await runRetentionSweep({
      now: () => now,
      policy: {
        expiredSessionRetentionDays: 30,
        expiredPasswordResetRetentionDays: 30,
      },
    });

    expect(result.sessionsDeleted).toBeGreaterThanOrEqual(1);
    expect(result.platformSessionsDeleted).toBeGreaterThanOrEqual(1);
    expect(result.passwordResetTokensDeleted).toBeGreaterThanOrEqual(1);
    expect(
      await withTenant(prisma, school.id, (tx) =>
        tx.session.findUnique({ where: { id: seeded.expiredSession.id } }),
      ),
    ).toBeNull();
    expect(
      await withTenant(prisma, school.id, (tx) =>
        tx.session.findUnique({ where: { id: seeded.freshSession.id } }),
      ),
    ).not.toBeNull();
    expect(
      await withTenant(prisma, school.id, (tx) =>
        tx.passwordResetToken.findUnique({ where: { id: seeded.expiredReset.id } }),
      ),
    ).toBeNull();
    expect(
      await prisma.platformSession.findUnique({ where: { id: expiredPlatformSession.id } }),
    ).toBeNull();
    expect(
      await withTenant(prisma, school.id, (tx) =>
        tx.academicSession.findUnique({ where: { id: seeded.academicSession.id } }),
      ),
    ).not.toBeNull();
  });
});
