'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

export interface AnalyticsContextFilter {
  academicSessionId?: string | undefined;
  academicTermId?: string | undefined;
  subjectId?: string | undefined;
}

function cleanFilter(filter?: AnalyticsContextFilter) {
  const q: { academicSessionId?: string; academicTermId?: string; subjectId?: string } = {};
  if (filter?.academicSessionId) q.academicSessionId = filter.academicSessionId;
  if (filter?.academicTermId) q.academicTermId = filter.academicTermId;
  if (filter?.subjectId) q.subjectId = filter.subjectId;
  return q;
}

export function useSchoolAnalytics(
  filter?: AnalyticsContextFilter,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['analytics', 'school', filter],
    queryFn: () =>
      unwrap(apiClient.GET('/analytics/school', { params: { query: cleanFilter(filter) } })),
    enabled: options?.enabled ?? true,
  });
}

export function useDepartmentAnalytics(
  departmentId: string | undefined,
  filter?: AnalyticsContextFilter,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['analytics', 'department', departmentId, filter],
    queryFn: () =>
      unwrap(
        apiClient.GET('/analytics/departments/{id}', {
          params: { path: { id: departmentId as string }, query: cleanFilter(filter) },
        }),
      ),
    enabled: Boolean(departmentId) && (options?.enabled ?? true),
  });
}

export function useClassAnalytics(
  classId: string | undefined,
  filter?: AnalyticsContextFilter,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['analytics', 'class', classId, filter],
    queryFn: () =>
      unwrap(
        apiClient.GET('/analytics/classes/{id}', {
          params: { path: { id: classId as string }, query: cleanFilter(filter) },
        }),
      ),
    enabled: Boolean(classId) && (options?.enabled ?? true),
  });
}

export function useExamAnalytics(examId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['analytics', 'exam', examId],
    queryFn: () =>
      unwrap(
        apiClient.GET('/analytics/exams/{id}', { params: { path: { id: examId as string } } }),
      ),
    enabled: Boolean(examId) && (options?.enabled ?? true),
  });
}

export function useExamQuestionAnalytics(
  examId: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['analytics', 'exam-questions', examId],
    queryFn: () =>
      unwrap(
        apiClient.GET('/analytics/exams/{id}/questions', {
          params: { path: { id: examId as string } },
        }),
      ),
    enabled: Boolean(examId) && (options?.enabled ?? true),
  });
}

export function useStudentAnalytics(
  studentId: string | undefined,
  filter?: AnalyticsContextFilter,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['analytics', 'student', studentId, filter],
    queryFn: () =>
      unwrap(
        apiClient.GET('/analytics/students/{id}', {
          params: { path: { id: studentId as string }, query: cleanFilter(filter) },
        }),
      ),
    enabled: Boolean(studentId) && (options?.enabled ?? true),
  });
}

export function usePlatformAnalytics(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['analytics', 'platform'],
    queryFn: () => unwrap(apiClient.GET('/platform/analytics', {})),
    enabled: options?.enabled ?? true,
  });
}

export function useQuestionCounts(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['questions', 'counts'],
    queryFn: () => unwrap(apiClient.GET('/questions/counts', {})),
    enabled: options?.enabled ?? true,
  });
}

export function useSchoolSubscription(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['school', 'subscription'],
    queryFn: () => unwrap(apiClient.GET('/school/subscription', {})),
    enabled: options?.enabled ?? true,
  });
}

export function useTeacherMyAssignments(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['teachers', 'me', 'assignments'],
    queryFn: () => unwrap(apiClient.GET('/teachers/me/assignments', {})),
    enabled: options?.enabled ?? true,
  });
}

import type { ExamStatus } from '@atlas/domain';

export interface ExamQueryFilter {
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

export function useExamsList(query?: ExamQueryFilter, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['exams', 'list', query],
    queryFn: () => {
      const q: Record<string, unknown> = {};
      if (query?.status) q.status = query.status;
      if (query?.academicSessionId) q.academicSessionId = query.academicSessionId;
      if (query?.academicTermId) q.academicTermId = query.academicTermId;
      if (query?.subjectId) q.subjectId = query.subjectId;
      if (query?.classId) q.classId = query.classId;
      if (query?.departmentId) q.departmentId = query.departmentId;
      if (query?.teacherMembershipId) q.teacherMembershipId = query.teacherMembershipId;
      if (query?.page !== undefined) q.page = query.page;
      if (query?.pageSize !== undefined) q.pageSize = query.pageSize;
      return unwrap(apiClient.GET('/exams', { params: { query: q as never } }));
    },
    enabled: options?.enabled ?? true,
  });
}

export function useClassStudents(classId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['classes', classId, 'students'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/classes/{id}/students', { params: { path: { id: classId as string } } }),
      ),
    enabled: Boolean(classId) && (options?.enabled ?? true),
  });
}

export function useClassTeachers(classId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['classes', classId, 'teachers'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/classes/{id}/teachers', { params: { path: { id: classId as string } } }),
      ),
    enabled: Boolean(classId) && (options?.enabled ?? true),
  });
}

export function useReviewQueue(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['reviews', 'queue'],
    queryFn: () => unwrap(apiClient.GET('/reviews/queue', {})),
    enabled: options?.enabled ?? true,
  });
}

export function useImportJobs(
  query?: { page?: number; pageSize?: number },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['imports', 'jobs', 'list', query],
    queryFn: () => unwrap(apiClient.GET('/imports', { params: { query: query ?? {} } })),
    enabled: options?.enabled ?? true,
  });
}
