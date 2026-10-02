import { Worker, type ConnectionOptions } from 'bullmq';
import { prisma, withTenant } from '@atlas/db';
import {
  computeAttemptQuestionMarkingResults,
  ATTEMPT_MARKING_QUEUE_NAME,
  type AttemptMarkingJobPayload,
  type AttemptSnapshotDocumentV1,
} from '@atlas/domain';
import {
  autoPublishIfPolicyRequires,
  finalizeResultAfterMarking,
  recordAutoPublication,
  type FinalizedResultOutcome,
} from './result-finalization.js';
import {
  CRITICAL_SPANS,
  examInstruments,
  withExtractedTraceContext,
  withSpan,
} from '@atlas/observability';

/**
 * B14's marking-job consumer — lives in `apps/worker`, not `apps/api`,
 * unlike B7's import processor or B10's notification-dispatch processor
 * (both hosted in `apps/api` specifically because they reuse Nest-DI-
 * resolved singletons `apps/worker` cannot reach). Marking has no such
 * dependency: it reads `AttemptQuestionSnapshot`/`AttemptAnswer` and writes
 * `AttemptQuestionResult` via plain Prisma, with no audit event of its own
 * (marking's outcome is implicit in row existence — `ATTEMPT_SUBMITTED`/
 * `ATTEMPT_AUTO_SUBMITTED` are already recorded by whichever path finalized
 * the attempt). Placing it here gives real BullMQ retry/backoff/crash-
 * resumability with no extra bootstrap machinery, satisfying DoD item 10
 * directly.
 *
 * Three producers share this queue across two processes: `apps/api`'s
 * `AttemptLifecycleService.submit()`/`.end()`/`AttemptFinalizationService`
 * (this app's own opportunistic paths), and `apps/worker`'s own
 * ADR-0004 sweeper — matching `NOTIFICATION_DISPATCH_QUEUE_NAME`'s own
 * established cross-process producer/consumer split.
 *
 * The whole per-attempt marking run (snapshot read → per-question upserts)
 * sits inside ONE `withTenant` transaction, so "resumable" (DoD item 10)
 * means "safely re-run from scratch" on a retry (a mid-run crash rolls the
 * whole transaction back, leaving zero partial rows — Postgres's own
 * guarantee, not application logic) rather than literal partial-progress
 * resumption. This is deliberately simpler than mid-batch resume and
 * correct at this codebase's actual scale (a single attempt's question
 * count is small; re-running the full set on retry costs nothing
 * meaningful). Every upsert is unconditional — no ordering guard is needed
 * here unlike `AttemptAnswer`'s own atomic upsert (marking has no
 * sequence-number/replay concept): the two frozen inputs this function
 * reads (the immutable snapshot, and `AttemptAnswer` rows that are
 * themselves immutable once the parent attempt leaves `IN_PROGRESS`) never
 * change between two runs, so re-marking always produces byte-identical
 * output — DoD item 9's actual idempotency guarantee.
 */
export interface AttemptMarkingWorkerDeps {
  /** Test-only hook, called with the zero-based index of each question
   * immediately before its own upsert — lets a test force a crash
   * mid-run deterministically (see this file's own integration test) to
   * prove DoD item 10's rollback/resumability guarantee. Never set in
   * production. */
  onBeforeUpsert?: (index: number) => void;
  /** B17 cache invalidation runs only after the marking transaction commits. */
  invalidateAnalytics?: (schoolId: string) => Promise<void>;
}

/**
 * B20 (08 §18 "trace result generation"): the result-generation span,
 * continuing the trace of the request that enqueued this job (submit) via
 * the W3C carrier the API puts in the payload. Ids-only attributes.
 */
export async function runAttemptMarking(
  deps: AttemptMarkingWorkerDeps,
  payload: AttemptMarkingJobPayload,
): Promise<void> {
  const began = performance.now();
  await withExtractedTraceContext(payload.trace, () =>
    withSpan(
      CRITICAL_SPANS.resultGenerate,
      { 'atlas.school_id': payload.schoolId, 'atlas.attempt_id': payload.attemptId },
      () => markAttempt(deps, payload),
    ),
  );
  const instruments = examInstruments();
  instruments.resultGenerated.add(1);
  instruments.resultGenerationDuration.record(performance.now() - began);
}

async function markAttempt(
  deps: AttemptMarkingWorkerDeps,
  payload: AttemptMarkingJobPayload,
): Promise<void> {
  const { schoolId, attemptId } = payload;
  let finalized: FinalizedResultOutcome | undefined;
  let published = false;

  await withTenant(prisma, schoolId, async (tx) => {
    const attempt = await tx.examAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: { state: true },
    });
    if (attempt.state === 'IN_PROGRESS') {
      // Should be structurally impossible — every enqueue onto this queue
      // follows a committed finalisation transition — but a defensive
      // throw here lets BullMQ's own retry/backoff resolve a genuine race
      // rather than mis-marking a still-live, still-writable attempt.
      throw new Error(`attempt ${attemptId} is still IN_PROGRESS — refusing to mark`);
    }
    if (attempt.state === 'INVALIDATED' || attempt.state === 'CANCELLED') {
      // A stale queued job must be harmless after a terminal administrative
      // transition. These are not transient marking failures worthy of retry.
      return;
    }

    const snapshot = await tx.attemptQuestionSnapshot.findUniqueOrThrow({
      where: { schoolId_attemptId: { schoolId, attemptId } },
    });
    const answers = await tx.attemptAnswer.findMany({
      where: { schoolId, attemptId },
      select: { examQuestionId: true, selectedOptionId: true },
    });
    const answersByExamQuestionId = new Map(
      answers.map((a) => [a.examQuestionId, { selectedOptionId: a.selectedOptionId }]),
    );
    const document = snapshot.document as unknown as AttemptSnapshotDocumentV1;
    const results = computeAttemptQuestionMarkingResults(document, answersByExamQuestionId);

    for (const [index, result] of results.entries()) {
      deps.onBeforeUpsert?.(index);
      await tx.attemptQuestionResult.upsert({
        where: {
          schoolId_attemptId_examQuestionId: {
            schoolId,
            attemptId,
            examQuestionId: result.examQuestionId,
          },
        },
        create: {
          schoolId,
          attemptId,
          examQuestionId: result.examQuestionId,
          correctness: result.correctness,
          awardedMarks: result.awardedMarks,
          maximumMarks: result.maximumMarks,
        },
        update: {
          correctness: result.correctness,
          awardedMarks: result.awardedMarks,
          maximumMarks: result.maximumMarks,
        },
      });
    }

    // B15: the result is finalised inside this same transaction, after the
    // last per-question upsert — so DoD item 2's "PROCESSING → FINAL only
    // after ALL question marking completes" holds structurally rather than
    // by a check, and a crashed run rolls the transition back with the marks.
    finalized = await finalizeResultAfterMarking(tx, schoolId, attemptId, results);
    if (finalized.autoPublish) {
      published = await autoPublishIfPolicyRequires(tx, schoolId, finalized.examId);
    }
  });

  // The audit event and notification for an automatic release are written
  // after the transaction commits, matching this worker's sibling sweeps: a
  // notification failure must never roll back marking that has succeeded.
  if (finalized && published) {
    // Bound to a local so the narrowing survives into the closure below.
    const outcome = finalized;
    try {
      // `withTenant`, not a bare `prisma` read: `exams` is school-owned and
      // RLS-protected, so an unscoped query returns nothing here.
      const exam = await withTenant(prisma, schoolId, (tx) =>
        tx.exam.findUniqueOrThrow({
          where: { id: outcome.examId },
          select: { title: true },
        }),
      );
      await recordAutoPublication(schoolId, outcome, exam.title, outcome.studentUserId);
    } catch (error) {
      console.error(
        `[attempt-marking] result ${finalized.resultId} was published automatically but its audit/notification write failed: ${String(error)}`,
      );
    }
  }
  if (finalized) {
    try {
      await deps.invalidateAnalytics?.(schoolId);
    } catch (error) {
      // The result is already durable. A cache-version bump is retryable by
      // the scheduled refresh and must never fail a marking job.
      console.error(
        `[attempt-marking] analytics cache invalidation failed for ${schoolId}: ${String(error)}`,
      );
    }
  }
}

export function createAttemptMarkingWorker(
  connection: ConnectionOptions,
  deps: AttemptMarkingWorkerDeps,
): Worker<AttemptMarkingJobPayload> {
  return new Worker<AttemptMarkingJobPayload>(
    ATTEMPT_MARKING_QUEUE_NAME,
    async (job) => {
      await runAttemptMarking(deps, job.data);
    },
    { connection },
  );
}
