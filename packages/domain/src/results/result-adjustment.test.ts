import { describe, expect, it } from 'vitest';
import {
  applyResultAdjustment,
  replayOriginalValues,
  toAdjustableValues,
  type AdjustableResultValues,
} from './result-adjustment.js';
import { computeResultTotals, type ResultQuestionMarking } from './result-totals.js';

/** Ten one-mark questions: seven right, two wrong, one unanswered. */
const marking: ResultQuestionMarking[] = [
  ...Array.from({ length: 7 }, (_, i) => ({
    examQuestionId: `q-correct-${i}`,
    correctness: 'CORRECT' as const,
    awardedMarks: 1,
    maximumMarks: 1,
  })),
  {
    examQuestionId: 'q-wrong-0',
    correctness: 'INCORRECT' as const,
    awardedMarks: 0,
    maximumMarks: 1,
  },
  {
    examQuestionId: 'q-wrong-1',
    correctness: 'INCORRECT' as const,
    awardedMarks: 0,
    maximumMarks: 1,
  },
  {
    examQuestionId: 'q-blank',
    correctness: 'UNANSWERED' as const,
    awardedMarks: 0,
    maximumMarks: 1,
  },
];

const original = toAdjustableValues(computeResultTotals(marking));

describe('applyResultAdjustment', () => {
  it('starts from a 7/10 baseline', () => {
    expect(original).toMatchObject({ totalMarks: 10, earnedMarks: 7, percentage: 70 });
  });

  it('VOID_QUESTION removes the question from BOTH earned and maximum marks', () => {
    // 03 §73's "exclude question from score": voiding a question nobody could
    // answer must not punish the cohort by keeping its marks in the
    // denominator.
    const adjusted = applyResultAdjustment(
      original,
      { type: 'VOID_QUESTION', targetExamQuestionId: 'q-wrong-0' },
      marking,
    );

    expect(adjusted.totalMarks).toBe(9);
    expect(adjusted.earnedMarks).toBe(7);
    expect(adjusted.percentage).toBe(77.78);
    expect(adjusted.incorrectCount).toBe(1);
  });

  it('voiding a question the student answered correctly removes its mark too', () => {
    const adjusted = applyResultAdjustment(
      original,
      { type: 'VOID_QUESTION', targetExamQuestionId: 'q-correct-0' },
      marking,
    );

    expect(adjusted.totalMarks).toBe(9);
    expect(adjusted.earnedMarks).toBe(6);
    expect(adjusted.correctCount).toBe(6);
  });

  it('accumulates across successive VOID_QUESTION adjustments', () => {
    const first = applyResultAdjustment(
      original,
      { type: 'VOID_QUESTION', targetExamQuestionId: 'q-wrong-0' },
      marking,
    );
    const second = applyResultAdjustment(
      first,
      { type: 'VOID_QUESTION', targetExamQuestionId: 'q-wrong-1' },
      marking,
      ['q-wrong-0'],
    );

    expect(second.totalMarks).toBe(8);
    expect(second.earnedMarks).toBe(7);
    expect(second.percentage).toBe(87.5);
  });

  it('is idempotent when the same question is voided twice', () => {
    // The adjustment worker skips an already-applied child, but a re-run that
    // did reach here must not double-count.
    const once = applyResultAdjustment(
      original,
      { type: 'VOID_QUESTION', targetExamQuestionId: 'q-wrong-0' },
      marking,
    );
    const twice = applyResultAdjustment(
      once,
      { type: 'VOID_QUESTION', targetExamQuestionId: 'q-wrong-0' },
      marking,
      ['q-wrong-0'],
    );

    expect(twice).toEqual(once);
  });

  it('AWARD_MARK raises earned marks and leaves the total alone', () => {
    const adjusted = applyResultAdjustment(original, { type: 'AWARD_MARK', markDelta: 2 }, marking);

    expect(adjusted.earnedMarks).toBe(9);
    expect(adjusted.totalMarks).toBe(10);
    expect(adjusted.percentage).toBe(90);
  });

  it('DEDUCT_MARK lowers earned marks', () => {
    const adjusted = applyResultAdjustment(
      original,
      { type: 'DEDUCT_MARK', markDelta: 3 },
      marking,
    );

    expect(adjusted.earnedMarks).toBe(4);
    expect(adjusted.percentage).toBe(40);
  });

  it('clamps an award above the paper total and a deduction below zero', () => {
    expect(
      applyResultAdjustment(original, { type: 'AWARD_MARK', markDelta: 50 }, marking).earnedMarks,
    ).toBe(10);
    expect(
      applyResultAdjustment(original, { type: 'DEDUCT_MARK', markDelta: 50 }, marking).earnedMarks,
    ).toBe(0);
  });

  it('MANUAL_OVERRIDE sets earned marks outright', () => {
    const adjusted = applyResultAdjustment(
      original,
      { type: 'MANUAL_OVERRIDE', overrideEarnedMarks: 5 },
      marking,
    );

    expect(adjusted.earnedMarks).toBe(5);
    expect(adjusted.percentage).toBe(50);
  });

  it('RECALCULATE re-derives from the immutable marking evidence', () => {
    // The repair path: a result whose stored totals have drifted is brought
    // back into agreement with the rows it summarises.
    const drifted: AdjustableResultValues = { ...original, earnedMarks: 3, percentage: 30 };
    const repaired = applyResultAdjustment(drifted, { type: 'RECALCULATE' }, marking);

    expect(repaired).toEqual(original);
  });

  it('RECALCULATE preserves questions voided by earlier adjustments', () => {
    const drifted: AdjustableResultValues = { ...original, earnedMarks: 3 };
    const repaired = applyResultAdjustment(drifted, { type: 'RECALCULATE' }, marking, ['q-blank']);

    expect(repaired.totalMarks).toBe(9);
    expect(repaired.earnedMarks).toBe(7);
    expect(repaired.unansweredCount).toBe(0);
  });

  it('VOID_QUESTION with no target is a no-op rather than a silent wipe', () => {
    expect(applyResultAdjustment(original, { type: 'VOID_QUESTION' }, marking)).toEqual(original);
  });
});

describe('replayOriginalValues (DoD item 12)', () => {
  it('reproduces the original result from the append-only history', () => {
    // 07 §38 lists the "original finalized result" as immutable, while
    // Result holds current values — the two are reconciled by the history
    // being complete enough to recover the original.
    const afterVoid = applyResultAdjustment(
      original,
      { type: 'VOID_QUESTION', targetExamQuestionId: 'q-wrong-0' },
      marking,
    );
    const afterAward = applyResultAdjustment(
      afterVoid,
      { type: 'AWARD_MARK', markDelta: 1 },
      marking,
    );

    const history = [
      { oldValue: original, newValue: afterVoid },
      { oldValue: afterVoid, newValue: afterAward },
    ];

    expect(replayOriginalValues(history, afterAward)).toEqual(original);
    // And each step's newValue is the next step's oldValue — the chain has
    // no gap through which an unrecorded change could have happened.
    expect(history[0]?.newValue).toEqual(history[1]?.oldValue);
  });

  it('returns the current values when nothing has ever been adjusted', () => {
    expect(replayOriginalValues([], original)).toEqual(original);
  });
});
