export interface FrozenResultMetric {
  percentage: number;
  grade: string | null;
  gradingScaleVersionId: string | null;
}

export interface PassingBand {
  versionId: string;
  label: string;
}

export const round = (value: number): number => Math.round(value * 100) / 100;

export function rate(value: number, total: number): number {
  return total === 0 ? 0 : round((value / total) * 100);
}

export function distribution(values: number[]) {
  return Array.from({ length: 10 }, (_, index) => {
    const count = values.filter(
      (value) => value >= index * 10 && (index === 9 ? value <= 100 : value < index * 10 + 10),
    ).length;
    return {
      lowerBound: index * 10,
      upperBound: index === 9 ? 100 : index * 10 + 9.99,
      count,
      percentage: values.length ? rate(count, values.length) : null,
    };
  });
}

export function summarizePercentages(values: number[]) {
  return {
    resultCount: values.length,
    averagePercentage: values.length
      ? round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null,
    highestPercentage: values.length ? Math.max(...values) : null,
    lowestPercentage: values.length ? Math.min(...values) : null,
  };
}

/** Results without a frozen grading scale do not imply pass or fail. */
export function frozenPassRate(
  rows: FrozenResultMetric[],
  passingBands: PassingBand[],
): number | null {
  const graded = rows.filter(
    (row): row is FrozenResultMetric & { gradingScaleVersionId: string } =>
      row.gradingScaleVersionId !== null,
  );
  if (graded.length === 0 || passingBands.length === 0) return null;
  const passing = new Set(passingBands.map((band) => `${band.versionId}:${band.label}`));
  return rate(
    graded.filter(
      (row) => row.grade !== null && passing.has(`${row.gradingScaleVersionId}:${row.grade}`),
    ).length,
    graded.length,
  );
}
