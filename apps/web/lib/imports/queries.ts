'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

export type ImportJobType = 'STUDENTS' | 'TEACHERS' | 'QUESTIONS';
export type ImportJobStatus =
  | 'PENDING_VALIDATION'
  | 'VALIDATING'
  | 'VALIDATED'
  | 'IMPORTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED';
export type ImportRowStatus = 'VALID' | 'INVALID' | 'COMMITTED' | 'FAILED';

/**
 * F8 — the read-side data layer for `imports.v1` (B7/B8). Polling uses a
 * simple two-tier `refetchInterval`, not a generic backoff utility — no
 * precedent for one exists in this codebase, and B7's own
 * `import-1500-rows.integration.test.ts` bounds real-scale validation to
 * ~30s and commit to ~90s, so a fixed 2s/5s split is enough without
 * inventing exponential backoff for an already-bounded, already-fast
 * operation. Every other status (including the resting `VALIDATED` review
 * state and every terminal status) stops polling.
 */
function pollingInterval(status: ImportJobStatus | undefined): number | false {
  if (status === 'VALIDATING') return 2000;
  if (status === 'IMPORTING') return 5000;
  return false;
}

/** `GET /imports/:id` — job status/counts, polled while `VALIDATING`/
 * `IMPORTING`. `pageSize: 1` on the embedded row page: this hook is for the
 * job's own fields, not its rows — `useImportRows` below fetches those. */
export function useImportJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ['imports', 'jobs', jobId],
    queryFn: () =>
      unwrap(
        apiClient.GET('/imports/{id}', {
          params: { path: { id: jobId as string }, query: { pageSize: 1 } },
        }),
      ),
    enabled: Boolean(jobId),
    refetchInterval: (query) => pollingInterval(query.state.data?.status),
  });
}

export interface UseImportRowsParams {
  page: number;
  pageSize: number;
  status?: ImportRowStatus;
}

/**
 * Powers `<ErrorTable>` — server-paginated (`ListImportRowsQueryDto` caps
 * `pageSize` at 200), the same mechanism `StudentsScreen` already proves at
 * 1,500-row scale, so no client-side virtualization is needed here (see the
 * F8 plan's considered-and-rejected note). Mounted only once the job is
 * resting at `VALIDATED`, so this deliberately carries no `refetchInterval`
 * of its own — re-polling a fixed list the user is actively paging through
 * would fight their pagination.
 */
export function useImportRows(jobId: string | undefined, params: UseImportRowsParams) {
  return useQuery({
    queryKey: [
      'imports',
      'jobs',
      jobId,
      'rows',
      params.page,
      params.pageSize,
      params.status ?? null,
    ],
    queryFn: () =>
      unwrap(
        apiClient.GET('/imports/{id}', {
          params: {
            path: { id: jobId as string },
            query: {
              page: params.page,
              pageSize: params.pageSize,
              ...(params.status ? { status: params.status } : {}),
            },
          },
        }),
      ),
    enabled: Boolean(jobId),
  });
}
