import { describe, expect, it } from 'vitest';
import { effectiveResultSettings } from './result-policy.js';

const exam = { resultPolicy: 'AUTOMATIC', resultDetailVisibility: 'FULL_REVIEW' } as const;

describe('effectiveResultSettings', () => {
  it("uses the exam's own values while the school policy is unlocked", () => {
    expect(
      effectiveResultSettings(
        {
          resultPolicy: 'SCHOOL_ADMIN',
          resultDetailVisibility: 'SCORE_ONLY',
          resultPolicyLocked: false,
        },
        exam,
      ),
    ).toEqual(exam);
  });

  it("uses the school's values for both settings while the policy is locked", () => {
    expect(
      effectiveResultSettings(
        {
          resultPolicy: 'SCHOOL_ADMIN',
          resultDetailVisibility: 'SCORE_ONLY',
          resultPolicyLocked: true,
        },
        exam,
      ),
    ).toEqual({ resultPolicy: 'SCHOOL_ADMIN', resultDetailVisibility: 'SCORE_ONLY' });
  });
});
