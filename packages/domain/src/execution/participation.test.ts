import { describe, expect, it } from 'vitest';
import { classifyAttemptParticipation } from './participation.js';

describe('classifyAttemptParticipation', () => {
  it('keeps absence separate from attempt execution state', () => {
    expect(
      classifyAttemptParticipation({ participationStatus: 'ABSENT', attemptState: null }),
    ).toBe('ABSENT');
  });

  it('derives incomplete without inventing an AttemptState', () => {
    expect(
      classifyAttemptParticipation({
        participationStatus: 'ATTENDED',
        attemptState: 'CANCELLED',
      }),
    ).toBe('INCOMPLETE');
  });

  it('gives terminal completion precedence after a later sitting', () => {
    expect(
      classifyAttemptParticipation({
        participationStatus: 'COMPLETED',
        attemptState: 'AUTO_SUBMITTED',
      }),
    ).toBe('COMPLETED');
  });

  it('keeps invalidation explicit', () => {
    expect(
      classifyAttemptParticipation({
        participationStatus: 'ATTENDED',
        attemptState: 'INVALIDATED',
      }),
    ).toBe('INVALIDATED');
  });
});
