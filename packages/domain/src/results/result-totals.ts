import type { AttemptQuestionCorrectness } from '../exams/constants.js';

/**
 * B15's result arithmetic (07 §10.1, 05 §43-§44). Pure, DB-free, and shared
 * by three callers that must never disagree with one another:
 *
 *   - `apps/worker`'s marking-job consumer, which persists these numbers onto
 *     the `Result` row at finalisation;
 *   - `apps/api`'s `AttemptStatusService`, which computes the same aggregate
 *     live for the post-submission confirmation screen (this arithmetic
 *     originally lived inline there, in B14 — extracted here rather than
 *     duplicated, so the persisted record and the live view are the same
 *     computation by construction);
 *   - the adjustment recalculation path, which re-derives totals after a
 *     question is voided or marks are awarded.
 *
 * `totalMarks` is summed from `maximumMarks`, which B14 sources exclusively
 * from the frozen attempt snapshot (`AttemptSnapshotQuestionV1.marks`, itself
 * `ExamQuestion.marks` at attempt-start time) — never the live question bank.
 * That is ADR-0029's "B15: total_marks summed from snapshots" clause,
 * satisfied structurally rather than by a separate lookup.
 */
export interface ResultQuestionMarking {
  examQuestionId: string;
  correctness: AttemptQuestionCorrectness;
  awardedMarks: number;
  maximumMarks: number;
}

export interface ResultTotals {
  totalMarks: number;
  earnedMarks: number;
  /** Two decimal places. `0` when `totalMarks` is 0, never `NaN`. */
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  partialCount: number;
}

/**
 * Percentage to two decimal places. Kept as its own exported function
 * because the rounding convention (round-half-up at the fourth significant
 * digit, via scale-round-descale) is load-bearing: it is what B14's
 * `AttemptStatusService` already returned to students, and changing it would
 * silently move every displayed score by up to a hundredth of a point.
 */
export function computePercentage(earnedMarks: number, totalMarks: number): number {
  if (totalMarks <= 0) return 0;
  return Math.round((earnedMarks / totalMarks) * 10000) / 100;
}

export function computeResultTotals(
  questionResults: readonly ResultQuestionMarking[],
): ResultTotals {
  let earnedMarks = 0;
  let totalMarks = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;
  let partialCount = 0;

  for (const row of questionResults) {
    earnedMarks += row.awardedMarks;
    totalMarks += row.maximumMarks;

    switch (row.correctness) {
      case 'CORRECT':
        correctCount += 1;
        break;
      case 'INCORRECT':
        incorrectCount += 1;
        break;
      case 'UNANSWERED':
        unansweredCount += 1;
        break;
      case 'PARTIAL':
        partialCount += 1;
        break;
    }
  }

  return {
    totalMarks,
    earnedMarks,
    percentage: computePercentage(earnedMarks, totalMarks),
    correctCount,
    incorrectCount,
    unansweredCount,
    partialCount,
  };
}
