import { Worker, type ConnectionOptions } from 'bullmq';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import {
  RESULT_ADJUSTMENT_CHUNK_SIZE,
  RESULT_ADJUSTMENT_CLAIM_TTL_MS,
  RESULT_ADJUSTMENT_QUEUE_NAME,
  applyResultAdjustment,
  computePercentage,
  resolveGradeBand,
  type AdjustableResultValues,
  type GradingBand,
  type ResultAdjustmentJobPayload,
  type ResultQuestionMarking,
} from '@atlas/domain';

/**
 * ADR-0025's bulk-adjustment consumer — the only place in the product where a
 * score changes after marking (05 §53, 02 §6, B15 DoD item 10).
 *
 * Four properties this worker has to hold simultaneously, all of which X-14
 * named as unspecified before ADR-0025 settled them:
 *
 *   1. **Resumable.** Work is chunked; each chunk commits on its own. A crash
 *      mid-run leaves every completed chunk applied and the rest pending, and
 *      a retry continues from there rather than restarting the cohort.
 *   2. **Idempotent.** The `(school_id, operation_id, result_id)` unique index
 *      on the child table is the idempotency key: a resumed run selects only
 *      results with no child row yet, so re-running never double-applies.
 *   3. **Never partially visible.** The parent set `adjustmentInProgress` at
 *      creation time (in `apps/api`), which the shared visibility helper
 *      honours, and only a COMPLETED run clears it.
 *   4. **Single-writer.** `processingClaimedAt` is an atomically-claimed,
 *      per-chunk-refreshed lease — B7's import-commit idiom — so a BullMQ
 *      stalled-lock redelivery cannot run concurrently with the original.
 */
export interface ResultAdjustmentWorkerDeps {
  /** Test-only hook, called with the zero-based index of each chunk before it
   * is applied — lets a test force a crash mid-run deterministically and
   * prove property 1. Never set in production. */
  onBeforeChunk?: (chunkIndex: number) => void;
  /** B17: invoked only after a completed operation releases its cohort. */
  invalidateAnalytics?: (schoolId: string) => Promise<void>;
}

export async function runResultAdjustment(
  deps: ResultAdjustmentWorkerDeps,
  payload: ResultAdjustmentJobPayload,
): Promise<void> {
  const { schoolId, operationId } = payload;

  const claimed = await claimOperation(schoolId, operationId);
  if (!claimed) {
    const current = await withTenant(prisma, schoolId, (tx) =>
      tx.resultAdjustmentOperation.findUnique({
        where: { id: operationId },
        select: { status: true },
      }),
    );
    // Finished (or gone): this is a duplicate job, nothing to do.
    if (!current || current.status === 'COMPLETED' || current.status === 'FAILED') return;
    // B22: still owed, but another run holds a live lease — it really is
    // running, or it was killed and the lease has not gone stale yet. Thrown
    // so BullMQ retries after its backoff and a dead holder's lease can be
    // taken over; returning used to complete the job and leave the cohort
    // held (adjustmentInProgress) indefinitely.
    throw new Error(`result adjustment ${operationId} is held by another run's claim; retrying`);
  }

  const operation = await withTenant(prisma, schoolId, (tx) =>
    tx.resultAdjustmentOperation.findUniqueOrThrow({ where: { id: operationId } }),
  );

  // Questions voided by EARLIER completed operations on the same exam. Every
  // recalculation is computed against the marking evidence minus these, so a
  // second void does not silently resurrect the first one's question.
  const previouslyVoided = await loadPreviouslyVoidedQuestionIds(
    schoolId,
    operation.examId,
    operationId,
  );

  let chunkIndex = 0;
  let failureReason: string | null = null;

  try {
    for (;;) {
      const pending = await loadPendingResultIds(schoolId, operation, RESULT_ADJUSTMENT_CHUNK_SIZE);
      if (pending.length === 0) break;

      deps.onBeforeChunk?.(chunkIndex);
      await applyChunk(schoolId, operation, pending, previouslyVoided);
      await refreshClaim(schoolId, operationId);
      chunkIndex += 1;
    }
  } catch (error) {
    failureReason = String(error);
    // The operation stays PROCESSING with its claim released, so BullMQ's
    // retry resumes it. Only an exhausted retry budget leaves it visibly
    // stuck — which is the honest outcome, since the alternative (marking it
    // COMPLETED) would clear the hold over a half-adjusted cohort.
    await withTenant(prisma, schoolId, (tx) =>
      tx.resultAdjustmentOperation.update({
        where: { id: operationId },
        data: { processingClaimedAt: null, failureReason },
      }),
    );
    throw error;
  }

  await completeOperation(schoolId, operationId, operation.examId);
  try {
    await deps.invalidateAnalytics?.(schoolId);
  } catch (error) {
    console.error(
      `[result-adjustment] analytics cache invalidation failed for ${schoolId}: ${String(error)}`,
    );
  }
}

/**
 * Atomically claims the operation, or declines. A claim is refused when
 * another worker holds a lease that has not yet expired; an expired lease is
 * taken over, since it means the previous holder died.
 */
async function claimOperation(schoolId: string, operationId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - RESULT_ADJUSTMENT_CLAIM_TTL_MS);

  const { count } = await withTenant(prisma, schoolId, (tx) =>
    tx.resultAdjustmentOperation.updateMany({
      where: {
        schoolId,
        id: operationId,
        status: { in: ['PENDING', 'PROCESSING'] },
        OR: [{ processingClaimedAt: null }, { processingClaimedAt: { lt: staleBefore } }],
      },
      data: { status: 'PROCESSING', processingClaimedAt: new Date() },
    }),
  );

  return count > 0;
}

async function refreshClaim(schoolId: string, operationId: string): Promise<void> {
  await withTenant(prisma, schoolId, (tx) =>
    tx.resultAdjustmentOperation.update({
      where: { id: operationId },
      data: { processingClaimedAt: new Date() },
    }),
  );
}

/**
 * Results this operation has not yet touched — the resumability and
 * idempotency mechanism in one query. A child row's existence IS the record
 * that its result is done.
 */
async function loadPendingResultIds(
  schoolId: string,
  operation: { id: string; examId: string; type: string; targetResultId: string | null },
  take: number,
): Promise<string[]> {
  const scope: Prisma.ResultWhereInput =
    operation.type === 'MANUAL_OVERRIDE' && operation.targetResultId
      ? { schoolId, id: operation.targetResultId }
      : { schoolId, examId: operation.examId, state: { in: ['FINAL', 'ADJUSTED'] } };

  const rows = await withTenant(prisma, schoolId, (tx) =>
    tx.result.findMany({
      where: { AND: [scope, { adjustments: { none: { operationId: operation.id } } }] },
      select: { id: true },
      orderBy: { id: 'asc' },
      take,
    }),
  );
  return rows.map((r) => r.id);
}

async function loadPreviouslyVoidedQuestionIds(
  schoolId: string,
  examId: string,
  currentOperationId: string,
): Promise<string[]> {
  const operations = await withTenant(prisma, schoolId, (tx) =>
    tx.resultAdjustmentOperation.findMany({
      where: {
        schoolId,
        examId,
        type: 'VOID_QUESTION',
        status: 'COMPLETED',
        id: { not: currentOperationId },
      },
      select: { targetExamQuestionId: true },
    }),
  );
  return operations.map((o) => o.targetExamQuestionId).filter((id): id is string => id !== null);
}

/**
 * One chunk, one transaction: every result in it is recalculated, its child
 * adjustment row written, and the parent's progress counter advanced —
 * atomically, so a crash can never leave a result adjusted without the child
 * row that records it (which would make the run non-idempotent on retry).
 */
async function applyChunk(
  schoolId: string,
  operation: {
    id: string;
    type: string;
    reason: string;
    targetExamQuestionId: string | null;
    markDelta: number | null;
    overrideEarnedMarks: number | null;
    createdByMembershipId: string;
  },
  resultIds: readonly string[],
  previouslyVoided: readonly string[],
): Promise<void> {
  await withTenant(prisma, schoolId, async (tx) => {
    for (const resultId of resultIds) {
      const result = await tx.result.findUniqueOrThrow({
        where: { id: resultId },
        select: {
          id: true,
          attemptId: true,
          totalMarks: true,
          earnedMarks: true,
          percentage: true,
          correctCount: true,
          incorrectCount: true,
          unansweredCount: true,
          partialCount: true,
          gradingScaleVersionId: true,
          state: true,
        },
      });

      const questionResults: ResultQuestionMarking[] = (
        await tx.attemptQuestionResult.findMany({
          where: { schoolId, attemptId: result.attemptId },
          select: {
            examQuestionId: true,
            correctness: true,
            awardedMarks: true,
            maximumMarks: true,
          },
        })
      ).map((qr) => ({
        examQuestionId: qr.examQuestionId,
        correctness: qr.correctness,
        awardedMarks: qr.awardedMarks,
        maximumMarks: qr.maximumMarks,
      }));

      const oldValue: AdjustableResultValues = {
        totalMarks: result.totalMarks,
        earnedMarks: result.earnedMarks,
        percentage: Number(result.percentage),
        correctCount: result.correctCount,
        incorrectCount: result.incorrectCount,
        unansweredCount: result.unansweredCount,
        partialCount: result.partialCount,
      };

      const newValue = applyResultAdjustment(
        oldValue,
        {
          type: operation.type as never,
          targetExamQuestionId: operation.targetExamQuestionId,
          markDelta: operation.markDelta,
          overrideEarnedMarks: operation.overrideEarnedMarks,
        },
        questionResults,
        previouslyVoided,
      );

      // The grade is re-resolved against the SAME frozen scale version the
      // result was originally graded with — never the school's current one.
      // A regrade after an adjustment must reflect the new mark under the
      // rules that applied at the time, not rules adopted since (ADR-0018).
      const grade = await resolveGradeForVersion(
        tx,
        schoolId,
        result.gradingScaleVersionId,
        newValue.percentage,
      );

      await tx.result.update({
        where: { id: resultId },
        data: {
          totalMarks: newValue.totalMarks,
          earnedMarks: newValue.earnedMarks,
          percentage: computePercentage(newValue.earnedMarks, newValue.totalMarks),
          correctCount: newValue.correctCount,
          incorrectCount: newValue.incorrectCount,
          unansweredCount: newValue.unansweredCount,
          partialCount: newValue.partialCount,
          grade,
          // 07 §19: "An adjustment does not erase the original result state."
          // FINAL becomes ADJUSTED; an already-ADJUSTED result stays so.
          state: 'ADJUSTED',
        },
      });

      await tx.resultAdjustment.create({
        data: {
          schoolId,
          operationId: operation.id,
          resultId,
          adjustmentType: operation.type as never,
          oldValue: oldValue as unknown as Prisma.InputJsonValue,
          newValue: newValue as unknown as Prisma.InputJsonValue,
          reason: operation.reason,
          authorizedByMembershipId: operation.createdByMembershipId,
        },
      });

      // ADR-0025: "Each child writes its own audit event, so the adjustment
      // is fully reconstructable" — per RESULT, not per bulk operation, so a
      // 1,200-result void is auditable per student (07 §34).
      await tx.auditEvent.create({
        data: {
          schoolId,
          actorUserId: (
            await tx.schoolMembership.findUniqueOrThrow({
              where: { id: operation.createdByMembershipId },
              select: { userId: true },
            })
          ).userId,
          actorRole: 'SCHOOL_ADMIN',
          action:
            operation.type === 'MANUAL_OVERRIDE' ? 'RESULT_MANUAL_OVERRIDE' : 'RESULT_ADJUSTED',
          entityType: 'Result',
          entityId: resultId,
          reason: operation.reason,
          metadata: {
            operationId: operation.id,
            type: operation.type,
            oldEarnedMarks: oldValue.earnedMarks,
            newEarnedMarks: newValue.earnedMarks,
          },
        },
      });
    }

    await tx.resultAdjustmentOperation.update({
      where: { id: operation.id },
      data: { appliedCount: { increment: resultIds.length } },
    });
  });
}

async function resolveGradeForVersion(
  tx: Prisma.TransactionClient,
  schoolId: string,
  versionId: string | null,
  percentage: number,
): Promise<string | null> {
  if (!versionId) return null;

  const bands: GradingBand[] = (
    await tx.gradingScaleBand.findMany({ where: { schoolId, versionId } })
  ).map((b) => ({
    label: b.label,
    minPercentage: Number(b.minPercentage),
    maxPercentage: Number(b.maxPercentage),
    isPassing: b.isPassing,
  }));

  return resolveGradeBand(bands, percentage)?.label ?? null;
}

/** Clears ADR-0025's hold — only ever on a fully completed run, so a cohort
 * is never revealed half-adjusted. */
async function completeOperation(
  schoolId: string,
  operationId: string,
  examId: string,
): Promise<void> {
  await withTenant(prisma, schoolId, async (tx) => {
    await tx.resultAdjustmentOperation.update({
      where: { id: operationId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        processingClaimedAt: null,
        failureReason: null,
      },
    });

    // Another operation may have been queued behind this one; the hold stays
    // until none is outstanding, so two adjustments in quick succession never
    // expose the cohort between them.
    const outstanding = await tx.resultAdjustmentOperation.count({
      where: { schoolId, examId, status: { in: ['PENDING', 'PROCESSING'] } },
    });
    if (outstanding === 0) {
      await tx.resultPublication.updateMany({
        where: { schoolId, examId },
        data: { adjustmentInProgress: false },
      });
    }
  });
}

export function createResultAdjustmentWorker(
  connection: ConnectionOptions,
  deps: ResultAdjustmentWorkerDeps,
): Worker<ResultAdjustmentJobPayload> {
  return new Worker<ResultAdjustmentJobPayload>(
    RESULT_ADJUSTMENT_QUEUE_NAME,
    async (job) => {
      await runResultAdjustment(deps, job.data);
    },
    { connection },
  );
}
