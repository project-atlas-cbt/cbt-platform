'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F15 — the write-side data layer for the staff half of `results.v1`
 * (B15), modeled on `lib/exams/mutations.ts`'s `invalidateExams` helper
 * shape.
 *
 * Every mutation here invalidates and refetches rather than writing an
 * optimistic cache update. That is a deliberate reading of
 * `ui-ux-principles.md` Section 13 ("no optimistic UI for publication or
 * other sensitive operations"): what a staff member sees after publishing
 * is confirmed server state, never a local guess that might be rolled
 * back. Publication also has genuine server-side side effects this client
 * cannot model — `affectedResultCount`, withheld results that stay hidden,
 * and ADR-0025's "held unpublished while an adjustment is in progress"
 * rule — so guessing would frequently be wrong, not merely premature.
 */
function invalidateResults(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['exam-results'], exact: false }),
    client.invalidateQueries({ queryKey: ['staff-result'], exact: false }),
  ]);
}

/** `POST /exams/:id/results/publish`. `note` is optional (unlike every
 * reversal below, where a reason is mandatory). */
export function usePublishResults(examId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (note?: string) =>
      unwrap(
        apiClient.POST('/exams/{id}/results/publish', {
          params: { path: { id: examId } },
          body: note ? { note } : {},
        }),
      ),
    onSuccess: () => invalidateResults(client),
  });
}

/** `POST /exams/:id/results/unpublish` — `reason` is required by
 * `UnpublishResultsDto`, because this retracts something students have
 * already seen. */
export function useUnpublishResults(examId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        apiClient.POST('/exams/{id}/results/unpublish', {
          params: { path: { id: examId } },
          body: { reason },
        }),
      ),
    onSuccess: () => invalidateResults(client),
  });
}

/**
 * `POST /results/:id/withhold` and `POST /results/:id/release` — both take
 * the same mandatory-reason body (`WithholdResultDto`). Per-result, not
 * per-exam: this is the single-student escalation path (a pending
 * malpractice review, a disputed script), which is exactly why
 * `results.withhold` is granted to TEACHER at OWNED scope while
 * `results.adjust` is not granted to teachers at all.
 */
export function useWithholdResult(resultId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        apiClient.POST('/results/{id}/withhold', {
          params: { path: { id: resultId } },
          body: { reason },
        }),
      ),
    onSuccess: () => invalidateResults(client),
  });
}

export function useReleaseResult(resultId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        apiClient.POST('/results/{id}/release', {
          params: { path: { id: resultId } },
          body: { reason },
        }),
      ),
    onSuccess: () => invalidateResults(client),
  });
}

export interface CreateResultAdjustmentBody {
  examId: string;
  type: string;
  reason: string;
  targetExamQuestionId?: string;
  markDelta?: number;
  targetResultId?: string;
  overrideEarnedMarks?: number;
}

/**
 * `POST /results/adjustments` — returns the parent operation immediately
 * (`PENDING`), not a finished result set; the caller then follows
 * `useAdjustmentOperation`. Note what this endpoint is *not*: there is no
 * "set this student's score to X" call anywhere in `results.v1`. Even
 * `MANUAL_OVERRIDE` goes through this same audited, reason-bearing,
 * replayable operation record (DoD item 7).
 */
export function useCreateResultAdjustment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateResultAdjustmentBody) =>
      unwrap(apiClient.POST('/results/adjustments', { body })),
    onSuccess: () => invalidateResults(client),
  });
}
