'use client';

import { useMutation } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';
import { getDeviceId } from './device-id';

/**
 * F13 — the write-side data layer for `attempt.v1`. Only the two mutations
 * the exam runtime calls directly on the critical path live here — answer
 * writes/flushes go through `sync-engine.ts` instead, since they need
 * Dexie-backed serialization the generic `useMutation` shape doesn't offer.
 */

/** `POST /exams/:id/attempts` — start, or idempotently resume, this
 * student's attempt (B13: an existing IN_PROGRESS attempt returns the same
 * package, no duplicate — DoD 3's real guarantee lives server-side; the
 * caller's own button-disable-on-pending is a UX nicety on top of it, not a
 * substitute for it). */
export function useStartAttempt() {
  return useMutation({
    mutationFn: (examId: string) =>
      unwrap(
        apiClient.POST('/exams/{id}/attempts', {
          params: { path: { id: examId } },
          headers: { 'X-Device-Id': getDeviceId() },
        }),
      ),
  });
}

/** `POST /attempts/:id/submit` — normal submission and the proactive
 * zero-reached call (`use-attempt-timer.ts`). Idempotent: a repeat call
 * against an already-terminal attempt returns the same state, 200 (ADR-0004
 * — the client only ever *requests* finalization, the server always decides
 * it). */
export function useSubmitAttempt() {
  return useMutation({
    mutationFn: (attemptId: string) =>
      unwrap(apiClient.POST('/attempts/{id}/submit', { params: { path: { id: attemptId } } })),
  });
}
