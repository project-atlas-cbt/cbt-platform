import { describe, expect, it } from 'vitest';
import { rollUpParticipation } from './participation.js';

describe('rollUpParticipation', () => {
  it('prefers an attended makeup over an earlier absence', () => {
    expect(
      rollUpParticipation([
        { status: 'ABSENT', hasNonInvalidatedAttempt: false },
        { status: 'ATTENDED', hasNonInvalidatedAttempt: true },
      ]),
    ).toBe('ATTENDED');
  });

  it('does not treat an invalidated attempt as attendance', () => {
    expect(
      rollUpParticipation([
        { status: 'ABSENT', hasNonInvalidatedAttempt: false },
        { status: 'ATTENDED', hasNonInvalidatedAttempt: false },
      ]),
    ).toBe('ABSENT');
  });

  it('keeps unrecorded participation pending', () => {
    expect(rollUpParticipation([{ status: null, hasNonInvalidatedAttempt: false }])).toBe(
      'PENDING',
    );
  });
});
