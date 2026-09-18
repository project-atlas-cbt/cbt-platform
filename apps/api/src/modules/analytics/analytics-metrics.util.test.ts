import { describe, expect, it } from 'vitest';
import {
  distribution,
  frozenPassRate,
  rate,
  summarizePercentages,
} from './analytics-metrics.util.js';

describe('analytics metric helpers', () => {
  it('uses fixed inclusive/exclusive deciles and reports their percentages', () => {
    const buckets = distribution([0, 9.99, 10, 55, 100]);
    expect(buckets.map((bucket) => bucket.count)).toEqual([2, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(buckets[0]?.percentage).toBe(40);
    expect(buckets[9]).toMatchObject({ lowerBound: 90, upperBound: 100, percentage: 20 });
  });

  it('keeps empty cohorts honest and avoids division by zero', () => {
    expect(
      distribution([]).every((bucket) => bucket.count === 0 && bucket.percentage === null),
    ).toBe(true);
    expect(rate(0, 0)).toBe(0);
  });

  it('computes average and extrema without treating absence as a zero score', () => {
    expect(summarizePercentages([40, 70, 100])).toEqual({
      resultCount: 3,
      averagePercentage: 70,
      highestPercentage: 100,
      lowestPercentage: 40,
    });
    expect(summarizePercentages([])).toEqual({
      resultCount: 0,
      averagePercentage: null,
      highestPercentage: null,
      lowestPercentage: null,
    });
  });

  it("derives pass rate from each result's frozen grading-scale version only", () => {
    const rows = [
      { percentage: 80, grade: 'A', gradingScaleVersionId: 'v1' },
      { percentage: 52, grade: 'C', gradingScaleVersionId: 'v1' },
      { percentage: 70, grade: 'B', gradingScaleVersionId: 'v2' },
      { percentage: 65, grade: null, gradingScaleVersionId: null },
    ];
    expect(
      frozenPassRate(rows, [
        { versionId: 'v1', label: 'C' },
        { versionId: 'v2', label: 'A' },
      ]),
    ).toBe(33.33);
    expect(
      frozenPassRate([{ percentage: 70, grade: null, gradingScaleVersionId: null }], []),
    ).toBeNull();
  });
});
