import { ApiError } from '@/lib/api';

/**
 * F12 — mirrors `describeExamError`/`describeReviewError`'s dispatch-on-
 * `error.code` pattern (`lib/exams/error-utils.ts`).
 */
export function describeExamControlError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

export function isStaleAbsenteeListError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'STALE_ABSENTEE_LIST';
}

export function isSessionsStillOpenError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'EXAM_SESSIONS_STILL_OPEN';
}

export function isNotAuthorizableError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'EXAM_SESSION_NOT_AUTHORIZABLE';
}

/** `REVOKE_AFTER_START_REFUSED` — structurally unreachable in B12 (no
 * `ExamAttempt` exists yet to have "started"), but real and tested on the
 * backend. The check exists now so B13 (which will make this reachable)
 * needs no frontend change just for this one string. */
export function isRevokeAfterStartError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'REVOKE_AFTER_START_REFUSED';
}
