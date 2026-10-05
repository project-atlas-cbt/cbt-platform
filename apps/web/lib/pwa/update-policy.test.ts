import { describe, expect, it } from 'vitest';
import { isAttemptPath, mayActivateUpdate } from './update-policy';

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

  it('refuses while any open window is on an attempt', () => {
    expect(
      mayActivateUpdate([
        'https://kings.example.test/teacher/exams',
        'https://kings.example.test/student/exam/a1',
      ]),
    ).toBe(false);
  });

  it('allows when no window is on an attempt, including none at all', () => {
    expect(mayActivateUpdate(['https://kings.example.test/student/exam/a1/submitted'])).toBe(true);
    expect(mayActivateUpdate([])).toBe(true);
  });

  it('errs on the side of the exam for a URL it cannot read', () => {
    expect(mayActivateUpdate(['not a url'])).toBe(false);
  });
});
