'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F6 — the write-side data layer for `academics.v1` beyond what F4's
 * onboarding wizard already needed (`useCreateSession`, `useActivateSession`,
 * `useCreateTerm`, `useActivateTerm`, `useCreateDepartment`,
 * `useDeactivateDepartment`, `useCreateClass`, `useCreateSubject` all stay in
 * `lib/onboarding/mutations.ts` — reused, not duplicated, since they're
 * plain data-layer hooks with no onboarding-specific behaviour of their own,
 * and this file's own screens import them directly from there).
 *
 * `invalidateAcademics` mirrors `lib/onboarding/mutations.ts`'s own helper
 * of the same name and shape exactly (broad `['academics']` invalidation
 * plus `['school','onboarding']`, since onboarding step-completion depends
 * on academics state) — kept as an independent, trivial local copy rather
 * than cross-imported, matching this codebase's established "each phase
 * owns its own thin wrappers" convention (`lib/school-settings/queries.ts`'s
 * own header comment).
 */
function invalidateAcademics(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['academics'], exact: false }),
    client.invalidateQueries({ queryKey: ['school', 'onboarding'] }),
  ]);
}

// ---- AcademicSession ----

export function useUpdateSession(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; startDate?: string; endDate?: string }) =>
      unwrap(apiClient.PATCH('/academics/sessions/{id}', { params: { path: { id } }, body })),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useArchiveSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/academics/sessions/{id}/archive', { params: { path: { id } } })),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useDeleteSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.DELETE('/academics/sessions/{id}', { params: { path: { id } } })),
    onSuccess: () => invalidateAcademics(client),
  });
}

// ---- AcademicTerm ----

export function useUpdateTerm(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; startDate?: string; endDate?: string }) =>
      unwrap(apiClient.PATCH('/academics/terms/{id}', { params: { path: { id } }, body })),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useDeleteTerm() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.DELETE('/academics/terms/{id}', { params: { path: { id } } })),
    onSuccess: () => invalidateAcademics(client),
  });
}

// ---- Department ----

export function useUpdateDepartment(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; code?: string }) =>
      unwrap(apiClient.PATCH('/academics/departments/{id}', { params: { path: { id } }, body })),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useDeleteDepartment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.DELETE('/academics/departments/{id}', { params: { path: { id } } })),
    onSuccess: () => invalidateAcademics(client),
  });
}

// ---- ClassGroup ----

export function useUpdateClass(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      departmentId?: string | null;
      name?: string;
      level?: 'JSS1' | 'JSS2' | 'JSS3' | 'SS1' | 'SS2' | 'SS3';
      arm?: string;
    }) => unwrap(apiClient.PATCH('/academics/classes/{id}', { params: { path: { id } }, body })),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useArchiveClass() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/academics/classes/{id}/archive', { params: { path: { id } } })),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useDeleteClass() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.DELETE('/academics/classes/{id}', { params: { path: { id } } })),
    onSuccess: () => invalidateAcademics(client),
  });
}

// ---- Subject ----

export function useUpdateSubject(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; code?: string; departmentId?: string | null }) =>
      unwrap(apiClient.PATCH('/academics/subjects/{id}', { params: { path: { id } }, body })),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useDeactivateSubject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/academics/subjects/{id}/deactivate', { params: { path: { id } } })),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useDeleteSubject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.DELETE('/academics/subjects/{id}', { params: { path: { id } } })),
    onSuccess: () => invalidateAcademics(client),
  });
}

// ---- ClassSubject (offerings) ----

export function useAddClassSubject(classId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (subjectId: string) =>
      unwrap(
        apiClient.POST('/academics/classes/{id}/subjects', {
          params: { path: { id: classId } },
          body: { subjectId },
        }),
      ),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useRemoveClassSubject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.DELETE('/academics/class-subjects/{id}', { params: { path: { id } } })),
    onSuccess: () => invalidateAcademics(client),
  });
}

// ---- Rollover Mutations (F19 / B19) ----

export function useCloseSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      unwrap(
        apiClient.POST('/academics/sessions/{id}/close', {
          params: { path: { id: sessionId } },
        }),
      ),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useCreateRolloverPlan(sourceSessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (targetAcademicSessionId: string) =>
      unwrap(
        apiClient.POST('/academics/sessions/{id}/rollover/plan', {
          params: { path: { id: sourceSessionId } },
          body: { targetAcademicSessionId },
        }),
      ),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useUpdateRolloverDecisions(planId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      decisions: Array<{
        decisionId: string;
        outcome: 'PROMOTE' | 'REPEAT' | 'CHANGE_DEPARTMENT' | 'TRANSFER' | 'GRADUATE' | 'WITHDRAW';
        targetDraftClassId?: string | null;
        reason: string;
      }>;
      version: number;
    }) =>
      unwrap(
        apiClient.PATCH('/academics/rollovers/{id}/decisions', {
          params: { path: { id: planId } },
          body: body as never,
        }),
      ),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useUpdateRolloverStructure(planId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      classes?: Array<{ draftId: string; included: boolean }>;
      offerings?: Array<{ draftId: string; included: boolean }>;
      staffAssignments?: Array<{ draftId: string; confirmed: boolean }>;
      version: number;
    }) =>
      unwrap(
        apiClient.PATCH('/academics/rollovers/{id}/structure', {
          params: { path: { id: planId } },
          body: body as never,
        }),
      ),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useCommitRollover(planId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (version: number) =>
      unwrap(
        apiClient.POST('/academics/rollovers/{id}/commit', {
          params: { path: { id: planId } },
          body: { version },
        }),
      ),
    onSuccess: () => invalidateAcademics(client),
  });
}
