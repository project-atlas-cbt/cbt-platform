import { describe, expect, it } from 'vitest';
import { retentionCutoff } from './retention-policy.js';

describe('retentionCutoff', () => {
  it('subtracts whole policy days in UTC', () => {
    expect(retentionCutoff(new Date('2026-09-27T12:00:00.000Z'), 30).toISOString()).toBe(
      '2026-08-28T12:00:00.000Z',
    );
  });
});
