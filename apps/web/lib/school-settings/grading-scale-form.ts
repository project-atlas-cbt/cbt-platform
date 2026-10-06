import {
  CLASS_LEVELS,
  validateGradingBands,
  type ClassLevel,
  type GradingBand,
} from '@atlas/domain';

/**
 * Form-side helpers for the grading scale editor (Settings → Results,
 * ADR-0018). The table edits strings — a half-typed "89." must survive a
 * re-render — so parsing to numbers, and every rule the server enforces,
 * happen here before a save is offered. The band rules themselves are
 * `validateGradingBands` from `@atlas/domain`, the same function the API
 * runs, so the form can never accept what the server will reject.
 */

/** `GradingScaleBandDto`'s `@MaxLength(16)`. */
export const GRADE_LABEL_MAX_LENGTH = 16;
/** `PutGradingScaleDto.name`'s `@MaxLength(120)`. */
export const SCALE_NAME_MAX_LENGTH = 120;

export interface BandDraft {
  /** Client-only row key; never sent. */
  key: string;
  label: string;
  minPercentage: string;
  maxPercentage: string;
  isPassing: boolean;
}

let nextKey = 0;
function newKey(): string {
  nextKey += 1;
  return `band-${nextKey}`;
}

export function toBandDrafts(bands: readonly GradingBand[]): BandDraft[] {
  return bands.map((band) => ({
    key: newKey(),
    label: band.label,
    minPercentage: String(band.minPercentage),
    maxPercentage: String(band.maxPercentage),
    isPassing: band.isPassing,
  }));
}

export function emptyBandDraft(): BandDraft {
  return { key: newKey(), label: '', minPercentage: '', maxPercentage: '', isPassing: false };
}

/** Comparable form of a draft, ignoring row keys and surrounding spaces —
 * what the dirty check compares. */
export function draftSignature(name: string, rows: readonly BandDraft[]): string {
  return JSON.stringify([
    name.trim(),
    rows.map((r) => [r.label.trim(), r.minPercentage.trim(), r.maxPercentage.trim(), r.isPassing]),
  ]);
}

/** Up to two decimal places — the stored precision (`Decimal(5,2)`). */
const PERCENTAGE_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

function parsePercentage(raw: string): number | null {
  const value = raw.trim();
  if (!PERCENTAGE_PATTERN.test(value)) return null;
  return Number(value);
}

export type ParseResult = { ok: true; bands: GradingBand[] } | { ok: false; issues: string[] };

/**
 * Field-level checks first (each row needs a label and two numbers); only
 * when every row parses are the band rules run, so an empty cell is never
 * reported as a confusing "gap" or "overlap".
 */
export function parseBandDrafts(name: string, rows: readonly BandDraft[]): ParseResult {
  const issues: string[] = [];

  if (name.trim() === '') issues.push('Give the grading scale a name.');
  else if (name.trim().length > SCALE_NAME_MAX_LENGTH) {
    issues.push(`The scale name can be at most ${SCALE_NAME_MAX_LENGTH} characters.`);
  }

  if (rows.length === 0) {
    issues.push('Add at least one grade.');
    return { ok: false, issues };
  }

  const bands: GradingBand[] = [];
  rows.forEach((row, index) => {
    const rowName = row.label.trim() === '' ? `Row ${index + 1}` : `Grade "${row.label.trim()}"`;
    const label = row.label.trim();
    if (label === '') issues.push(`Row ${index + 1} needs a grade label.`);
    else if (label.length > GRADE_LABEL_MAX_LENGTH) {
      issues.push(`${rowName}: a grade label can be at most ${GRADE_LABEL_MAX_LENGTH} characters.`);
    }
    const min = parsePercentage(row.minPercentage);
    const max = parsePercentage(row.maxPercentage);
    if (min === null) {
      issues.push(`${rowName}: "From" must be a number from 0 to 100, with up to two decimals.`);
    }
    if (max === null) {
      issues.push(`${rowName}: "To" must be a number from 0 to 100, with up to two decimals.`);
    }
    if (min !== null && max !== null) {
      bands.push({ label, minPercentage: min, maxPercentage: max, isPassing: row.isPassing });
    }
  });

  if (issues.length > 0) return { ok: false, issues };

  const bandIssues = validateGradingBands(bands);
  if (bandIssues.length > 0) return { ok: false, issues: bandIssues.map((i) => i.message) };

  return { ok: true, bands };
}

/** "A 90–100 · B 80–89.99 · …" for the version history. */
export function summariseBands(bands: readonly GradingBand[]): string {
  return bands.map((b) => `${b.label} ${b.minPercentage}–${b.maxPercentage}`).join(' · ');
}

/**
 * Class levels whose results would be finalised Ungraded today: those with
 * no own scale when the school-wide scale is missing too. Grades are fixed
 * at finalisation (ADR-0018), so this is what the dashboard warns about.
 */
export function levelsWithoutGradingScale(
  scales: readonly { level: ClassLevel | null; currentVersion: unknown }[],
): ClassLevel[] {
  const covered = (level: ClassLevel | null) =>
    scales.some((s) => s.level === level && s.currentVersion !== null);
  if (covered(null)) return [];
  return CLASS_LEVELS.filter((level) => !covered(level));
}
