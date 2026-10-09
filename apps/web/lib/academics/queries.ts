'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';
import { isUuid } from '@/lib/utils';

/**
 * F6 — the canonical read-side data layer for `academics.v1` (B5/B6). Moved
 * here from `lib/onboarding/queries.ts` (F4), which now re-exports these
 * same hooks so every existing onboarding import keeps working unchanged —
 * onboarding and the Academic Structure Workspace read and write the exact
 * same backend resources and must share one TanStack Query cache, not two
 * independently-drifting copies.
 *
 * Query keys are unchanged from F4's own shapes (`['academics', ...]` /
 * `['people', ...]`) — every mutation's `invalidateAcademics`/
 * `invalidatePeople` helper (`lib/academics/mutations.ts`,
 * `lib/onboarding/mutations.ts`) invalidates the `['academics']`/
 * `['people']` prefix broadly, so a mutation from either phase refreshes
 * both.
 */

export function useAcademicsContext(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['academics', 'context'],
    queryFn: () => unwrap(apiClient.GET('/academics/context', {})),
    ...(options?.enabled !== undefined ? { enabled: options.enabled } : {}),
  });
}

export function useSessions() {
  return useQuery({
    queryKey: ['academics', 'sessions'],
    queryFn: () => unwrap(apiClient.GET('/academics/sessions', {})),
  });
}

export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: ['academics', 'sessions', id],
    queryFn: () =>
      unwrap(apiClient.GET('/academics/sessions/{id}', { params: { path: { id: id as string } } })),
    enabled: Boolean(id),
  });
}

export function useTerms(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['academics', 'sessions', sessionId, 'terms'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/academics/sessions/{sessionId}/terms', {
          params: { path: { sessionId: sessionId as string } },
        }),
      ),
    enabled: Boolean(sessionId),
  });
}

/** `options.enabled` (F11): same precedent as `useClasses` above —
 * `schoolConfig.department.view` is `denied()` for TEACHER too. */
export function useDepartments(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['academics', 'departments'],
    queryFn: () => unwrap(apiClient.GET('/academics/departments', {})),
    enabled: options?.enabled ?? true,
  });
}

/** P1-12: the department the signed-in HOD heads (the first, by name, if
 * they head several). `department` is undefined until loaded, and also when
 * they head none — check `isSuccess` to tell the two apart. */
export function useMyHodDepartment() {
  const query = useDepartments();
  const department = query.data?.departments.find((d) => d.headedByMe);
  return { ...query, department };
}

export function useDepartment(id: string | undefined) {
  return useQuery({
    queryKey: ['academics', 'departments', id],
    queryFn: () =>
      unwrap(
        apiClient.GET('/academics/departments/{id}', { params: { path: { id: id as string } } }),
      ),
    enabled: Boolean(id),
  });
}

/** `options.enabled` (F11): mirrors `useSubjects`'s own precedent — a caller
 * reachable by TEACHER (`schoolConfig.class.view` is `denied()` there, the
 * same gap F6 already found for subjects) must pass `enabled: false` and
 * source classes from elsewhere instead (F11's `useMyTeacherAssignments`). */
export function useClasses(academicSessionId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['academics', 'classes', academicSessionId ?? 'all'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/academics/classes', {
          params: { query: academicSessionId ? { academicSessionId } : {} },
        }),
      ),
    enabled: options?.enabled ?? true,
  });
}

export function useClass(id: string | undefined) {
  return useQuery({
    queryKey: ['academics', 'classes', 'detail', id],
    queryFn: () =>
      unwrap(apiClient.GET('/academics/classes/{id}', { params: { path: { id: id as string } } })),
    enabled: Boolean(id),
  });
}

/**
 * `enabled` (optional, default `true`): `schoolConfig.subject.view` is
 * `denied()` for TEACHER, so a caller reachable by Teacher (e.g.
 * `QuestionBankScreen`, shared with HOD) must pass `enabled: false` there
 * and source subjects from `lib/questions/queries.ts`'s `useAssignedSubjects`
 * instead — see that hook's own doc comment. Declared as an option object
 * (not disabled by inferring the caller's role from a permission check
 * inside this hook) specifically to avoid a loading-race: `useHasPermission`
 * returns `false` until `/me/permissions` resolves, so gating on it here
 * would fire one doomed 403 request for every Teacher on first render,
 * retried per the app's default `retry: 2` — the caller already knows its
 * own role context statically, before first render, with no such race.
 */
export function useSubjects(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['academics', 'subjects'],
    queryFn: () => unwrap(apiClient.GET('/academics/subjects', {})),
    enabled: options?.enabled ?? true,
  });
}

export function useSubject(id: string | undefined) {
  return useQuery({
    queryKey: ['academics', 'subjects', id],
    queryFn: () =>
      unwrap(apiClient.GET('/academics/subjects/{id}', { params: { path: { id: id as string } } })),
    enabled: Boolean(id),
  });
}

export function useClassSubjects(classId: string | undefined) {
  return useQuery({
    queryKey: ['academics', 'classes', classId, 'subjects'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/academics/classes/{id}/subjects', {
          params: { path: { id: classId as string } },
        }),
      ),
    enabled: Boolean(classId),
  });
}

/** ADR-0038 — the class subject grid (students × offerings). */
export function useClassRegistrationGrid(classId: string | undefined) {
  return useQuery({
    queryKey: ['academics', 'classes', classId, 'subject-registrations'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/academics/classes/{id}/subject-registrations', {
          params: { path: { id: classId as string } },
        }),
      ),
    enabled: Boolean(classId),
  });
}

/** ADR-0038 — subject choice groups ("pick one of CRS or IRS"). */
export function useSubjectChoiceGroups() {
  return useQuery({
    queryKey: ['academics', 'subject-choice-groups'],
    queryFn: () => unwrap(apiClient.GET('/academics/subject-choice-groups')),
  });
}

export function useDepartmentHodAssignments(departmentId: string | undefined) {
  return useQuery({
    queryKey: ['academics', 'departments', departmentId, 'hod-assignments'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/academics/departments/{id}/hod-assignments', {
          params: { path: { id: departmentId as string } },
        }),
      ),
    enabled: Boolean(departmentId),
  });
}

/** `GET /v1/classes/:id/students` (B6) — the class roster. */
export function useClassRoster(classId: string | undefined) {
  return useQuery({
    queryKey: ['academics', 'classes', classId, 'students'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/classes/{id}/students', { params: { path: { id: classId as string } } }),
      ),
    enabled: Boolean(classId),
  });
}

/** `GET /v1/classes/:id/teachers` — F6's own gap-closure (2026-08-28): the
 * class roster's teacher-side counterpart, which did not exist before this
 * phase (only the per-teacher `GET /teachers/:id/assignments` did). */
export function useClassTeachers(classId: string | undefined) {
  return useQuery({
    queryKey: ['academics', 'classes', classId, 'teachers'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/classes/{id}/teachers', { params: { path: { id: classId as string } } }),
      ),
    enabled: Boolean(classId),
  });
}

/** `options.enabled` (F11): `users.teacher.view` is `denied()` for TEACHER
 * itself — same precedent as `useHods`'s own `enabled` option below. */
export function useTeachers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['people', 'teachers'],
    queryFn: () => unwrap(apiClient.GET('/teachers', {})),
    enabled: options?.enabled ?? true,
  });
}

/** `enabled` matters here specifically: `GET /hods` requires
 * `users.hod.view`, which HOD itself is denied (confirmed decision #2,
 * `DepartmentDetailScreen`) — an HOD viewer must not fire this request at
 * all, not merely ignore its result, or every Department Detail visit
 * generates a needless 403. */
export function useHods(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['people', 'hods'],
    queryFn: () => unwrap(apiClient.GET('/hods', {})),
    ...(options?.enabled !== undefined ? { enabled: options.enabled } : {}),
  });
}

export function useModerators() {
  return useQuery({
    queryKey: ['people', 'moderators'],
    queryFn: () => unwrap(apiClient.GET('/moderators', {})),
  });
}

export function useStudents() {
  return useQuery({
    queryKey: ['people', 'students'],
    queryFn: () => unwrap(apiClient.GET('/students', {})),
  });
}

// ---- Rollover Queries (F19 / B19) ----

export interface RolloverQueryParams {
  page?: number;
  pageSize?: number;
  outcome?: 'PROMOTE' | 'REPEAT' | 'TRANSFER' | 'GRADUATE' | 'WITHDRAW';
  sourceClassId?: string;
  departmentId?: string;
  sourceLevel?: 'JSS1' | 'JSS2' | 'JSS3' | 'SS1' | 'SS2' | 'SS3';
  overriddenOnly?: boolean;
}

export function useCloseReadiness(sessionId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['academics', 'sessions', sessionId, 'close-readiness'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/academics/sessions/{id}/close-readiness', {
          params: { path: { id: sessionId as string } },
        }),
      ),
    enabled: isUuid(sessionId) && (options?.enabled ?? true),
  });
}

export function useRolloverPlan(
  planId: string | undefined,
  params?: RolloverQueryParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['academics', 'rollover-plans', planId, params],
    queryFn: () =>
      unwrap(
        apiClient.GET('/academics/rollovers/{id}', {
          params: {
            path: { id: planId as string },
            query: params as never,
          },
        }),
      ),
    enabled: isUuid(planId) && (options?.enabled ?? true),
  });
}

/** ADR-0038 amendment — a class's current form teachers. */
export function useFormTeachers(classId: string | undefined) {
  return useQuery({
    queryKey: ['academics', 'classes', classId, 'form-teachers'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/academics/classes/{id}/form-teachers', {
          params: { path: { id: classId as string } },
        }),
      ),
    enabled: Boolean(classId),
  });
}

/** Teacher › My classes: the classes the caller is form teacher of. */
export function useMyFormClasses(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['teachers', 'me', 'form-classes'],
    queryFn: () => unwrap(apiClient.GET('/teachers/me/form-classes', {})),
    enabled: options?.enabled ?? true,
  });
}
