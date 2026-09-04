'use client';

import { useQuery } from '@tanstack/react-query';
import type { ExamStatus, QuestionDifficulty } from '@atlas/domain';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F11 — the read-side data layer for `exams.v1` (B11), modeled on
 * `lib/questions/queries.ts`'s `unwrap(apiClient.GET(...))` pattern.
 */

export interface ExamListFilters {
  status?: ExamStatus;
  academicSessionId?: string;
  academicTermId?: string;
  subjectId?: string;
  classId?: string;
  departmentId?: string;
  teacherMembershipId?: string;
  page?: number;
  pageSize?: number;
}

export function useExamsPaginated(filters: ExamListFilters) {
  return useQuery({
    queryKey: ['exams', 'list', filters],
    queryFn: () =>
      unwrap(
        apiClient.GET('/exams', {
          params: {
            query: {
              ...(filters.status ? { status: filters.status } : {}),
              ...(filters.academicSessionId
                ? { academicSessionId: filters.academicSessionId }
                : {}),
              ...(filters.academicTermId ? { academicTermId: filters.academicTermId } : {}),
              ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
              ...(filters.classId ? { classId: filters.classId } : {}),
              ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
              ...(filters.teacherMembershipId
                ? { teacherMembershipId: filters.teacherMembershipId }
                : {}),
              ...(filters.page ? { page: filters.page } : {}),
              ...(filters.pageSize ? { pageSize: filters.pageSize } : {}),
            },
          },
        }),
      ),
  });
}

export function useExam(id: string | undefined) {
  return useQuery({
    queryKey: ['exams', id],
    queryFn: () => unwrap(apiClient.GET('/exams/{id}', { params: { path: { id: id as string } } })),
    enabled: Boolean(id),
  });
}

/**
 * Roadmap's own explicit "State management requirements": "Readiness
 * re-fetched on entering the review step, never cached stale." `staleTime: 0`
 * alone isn't enough — TanStack Query still serves a mount-time cache hit at
 * `staleTime: 0` unless a refetch is also forced, so `refetchOnMount:
 * 'always'` is load-bearing here, not redundant with `staleTime`.
 */
export function useExamReadiness(id: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['exams', id, 'readiness'],
    queryFn: () =>
      unwrap(apiClient.GET('/exams/{id}/readiness', { params: { path: { id: id as string } } })),
    enabled: Boolean(id) && (options?.enabled ?? true),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export interface AvailableQuestionsFilters {
  topicId?: string;
  difficulty?: QuestionDifficulty;
  page?: number;
  pageSize?: number;
}

/**
 * `GET /exams/:id/available-questions` — approved-revisions-only pool,
 * scoped server-side to this exam's own subject/level (`subjectId`/`status`/
 * `level` are silently overridden regardless of what's sent). Only
 * `topicId`/`difficulty`/`page`/`pageSize` are meaningful to pass. A real,
 * fixed gap-closure went into this same phase: the route's own `@Query()`
 * parameter was a `type`-only import, which stripped Nest's Swagger
 * reflection metadata and dropped these params from the generated contract
 * entirely even though the route itself already accepted them — see
 * `apps/api/src/modules/exams/exam.controller.ts`'s import.
 */
export function useAvailableQuestions(
  examId: string | undefined,
  filters: AvailableQuestionsFilters,
) {
  return useQuery({
    queryKey: ['exams', examId, 'available-questions', filters],
    queryFn: () =>
      unwrap(
        apiClient.GET('/exams/{id}/available-questions', {
          params: {
            path: { id: examId as string },
            query: {
              ...(filters.topicId ? { topicId: filters.topicId } : {}),
              ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
              ...(filters.page ? { page: filters.page } : {}),
              ...(filters.pageSize ? { pageSize: filters.pageSize } : {}),
            },
          },
        }),
      ),
    enabled: Boolean(examId),
  });
}

/**
 * `GET /teachers/me/assignments` — F11's own backend gap-closure. The data
 * source for the Details step's Subject/Class pickers: `schoolConfig.class
 * .view`/`.subject.view` are both denied to TEACHER (F6 precedent), so
 * nothing else can supply this. Deliberately namespaced under
 * `['teachers','me',...]`, not `['exams',...]` — a general teacher-identity
 * fact, not exam-specific, so a future screen can reuse the same cache entry.
 */
export function useMyTeacherAssignments(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['teachers', 'me', 'assignments'],
    queryFn: () => unwrap(apiClient.GET('/teachers/me/assignments', {})),
    enabled: options?.enabled ?? true,
  });
}
