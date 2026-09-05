import { Worker, type ConnectionOptions } from 'bullmq';
import { prisma, withTenant } from '@atlas/db';
import {
  computeAttemptQuestionMarkingResults,
  ATTEMPT_MARKING_QUEUE_NAME,
  type AttemptMarkingJobPayload,
  type AttemptSnapshotDocumentV1,
} from '@atlas/domain';

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
}

export async function runAttemptMarking(
  deps: AttemptMarkingWorkerDeps,
  payload: AttemptMarkingJobPayload,
): Promise<void> {
  const { schoolId, attemptId } = payload;

  await withTenant(prisma, schoolId, async (tx) => {
    const attempt = await tx.examAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: { state: true },
    });
    if (attempt.state === 'IN_PROGRESS') {
      // Should be structurally impossible — every enqueue onto this queue
      // follows a committed finalisation transition — but a defensive
      // throw here lets BullMQ's own retry/backoff resolve a genuine race
      // rather than mis-marking a still-live, still-writable attempt; the
      // schema's own attempt_question_results_require_finalized_attempt
      // trigger (B14 migration) backstops this at the database level too.
      throw new Error(`attempt ${attemptId} is still IN_PROGRESS — refusing to mark`);
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
  });
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
