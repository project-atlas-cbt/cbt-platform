import { Worker, type ConnectionOptions, type Job, type Queue } from 'bullmq';
import { prisma, withTenant } from '@atlas/db';
import {
  attemptGraceWindowSeconds,
  RESULT_ADJUSTMENT_CLAIM_TTL_MS,
  type AttemptMarkingJobPayload,
  type ResultAdjustmentJobPayload,
} from '@atlas/domain';
import { recordDependencyFallback, recordWorkReconciled } from '@atlas/observability';
import { ensureProcessingResult } from './result-finalization.js';
import type { JobReconcileOutcome } from '../job-reconcile.js';

export const ATTEMPT_AUTO_SUBMIT_QUEUE_NAME = 'atlas-attempt-auto-submit-sweep';
// A stable jobId so re-scheduling on every process restart doesn't pile up
// duplicate repeatable jobs — same idiom as every other sweep in this file.
/** Exported for the worker's schedule guard (B22, main.ts). */
export const AUTO_SUBMIT_SWEEP_JOB_ID = 'sweep';
const SWEEP_JOB_ID = AUTO_SUBMIT_SWEEP_JOB_ID;

export interface AttemptAutoSubmitSweepDeps {
  /** Enqueues onto the shared `ATTEMPT_MARKING_QUEUE_NAME` queue — the
   * marking-job consumer (this same process, `attempt-marking.queue.ts`)
   * picks it up. Injected rather than constructed here so this function
   * stays directly unit/integration-testable without standing up a real
   * BullMQ `Queue`. */
  enqueueMarking: (payload: AttemptMarkingJobPayload, jobId?: string) => Promise<void>;
  /** B22: makes sure marking owed to a finalised attempt is actually
   * queued — enqueues it if no job exists, retries it if the job failed.
   * Optional so tests of the transition alone need not provide it. */
  reconcileMarking?: (payload: AttemptMarkingJobPayload) => Promise<MarkingReconcileOutcome>;
  /** B22: the same for a result adjustment whose run died or whose job
   * was lost — its cohort stays held until it completes. */
  reconcileAdjustment?: (payload: ResultAdjustmentJobPayload) => Promise<JobReconcileOutcome>;
  now?: () => Date;
}

export type MarkingReconcileOutcome = JobReconcileOutcome;

/** A result still PROCESSING this long after finalisation is owed marking
 * that has not happened. Comfortably past a normal marking run, so the pass
 * never races the enqueue a submit is about to make. */
export const MARKING_RECONCILE_AFTER_MS = 2 * 60 * 1000;

/**
 * ADR-0004: "a background sweeper as the authority, plus opportunistic
 * finalisation, sharing one idempotent routine." This IS the authority half
 * — `apps/api`'s `AttemptFinalizationService` is the opportunistic half,
 * both applying the identical grace-window boundary via `@atlas/domain`'s
 * `attemptGraceWindowSeconds()` (this codebase's own AGENTS.md §5 names
 * exactly this class of drift risk by name; a hand-duplicated grace-window
 * calculation would be unacceptable here).
 *
 * A plain async function (not a class, no Nest DI: the worker process has
 * none) so it's directly unit/integration-testable without standing up
 * BullMQ at all, matching every sweep in this file (`subscription-expiry
 * .queue.ts`, `exam-control-refresh.queue.ts`). Iterates schools one at a
 * time via `withTenant`, never a single global query — `ExamAttempt` is
 * RLS-protected (`FORCE ROW LEVEL SECURITY`), so `atlas_app` cannot see
 * rows across multiple schools in one unscoped query, the same real
 * constraint every prior sweep in this file already documents.
 *
 * Per-attempt `try/catch`, not just per-school — one level finer than the
 * per-school-only precedent every other sweep in this file uses, since a
 * single attempt's audit-write or enqueue failure is a much narrower blast
 * radius than a whole tenant's failure, and there is no reason a
 * transient failure on one student's attempt should delay finalising every
 * other abandoned attempt in the same school on this same tick.
 *
 * Re-derives the "is this attempt still IN_PROGRESS" condition atomically
 * at write time via the conditional `updateMany`'s own `state:
 * 'IN_PROGRESS'` filter — the same two-step "find candidates, then
 * conditionally act" shape `AttemptLifecycleService.start()`'s own
 * advisory-lock-plus-insert uses. A `count === 0` result is a normal,
 * silent no-op: it means an `apps/api` opportunistic-finalisation path (or
 * a manual submit) already won this exact attempt between this sweep's own
 * `findMany` and this `updateMany` — never treated as an error.
 *
 * B22: also the reconciliation authority for marking — see
 * `reconcileOwedMarking` below, which closed the residual risk (a lost
 * marking enqueue was never retried) this comment used to record.
 */
export async function runAttemptAutoSubmitSweep(deps: AttemptAutoSubmitSweepDeps): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const cutoff = new Date(now.getTime() - attemptGraceWindowSeconds() * 1000);
  const schools = await prisma.school.findMany({ select: { id: true } });

  for (const school of schools) {
    try {
      const expired = await withTenant(prisma, school.id, (tx) =>
        tx.examAttempt.findMany({
          where: { schoolId: school.id, state: 'IN_PROGRESS', expiresAt: { lte: cutoff } },
          select: { id: true },
        }),
      );

      for (const { id: attemptId } of expired) {
        try {
          // B22: the transition, the PROCESSING result and the audit row
          // commit together (they used to be three transactions, and the
          // sweeper wrote no result at all), so a crash or outage between
          // them can no longer leave a finalised attempt with no record that
          // marking is owed.
          const transitioned = await withTenant(prisma, school.id, async (tx) => {
            const { count } = await tx.examAttempt.updateMany({
              where: { schoolId: school.id, id: attemptId, state: 'IN_PROGRESS' },
              data: { state: 'AUTO_SUBMITTED', submittedAt: now },
            });
            if (count === 0) return false; // already finalized by another path — safe no-op.
            const attempt = await tx.examAttempt.findUniqueOrThrow({
              where: { id: attemptId },
              select: {
                examId: true,
                studentProfileId: true,
                studentProfile: { select: { membership: { select: { userId: true } } } },
              },
            });
            await ensureProcessingResult(tx, {
              schoolId: school.id,
              attemptId,
              examId: attempt.examId,
              studentProfileId: attempt.studentProfileId,
            });
            // Attributed to the attempt's own student — AuditEvent.actorUserId/
            // actorRole are non-nullable and Role has no SYSTEM value, the
            // same convention apps/api's own AttemptFinalizationService uses
            // for this identical action. Written directly via Prisma, not
            // through AuditService (Nest DI, unavailable in this process) —
            // the same direct-write precedent this file's own sibling sweeps
            // already use for Notification rows.
            await tx.auditEvent.create({
              data: {
                schoolId: school.id,
                actorUserId: attempt.studentProfile.membership.userId,
                actorRole: 'STUDENT',
                action: 'ATTEMPT_AUTO_SUBMITTED',
                entityType: 'ExamAttempt',
                entityId: attemptId,
              },
            });
            return true;
          });
          if (!transitioned) continue;

          await deps.enqueueMarking({ schoolId: school.id, attemptId }, `mark-${attemptId}`);
        } catch (err) {
          console.error(`[worker] attempt-auto-submit failed for attempt ${attemptId}:`, err);
        }
      }
      if (deps.reconcileMarking) {
        await reconcileOwedMarking(school.id, now, deps.reconcileMarking);
      }
      if (deps.reconcileAdjustment) {
        await reconcileOwedAdjustments(school.id, now, deps.reconcileAdjustment);
      }
    } catch (err) {
      console.error(`[worker] attempt-auto-submit sweep failed for school ${school.id}:`, err);
    }
  }
}

/**
 * B22 (08 §25 "worker crash" / "result worker failure"; closes the gap
 * B14 recorded against itself): every finalised attempt holds a result
 * that stays PROCESSING until marking commits. One still PROCESSING well
 * after finalisation means its marking was lost — an enqueue that failed
 * during a Redis outage, a job that stalled twice when workers were killed,
 * a job that failed every retry — so this pass makes sure a job for it is
 * queued. Marking itself is idempotent and ignores a result that is no
 * longer PROCESSING, so a duplicate here costs one no-op job.
 *
 * Runs per school inside the sweep (RLS, as above). Uses the
 * `(school_id, state, finalized_at)` index: PROCESSING results are only
 * ever the handful not yet marked.
 */
/** Exhausted work stays exhausted until an operator replays it, so it is
 * seen on every pass; it is logged once per EXHAUSTED_LOG_EVERY_MS per
 * school, not every 15 s. Recovered work is always logged. */
const EXHAUSTED_LOG_EVERY_MS = 10 * 60 * 1000;
const lastExhaustedLog = new Map<string, number>();
function shouldLogReconciliation(
  key: string,
  counts: Record<JobReconcileOutcome, number>,
  now: Date,
): boolean {
  if (counts.enqueued + counts.retried > 0) return true;
  if (counts.exhausted === 0) return false;
  const last = lastExhaustedLog.get(key) ?? 0;
  if (now.getTime() - last < EXHAUSTED_LOG_EVERY_MS) return false;
  lastExhaustedLog.set(key, now.getTime());
  return true;
}

export async function reconcileOwedMarking(
  schoolId: string,
  now: Date,
  reconcile: NonNullable<AttemptAutoSubmitSweepDeps['reconcileMarking']>,
): Promise<Record<MarkingReconcileOutcome, number>> {
  const counts: Record<MarkingReconcileOutcome, number> = {
    pending: 0,
    enqueued: 0,
    retried: 0,
    exhausted: 0,
  };
  const owed = await withTenant(prisma, schoolId, (tx) =>
    tx.result.findMany({
      where: {
        schoolId,
        state: 'PROCESSING',
        createdAt: { lte: new Date(now.getTime() - MARKING_RECONCILE_AFTER_MS) },
        attempt: { state: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] } },
      },
      select: { attemptId: true },
      // Newest first: results left exhausted (an operator's job) must never
      // crowd newly owed marking out of the batch.
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
  );
  for (const { attemptId } of owed) {
    try {
      const outcome = await reconcile({ schoolId, attemptId });
      counts[outcome] += 1;
    } catch (err) {
      // Redis unreachable: the next tick tries again.
      recordDependencyFallback('queue', 'marking-reconcile');
      console.error(`[worker] marking reconciliation failed for attempt ${attemptId}:`, err);
      break;
    }
  }
  for (const outcome of ['enqueued', 'retried', 'exhausted'] as const) {
    recordWorkReconciled('marking', outcome, counts[outcome]);
  }
  if (shouldLogReconciliation(`marking:${schoolId}`, counts, now)) {
    // Structured enough to alert on (B22 runbook): any non-zero
    // `enqueued`/`retried` means marking was lost and recovered;
    // `exhausted` needs an operator.
    console.warn(JSON.stringify({ msg: 'marking reconciliation', schoolId, ...counts }));
  }
  return counts;
}

export function createAttemptAutoSubmitWorker(
  connection: ConnectionOptions,
  deps: AttemptAutoSubmitSweepDeps,
): Worker {
  return new Worker(
    ATTEMPT_AUTO_SUBMIT_QUEUE_NAME,
    async (_job: Job) => {
      await runAttemptAutoSubmitSweep(deps);
    },
    {
      connection,
      // A sweep may walk every school and enqueue marking work. Its 15s
      // cadence must not let the default 30s BullMQ lock expire mid-pass.
      // Serial execution preserves the idempotent compare-and-transition
      // logic above while renewal prevents a false stalled-job reclaim.
      concurrency: 1,
      lockDuration: 120_000,
      lockRenewTime: 30_000,
      stalledInterval: 30_000,
      maxStalledCount: 1,
    },
  );
}

export async function scheduleAttemptAutoSubmitSweep(queue: Queue, everyMs: number): Promise<void> {
  await queue.upsertJobScheduler(
    SWEEP_JOB_ID,
    { every: everyMs },
    { opts: { removeOnComplete: true, removeOnFail: 10 } },
  );
}

/**
 * B22: a result adjustment holds its whole cohort (`adjustmentInProgress`)
 * until it completes, so one whose job was lost or failed for good must
 * not be left PENDING/PROCESSING. Owed = not finished, created a while
 * ago, and no live lease (a running adjustment refreshes its lease every
 * chunk, so an unrefreshed one is dead). The job itself is resumable and
 * idempotent per result.
 */
export async function reconcileOwedAdjustments(
  schoolId: string,
  now: Date,
  reconcile: NonNullable<AttemptAutoSubmitSweepDeps['reconcileAdjustment']>,
): Promise<Record<JobReconcileOutcome, number>> {
  const counts: Record<JobReconcileOutcome, number> = {
    pending: 0,
    enqueued: 0,
    retried: 0,
    exhausted: 0,
  };
  const staleBefore = new Date(now.getTime() - RESULT_ADJUSTMENT_CLAIM_TTL_MS);
  const owed = await withTenant(prisma, schoolId, (tx) =>
    tx.resultAdjustmentOperation.findMany({
      where: {
        schoolId,
        status: { in: ['PENDING', 'PROCESSING'] },
        createdAt: { lte: new Date(now.getTime() - MARKING_RECONCILE_AFTER_MS) },
        OR: [{ processingClaimedAt: null }, { processingClaimedAt: { lt: staleBefore } }],
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  );
  for (const { id: operationId } of owed) {
    try {
      counts[await reconcile({ schoolId, operationId })] += 1;
    } catch (err) {
      recordDependencyFallback('queue', 'adjustment-reconcile');
      console.error(`[worker] adjustment reconciliation failed for ${operationId}:`, err);
      break;
    }
  }
  for (const outcome of ['enqueued', 'retried', 'exhausted'] as const) {
    recordWorkReconciled('result-adjustment', outcome, counts[outcome]);
  }
  if (shouldLogReconciliation(`adjustment:${schoolId}`, counts, now)) {
    console.warn(JSON.stringify({ msg: 'adjustment reconciliation', schoolId, ...counts }));
  }
  return counts;
}
