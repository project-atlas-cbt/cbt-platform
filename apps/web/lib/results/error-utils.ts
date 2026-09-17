import { ApiError } from '@/lib/api';

/**
 * F14 — mirrors `describeExamError`'s single-generic-fallback shape. No
 * result-specific error code needs bespoke copy: every non-visible case
 * (unpublished, voided, withheld, mid-adjustment, or someone else's result)
 * already collapses server-side into one identical generic `NOT_FOUND`
 * message (ADR-0010's deliberate non-disclosure) — there is nothing for the
 * client to distinguish or explain further.
 */
export function describeResultError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}
