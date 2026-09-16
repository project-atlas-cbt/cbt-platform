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

export interface AttemptMarkingWorkerDeps {
  onBeforeUpsert?: (index: number) => void;
}

/**
 * Marks only submitted attempts. INVALIDATED and CANCELLED are deliberate
 * terminal outcomes, so a delayed or retried queue job must become a no-op
 * rather than recreate marking evidence or finalize a voided result.
 */
export async function runAttemptMarking(
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

    if (attempt.state === 'INVALIDATED' || attempt.state === 'CANCELLED') {
      return;
    }
    if (attempt.state !== 'SUBMITTED' && attempt.state !== 'AUTO_SUBMITTED') {
      throw new Error(
        `attempt ${attemptId} is ${attempt.state} — refusing to mark before submission`,
      );
    }

    const snapshot = await tx.attemptQuestionSnapshot.findUniqueOrThrow({
      where: { schoolId_attemptId: { schoolId, attemptId } },
    });
    const answers = await tx.attemptAnswer.findMany({
      where: { schoolId, attemptId },
      select: { examQuestionId: true, selectedOptionId: true },
    });
    const answersByExamQuestionId = new Map(
      answers.map((answer) => [
        answer.examQuestionId,
        { selectedOptionId: answer.selectedOptionId },
      ]),
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

    finalized = await finalizeResultAfterMarking(tx, schoolId, attemptId, results);
    if (finalized.autoPublish) {
      published = await autoPublishIfPolicyRequires(tx, schoolId, finalized.examId);
    }
  });

  if (finalized && published) {
    const outcome = finalized;
    try {
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
