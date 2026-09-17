'use client';

import { useQuery } from '@tanstack/react-query';
import type { ResultState } from '@atlas/domain';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F15 — the read-side data layer for the *staff* half of `results.v1`
 * (B15). Modeled on `lib/exams/queries.ts`'s `unwrap(apiClient.GET(...))`
 * + caller-owned-filters shape. Deliberately a separate module from
 * `lib/results/queries.ts` (F14), which stays the student-only,
 * self-scoped surface and is left untouched: nothing here can be reached
 * from a student session, and nothing there can name another student.
 */

export type ExamResultSortBy = 'studentName' | 'percentage' | 'earnedMarks' | 'finalizedAt';

export interface ExamResultsFilters {
  page: number;
  pageSize: number;
  q?: string;
  classId?: string;
  /** `RESULT_STATES` from `@atlas/domain`, not a free string: the API
   *  validates this with `IsIn(RESULT_STATES)` and 400s anything else. */
  state?: ResultState;
  sortBy?: ExamResultSortBy;
  sortDir?: 'asc' | 'desc';
}

/**
 * `GET /exams/:id/results` — server-side filter/sort/pagination throughout
 * (doctrine Section 7: anything that can reach real-school scale). The
 * caller owns the filter object and holds it in the URL (F3 precedent), so
 * a staff member can share or reload an exact view of a results screen.
 *
 * Row visibility is entirely the server's business: `result-scope.util.ts`
 * narrows TEACHER to OWNED and HOD to DEPARTMENT before anything is
 * returned. This module never sends a scope hint and never filters rows
 * client-side — there is no client-side scope decision to get wrong.
 */
export function useExamResults(examId: string | undefined, filters: ExamResultsFilters) {
  return useQuery({
    queryKey: ['exam-results', examId, filters],
    queryFn: () =>
      unwrap(
        apiClient.GET('/exams/{id}/results', {
          params: { path: { id: examId as string }, query: filters },
        }),
      ),
    enabled: Boolean(examId),
  });
}

/** `GET /results/:id` — `ResultDetailResponseDto`, i.e. the list row plus
 * the question breakdown and the full adjustment history. */
export function useStaffResult(resultId: string | undefined) {
  return useQuery({
    queryKey: ['staff-result', resultId],
    queryFn: () =>
      unwrap(apiClient.GET('/results/{id}', { params: { path: { id: resultId as string } } })),
    enabled: Boolean(resultId),
  });
}

/**
 * `GET /results/adjustments/:id` — the parent operation of ADR-0025's
 * "parent op + per-result children, idempotent and resumable" bulk
 * adjustment model.
 *
 * Polls only while the operation is genuinely still running and stops dead
 * on either terminal status, rather than leaving a permanent background
 * timer running on a screen staff may sit on for an entire marking
 * session. `PENDING` is polled as well as `PROCESSING`: a queued operation
 * that the worker has not picked up yet is still going to change. (These
 * are the *operation* statuses from `ResultAdjustmentOperationResponseDto`,
 * a different vocabulary from a result's own `RESULT_STATES`.)
 */
export function useAdjustmentOperation(operationId: string | null) {
  return useQuery({
    queryKey: ['result-adjustment', operationId],
    queryFn: () =>
      unwrap(
        apiClient.GET('/results/adjustments/{id}', {
          params: { path: { id: operationId as string } },
        }),
      ),
    enabled: Boolean(operationId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PENDING' || status === 'PROCESSING' ? 2000 : false;
    },
  });
}

/**
 * `GET /school/result-policy` (F5) — read purely to explain *why* a
 * publication control is unavailable when the school has locked its result
 * policy (`School.resultPolicyLocked`).
 *
 * Non-blocking and non-retrying by design: `schoolConfig.settings.view` is
 * denied to TEACHER, so on the Teacher root this call is expected to fail
 * with a 403. That failure must never surface as a broken screen or a
 * retry storm — every consumer treats "no data" as "say nothing extra",
 * which is the honest outcome: the client genuinely does not know the
 * policy, and the server remains the only authority on whether a publish
 * is permitted.
 */
export function useSchoolResultPolicy() {
  return useQuery({
    queryKey: ['school', 'result-policy'],
    queryFn: () => unwrap(apiClient.GET('/school/result-policy', {})),
    retry: false,
    staleTime: Infinity,
  });
}
