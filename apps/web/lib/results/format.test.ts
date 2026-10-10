import { describe, expect, it } from 'vitest';
import { formatResultPercentage } from './format';

describe('formatResultPercentage', () => {
  it('shows whole numbers without a decimal', () => {
    expect(formatResultPercentage(86)).toBe('86%');
  });

  it('never rounds up across a grade boundary (P2-16)', () => {
    expect(formatResultPercentage(89.95)).toBe('89.9%');
    expect(formatResultPercentage(49.95)).toBe('49.9%');
    expect(formatResultPercentage(77.78)).toBe('77.7%');
  });

  it('keeps exact one-decimal values despite floating point', () => {
    expect(formatResultPercentage(57.1)).toBe('57.1%');
    expect(formatResultPercentage(4.1)).toBe('4.1%');
  });
});
