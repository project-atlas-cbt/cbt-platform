import { ApiError, NetworkError } from '@/lib/api';

/** Mirrors `describeExamControlError`/`describeExamError`'s dispatch-on-
 * `error.code` pattern (`lib/exam-control/error-utils.ts`). */
export function describeAttemptError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof NetworkError) return error.message;
  return 'Something went wrong. Please try again.';
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof NetworkError;
}

export function isNotEligibleError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'ATTEMPT_NOT_ELIGIBLE';
}

export function isNotWritableError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'ATTEMPT_NOT_WRITABLE';
}

export function isWriteWindowClosedError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'ATTEMPT_WRITE_WINDOW_CLOSED';
}

export function isSequenceStaleError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'ATTEMPT_ANSWER_SEQUENCE_STALE';
}

/** B22: the server no longer has this attempt at all — after a database
 * restore to a point before it started. The device's answers are then the
 * only copy and must be kept. */
export function isAttemptMissingError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'NOT_FOUND';
}

export function isQuestionNotInSnapshotError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'ATTEMPT_QUESTION_NOT_IN_SNAPSHOT';
}

/** ADR-0003: a write rejected for this reason must never be retried — the
 * server has already, deliberately, permanently refused it. */
export const NON_RETRYABLE_ANSWER_CODES = new Set(['ATTEMPT_WRITE_WINDOW_CLOSED']);
