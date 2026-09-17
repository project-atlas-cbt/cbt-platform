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

  // Regression: post-implementation review found that VOID_QUESTION always
  // recomputed straight from raw marking evidence, discarding any
  // AWARD_MARK/DEDUCT_MARK/MANUAL_OVERRIDE delta already applied in an
  // earlier, separate adjustment operation on the same result — a silent
  // score change, exactly what this phase's own governing constraint (no
  // path may silently change a score) exists to forbid.
  describe('composing a delta-type adjustment with a later VOID_QUESTION', () => {
    it('preserves an earlier AWARD_MARK bonus across a later void', () => {
      const afterAward = applyResultAdjustment(
        original,
        { type: 'AWARD_MARK', markDelta: 2 },
        marking,
      );
      expect(afterAward).toMatchObject({ earnedMarks: 9, totalMarks: 10 });

      // A separate, later operation voids an unrelated wrong answer.
      const afterVoid = applyResultAdjustment(
        afterAward,
        { type: 'VOID_QUESTION', targetExamQuestionId: 'q-wrong-0' },
        marking,
        [], // no earlier COMPLETED VOID_QUESTION operation yet
      );

      // Raw-minus-voided baseline is 9/9 (7 correct + the voided wrong
      // answer's 0 marks removed from the denominator); the +2 award must
      // still be reflected on top of it, clamped to the new total.
      expect(afterVoid.totalMarks).toBe(9);
      expect(afterVoid.earnedMarks).toBe(9); // 7 + 2, clamped to 9
      expect(afterVoid.percentage).toBe(100);
    });

    it('preserves an earlier DEDUCT_MARK penalty across a later void', () => {
      const afterDeduct = applyResultAdjustment(
        original,
        { type: 'DEDUCT_MARK', markDelta: 3 },
        marking,
      );
      expect(afterDeduct).toMatchObject({ earnedMarks: 4, totalMarks: 10 });

      const afterVoid = applyResultAdjustment(
        afterDeduct,
        { type: 'VOID_QUESTION', targetExamQuestionId: 'q-wrong-0' },
        marking,
        [],
      );

      expect(afterVoid.totalMarks).toBe(9);
      expect(afterVoid.earnedMarks).toBe(4); // 7 - 3, unaffected by the void
    });

    it('preserves an earlier MANUAL_OVERRIDE across a later void', () => {
      const afterOverride = applyResultAdjustment(
        original,
        { type: 'MANUAL_OVERRIDE', overrideEarnedMarks: 9 },
        marking,
      );
      expect(afterOverride.earnedMarks).toBe(9);

      const afterVoid = applyResultAdjustment(
        afterOverride,
        { type: 'VOID_QUESTION', targetExamQuestionId: 'q-wrong-0' },
        marking,
        [],
      );

      // The override set a +2-over-raw delta (9 vs. the raw 7); that delta
      // rides forward onto the reduced 9-mark total.
      expect(afterVoid.totalMarks).toBe(9);
      expect(afterVoid.earnedMarks).toBe(9);
    });

    it('preserves a delta across TWO successive VOID_QUESTION adjustments', () => {
      const first = applyResultAdjustment(
        original,
        { type: 'VOID_QUESTION', targetExamQuestionId: 'q-wrong-0' },
        marking,
      );
      const afterAward = applyResultAdjustment(
        first,
        { type: 'AWARD_MARK', markDelta: 1 },
        marking,
      );
      expect(afterAward).toMatchObject({ earnedMarks: 8, totalMarks: 9 });

      const second = applyResultAdjustment(
        afterAward,
        { type: 'VOID_QUESTION', targetExamQuestionId: 'q-wrong-1' },
        marking,
        ['q-wrong-0'],
      );

      // Raw-minus-both-voids baseline is 7/8; the +1 award rides forward.
      expect(second.totalMarks).toBe(8);
      expect(second.earnedMarks).toBe(8);
    });

    it('still clamps a preserved delta to the newly-reduced total', () => {
      const afterAward = applyResultAdjustment(
        original,
        { type: 'AWARD_MARK', markDelta: 3 },
        marking,
      );
      expect(afterAward).toMatchObject({ earnedMarks: 10, totalMarks: 10 });

      // Voiding a CORRECT answer shrinks the total to 9 with a 6-mark raw
      // baseline; a naive "+3" would overshoot the new total.
      const afterVoid = applyResultAdjustment(
        afterAward,
        { type: 'VOID_QUESTION', targetExamQuestionId: 'q-correct-0' },
        marking,
        [],
      );

      expect(afterVoid.totalMarks).toBe(9);
      expect(afterVoid.earnedMarks).toBe(9); // 6 + 3, clamped to the new total of 9
    });

    it('RECALCULATE remains a deliberate reset — it does NOT preserve a prior delta', () => {
      // Confirms the fix above is scoped to VOID_QUESTION only: RECALCULATE
      // is still the "repair path" that resets to ground truth, per its own
      // existing contract.
      const afterAward = applyResultAdjustment(
        original,
        { type: 'AWARD_MARK', markDelta: 2 },
        marking,
      );
      const recalculated = applyResultAdjustment(afterAward, { type: 'RECALCULATE' }, marking);
      expect(recalculated).toEqual(original);
    });
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
