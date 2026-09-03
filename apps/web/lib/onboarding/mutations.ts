'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F4's write-side data layer. Every mutation's `onSuccess` only invalidates
 * the affected query keys (this codebase's established convention — see
 * `lib/platform/mutations.ts`'s own header comment) — no optimistic
 * updates, since every step commits real data immediately and the wizard's
 * own "added so far" lists must reflect confirmed server state.
 */

export function useUpdateOnboardingProgress() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { currentStep: number; skippedSteps?: number[] }) =>
      unwrap(apiClient.PUT('/school/onboarding/progress', { body })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['school', 'onboarding'] }),
  });
}

export function useCompleteOnboarding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(apiClient.POST('/school/onboarding/complete', {})),
    onSuccess: () => client.invalidateQueries({ queryKey: ['school', 'onboarding'] }),
  });
}

export function useUpdateSchoolProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      shortName?: string;
      contactEmail?: string;
      contactPhone?: string;
      address?: string;
    }) => unwrap(apiClient.PATCH('/school/profile', { body })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['school', 'profile'] }),
  });
}

// useRequestLogoUpload/useCompleteLogoUpload/useUpdateBranding moved to
// lib/branding/mutations.ts (F5) — shared with the School Settings Branding
// screen, since they had no onboarding-specific behaviour. Re-exported here
// only if a future onboarding file needs them; none currently does.

function invalidateAcademics(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['academics'], exact: false }),
    client.invalidateQueries({ queryKey: ['school', 'onboarding'] }),
  ]);
}

export function useCreateSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; startDate: string; endDate: string }) =>
      unwrap(apiClient.POST('/academics/sessions', { body })),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useActivateSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/academics/sessions/{id}/activate', { params: { path: { id } } })),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useCreateTerm() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      sessionId: string;
      name: string;
      sequence: number;
      startDate: string;
      endDate: string;
    }) =>
      unwrap(
        apiClient.POST('/academics/sessions/{sessionId}/terms', {
          params: { path: { sessionId: input.sessionId } },
          body: {
            name: input.name,
            sequence: input.sequence,
            startDate: input.startDate,
            endDate: input.endDate,
          },
        }),
      ),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useActivateTerm() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(apiClient.POST('/academics/terms/{id}/activate', { params: { path: { id } } })),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useCreateDepartment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; code: string }) =>
      unwrap(apiClient.POST('/academics/departments', { body })),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useDeactivateDepartment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        apiClient.POST('/academics/departments/{id}/deactivate', { params: { path: { id } } }),
      ),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useCreateClass() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      academicSessionId: string;
      departmentId?: string | null;
      name: string;
      level: 'JSS1' | 'JSS2' | 'JSS3' | 'SS1' | 'SS2' | 'SS3';
      arm: string;
    }) => unwrap(apiClient.POST('/academics/classes', { body })),
    onSuccess: () => invalidateAcademics(client),
  });
}

export function useCreateSubject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; code: string; departmentId?: string | null }) =>
      unwrap(apiClient.POST('/academics/subjects', { body })),
    onSuccess: () => invalidateAcademics(client),
  });
}

function invalidatePeople(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['people'], exact: false }),
    client.invalidateQueries({ queryKey: ['school', 'onboarding'] }),
  ]);
}

export function useCreateTeacher() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { firstName: string; lastName: string; email: string; staffId: string }) =>
      unwrap(apiClient.POST('/teachers', { body })),
    onSuccess: () => invalidatePeople(client),
  });
}

export function useCreateModerator() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      firstName: string;
      lastName: string;
      email: string;
      loginIdentifier: string;
    }) => unwrap(apiClient.POST('/moderators', { body })),
    onSuccess: () => invalidatePeople(client),
  });
}

/** Promote an existing teacher (`membershipId`) then set their department in
 * one perceived action — `POST /hods` alone leaves `departmentId` null. */
export function useCreateHod() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      membershipId: string;
      departmentId?: string;
      academicSessionId: string;
    }) => {
      const hod = await unwrap(
        apiClient.POST('/hods', { body: { membershipId: input.membershipId } }),
      );
      if (!input.departmentId) return hod;
      return unwrap(
        apiClient.PUT('/hods/{id}/department', {
          params: { path: { id: hod.membershipId } },
          body: { departmentId: input.departmentId, academicSessionId: input.academicSessionId },
        }),
      );
    },
    onSuccess: () => invalidatePeople(client),
  });
}

/** Create the student, immediately enroll them into the chosen class, then
 * immediately issue their initial credentials — one perceived "Add student"
 * action, three calls in sequence. If enrollment fails after creation
 * succeeds, the student still exists; the caller's "added so far" list
 * (refetched regardless) lets the admin retry just the enrollment rather
 * than re-creating the person.
 *
 * The credential-issuance step is a gap-closure found via live testing:
 * `POST /students` never set a password at all — the only way to get one
 * was the *separate* "Reset credentials" action in the student directory
 * (`RevealCredentialsDialog`), a required extra step nothing in the create
 * flow ever mentioned, leaving an admin with a login ID and no way to
 * discover a password. Reuses the exact same `POST /students/:id/
 * reset-credentials` endpoint and one-time-reveal semantics
 * (`CredentialResetResponseDto`) — issuing "the first" password this way is
 * behaviourally identical to issuing a replacement one; there is no
 * separate "initial issuance" endpoint to call instead. Returned under
 * `credentials`, additive to the existing `student` fields, so this mutation
 * stays a drop-in replacement at every call site. */
export function useCreateStudent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      firstName: string;
      lastName: string;
      studentId: string;
      admissionNumber?: string;
      academicSessionId: string;
      classId: string;
    }) => {
      const student = await unwrap(
        apiClient.POST('/students', {
          body: {
            firstName: input.firstName,
            lastName: input.lastName,
            studentId: input.studentId,
            ...(input.admissionNumber ? { admissionNumber: input.admissionNumber } : {}),
          },
        }),
      );
      // `StudentEnrollmentController`'s `:id` is `studentProfileId`, not
      // `membershipId` — every other `/students/:id/...` route uses the
      // same convention. A pre-existing bug found and fixed during F7
      // (this call was passing `student.membershipId`, a different UUID,
      // which would 404 silently since this mutation uses `onSettled` and
      // just refetches regardless of the enrollment call's own outcome).
      await unwrap(
        apiClient.POST('/students/{id}/enrollments', {
          params: { path: { id: student.studentProfileId } },
          body: { academicSessionId: input.academicSessionId, classId: input.classId },
        }),
      );
      const credentials = await unwrap(
        apiClient.POST('/students/{id}/reset-credentials', {
          params: { path: { id: student.studentProfileId } },
        }),
      );
      return {
        ...student,
        credentials: {
          loginIdentifier: credentials.loginIdentifier,
          initialPassword: credentials.initialPassword,
        },
      };
    },
    onSettled: () => invalidatePeople(client),
  });
}
