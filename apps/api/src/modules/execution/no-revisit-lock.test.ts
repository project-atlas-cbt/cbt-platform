import { describe, expect, it } from 'vitest';
import { furthestAnsweredRank, isQuestionLocked } from './no-revisit-lock.js';

describe('no-revisit lock (bug audit P1-6)', () => {
  const order = new Map([
    ['q1', 0],
    ['q2', 1],
    ['q3', 2],
  ]);

  it('takes the furthest answered question in attempt order', () => {
    expect(furthestAnsweredRank([], order)).toBe(-1);
    expect(furthestAnsweredRank(['q3', 'q1'], order)).toBe(2);
    expect(furthestAnsweredRank(['unknown'], order)).toBe(-1);
  });

  it('never locks the furthest question or anything after it', () => {
    expect(isQuestionLocked({ rank: 2, furthestRank: 2, alreadyAnswered: true })).toBe(false);
    expect(isQuestionLocked({ rank: 3, furthestRank: 2, alreadyAnswered: false })).toBe(false);
  });

  it('locks every earlier question by default, skipped ones included', () => {
    expect(isQuestionLocked({ rank: 0, furthestRank: 2, alreadyAnswered: true })).toBe(true);
    expect(isQuestionLocked({ rank: 1, furthestRank: 2, alreadyAnswered: false })).toBe(true);
  });

  it('ANSWERED_ONLY leaves a skipped earlier question open', () => {
    expect(
      isQuestionLocked({ rank: 1, furthestRank: 2, alreadyAnswered: false, mode: 'ANSWERED_ONLY' }),
    ).toBe(false);
    expect(
      isQuestionLocked({ rank: 1, furthestRank: 2, alreadyAnswered: true, mode: 'ANSWERED_ONLY' }),
    ).toBe(true);
  });
});
