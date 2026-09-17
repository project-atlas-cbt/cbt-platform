import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRADING_SCALE_TEMPLATE,
  resolveGradeBand,
  validateGradingBands,
  type GradingBand,
} from './grading-scale.js';

describe('resolveGradeBand', () => {
  it.each([
    [100, 'A'],
    [95, 'A'],
    [90, 'A'],
    [89.99, 'B'],
    [80, 'B'],
    [70, 'C'],
    [60, 'D'],
    [50, 'E'],
    [49.99, 'F'],
    [0, 'F'],
  ])('%s%% resolves to %s on the default scale', (percentage, label) => {
    expect(resolveGradeBand(DEFAULT_GRADING_SCALE_TEMPLATE, percentage)?.label).toBe(label);
  });

  it('carries isPassing from the matched band', () => {
    expect(resolveGradeBand(DEFAULT_GRADING_SCALE_TEMPLATE, 50)?.isPassing).toBe(true);
    expect(resolveGradeBand(DEFAULT_GRADING_SCALE_TEMPLATE, 49)?.isPassing).toBe(false);
  });

  it('returns null when the school has configured no scale (DoD item 9)', () => {
    // Not an error state: raw marks and percentage stay authoritative
    // regardless of grading configuration (05 §46), so an ungraded result is
    // complete and publishable — just without a letter.
    expect(resolveGradeBand([], 86)).toBeNull();
  });

  it('resolves highest-first, so touching bands match the way the table reads', () => {
    const touching: GradingBand[] = [
      { label: 'LOW', minPercentage: 0, maxPercentage: 50, isPassing: false },
      { label: 'HIGH', minPercentage: 50, maxPercentage: 100, isPassing: true },
    ];

    expect(resolveGradeBand(touching, 50)?.label).toBe('HIGH');
  });

  it('returns null for a percentage no band covers', () => {
    const partial: GradingBand[] = [
      { label: 'TOP', minPercentage: 80, maxPercentage: 100, isPassing: true },
    ];

    expect(resolveGradeBand(partial, 79)).toBeNull();
  });
});

describe('validateGradingBands', () => {
  it('accepts the platform default template', () => {
    expect(validateGradingBands(DEFAULT_GRADING_SCALE_TEMPLATE)).toEqual([]);
  });

  it('rejects an empty scale', () => {
    expect(validateGradingBands([]).map((i) => i.code)).toEqual(['EMPTY']);
  });

  it('rejects overlapping bands', () => {
    const overlapping: GradingBand[] = [
      { label: 'A', minPercentage: 50, maxPercentage: 100, isPassing: true },
      { label: 'B', minPercentage: 0, maxPercentage: 60, isPassing: false },
    ];

    expect(validateGradingBands(overlapping).map((i) => i.code)).toContain('OVERLAP');
  });

  it('rejects a gap between bands', () => {
    const gapped: GradingBand[] = [
      { label: 'A', minPercentage: 60, maxPercentage: 100, isPassing: true },
      { label: 'F', minPercentage: 0, maxPercentage: 40, isPassing: false },
    ];

    expect(validateGradingBands(gapped).map((i) => i.code)).toContain('GAP');
  });

  it('requires coverage of both 0 and 100', () => {
    const narrow: GradingBand[] = [
      { label: 'MID', minPercentage: 10, maxPercentage: 90, isPassing: true },
    ];

    expect(validateGradingBands(narrow).filter((i) => i.code === 'GAP')).toHaveLength(2);
  });

  it('rejects an inverted range and an out-of-bounds range', () => {
    const bad: GradingBand[] = [
      { label: 'X', minPercentage: 90, maxPercentage: 10, isPassing: true },
      { label: 'Y', minPercentage: 0, maxPercentage: 140, isPassing: false },
    ];

    const codes = validateGradingBands(bad).map((i) => i.code);
    expect(codes).toContain('INVERTED_RANGE');
    expect(codes).toContain('OUT_OF_BOUNDS');
  });

  it('rejects duplicate labels case-insensitively', () => {
    const dupes: GradingBand[] = [
      { label: 'a', minPercentage: 50, maxPercentage: 100, isPassing: true },
      { label: 'A', minPercentage: 0, maxPercentage: 49.99, isPassing: false },
    ];

    expect(validateGradingBands(dupes).map((i) => i.code)).toContain('DUPLICATE_LABEL');
  });
});
