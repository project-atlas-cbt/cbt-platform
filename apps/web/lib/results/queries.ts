'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F14 — the read-side data layer for `student-results.v1` (B15). Modeled on
 * `lib/exams/queries.ts`'s `unwrap(apiClient.GET(...))` pattern. Both routes
 * are self-scoped server-side (no student id is ever passed from here) —
 * there is no "view another student's results" call this module can even
 * construct.
 */

export function useStudentResults() {
  return useQuery({
    queryKey: ['student-results', 'list'],
    queryFn: () => unwrap(apiClient.GET('/student/results', {})),
  });
}

export function useStudentResult(id: string | undefined) {
  return useQuery({
    queryKey: ['student-results', id],
    queryFn: () =>
      unwrap(apiClient.GET('/student/results/{id}', { params: { path: { id: id as string } } })),
    enabled: Boolean(id),
  });
}
