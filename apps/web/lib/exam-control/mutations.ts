'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ExamSessionType } from '@atlas/domain';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F12 — the write-side data layer for `exam-control.v1` (B12). Every
 * mutation follows this codebase's established never-optimistic pattern
 * (no `onMutate` — doctrine: "no optimistic UI for control actions"); the
 * cache is only ever updated via `onSuccess` invalidation or the SSE push
 * (`sse-client.ts`'s direct `queryClient.setQueryData`).
 */

function invalidateExamControl(client: QueryClient, examId: string) {
  return client.invalidateQueries({ queryKey: ['exam-control', examId], exact: false });
}
/** Imported by name rather than re-declared — `lib/exams/mutations.ts`'s
 * own `invalidateExams` helper isn't exported today; a bare inline
 * invalidation is used instead so this module doesn't need a cross-cutting
 * export added to a file F11 already owns for an unrelated purpose. */
function invalidateExams(client: QueryClient) {
  return client.invalidateQueries({ queryKey: ['exams'], exact: false });
}

/** F16 actions affect participation, the live Control Center, and (after an
 * invalidation) staff results.  Invalidate/refetch is intentional: these are
 * integrity actions and the UI must show only confirmed server truth. */
function invalidateParticipation(client: QueryClient, examId: string) {
  return Promise.all([
    invalidateExamControl(client, examId),
    invalidateExams(client),
    client.invalidateQueries({ queryKey: ['exam-results'], exact: false }),
    client.invalidateQueries({ queryKey: ['staff-result'], exact: false }),
  ]);
}

/** `POST /exams/:id/sessions` — opening a session flips a `READY` exam to
 * `OPEN` in the same backend transaction, so both cache roots are
 * invalidated. */
export function useOpenExamSession(examId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { sessionType?: ExamSessionType }) =>
      unwrap(apiClient.POST('/exams/{id}/sessions', { params: { path: { id: examId } }, body })),
    onSuccess: () => {
      void invalidateExamControl(client, examId);
      void invalidateExams(client);
    },
  });
}

/** `POST /exams/:id/close` — exam-level "Pause" (ADR-0009): cascades every
 * OPEN session to CLOSED. */
export function useCloseExam(examId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(apiClient.POST('/exams/{id}/close', { params: { path: { id: examId } } })),
    onSuccess: () => {
      void invalidateExamControl(client, examId);
      void invalidateExams(client);
    },
  });
}

/** `POST /exams/:id/reopen` — lifts the exam-level block on opening new
 * sessions. Does not auto-reopen the sessions the cascade closed. */
export function useReopenExam(examId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(apiClient.POST('/exams/{id}/reopen', { params: { path: { id: examId } } })),
    onSuccess: () => {
      void invalidateExamControl(client, examId);
      void invalidateExams(client);
    },
  });
}

/** `POST /exams/:id/complete` — End Examination. `confirmedAbsentStudentProfileIds`
 * must exactly match the server's current pending-absentee set or the call
 * fails with `STALE_ABSENTEE_LIST` — see `EndExaminationDialog`. */
export function useCompleteExam(examId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (confirmedAbsentStudentProfileIds: string[]) =>
      unwrap(
        apiClient.POST('/exams/{id}/complete', {
          params: { path: { id: examId } },
          body: { confirmedAbsentStudentProfileIds },
        }),
      ),
    onSuccess: () => {
      void invalidateExamControl(client, examId);
      void invalidateExams(client);
    },
  });
}

/** `POST /exam-sessions/:id/close` — ADR-0009 "Pause" at session
 * granularity: stops new starts on this one session only, other sessions
 * and the parent exam are unaffected. Call-time-parameterized (mirrors
 * `useUpdateExam`'s own stale-closure-avoidance precedent), since one
 * screen can act on several sessions. */
export function useCloseExamSession(examId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      unwrap(apiClient.POST('/exam-sessions/{id}/close', { params: { path: { id: sessionId } } })),
    onSuccess: () => void invalidateExamControl(client, examId),
  });
}

/** `POST /exam-sessions/:id/reopen` — requires the parent exam to already
 * be OPEN (409 `EXAM_NOT_OPEN` otherwise — reopen the exam first). */
export function useReopenExamSession(examId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      unwrap(apiClient.POST('/exam-sessions/{id}/reopen', { params: { path: { id: sessionId } } })),
    onSuccess: () => void invalidateExamControl(client, examId),
  });
}

/** `POST /exam-sessions/:id/participants` — batch authorize. Every id is
 * independently eligibility-checked; the response reports every outcome
 * (never silently drops an ineligible id) — see `BatchAuthorizer`. */
export function useAuthorizeParticipants(examId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      studentProfileIds,
    }: {
      sessionId: string;
      studentProfileIds: string[];
    }) =>
      unwrap(
        apiClient.POST('/exam-sessions/{id}/participants', {
          params: { path: { id: sessionId } },
          body: { studentProfileIds },
        }),
      ),
    onSuccess: () => void invalidateExamControl(client, examId),
  });
}

/** `DELETE /exam-sessions/:id/participants/:studentId` — mandatory reason
 * (`RevokeParticipantDialog`). Structurally only reachable "before start" in
 * B12 (`REVOKE_AFTER_START_REFUSED` is real/tested but unreachable — no
 * `ExamAttempt` exists yet). */
export function useRevokeParticipant(examId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      studentId,
      reason,
    }: {
      sessionId: string;
      studentId: string;
      reason: string;
    }) =>
      unwrap(
        apiClient.DELETE('/exam-sessions/{id}/participants/{studentId}', {
          params: { path: { id: sessionId, studentId } },
          body: { reason },
        }),
      ),
    onSuccess: () => void invalidateExamControl(client, examId),
  });
}

/** `POST /exams/:id/administrators` — ADR-0012/M-15 delegation. */
export function useAssignExamAdministrator(examId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) =>
      unwrap(
        apiClient.POST('/exams/{id}/administrators', {
          params: { path: { id: examId } },
          body: { membershipId },
        }),
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['exam-control', examId, 'administrators'] }),
  });
}

/** `DELETE /exams/:id/administrators/:membershipId` — revoke a delegation. */
export function useRevokeExamAdministrator(examId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) =>
      unwrap(
        apiClient.DELETE('/exams/{id}/administrators/{membershipId}', {
          params: { path: { id: examId, membershipId } },
        }),
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['exam-control', examId, 'administrators'] }),
  });
}

export function useGrantMakeup(examId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { studentProfileIds: string[]; reason: string; expiresAt?: string }) =>
      unwrap(
        apiClient.POST('/exams/{id}/makeup-authorizations', {
          params: { path: { id: examId } },
          body,
        }),
      ),
    onSuccess: () => invalidateParticipation(client, examId),
  });
}

export function useGrantRetry(examId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { studentProfileId: string; reason: string; expiresAt?: string }) =>
      unwrap(
        apiClient.POST('/exams/{id}/retry-authorizations', {
          params: { path: { id: examId } },
          body,
        }),
      ),
    onSuccess: () => invalidateParticipation(client, examId),
  });
}

export function useInvalidateAttempt(examId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ attemptId, reason }: { attemptId: string; reason: string }) =>
      unwrap(
        apiClient.POST('/attempts/{id}/invalidate', {
          params: { path: { id: attemptId } },
          body: { reason },
        }),
      ),
    onSuccess: () => invalidateParticipation(client, examId),
  });
}
