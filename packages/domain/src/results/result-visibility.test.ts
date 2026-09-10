import { describe, expect, it } from 'vitest';
import {
  AGGREGATABLE_RESULT_STATES,
  NON_VOIDED_RESULT_STATES,
  isResultVisibleToStudent,
  resolveStudentResultVisibility,
  type StudentResultVisibilityInput,
} from './result-visibility.js';

const visible: StudentResultVisibilityInput = {
  state: 'FINAL',
  withheld: false,
  examPublished: true,
  adjustmentInProgress: false,
};

describe('resolveStudentResultVisibility', () => {
  it("is visible only when all of ADR-0010's conditions hold", () => {
    expect(resolveStudentResultVisibility(visible)).toBe('VISIBLE');
    expect(isResultVisibleToStudent(visible)).toBe(true);
  });

  it('keeps an ADJUSTED result visible (ADR-0010: adjusting does not unpublish)', () => {
    // The whole reason publication was split out of Result.state: an
    // ADJUSTED-and-PUBLISHED result must be representable.
    expect(resolveStudentResultVisibility({ ...visible, state: 'ADJUSTED' })).toBe('VISIBLE');
  });

  it.each([
    ['PROCESSING' as const, 'NOT_FINALIZED'],
    ['VOIDED' as const, 'VOIDED'],
  ])('hides a %s result', (state, reason) => {
    expect(resolveStudentResultVisibility({ ...visible, state })).toBe(reason);
  });

  it('hides an unpublished result', () => {
    expect(resolveStudentResultVisibility({ ...visible, examPublished: false })).toBe(
      'NOT_PUBLISHED',
    );
  });

  it('hides a withheld result even when the exam is published (ADR-0010)', () => {
    expect(resolveStudentResultVisibility({ ...visible, withheld: true })).toBe('WITHHELD');
  });

  it('hides every result while a bulk adjustment is in flight (ADR-0025)', () => {
    // "No partially-regraded cohort is ever visible" — the marker hides the
    // cohort without disturbing the exam's publication state.
    expect(resolveStudentResultVisibility({ ...visible, adjustmentInProgress: true })).toBe(
      'UNDER_ADJUSTMENT',
    );
  });

  it('reports VOIDED ahead of any other reason', () => {
    // A voided result is excluded on its own terms, whatever else is true of
    // it — the caller must never be told "not published" about a result that
    // is actually void.
    expect(
      resolveStudentResultVisibility({
        state: 'VOIDED',
        withheld: true,
        examPublished: false,
        adjustmentInProgress: true,
      }),
    ).toBe('VOIDED');
  });
});

describe('shared result-state filters (ADR-0025)', () => {
  it('excludes VOIDED from both aggregate filters', () => {
    expect(NON_VOIDED_RESULT_STATES).not.toContain('VOIDED');
    expect(AGGREGATABLE_RESULT_STATES).not.toContain('VOIDED');
  });

  it('excludes PROCESSING from aggregates but keeps it in the non-voided set', () => {
    // A result still being marked has no complete score to average, but it
    // is emphatically not void — B19 detects it as a pending result.
    expect(AGGREGATABLE_RESULT_STATES).not.toContain('PROCESSING');
    expect(NON_VOIDED_RESULT_STATES).toContain('PROCESSING');
  });
});
