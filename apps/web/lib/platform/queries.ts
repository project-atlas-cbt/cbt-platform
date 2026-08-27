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

/**
 * `status` is a comma-separated `SchoolStatus` filter — the endpoint's
 * generated type marks the query param required (no `@ApiQuery` decorator
 * was added server-side to declare it optional), so an empty string is
 * passed for "no filter" rather than omitting the param entirely;
 * `SchoolsAdminService.list`'s own `parseStatusFilter` already treats a
 * falsy value as "no filter."
 */
export function useSchools(statusFilter: string[]) {
  const status = statusFilter.join(',');
  return useQuery({
    queryKey: ['platform', 'schools', status],
    queryFn: () => unwrap(apiClient.GET('/platform/schools', { params: { query: { status } } })),
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
