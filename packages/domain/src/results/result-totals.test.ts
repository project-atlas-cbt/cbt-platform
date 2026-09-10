import { describe, expect, it } from 'vitest';
import {
  computePercentage,
  computeResultTotals,
  type ResultQuestionMarking,
} from './result-totals.js';

const q = (
  examQuestionId: string,
  correctness: ResultQuestionMarking['correctness'],
  awardedMarks: number,
  maximumMarks: number,
): ResultQuestionMarking => ({ examQuestionId, correctness, awardedMarks, maximumMarks });

describe('computePercentage', () => {
  it.each([
    [43, 50, 86],
    [0, 50, 0],
    [50, 50, 100],
    [1, 3, 33.33],
    [2, 3, 66.67],
    [7, 9, 77.78],
  ])('%i/%i is %s%%', (earned, total, expected) => {
    expect(computePercentage(earned, total)).toBe(expected);
  });

  it('returns 0 rather than NaN when the paper carries no marks at all', () => {
    // Reachable for real: an exam whose every question was voided by
    // adjustment has a total of 0, and a NaN percentage would poison every
    // aggregate downstream of it.
    expect(computePercentage(0, 0)).toBe(0);
    expect(computePercentage(5, 0)).toBe(0);
  });
});

describe('computeResultTotals', () => {
  it('sums marks and counts each correctness class (03 §46 worked example)', () => {
    const rows = [
      ...Array.from({ length: 43 }, (_, i) => q(`c${i}`, 'CORRECT', 1, 1)),
      ...Array.from({ length: 7 }, (_, i) => q(`w${i}`, 'INCORRECT', 0, 1)),
    ];

    expect(computeResultTotals(rows)).toEqual({
      totalMarks: 50,
      earnedMarks: 43,
      percentage: 86,
      correctCount: 43,
      incorrectCount: 7,
      unansweredCount: 0,
      partialCount: 0,
    });
  });

  it('counts unanswered separately from incorrect (07 §42 invariant 9)', () => {
    // Absence is not a score: an unanswered question earns 0 but must never
    // be reported as a wrong answer.
    const totals = computeResultTotals([
      q('a', 'CORRECT', 2, 2),
      q('b', 'INCORRECT', 0, 2),
      q('c', 'UNANSWERED', 0, 2),
    ]);

    expect(totals.incorrectCount).toBe(1);
    expect(totals.unansweredCount).toBe(1);
    expect(totals.earnedMarks).toBe(2);
    expect(totals.totalMarks).toBe(6);
  });

  it('respects per-question weighting rather than counting questions', () => {
    const totals = computeResultTotals([q('a', 'CORRECT', 5, 5), q('b', 'INCORRECT', 0, 15)]);

    expect(totals.totalMarks).toBe(20);
    expect(totals.earnedMarks).toBe(5);
    expect(totals.percentage).toBe(25);
  });

  it('carries PARTIAL through without folding it into another count', () => {
    const totals = computeResultTotals([q('a', 'PARTIAL', 1, 2)]);

    expect(totals.partialCount).toBe(1);
    expect(totals.correctCount).toBe(0);
    expect(totals.incorrectCount).toBe(0);
    expect(totals.earnedMarks).toBe(1);
  });

  it('returns an all-zero result for no marking rows', () => {
    expect(computeResultTotals([])).toEqual({
      totalMarks: 0,
      earnedMarks: 0,
      percentage: 0,
      correctCount: 0,
      incorrectCount: 0,
      unansweredCount: 0,
      partialCount: 0,
    });
  });
});
