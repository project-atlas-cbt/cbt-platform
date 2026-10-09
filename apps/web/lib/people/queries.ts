'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';
import { useClasses } from '@/lib/academics/queries';

/**
 * F7 — the paginated/detail read-side data layer for `people.v1`'s four
 * directories, built on top of the F7 gap-closure endpoints (server-side
 * search/sort/pagination). The existing fetch-all hooks (`useStudents`/
 * `useTeachers`/`useHods`/`useModerators`, `lib/academics/queries.ts`) stay
 * as-is and are reused unchanged by onboarding and small-scale pickers
 * (e.g. the HOD-promote membership picker) — this file is additive, not a
 * replacement, matching this codebase's established "each phase adds its
 * own thin layer on shared cache keys" convention (`lib/academics/
 * mutations.ts`'s own header comment).
 */

type SortDir = 'asc' | 'desc' | null;

export interface UseStudentsPaginatedParams {
  q?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'studentId' | 'lastName' | null;
  sortDir?: SortDir;
  /** Decision A — filters the directory to students currently (ACTIVE)
   * enrolled in this class. */
  classId?: string;
}

export function useStudentsPaginated(params: UseStudentsPaginatedParams) {
  const q = params.q ?? '';
  const page = params.page ?? 1;
  const sortBy = params.sortBy ?? null;
  const sortDir = params.sortDir ?? null;
  const classId = params.classId ?? '';
  return useQuery({
    queryKey: [
      'people',
      'students',
      'paginated',
      q,
      page,
      params.pageSize ?? null,
      sortBy,
      sortDir,
      classId,
    ],
    queryFn: () =>
      unwrap(
        apiClient.GET('/students', {
          params: {
            query: {
              ...(q ? { q } : {}),
              page,
              ...(params.pageSize ? { pageSize: params.pageSize } : {}),
              ...(sortBy ? { sortBy } : {}),
              ...(sortDir ? { sortDir } : {}),
              ...(classId ? { classId } : {}),
            },
          },
        }),
      ),
  });
}

export interface UseTeachersPaginatedParams {
  q?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'staffId' | 'lastName' | null;
  sortDir?: SortDir;
}

export function useTeachersPaginated(params: UseTeachersPaginatedParams) {
  const q = params.q ?? '';
  const page = params.page ?? 1;
  const sortBy = params.sortBy ?? null;
  const sortDir = params.sortDir ?? null;
  return useQuery({
    queryKey: [
      'people',
      'teachers',
      'paginated',
      q,
      page,
      params.pageSize ?? null,
      sortBy,
      sortDir,
    ],
    queryFn: () =>
      unwrap(
        apiClient.GET('/teachers', {
          params: {
            query: {
              ...(q ? { q } : {}),
              page,
              ...(params.pageSize ? { pageSize: params.pageSize } : {}),
              ...(sortBy ? { sortBy } : {}),
              ...(sortDir ? { sortDir } : {}),
            },
          },
        }),
      ),
  });
}

export interface UseHodsPaginatedParams {
  q?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'staffId' | 'lastName' | null;
  sortDir?: SortDir;
}

export function useHodsPaginated(params: UseHodsPaginatedParams) {
  const q = params.q ?? '';
  const page = params.page ?? 1;
  const sortBy = params.sortBy ?? null;
  const sortDir = params.sortDir ?? null;
  return useQuery({
    queryKey: ['people', 'hods', 'paginated', q, page, params.pageSize ?? null, sortBy, sortDir],
    queryFn: () =>
      unwrap(
        apiClient.GET('/hods', {
          params: {
            query: {
              ...(q ? { q } : {}),
              page,
              ...(params.pageSize ? { pageSize: params.pageSize } : {}),
              ...(sortBy ? { sortBy } : {}),
              ...(sortDir ? { sortDir } : {}),
            },
          },
        }),
      ),
  });
}

export interface UseModeratorsPaginatedParams {
  q?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'loginIdentifier' | 'lastName' | null;
  sortDir?: SortDir;
}

export function useModeratorsPaginated(params: UseModeratorsPaginatedParams) {
  const q = params.q ?? '';
  const page = params.page ?? 1;
  const sortBy = params.sortBy ?? null;
  const sortDir = params.sortDir ?? null;
  return useQuery({
    queryKey: [
      'people',
      'moderators',
      'paginated',
      q,
      page,
      params.pageSize ?? null,
      sortBy,
      sortDir,
    ],
    queryFn: () =>
      unwrap(
        apiClient.GET('/moderators', {
          params: {
            query: {
              ...(q ? { q } : {}),
              page,
              ...(params.pageSize ? { pageSize: params.pageSize } : {}),
              ...(sortBy ? { sortBy } : {}),
              ...(sortDir ? { sortDir } : {}),
            },
          },
        }),
      ),
  });
}

export function useStudent(studentProfileId: string | undefined) {
  return useQuery({
    queryKey: ['people', 'students', studentProfileId],
    queryFn: () =>
      unwrap(
        apiClient.GET('/students/{id}', { params: { path: { id: studentProfileId as string } } }),
      ),
    enabled: Boolean(studentProfileId),
  });
}

export function useTeacher(teacherProfileId: string | undefined) {
  return useQuery({
    queryKey: ['people', 'teachers', teacherProfileId],
    queryFn: () =>
      unwrap(
        apiClient.GET('/teachers/{id}', { params: { path: { id: teacherProfileId as string } } }),
      ),
    enabled: Boolean(teacherProfileId),
  });
}

export function useStudentEnrollments(studentProfileId: string | undefined) {
  return useQuery({
    queryKey: ['people', 'students', studentProfileId, 'enrollments'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/students/{id}/enrollments', {
          params: { path: { id: studentProfileId as string } },
        }),
      ),
    enabled: Boolean(studentProfileId),
  });
}

/** ADR-0011's elective-registration surface — the student profile's
 * "Subjects" panel. */
/** A student's academic history by session (2026-10-09 redesign). */
export function useStudentHistory(studentProfileId: string | undefined) {
  return useQuery({
    queryKey: ['people', 'students', studentProfileId, 'history'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/students/{id}/history', {
          params: { path: { id: studentProfileId as string } },
        }),
      ),
    enabled: Boolean(studentProfileId),
  });
}

export function useStudentSubjectRegistrations(studentProfileId: string | undefined) {
  return useQuery({
    queryKey: ['people', 'students', studentProfileId, 'subject-registrations'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/students/{id}/subject-registrations', {
          params: { path: { id: studentProfileId as string } },
        }),
      ),
    enabled: Boolean(studentProfileId),
  });
}

/** Pre-fills the assignment matrix (DoD item 5). */
export function useTeacherAssignments(teacherProfileId: string | undefined) {
  return useQuery({
    queryKey: ['people', 'teachers', teacherProfileId, 'assignments'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/teachers/{id}/assignments', {
          params: { path: { id: teacherProfileId as string } },
        }),
      ),
    enabled: Boolean(teacherProfileId),
  });
}

export interface ClassSubjectCell {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  classSubjectId: string;
}

/** The assignment matrix's cell source: every (class, subject) offering
 * across every class in the given session. No batch cross-class endpoint
 * exists (`class-subject.controller.ts` only offers `GET .../classes/:id/
 * subjects`), so this aggregates via `useQueries` over the same per-class
 * query `useClassSubjects` (`lib/academics/queries.ts`) already uses —
 * same query keys, so both surfaces share one cache. */
export function useAllClassSubjectsForSession(academicSessionId: string | undefined) {
  const classes = useClasses(academicSessionId);
  const classList = classes.data?.classes ?? [];

  const results = useQueries({
    queries: classList.map((classGroup) => ({
      queryKey: ['academics', 'classes', classGroup.id, 'subjects'],
      queryFn: () =>
        unwrap(
          apiClient.GET('/academics/classes/{id}/subjects', {
            params: { path: { id: classGroup.id } },
          }),
        ),
      enabled: Boolean(academicSessionId),
    })),
  });

  const isPending = classes.isPending || results.some((r) => r.isPending);
  const isError = classes.isError || results.some((r) => r.isError);

  const cells: ClassSubjectCell[] = classList.flatMap((classGroup, index) => {
    const offerings = results[index]?.data?.offerings ?? [];
    return offerings.map((offering) => ({
      classId: classGroup.id,
      className: classGroup.name,
      subjectId: offering.subjectId,
      subjectName: offering.subjectName,
      subjectCode: offering.subjectCode,
      classSubjectId: offering.id,
    }));
  });

  return { classes: classList, cells, isPending, isError };
}

/** Passwordless student sign-in (owner decision 2026-10-08): where students
 * may sign in with name + Login ID instead of a password. */
export function useStudentPasswordlessSettings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['people', 'student-passwordless-sign-in'],
    queryFn: () => unwrap(apiClient.GET('/school/student-passwordless-sign-in', {})),
    enabled: options?.enabled ?? true,
  });
}

/** Students whose sign-in is locked right now. Polled, so a lab invigilator
 * sees new lockouts without reloading. */
export function useLockedOutStudents(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['people', 'students', 'locked-out'],
    queryFn: () => unwrap(apiClient.GET('/students/locked-out', {})),
    enabled: options?.enabled ?? true,
    refetchInterval: 15_000,
  });
}
