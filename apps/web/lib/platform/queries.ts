'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * F3's read-side data layer over `platform.v1`/`subscriptions.v1` (B3),
 * following F0's established `use-health.ts` shape — one hook per query,
 * TanStack Query as the admin server-state layer (F0's own scope rule:
 * "never the active exam").
 */

export function usePlatformMetrics() {
  return useQuery({
    queryKey: ['platform', 'metrics'],
    queryFn: () => unwrap(apiClient.GET('/platform/metrics', {})),
  });
}

export interface UseSchoolsParams {
  status: string[];
  q?: string;
  page?: number;
  /**
   * Only the Schools list screen wires real pager UI; other callers
   * (dashboard "requiring attention", the Subscriptions attention view) want
   * their whole small result set in one request rather than building their
   * own pager — capped at the server's own `MAX_PAGE_SIZE` (100), matching
   * this product's long-standing "fine at admin-scale school counts"
   * assumption rather than adding pagination UI those screens don't need.
   */
  pageSize?: number;
  sortBy?: string | null;
  sortDir?: 'asc' | 'desc' | null;
}

/**
 * F3 gap closure (pagination — `frontend-roadmap.md`'s F3 DoD item 2):
 * search, status filter, sort, and pagination are now all server-side, so
 * every one of these params is part of the query key — a change to any of
 * them is a genuinely different result set, not just a client-side re-slice
 * of one already-fetched list.
 */
export function useSchools(params: UseSchoolsParams) {
  const status = params.status.join(',');
  const q = params.q ?? '';
  const page = params.page ?? 1;
  const sortBy = params.sortBy ?? null;
  const sortDir = params.sortDir ?? null;
  return useQuery({
    queryKey: ['platform', 'schools', status, q, page, params.pageSize ?? null, sortBy, sortDir],
    queryFn: () =>
      unwrap(
        apiClient.GET('/platform/schools', {
          params: {
            query: {
              ...(status ? { status } : {}),
              ...(q ? { q } : {}),
              page,
              ...(params.pageSize ? { pageSize: params.pageSize } : {}),
              ...(sortBy ? { sortBy: sortBy as 'name' | 'status' | 'createdAt' } : {}),
              ...(sortDir ? { sortDir } : {}),
            },
          },
        }),
      ),
  });
}

export function useSchool(id: string) {
  return useQuery({
    queryKey: ['platform', 'schools', id],
    queryFn: () => unwrap(apiClient.GET('/platform/schools/{id}', { params: { path: { id } } })),
    enabled: Boolean(id),
  });
}

/** `05 §4.1`'s "Renewal history / Activation history" — F3 gap-closure endpoint. */
export function useActivationGrants(schoolId: string) {
  return useQuery({
    queryKey: ['platform', 'schools', schoolId, 'activation-grants'],
    queryFn: () =>
      unwrap(
        apiClient.GET('/platform/schools/{id}/activation-grants', {
          params: { path: { id: schoolId } },
        }),
      ),
    enabled: Boolean(schoolId),
  });
}
