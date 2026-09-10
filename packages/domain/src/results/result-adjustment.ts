import {
  computePercentage,
  type ResultQuestionMarking,
  type ResultTotals,
} from './result-totals.js';

/**
 * ADR-0025's adjustment arithmetic (07 §10.2, 05 §53, 03 §73). Pure and
 * DB-free, so the same computation runs in the worker that applies an
 * adjustment and in the unit tests that prove replaying the history
 * reproduces the original result (DoD item 12).
 *
 * Crucially, this never mutates `AttemptQuestionResult`: 07 §38 lists that
 * table as immutable "final marking evidence." An adjustment changes the
 * derived `Result` and records the delta; the per-question marking output
 * stays exactly as the marking worker wrote it, which is what keeps the
 * original recoverable at all.
 */

export const RESULT_ADJUSTMENT_TYPES = [
  'VOID_QUESTION',
  'AWARD_MARK',
  'DEDUCT_MARK',
  'RECALCULATE',
  'MANUAL_OVERRIDE',
] as const;
export type ResultAdjustmentType = (typeof RESULT_ADJUSTMENT_TYPES)[number];

/** The numeric shape captured in `ResultAdjustment.oldValue`/`newValue`. */
export interface AdjustableResultValues {
  totalMarks: number;
  earnedMarks: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  partialCount: number;
}

export interface ResultAdjustmentSpec {
  type: ResultAdjustmentType;
  /** VOID_QUESTION: the `ExamQuestion` excluded from this result. */
  targetExamQuestionId?: string | null;
  /** AWARD_MARK / DEDUCT_MARK: magnitude, always positive. */
  markDelta?: number | null;
  /** MANUAL_OVERRIDE: the earned-marks value set outright. */
  overrideEarnedMarks?: number | null;
}

export function toAdjustableValues(totals: ResultTotals): AdjustableResultValues {
  return {
    totalMarks: totals.totalMarks,
    earnedMarks: totals.earnedMarks,
    percentage: totals.percentage,
    correctCount: totals.correctCount,
    incorrectCount: totals.incorrectCount,
    unansweredCount: totals.unansweredCount,
    partialCount: totals.partialCount,
  };
}

/**
 * Applies one adjustment to one result's current values.
 *
 * `questionResults` is the attempt's immutable marking evidence, needed by
 * the two types that re-derive rather than shift:
 *
 *   - `VOID_QUESTION` (03 §73's "exclude question from score") removes the
 *     question from BOTH earned and maximum marks, so the percentage reflects
 *     an exam of the remaining questions rather than punishing every student
 *     for a question nobody could answer correctly. Its correctness count is
 *     removed too, so the counts continue to sum to the questions that still
 *     carry marks.
 *   - `RECALCULATE` (05 §53's "Recalculate result") re-derives everything
 *     from the marking evidence — the repair path when a result's stored
 *     totals have drifted from the rows they summarise.
 *
 * Both are computed against the marking evidence MINUS every question voided
 * by earlier adjustments, which is what makes a sequence of adjustments
 * order-independent in outcome and replayable in order.
 */
export function applyResultAdjustment(
  current: AdjustableResultValues,
  spec: ResultAdjustmentSpec,
  questionResults: readonly ResultQuestionMarking[],
  previouslyVoidedExamQuestionIds: readonly string[] = [],
): AdjustableResultValues {
  switch (spec.type) {
    case 'VOID_QUESTION': {
      if (!spec.targetExamQuestionId) return current;
      const voided = new Set([...previouslyVoidedExamQuestionIds, spec.targetExamQuestionId]);
      return recomputeExcluding(questionResults, voided);
    }

    case 'RECALCULATE': {
      const voided = new Set(previouslyVoidedExamQuestionIds);
      return recomputeExcluding(questionResults, voided);
    }

    case 'AWARD_MARK': {
      const delta = spec.markDelta ?? 0;
      return withEarnedMarks(current, current.earnedMarks + delta);
    }

    case 'DEDUCT_MARK': {
      const delta = spec.markDelta ?? 0;
      return withEarnedMarks(current, current.earnedMarks - delta);
    }

    case 'MANUAL_OVERRIDE': {
      const override = spec.overrideEarnedMarks ?? current.earnedMarks;
      return withEarnedMarks(current, override);
    }
  }
}

/**
 * Earned marks are clamped to 0..totalMarks. An AWARD_MARK that would push a
 * near-perfect script above the paper's own total, or a DEDUCT_MARK that
 * would drive a score negative, is a data-entry mistake rather than an
 * intended academic outcome — and an out-of-range percentage would corrupt
 * every aggregate downstream. The adjustment is still recorded in full, so
 * the clamp is visible in the history rather than silent.
 */
function withEarnedMarks(
  current: AdjustableResultValues,
  earnedMarks: number,
): AdjustableResultValues {
  const clamped = Math.max(0, Math.min(earnedMarks, current.totalMarks));
  return {
    ...current,
    earnedMarks: clamped,
    percentage: computePercentage(clamped, current.totalMarks),
  };
}

function recomputeExcluding(
  questionResults: readonly ResultQuestionMarking[],
  voidedExamQuestionIds: ReadonlySet<string>,
): AdjustableResultValues {
  let totalMarks = 0;
  let earnedMarks = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;
  let partialCount = 0;

  for (const row of questionResults) {
    if (voidedExamQuestionIds.has(row.examQuestionId)) continue;

    totalMarks += row.maximumMarks;
    earnedMarks += row.awardedMarks;

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

/**
 * DoD item 12: "Adjustment history replays to reproduce the original
 * result." Because every child row carries the complete before/after numeric
 * snapshot, the original is the `oldValue` of the earliest adjustment —
 * recoverable regardless of how many adjustments followed, and without
 * needing to invert any of the arithmetic above.
 *
 * Exported (rather than left implicit in a test) because it is the actual
 * guarantee 07 §38's "original finalized result" immutability rests on: the
 * `Result` row holds current values, and this is how the original is read
 * back out of the append-only history.
 */
export function replayOriginalValues(
  history: readonly { oldValue: AdjustableResultValues }[],
  currentValues: AdjustableResultValues,
): AdjustableResultValues {
  const earliest = history[0];
  return earliest ? earliest.oldValue : currentValues;
}
