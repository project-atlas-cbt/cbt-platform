import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';

/**
 * F10 — mirrors `describeAcademicsError`'s pattern (`components/academics/
 * error-utils.tsx`): a decision endpoint's specific error codes get
 * explanatory copy; anything else falls back to the server's own message,
 * then a generic string for a non-`ApiError` throw.
 *
 * `QUESTION_SELF_REVIEW_FORBIDDEN` is surfaced with product-facing copy
 * (DoD item 10: "UI explains why") — detected reactively, only once a
 * decision is actually attempted, since `/auth/me` carries no
 * `teacherProfileId` a workspace screen could compare proactively (recorded
 * as Candidate/Deferred in the F10 roadmap notes).
 */
export const SELF_REVIEW_FORBIDDEN_MESSAGE =
  'You authored this question yourself. As HOD you cannot review your own submissions — ask another HOD in this department, or reassign department oversight.';

export function describeReviewError(error: unknown): ReactNode {
  if (error instanceof ApiError && error.code === 'QUESTION_SELF_REVIEW_FORBIDDEN') {
    return SELF_REVIEW_FORBIDDEN_MESSAGE;
  }
  if (error instanceof ApiError && error.code === 'QUESTION_REVISION_NOT_SUBMITTED') {
    return 'This question was already decided — likely by another HOD, or its own resubmission — since you opened it. Refresh to see its current state.';
  }
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

/** Whether a caught error is specifically the self-review block — used to
 * switch the decision panel itself into a permanent explanatory state,
 * rather than just showing an inline error the HOD could retry against. */
export function isSelfReviewForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'QUESTION_SELF_REVIEW_FORBIDDEN';
}
