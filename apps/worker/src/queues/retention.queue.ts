import { Worker, type ConnectionOptions, type Job, type Queue } from 'bullmq';
import { prisma, withTenant, RETENTION_PROTECTED_TABLES } from '@atlas/db';
import { RETENTION_SCHEDULE, retentionRule } from '@atlas/domain';
import type { Logger } from '@atlas/observability';

export const RETENTION_QUEUE_NAME = 'atlas-retention-sweep';
const SWEEP_JOB_ID = 'retention-sweep';
const DAY_MS = 24 * 60 * 60 * 1000;

/** The marker written over `import_rows.raw_data` — keeps the column's
 * NOT NULL contract while removing every uploaded cell value. */
export const REDACTED_RAW_DATA = { redacted: true, by: 'retention-sweep' } as const;

// Fail at module load, not at 3 a.m.: no schedule row may ever target a
// table the database role is forbidden to delete from (privileges.ts).
for (const rule of RETENTION_SCHEDULE) {
  if (rule.action === 'RETAIN_INDEFINITELY') continue;
  if (RETENTION_PROTECTED_TABLES.has(rule.table)) {
    throw new Error(`Retention rule "${rule.id}" targets protected table "${rule.table}".`);
  }
}

export interface RetentionSweepDeps {
  logger?: Logger;
  now?: () => Date;
}

export interface RetentionSweepResult {
  sessionsPurged: number;
  platformSessionsPurged: number;
  passwordResetTokensPurged: number;
  importRowsRedacted: number;
  notificationsPurged: number;
  marketingPageViewsPurged: number;
  marketingLeadsPurged: number;
  schoolsFailed: number;
}

const cutoff = (now: Date, ruleId: string) =>
  new Date(now.getTime() - (retentionRule(ruleId).afterDays ?? 0) * DAY_MS);

/**
 * B20 retention execution (ADR-0028 amended; DoD 10). Executes exactly the
 * PURGE/REDACT_FIELD rows of `RETENTION_SCHEDULE` — operational data only.
 * Academic evidence and audit are untouchable twice over: no rule names
 * them (checked at load, above), and `atlas_app` holds no DELETE on them.
 * Per-school work runs under that school's tenant (RLS), one school's
 * failure never stops the others — the sweep shape every B3+ sweep uses.
 */
export async function runRetentionSweep(
  deps: RetentionSweepDeps = {},
): Promise<RetentionSweepResult> {
  const now = deps.now?.() ?? new Date();
  const result: RetentionSweepResult = {
    sessionsPurged: 0,
    platformSessionsPurged: 0,
    passwordResetTokensPurged: 0,
    importRowsRedacted: 0,
    notificationsPurged: 0,
    marketingPageViewsPurged: 0,
    marketingLeadsPurged: 0,
    schoolsFailed: 0,
  };

  // Platform sessions carry no school — no tenant scope applies.
  const platformCutoff = cutoff(now, 'platform-sessions');
  result.platformSessionsPurged = (
    await prisma.platformSession.deleteMany({
      where: {
        OR: [
          { revokedAt: { lt: platformCutoff } },
          { revokedAt: null, expiresAt: { lt: platformCutoff } },
        ],
      },
    })
  ).count;

  // Platform-scoped (no school): marketing site visits and contacts.
  result.marketingPageViewsPurged = (
    await prisma.marketingPageView.deleteMany({
      where: { occurredAt: { lt: cutoff(now, 'marketing-page-views') } },
    })
  ).count;
  result.marketingLeadsPurged = (
    await prisma.marketingLead.deleteMany({
      where: { createdAt: { lt: cutoff(now, 'marketing-leads') } },
    })
  ).count;

  const schools = await prisma.school.findMany({ select: { id: true } });
  for (const school of schools) {
    try {
      await withTenant(prisma, school.id, async (tx) => {
        const sessionCutoff = cutoff(now, 'school-sessions');
        result.sessionsPurged += (
          await tx.session.deleteMany({
            where: {
              schoolId: school.id,
              OR: [
                { revokedAt: { lt: sessionCutoff } },
                { revokedAt: null, expiresAt: { lt: sessionCutoff } },
              ],
            },
          })
        ).count;

        const tokenCutoff = cutoff(now, 'password-reset-tokens');
        result.passwordResetTokensPurged += (
          await tx.passwordResetToken.deleteMany({
            where: {
              schoolId: school.id,
              OR: [
                { usedAt: { lt: tokenCutoff } },
                { usedAt: null, expiresAt: { lt: tokenCutoff } },
              ],
            },
          })
        ).count;

        const importCutoff = cutoff(now, 'import-raw-rows');
        result.importRowsRedacted += (
          await tx.importRow.updateMany({
            where: {
              schoolId: school.id,
              job: {
                status: { in: ['COMPLETED', 'FAILED', 'EXPIRED'] },
                updatedAt: { lt: importCutoff },
              },
              NOT: { rawData: { equals: REDACTED_RAW_DATA } },
            },
            data: { rawData: REDACTED_RAW_DATA },
          })
        ).count;

        const notificationCutoff = cutoff(now, 'read-notifications');
        result.notificationsPurged += (
          await tx.notification.deleteMany({
            where: { schoolId: school.id, readAt: { lt: notificationCutoff } },
          })
        ).count;
      });
    } catch (err) {
      result.schoolsFailed += 1;
      deps.logger?.error({ err, schoolId: school.id }, 'Retention sweep failed for school');
    }
  }

  deps.logger?.info({ ...result }, 'Retention sweep complete');
  return result;
}

export function createRetentionWorker(
  connection: ConnectionOptions,
  deps: RetentionSweepDeps,
): Worker {
  return new Worker(
    RETENTION_QUEUE_NAME,
    async (_job: Job) => {
      await runRetentionSweep(deps);
    },
    {
      connection,
      // Walks every school; same renewable-lock settings as the other
      // whole-platform sweeps (CLAUDE.md engineering facts).
      concurrency: 1,
      lockDuration: 120_000,
      lockRenewTime: 30_000,
      stalledInterval: 30_000,
      maxStalledCount: 1,
    },
  );
}

export async function scheduleRetentionSweep(queue: Queue, everyMs: number): Promise<void> {
  await queue.upsertJobScheduler(
    SWEEP_JOB_ID,
    { every: everyMs },
    { opts: { removeOnComplete: true, removeOnFail: 10 } },
  );
}
