/**
 * B20 DoD 10: "The retention schedule is defined and implemented, and never
 * deletes what invariant 14 protects." Runs against real Postgres as the
 * runtime role (RLS and the B20 least-privilege grants both in force).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { ACADEMIC_EVIDENCE_TABLES, prisma, withTenant } from '@atlas/db';
import { REDACTED_RAW_DATA, runRetentionSweep } from './retention.queue.js';
import { ownerPrisma } from '../test-support/owner-prisma.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ownerDatabaseUrl = process.env.DATABASE_URL;

async function protectedRowCounts(): Promise<Record<string, number>> {
  // Owner connection: a global count across every school (the owner is
  // the table owner and is not subject to FORCE RLS's tenant scoping here
  // because the superuser bypasses RLS) — the strongest "nothing was
  // touched anywhere" check, not just inside the fixture school.
  const counts: Record<string, number> = {};
  for (const table of [...ACADEMIC_EVIDENCE_TABLES, 'audit_events']) {
    const rows = await ownerPrisma().$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*)::bigint AS n FROM "${table}"`,
    );
    counts[table] = Number(rows[0]!.n);
  }
  return counts;
}

describe.skipIf(!ownerDatabaseUrl)('retention sweep (B20, ADR-0028 amended)', () => {
  const schoolIds: string[] = [];
  const userIds: string[] = [];

  afterAll(async () => {
    for (const schoolId of schoolIds) {
      await withTenant(prisma, schoolId, async (tx) => {
        await tx.importRow.deleteMany({ where: { schoolId } });
        await tx.importJob.deleteMany({ where: { schoolId } });
        await tx.notification.deleteMany({ where: { schoolId } });
        await tx.passwordResetToken.deleteMany({ where: { schoolId } });
        await tx.session.deleteMany({ where: { schoolId } });
      }).catch(() => undefined);
      await ownerPrisma()
        .school.delete({ where: { id: schoolId } })
        .catch(() => undefined);
    }
    await prisma.platformSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('purges only spent operational data past its period, redacts raw import rows, and leaves academic evidence untouched', async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 400 * DAY_MS);
    const recent = new Date(now.getTime() - 2 * DAY_MS);
    const future = new Date(now.getTime() + 2 * DAY_MS);

    const suffix = randomUUID().slice(0, 8);
    const school = await prisma.school.create({
      data: { name: `Retention ${suffix}`, subdomain: `retention-${suffix}` },
    });
    schoolIds.push(school.id);
    const user = await prisma.user.create({
      data: { firstName: 'Ret', lastName: 'Ention', displayName: 'Ret Ention' },
    });
    userIds.push(user.id);

    const ids = await withTenant(prisma, school.id, async (tx) => {
      const mk = (data: { revokedAt?: Date; expiresAt: Date }) =>
        tx.session.create({
          data: {
            schoolId: school.id,
            userId: user.id,
            tokenHash: randomUUID().replace(/-/g, '').padEnd(64, '0'),
            ...data,
          },
        });
      const oldRevoked = await mk({ revokedAt: old, expiresAt: future });
      const oldExpired = await mk({ expiresAt: old });
      const recentRevoked = await mk({ revokedAt: recent, expiresAt: future });
      const live = await mk({ expiresAt: future });

      const tok = (data: { usedAt?: Date; expiresAt: Date }) =>
        tx.passwordResetToken.create({
          data: {
            schoolId: school.id,
            userId: user.id,
            tokenHash: randomUUID().replace(/-/g, '').padEnd(64, '1'),
            ...data,
          },
        });
      const oldToken = await tok({ usedAt: old, expiresAt: old });
      const liveToken = await tok({ expiresAt: future });

      const note = (readAt?: Date) =>
        tx.notification.create({
          data: {
            schoolId: school.id,
            recipientUserId: user.id,
            type: 'QUESTION_APPROVED',
            title: 't',
            content: 'c',
            ...(readAt && { status: 'READ' as const, readAt }),
          },
        });
      const oldRead = await note(old);
      const unread = await note();

      const job = await tx.importJob.create({
        data: {
          schoolId: school.id,
          type: 'TEACHERS',
          status: 'COMPLETED',
          sourceMediaAssetId: randomUUID(),
          uploaderUserId: user.id,
          uploaderRole: 'SCHOOL_ADMIN',
          templateVersion: 1,
          expiresAt: old,
        },
      });
      const row = await tx.importRow.create({
        data: {
          schoolId: school.id,
          importJobId: job.id,
          rowNumber: 1,
          rawData: { firstName: 'Ada', lastName: 'Obi', admissionNumber: 'ADM-1' },
        },
      });
      return {
        oldRevoked,
        oldExpired,
        recentRevoked,
        live,
        oldToken,
        liveToken,
        oldRead,
        unread,
        job,
        row,
      };
    });
    // Age the import job past the 90-day window (updated_at is @updatedAt).
    await ownerPrisma()
      .$executeRaw`UPDATE import_jobs SET updated_at = ${old} WHERE id = ${ids.job.id}::uuid`;

    const platformOld = await prisma.platformSession.create({
      data: {
        userId: user.id,
        tokenHash: randomUUID().replace(/-/g, '').padEnd(64, '2'),
        expiresAt: old,
      },
    });

    const before = await protectedRowCounts();
    const result = await runRetentionSweep({ now: () => now });
    const after = await protectedRowCounts();

    expect(after).toEqual(before); // invariant 14 + 15: nothing protected moved, anywhere
    expect(result.schoolsFailed).toBe(0);

    const remaining = await withTenant(prisma, school.id, async (tx) => ({
      sessions: (await tx.session.findMany({ where: { schoolId: school.id } })).map((s) => s.id),
      tokens: (await tx.passwordResetToken.findMany({ where: { schoolId: school.id } })).map(
        (t) => t.id,
      ),
      notes: (await tx.notification.findMany({ where: { schoolId: school.id } })).map((n) => n.id),
      row: await tx.importRow.findUniqueOrThrow({ where: { id: ids.row.id } }),
    }));
    expect(remaining.sessions.sort()).toEqual([ids.recentRevoked.id, ids.live.id].sort());
    expect(remaining.tokens).toEqual([ids.liveToken.id]);
    expect(remaining.notes).toEqual([ids.unread.id]);
    expect(remaining.row.rawData).toEqual(REDACTED_RAW_DATA);
    expect(remaining.row.rowNumber).toBe(1); // the row (provenance) survives; only the cells go
    expect(await prisma.platformSession.findUnique({ where: { id: platformOld.id } })).toBeNull();

    // Idempotent: a second pass changes nothing further.
    const second = await runRetentionSweep({ now: () => now });
    expect(second.importRowsRedacted).toBe(0);
  });
});
