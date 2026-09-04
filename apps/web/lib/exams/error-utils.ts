import type { ApiComponents } from '@atlas/contracts';
import { ApiError } from '@/lib/api';

export type ExamReadinessCheck = ApiComponents['schemas']['ExamReadinessCheckItemDto'];

/**
 * F11 — mirrors `describeAcademicsError`/`describeReviewError`'s dispatch-
 * on-`error.code` pattern. Every exam-specific code below carries a
 * server-authored message already suitable to show directly (none need a
 * structured breakdown the way `ACADEMIC_STRUCTURE_HAS_DEPENDENTS` does) —
 * this exists mainly so call sites have one place to fall back through,
 * matching the established convention, not because any code needs bespoke
 * copy today.
 */
export function describeExamError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

/** Class/subject/term-agreement errors (ADR-0013), surfaced inline near the
 * Details step's Subject/Class fields rather than as a generic banner. */
const CLASS_MISMATCH_CODES = new Set([
  'EXAM_OUT_OF_SCOPE',
  'EXAM_REQUIRES_TEACHER_PROFILE',
  'EXAM_CLASS_SUBJECT_NOT_OFFERED',
  'EXAM_CLASS_SESSION_MISMATCH',
  'EXAM_CLASS_LEVEL_MISMATCH',
  'EXAM_TERM_SESSION_MISMATCH',
]);

export function isClassMismatchError(error: unknown): boolean {
  return error instanceof ApiError && CLASS_MISMATCH_CODES.has(error.code);
}

/** Same check, against a bare error *code* string — for a call site that
 * only retained `error.code` (e.g. after storing it in local state
 * alongside a separately-rendered message), not the original `ApiError`
 * instance. */
export function isClassMismatchErrorCode(code: string | null | undefined): boolean {
  return Boolean(code) && CLASS_MISMATCH_CODES.has(code as string);
}

/** Question-selection-time errors, surfaced inline on the Questions step's
 * save action. */
const QUESTION_SELECTION_ERROR_CODES = new Set([
  'EXAM_REVISION_NOT_APPROVED',
  'EXAM_QUESTION_OUT_OF_SCOPE',
  'EXAM_MARKS_INVALID',
]);

export function isQuestionSelectionError(error: unknown): boolean {
  return error instanceof ApiError && QUESTION_SELECTION_ERROR_CODES.has(error.code);
}

export function isExamNotDraftError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'EXAM_NOT_DRAFT';
}

/**
 * `POST /exams/:id/ready`'s `409 EXAM_NOT_READY` carries the full itemised
 * checklist in `error.details.checks` — this is what lets a failed "Save as
 * Ready" attempt repaint `ReadinessChecklist` immediately, without a second
 * `GET /readiness` round trip.
 */
export function readinessChecksFromError(error: unknown): ExamReadinessCheck[] | undefined {
  if (!(error instanceof ApiError) || error.code !== 'EXAM_NOT_READY') return undefined;
  const checks = error.details?.checks;
  return Array.isArray(checks) ? (checks as ExamReadinessCheck[]) : undefined;
}
