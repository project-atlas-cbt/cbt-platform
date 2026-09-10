/**
 * ADR-0010 + ADR-0025's shared visibility/state rules, in exactly one place.
 *
 * Both ADRs call for this explicitly and for the same reason: ADR-0010's
 * student-visibility rule is a conjunction of three independent conditions,
 * and ADR-0025 warns that "every analytics query must go through the shared
 * filter; a direct query bypassing it is a defect." Re-implementing either
 * rule per query is how one of them eventually gets forgotten in one place —
 * which, for result visibility, means a student seeing a result they must
 * not see.
 *
 * `apps/api`'s `result-visibility.util.ts` wraps these into Prisma `where`
 * fragments so the same rules constrain the database query itself, not only
 * a post-fetch filter. B17 consumes `NON_VOIDED_RESULT_STATES` for its
 * aggregates rather than re-deriving the exclusion.
 */

export const RESULT_STATES = ['PROCESSING', 'FINAL', 'ADJUSTED', 'VOIDED'] as const;
export type ResultState = (typeof RESULT_STATES)[number];

/**
 * ADR-0025: a VOIDED result is retained in full but excluded from EVERY
 * aggregate. `PROCESSING` is excluded too — it is a result whose marking has
 * not finished, so including it would count a partial score as a real one.
 */
export const NON_VOIDED_RESULT_STATES: readonly ResultState[] = [
  'PROCESSING',
  'FINAL',
  'ADJUSTED',
] as const;

/** The states that carry a complete, countable score. */
export const AGGREGATABLE_RESULT_STATES: readonly ResultState[] = ['FINAL', 'ADJUSTED'] as const;

/** ADR-0010: "Student visibility = Result.state ∈ {FINAL, ADJUSTED}". */
export const STUDENT_VISIBLE_RESULT_STATES: readonly ResultState[] = ['FINAL', 'ADJUSTED'] as const;

export interface StudentResultVisibilityInput {
  state: ResultState;
  withheld: boolean;
  /** Whether the exam's `ResultPublication` row exists and is `PUBLISHED`. */
  examPublished: boolean;
  /**
   * ADR-0025's "no partially-regraded cohort is ever visible" hold. Confirmed
   * during B15 planning as a marker rather than an auto-unpublish, so the
   * exam's publication state survives an adjustment untouched.
   */
  adjustmentInProgress: boolean;
}

export type StudentResultVisibilityReason =
  'VISIBLE' | 'NOT_FINALIZED' | 'VOIDED' | 'NOT_PUBLISHED' | 'WITHHELD' | 'UNDER_ADJUSTMENT';

/**
 * The single authority for "may this student see this result?". Returns a
 * reason rather than a bare boolean so callers can distinguish a genuine
 * 404 from a deliberate hold when logging or explaining — while still never
 * disclosing the distinction to the student, who always sees the same
 * not-available response.
 */
export function resolveStudentResultVisibility(
  input: StudentResultVisibilityInput,
): StudentResultVisibilityReason {
  if (input.state === 'VOIDED') return 'VOIDED';
  if (!STUDENT_VISIBLE_RESULT_STATES.includes(input.state)) return 'NOT_FINALIZED';
  if (input.adjustmentInProgress) return 'UNDER_ADJUSTMENT';
  if (!input.examPublished) return 'NOT_PUBLISHED';
  if (input.withheld) return 'WITHHELD';
  return 'VISIBLE';
}

export function isResultVisibleToStudent(input: StudentResultVisibilityInput): boolean {
  return resolveStudentResultVisibility(input) === 'VISIBLE';
}
