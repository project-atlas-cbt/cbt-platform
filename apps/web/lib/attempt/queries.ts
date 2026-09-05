'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';
import { reconcileAttemptOnLoad } from './resume';

/**
 * F13 — the read-side data layer for `attempt.v1` (B13/B14). Sibling to
 * `lib/exams/`/`lib/exam-control/`, mirroring the backend's own module split
 * (`apps/api/src/modules/execution/`). Query keys root at `['attempt', ...]`.
 */

export function useActiveAssessment() {
  return useQuery({
    queryKey: ['attempt', 'active-assessment'],
    queryFn: () => unwrap(apiClient.GET('/student/assessment')),
  });
}

export function useAssessmentPreview(examId: string | undefined) {
  return useQuery({
    queryKey: ['attempt', 'preview', examId],
    queryFn: () =>
      unwrap(
        apiClient.GET('/student/assessment/{examId}/preview', {
          params: { path: { examId: examId as string } },
        }),
      ),
    enabled: Boolean(examId),
  });
}

/**
 * The single entry point for the exam runtime — wraps `resume.ts`'s
 * `reconcileAttemptOnLoad`, which always re-fetches `GET /attempts/:id`
 * first (server state is the entry point, never local Dexie alone) and
 * reconciles local answer/media state against it. Covers first entry,
 * browser refresh, and crash-reopen with one code path (DoD 6, 9, 10, 11).
 * `refetch()` is called again by `exam-runtime.tsx` whenever the sync
 * engine reports the attempt is no longer writable (submitted elsewhere,
 * invalidated) or after a forced tab takeover.
 */
export function useReconciledAttempt(attemptId: string | undefined) {
  return useQuery({
    queryKey: ['attempt', 'reconcile', attemptId],
    queryFn: () => reconcileAttemptOnLoad(attemptId as string),
    enabled: Boolean(attemptId),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** `GET /attempts/:id/status` — post-submission live-aggregated marking
 * status (B14). Polls at `refetchIntervalMs` only while the last-known
 * marking status is still `PENDING`; a `COMPLETE`/`NOT_APPLICABLE` result
 * stops polling automatically. */
export function useAttemptStatus(
  attemptId: string | undefined,
  options?: { refetchIntervalMs?: number },
) {
  return useQuery({
    queryKey: ['attempt', 'status', attemptId],
    queryFn: () =>
      unwrap(
        apiClient.GET('/attempts/{id}/status', { params: { path: { id: attemptId as string } } }),
      ),
    enabled: Boolean(attemptId),
    refetchInterval: (query) =>
      query.state.data?.marking.status === 'PENDING'
        ? (options?.refetchIntervalMs ?? 5_000)
        : false,
  });
}
