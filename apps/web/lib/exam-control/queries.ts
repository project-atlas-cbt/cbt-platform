'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F12 — the read-side data layer for `exam-control.v1` (B12). Sibling to
 * (not merged into) `lib/exams/`, mirroring F9's `lib/question-review/` next
 * to `lib/questions/` precedent — the backend itself splits this domain the
 * same way (`apps/api/src/modules/execution/` vs. `.../exams/`).
 *
 * Query keys are rooted at `['exam-control', examId]`, parallel to
 * `lib/exams`'s `['exams', id]` root — `invalidateExamControl` (see
 * `mutations.ts`) invalidates with `exact: false`, catching every sub-key
 * below in one call.
 */

/**
 * `GET /exams/:id/control` — the Control Center aggregate + session list.
 * `refetchIntervalMs` is the R-04 polling-fallback knob: the screen passes
 * `false` while `useExamControlStream`'s connection is `'live'` (the SSE
 * push already writes into this exact cache entry via
 * `queryClient.setQueryData` — see `sse-client.ts`) and a real interval only
 * once the stream has left `'live'`. The two mechanisms never race: exactly
 * one is ever active for a given render, and both write to the one cache
 * entry, so the screen never has to reconcile two data sources.
 */
export function useExamControl(
  examId: string | undefined,
  options?: { refetchIntervalMs?: number | false },
) {
  return useQuery({
    queryKey: ['exam-control', examId],
    queryFn: () =>
      unwrap(apiClient.GET('/exams/{id}/control', { params: { path: { id: examId as string } } })),
    enabled: Boolean(examId),
    refetchInterval: options?.refetchIntervalMs ?? false,
  });
}

/** `GET /exams/:id/eligible-students` — the exam's full targeted-class
 * roster, joined against current participant status where one exists. */
export function useEligibleStudents(examId: string | undefined) {
  return useQuery({
    queryKey: ['exam-control', examId, 'eligible-students'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/exams/{id}/eligible-students', {
          params: { path: { id: examId as string } },
        }),
      ),
    enabled: Boolean(examId),
  });
}

/** `GET /exams/:id/administrators` — F12's own confirmed backend
 * gap-closure (2026-09-04): without this, `DelegatesSection` would be
 * write-only. Returns every delegation regardless of status, including
 * REVOKED ones, so a revoked delegate's history stays visible rather than
 * silently disappearing. */
export function useExamAdministrators(examId: string | undefined) {
  return useQuery({
    queryKey: ['exam-control', examId, 'administrators'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/exams/{id}/administrators', {
          params: { path: { id: examId as string } },
        }),
      ),
    enabled: Boolean(examId),
  });
}

/** F16 — B16's authoritative per-session participation facts plus the
 * ADR-0024 exam-level roll-up.  The server owns both eligibility and the
 * roll-up; this query deliberately performs no client-side reconstruction. */
export function useExamParticipation(examId: string | undefined) {
  return useQuery({
    queryKey: ['exam-control', examId, 'participation'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/exams/{id}/participation', {
          params: { path: { id: examId as string } },
        }),
      ),
    enabled: Boolean(examId),
  });
}
