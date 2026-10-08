'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { API_VERSION_PREFIX } from '@atlas/contracts';
import { apiClient, getCsrfToken, resolveApiOrigin, toApiError, unwrap } from '@/lib/api';

/**
 * F7 — the write-side data layer for `people.v1` beyond what onboarding
 * already needed (`useCreateTeacher`/`useCreateModerator`/`useCreateHod`/
 * `useCreateStudent` stay in `lib/onboarding/mutations.ts` — reused, not
 * duplicated). `invalidatePeople` mirrors `lib/onboarding/mutations.ts`'s
 * own helper of the same name and shape — an independent local copy per
 * this codebase's established "each phase owns its own thin wrappers"
 * convention (`lib/academics/mutations.ts`'s own header comment).
 */
function invalidatePeople(client: QueryClient) {
  return client.invalidateQueries({ queryKey: ['people'], exact: false });
}

// ---- Student ----

export function useUpdateStudent(studentProfileId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { firstName?: string; lastName?: string; admissionNumber?: string }) =>
      unwrap(
        apiClient.PATCH('/students/{id}', { params: { path: { id: studentProfileId } }, body }),
      ),
    onSuccess: () => invalidatePeople(client),
  });
}

export function useDeactivateStudent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/students/{id}/deactivate', { params: { path: { id } } })),
    onSuccess: () => invalidatePeople(client),
  });
}

export function useReactivateStudent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/students/{id}/reactivate', { params: { path: { id } } })),
    onSuccess: () => invalidatePeople(client),
  });
}

/** DoD items 3–4 — enroll or move a student's class (one endpoint serves
 * both; history in the prior class is preserved, never overwritten). */
export function useMoveStudentClass(studentProfileId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { academicSessionId: string; classId: string }) =>
      unwrap(
        apiClient.POST('/students/{id}/enrollments', {
          params: { path: { id: studentProfileId } },
          body,
        }),
      ),
    onSuccess: () => invalidatePeople(client),
  });
}

export function useResetStudentCredentials() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/students/{id}/reset-credentials', { params: { path: { id } } })),
    onSuccess: () => invalidatePeople(client),
  });
}

/** P1-4 — ends a sign-in lockout (too many wrong passwords) without
 * changing the student's password. */
export function useUnlockStudentSignIn() {
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/students/{id}/unlock-sign-in', { params: { path: { id } } })),
  });
}

export function useDeregisterElective(studentProfileId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (classSubjectId: string) =>
      unwrap(
        apiClient.POST('/students/{id}/subject-registrations/{classSubjectId}/deregister', {
          params: { path: { id: studentProfileId, classSubjectId } },
        }),
      ),
    onSuccess: () => invalidatePeople(client),
  });
}

export function useReRegisterElective(studentProfileId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (classSubjectId: string) =>
      unwrap(
        apiClient.POST('/students/{id}/subject-registrations/{classSubjectId}/re-register', {
          params: { path: { id: studentProfileId, classSubjectId } },
        }),
      ),
    onSuccess: () => invalidatePeople(client),
  });
}

// ---- Teacher ----

export function useUpdateTeacher(teacherProfileId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { firstName?: string; lastName?: string; email?: string }) =>
      unwrap(
        apiClient.PATCH('/teachers/{id}', { params: { path: { id: teacherProfileId } }, body }),
      ),
    onSuccess: () => invalidatePeople(client),
  });
}

export function useDeactivateTeacher() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/teachers/{id}/deactivate', { params: { path: { id } } })),
    onSuccess: () => invalidatePeople(client),
  });
}

export function useReactivateTeacher() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/teachers/{id}/reactivate', { params: { path: { id } } })),
    onSuccess: () => invalidatePeople(client),
  });
}

export function useResetTeacherCredentials() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/teachers/{id}/reset-credentials', { params: { path: { id } } })),
    onSuccess: () => invalidatePeople(client),
  });
}

/** DoD item 5 — full-replace, not per-cell auto-save (matches the
 * backend's own semantics). DoD item 6: removed pairs are ended, never
 * deleted — historical ownership is untouched. */
export function useReplaceTeacherAssignments(teacherProfileId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { academicSessionId: string; classSubjectIds: string[] }) =>
      unwrap(
        apiClient.PUT('/teachers/{id}/assignments', {
          params: { path: { id: teacherProfileId } },
          body,
        }),
      ),
    onSuccess: () => invalidatePeople(client),
  });
}

// ---- HOD ----

export function usePromoteHod() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) =>
      unwrap(apiClient.POST('/hods', { body: { membershipId } })),
    onSuccess: () => invalidatePeople(client),
  });
}

export function useSetHodDepartment(membershipId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { departmentId: string; academicSessionId: string }) =>
      unwrap(
        apiClient.PUT('/hods/{id}/department', { params: { path: { id: membershipId } }, body }),
      ),
    onSuccess: () => invalidatePeople(client),
  });
}

/** Decision C — a dedicated HOD edit route, not a call into the Teacher
 * endpoint. */
export function useUpdateHod(membershipId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { firstName?: string; lastName?: string; email?: string }) =>
      unwrap(apiClient.PATCH('/hods/{id}', { params: { path: { id: membershipId } }, body })),
    onSuccess: () => invalidatePeople(client),
  });
}

export function useResetHodCredentials() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/hods/{id}/reset-credentials', { params: { path: { id } } })),
    onSuccess: () => invalidatePeople(client),
  });
}

export function useRemoveHod() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/hods/{id}/remove', { params: { path: { id } } })),
    onSuccess: () => invalidatePeople(client),
  });
}

// ---- Moderator ----

export function useUpdateModerator(membershipId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { firstName?: string; lastName?: string; email?: string }) =>
      unwrap(apiClient.PATCH('/moderators/{id}', { params: { path: { id: membershipId } }, body })),
    onSuccess: () => invalidatePeople(client),
  });
}

export function useRemoveModerator() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/moderators/{id}/remove', { params: { path: { id } } })),
    onSuccess: () => invalidatePeople(client),
  });
}

// ---- Class credential sheet (gap-closure 2) ----

const FALLBACK_API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3001';
const API_PORT = process.env.NEXT_PUBLIC_API_PORT ?? '3001';

/**
 * Not a normal `unwrap(apiClient...)` call — `apiClient` (`openapi-fetch`)
 * is JSON-typed throughout and unsuited to a raw `text/csv` response. A
 * manual `fetch` instead, mirroring `apiClient`'s own dynamic-origin
 * resolution (`resolveApiOrigin`) and CSRF attachment (`getCsrfToken`) by
 * hand, since neither of `apiClient`'s own middlewares run for a request it
 * never issues. Deliberately sends no `Idempotency-Key` header — see
 * `class-credential-sheet.controller.ts`'s own doc comment for why a
 * replayed key wouldn't work correctly against this route anyway, and why
 * that's an acceptable limitation given this route's confirmed
 * "regenerate unconditionally" semantics.
 */
export function useClassCredentialSheet() {
  return useMutation({
    mutationFn: async (classId: string) => {
      const origin =
        typeof window !== 'undefined'
          ? resolveApiOrigin(
              window.location.hostname,
              window.location.protocol,
              FALLBACK_API_ORIGIN,
              API_PORT,
            )
          : FALLBACK_API_ORIGIN;
      const url = `${origin}${API_VERSION_PREFIX}/classes/${classId}/credential-sheet`;
      const csrfToken = getCsrfToken();

      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        ...(csrfToken ? { headers: { 'X-CSRF-Token': csrfToken } } : {}),
      });

      if (!res.ok) {
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          body = undefined;
        }
        throw toApiError(body, res.status, 'Could not generate the credential sheet.');
      }

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = 'class-credentials.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    },
  });
}

/** Replaces the passwordless student sign-in setting. Switching a class or
 * the school off signs those students out (server side). */
export function useUpdateStudentPasswordlessSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { allStudents: boolean; classIds: string[] }) =>
      unwrap(apiClient.PUT('/school/student-passwordless-sign-in', { body })),
    onSuccess: (data) => {
      client.setQueryData(['people', 'student-passwordless-sign-in'], data);
      // The sign-in page reads the on/off state from tenant/resolve.
      return client.invalidateQueries({ queryKey: ['tenant'], exact: false });
    },
  });
}
