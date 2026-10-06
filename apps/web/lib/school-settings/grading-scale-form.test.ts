import { describe, expect, it } from 'vitest';
import { DEFAULT_GRADING_SCALE_TEMPLATE } from '@atlas/domain';
import {
  draftSignature,
  emptyBandDraft,
  levelsWithoutGradingScale,
  parseBandDrafts,
  summariseBands,
  toBandDrafts,
} from './grading-scale-form';

describe('grading scale form helpers', () => {
  it('round-trips the default template', () => {
    const result = parseBandDrafts('Default', toBandDrafts(DEFAULT_GRADING_SCALE_TEMPLATE));
    expect(result).toEqual({
      ok: true,
      bands: DEFAULT_GRADING_SCALE_TEMPLATE.map((b) => ({ ...b })),
    });
  });

  it('reports empty cells as field problems, not as gaps', () => {
    const rows = [...toBandDrafts(DEFAULT_GRADING_SCALE_TEMPLATE), emptyBandDraft()];
    const result = parseBandDrafts('Default', rows);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContain('Row 7 needs a grade label.');
    expect(result.issues.some((i) => /gap|overlap|cover/i.test(i))).toBe(false);
  });

  it('rejects more than two decimal places and out-of-range text', () => {
    const rows = toBandDrafts([
      { label: 'A', minPercentage: 0, maxPercentage: 100, isPassing: true },
    ]);
    rows[0] = { ...rows[0]!, minPercentage: '0.001', maxPercentage: 'abc' };
    const result = parseBandDrafts('S', rows);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(2);
  });

  it('runs the shared band rules once every cell parses', () => {
    const rows = toBandDrafts([
      { label: 'A', minPercentage: 60, maxPercentage: 100, isPassing: true },
      { label: 'a', minPercentage: 0, maxPercentage: 40, isPassing: false },
    ]);
    const result = parseBandDrafts('S', rows);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.join(' ')).toMatch(/used more than once/);
    expect(result.issues.join(' ')).toMatch(/No band covers percentages between 40 and 60/);
  });

  it('requires a scale name', () => {
    const result = parseBandDrafts('  ', toBandDrafts(DEFAULT_GRADING_SCALE_TEMPLATE));
    expect(result).toEqual({ ok: false, issues: ['Give the grading scale a name.'] });
  });

  it('ignores row keys and surrounding spaces in the dirty signature', () => {
    const a = toBandDrafts(DEFAULT_GRADING_SCALE_TEMPLATE);
    const b = toBandDrafts(DEFAULT_GRADING_SCALE_TEMPLATE).map((r) => ({
      ...r,
      label: ` ${r.label}`,
    }));
    expect(draftSignature('X', a)).toBe(draftSignature('X ', b));
  });

  it('summarises bands for the version history', () => {
    expect(summariseBands(DEFAULT_GRADING_SCALE_TEMPLATE.slice(0, 2))).toBe(
      'A 90–100 · B 80–89.99',
    );
  });
});

describe('levelsWithoutGradingScale', () => {
  const version = { id: 'v' };

  it('is empty once a school-wide scale exists', () => {
    expect(levelsWithoutGradingScale([{ level: null, currentVersion: version }])).toEqual([]);
  });

  it('lists every level when nothing is set', () => {
    expect(levelsWithoutGradingScale([])).toEqual(['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3']);
  });

  it('leaves out levels that have their own scale', () => {
    expect(
      levelsWithoutGradingScale([
        { level: 'JSS1', currentVersion: version },
        { level: 'SS3', currentVersion: null },
      ]),
    ).toEqual(['JSS2', 'JSS3', 'SS1', 'SS2', 'SS3']);
  });
});
