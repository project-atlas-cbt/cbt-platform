import { describe, expect, it } from 'vitest';
import { MARK_FRESH_MS, anyFreshMark, isAttemptPath } from './update-policy';

describe('service-worker update policy (F21 DoD 5)', () => {
  it('treats only the running exam page as an attempt', () => {
    expect(isAttemptPath('/student/exam/0190a1b2-0000-7000-8000-000000000001')).toBe(true);
    expect(isAttemptPath('/student/exam/0190a1b2-0000-7000-8000-000000000001/')).toBe(true);
    expect(isAttemptPath('/student/exam/0190a1b2-0000-7000-8000-000000000001/submitted')).toBe(
      false,
    );
    expect(isAttemptPath('/student/assessment/abc')).toBe(false);
    expect(isAttemptPath('/teacher/exam-control/abc/students')).toBe(false);
  });

  it('a recent heartbeat mark means an exam is open; a stale one does not', () => {
    const now = 1_000_000;
    expect(anyFreshMark([now - 5_000], now)).toBe(true);
    expect(anyFreshMark([now - MARK_FRESH_MS - 1], now)).toBe(false);
    expect(anyFreshMark([Number.NaN], now)).toBe(false);
    expect(anyFreshMark([], now)).toBe(false);
  });
});
