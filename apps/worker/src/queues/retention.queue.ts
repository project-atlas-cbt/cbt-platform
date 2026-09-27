import { Worker, type ConnectionOptions, type Job, type Queue } from 'bullmq';
import { prisma, withTenant } from '@atlas/db';
import { structuredLog } from '@atlas/observability';
import { retentionCutoff, type RetentionPolicy } from './retention-policy.js';

export const RETENTION_QUEUE_NAME = 'atlas-retention';
const SWEEP_JOB_ID = 'sweep';

export interface RetentionSweepDeps {
  policy: RetentionPolicy;
  now?: () => Date;
}

export interface RetentionSweepResult {
  sessionsDeleted: number;
  platformSessionsDeleted: number;
  passwordResetTokensDeleted: number;
}

/**
 * Executes ADR-0028's deliberately narrow first retention schedule.
 *
 * Only expired authentication artefacts are deleted. Academic evidence,
 * audit events, notifications, exports, imports, media and school history
 * are intentionally absent from this function. Session-rotation links are
 * detached before deletion because their forensic value ends with the
 * retention window and the FK must never turn cleanup into a partial run.
 */
export async function runRetentionSweep(deps: RetentionSweepDeps): Promise<RetentionSweepResult> {
  const now = deps.now?.() ?? new Date();
  const sessionCutoff = retentionCutoff(now, deps.policy.expiredSessionRetentionDays);
  const resetCutoff = retentionCutoff(now, deps.policy.expiredPasswordResetRetentionDays);
  const result: RetentionSweepResult = {
    sessionsDeleted: 0,
    platformSessionsDeleted: 0,
    passwordResetTokensDeleted: 0,
  };

  const schools = await prisma.school.findMany({ select: { id: true } });
  for (const school of schools) {
    const schoolResult = await withTenant(prisma, school.id, async (tx) => {
      await tx.$executeRaw`
        UPDATE sessions current_session
        SET rotated_from_id = NULL
        FROM sessions previous_session
        WHERE current_session.rotated_from_id = previous_session.id
          AND current_session.school_id = ${school.id}::uuid
          AND previous_session.school_id = ${school.id}::uuid
          AND previous_session.expires_at < ${sessionCutoff}
      `;
      const sessions = await tx.session.deleteMany({
        where: {
          schoolId: school.id,
          expiresAt: { lt: sessionCutoff },
        },
      });
      const resetTokens = await tx.passwordResetToken.deleteMany({
        where: {
          schoolId: school.id,
          expiresAt: { lt: resetCutoff },
        },
      });
      return { sessions: sessions.count, resetTokens: resetTokens.count };
    });
    result.sessionsDeleted += schoolResult.sessions;
    result.passwordResetTokensDeleted += schoolResult.resetTokens;
  }

  await prisma.$executeRaw`
    UPDATE platform_sessions current_session
    SET rotated_from_id = NULL
    FROM platform_sessions previous_session
    WHERE current_session.rotated_from_id = previous_session.id
      AND previous_session.expires_at < ${sessionCutoff}
  `;
  const platformSessions = await prisma.platformSession.deleteMany({
    where: { expiresAt: { lt: sessionCutoff } },
  });
  result.platformSessionsDeleted = platformSessions.count;

  structuredLog('info', 'retention.sweep.completed', {
    sessionsDeleted: result.sessionsDeleted,
    platformSessionsDeleted: result.platformSessionsDeleted,
    passwordResetTokensDeleted: result.passwordResetTokensDeleted,
  });
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
    { connection },
  );
}

export async function scheduleRetentionSweep(queue: Queue, everyMs: number): Promise<void> {
  await queue.upsertJobScheduler(
    SWEEP_JOB_ID,
    { every: everyMs },
    { opts: { removeOnComplete: true, removeOnFail: 10 } },
  );
}
