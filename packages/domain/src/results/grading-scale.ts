/**
 * ADR-0018 — grading scale bands and grade resolution (resolving audit M-06,
 * a gap `07` leaves entirely: there is no GradingScale anywhere in the ERD).
 *
 * Pure and DB-free. The one rule this file exists to protect: a grade is
 * resolved ONCE, at result finalisation, against a specific frozen scale
 * version — never recomputed on read. ADR-0018 is explicit about this
 * ("always show the stored grade; recomputation is an explicit, separate
 * action if ever needed"), because computing on read would silently rewrite
 * every historical grade the moment a school edits its scale, violating
 * 07 §42 invariant 13.
 */

export interface GradingBand {
  label: string;
  /** Inclusive lower bound, 0-100. */
  minPercentage: number;
  /** Inclusive upper bound, 0-100. */
  maxPercentage: number;
  isPassing: boolean;
}

export interface ResolvedGrade {
  label: string;
  isPassing: boolean;
}

/**
 * 05 §46's sample configuration, offered at onboarding as a STARTING POINT
 * and freely editable — never enforced, and deliberately not hard-coded as
 * "the Nigerian grading system" anywhere a school cannot change it, which
 * that section calls out by name.
 *
 * `isPassing` has no source in any specification: "pass rate" is a required
 * analytics metric (05 §55.1, 01 §44) with no threshold defined anywhere in
 * the corpus. Confirmed with the project owner during B15 planning that the
 * pass concept rides on the band, so it derives from the same frozen version
 * that produced the grade rather than from a second, driftable source. The
 * 50% cut here matches the sample table's own E/F boundary.
 */
export const DEFAULT_GRADING_SCALE_NAME = 'Default grading scale';

export const DEFAULT_GRADING_SCALE_TEMPLATE: readonly GradingBand[] = [
  { label: 'A', minPercentage: 90, maxPercentage: 100, isPassing: true },
  { label: 'B', minPercentage: 80, maxPercentage: 89.99, isPassing: true },
  { label: 'C', minPercentage: 70, maxPercentage: 79.99, isPassing: true },
  { label: 'D', minPercentage: 60, maxPercentage: 69.99, isPassing: true },
  { label: 'E', minPercentage: 50, maxPercentage: 59.99, isPassing: true },
  { label: 'F', minPercentage: 0, maxPercentage: 49.99, isPassing: false },
] as const;

/**
 * Resolves the band containing `percentage`, or `null` when the school has
 * configured no scale at all — which is a fully supported state, not an
 * error: 05 §46 requires raw marks and percentage to remain available
 * regardless of grading configuration (B15 DoD item 9), so an ungraded
 * result is complete and publishable, just without a letter.
 *
 * Bounds are inclusive at both ends. Bands are matched highest-first so that
 * a scale whose ranges touch (90-100 above 80-90) resolves the way a reader
 * of the table expects rather than by declaration order.
 */
export function resolveGradeBand(
  bands: readonly GradingBand[],
  percentage: number,
): ResolvedGrade | null {
  if (bands.length === 0) return null;

  const match = [...bands]
    .sort((a, b) => b.minPercentage - a.minPercentage)
    .find((band) => percentage >= band.minPercentage && percentage <= band.maxPercentage);

  return match ? { label: match.label, isPassing: match.isPassing } : null;
}

export interface GradingBandValidationIssue {
  code: 'EMPTY' | 'INVERTED_RANGE' | 'OUT_OF_BOUNDS' | 'OVERLAP' | 'GAP' | 'DUPLICATE_LABEL';
  message: string;
}

/**
 * Validates a proposed set of bands before a new version is created. A scale
 * that overlaps or leaves a gap would make `resolveGradeBand` silently
 * ambiguous or silently null for real percentages, so this is checked at the
 * write boundary rather than discovered at finalisation time — when the
 * result is already being written and there is nowhere useful to report it.
 */
export function validateGradingBands(bands: readonly GradingBand[]): GradingBandValidationIssue[] {
  const issues: GradingBandValidationIssue[] = [];

  if (bands.length === 0) {
    return [{ code: 'EMPTY', message: 'A grading scale must define at least one band.' }];
  }

  for (const band of bands) {
    if (band.minPercentage > band.maxPercentage) {
      issues.push({
        code: 'INVERTED_RANGE',
        message: `Band "${band.label}" has a minimum (${band.minPercentage}) above its maximum (${band.maxPercentage}).`,
      });
    }
    if (band.minPercentage < 0 || band.maxPercentage > 100) {
      issues.push({
        code: 'OUT_OF_BOUNDS',
        message: `Band "${band.label}" falls outside 0-100.`,
      });
    }
  }

  const labels = new Set<string>();
  for (const band of bands) {
    const key = band.label.trim().toUpperCase();
    if (labels.has(key)) {
      issues.push({
        code: 'DUPLICATE_LABEL',
        message: `Band label "${band.label}" is used more than once.`,
      });
    }
    labels.add(key);
  }

  const ordered = [...bands].sort((a, b) => a.minPercentage - b.minPercentage);

  if (ordered[0] !== undefined && ordered[0].minPercentage > 0) {
    issues.push({
      code: 'GAP',
      message: `Bands must start at 0; the lowest starts at ${ordered[0].minPercentage}.`,
    });
  }

  const highest = ordered[ordered.length - 1];
  if (highest !== undefined && highest.maxPercentage < 100) {
    issues.push({
      code: 'GAP',
      message: `Bands must reach 100; the highest ends at ${highest.maxPercentage}.`,
    });
  }

  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    if (previous === undefined || current === undefined) continue;

    if (current.minPercentage <= previous.maxPercentage) {
      issues.push({
        code: 'OVERLAP',
        message: `Bands "${previous.label}" and "${current.label}" overlap.`,
      });
      continue;
    }

    // Bands are inclusive on both ends, so adjacency means the next band
    // starts within one representable step (0.01, the stored scale) of the
    // previous one's end. A wider distance leaves percentages ungradeable.
    if (current.minPercentage - previous.maxPercentage > 0.011) {
      issues.push({
        code: 'GAP',
        message: `No band covers percentages between ${previous.maxPercentage} and ${current.minPercentage}.`,
      });
    }
  }

  return issues;
}
