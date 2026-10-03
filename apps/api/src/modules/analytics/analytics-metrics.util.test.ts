import { describe, expect, it } from 'vitest';
import {
  distribution,
  frozenPassRate,
  frozenPassRateFromCounts,
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

  it('computes the same pass rate from database grade counts as from rows (B21)', () => {
    const versions = ['v1', 'v2', 'v3', null];
    const grades = ['A', 'B', 'C', 'F', null];
    const bands = [
      { versionId: 'v1', label: 'A' },
      { versionId: 'v1', label: 'B' },
      { versionId: 'v2', label: 'C' },
    ];
    let seed = 7;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let trial = 0; trial < 200; trial++) {
      const rows = Array.from({ length: next(40) }, () => ({
        percentage: next(101),
        grade: grades[next(grades.length)]!,
        gradingScaleVersionId: versions[next(versions.length)]!,
      }));
      const counts = new Map<
        string,
        { gradingScaleVersionId: string | null; grade: string | null; count: number }
      >();
      for (const row of rows) {
        const key = `${row.gradingScaleVersionId}:${row.grade}`;
        const entry = counts.get(key) ?? {
          gradingScaleVersionId: row.gradingScaleVersionId,
          grade: row.grade,
          count: 0,
        };
        entry.count += 1;
        counts.set(key, entry);
      }
      const usedBands = trial % 5 === 0 ? [] : bands;
      expect(frozenPassRateFromCounts([...counts.values()], usedBands)).toBe(
        frozenPassRate(rows, usedBands),
      );
    }
  });
});
