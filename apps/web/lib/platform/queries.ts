'use client';

import { useQuery } from '@tanstack/react-query';
import { SCHOOL_ROLES } from '@atlas/domain';
import type { ExamStatus, UserStatus } from '@atlas/domain';
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

type SchoolUserRole = (typeof SCHOOL_ROLES)[number];

export interface UseSchoolUsersParams {
  q?: string;
  role?: SchoolUserRole | null;
  status?: UserStatus | null;
  sortBy?: 'joinedAt' | 'lastName' | null;
  sortDir?: 'asc' | 'desc' | null;
  page?: number;
  pageSize?: number;
}

/** `04 §8`'s per-school Users tab — B3/F3 gap-closure, read-only directory.
 * Filter/sort/pagination state is server-side, so every param participates
 * in the query key (same convention as `useSchools` for the list screen). */
export function useSchoolUsers(schoolId: string, params: UseSchoolUsersParams) {
  const q = params.q ?? '';
  const role = params.role ?? null;
  const status = params.status ?? null;
  const sortBy = params.sortBy ?? null;
  const sortDir = params.sortDir ?? null;
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;
  return useQuery({
    queryKey: [
      'platform',
      'schools',
      schoolId,
      'users',
      q,
      role,
      status,
      sortBy,
      sortDir,
      page,
      pageSize,
    ],
    queryFn: () =>
      unwrap(
        apiClient.GET('/platform/schools/{id}/users', {
          params: {
            path: { id: schoolId },
            query: {
              ...(q ? { q } : {}),
              ...(role ? { role } : {}),
              ...(status ? { status } : {}),
              ...(sortBy ? { sortBy } : {}),
              ...(sortDir ? { sortDir } : {}),
              page,
              pageSize,
            },
          },
        }),
      ),
    enabled: Boolean(schoolId),
  });
}

export interface UseSchoolExamsParams {
  status?: ExamStatus | null;
  page?: number;
  pageSize?: number;
}

/** `04 §8`'s per-school Exams tab — read-only directory for the Software
 *  Admin's platform session. Status filter + pagination, server-side. */
export function useSchoolExams(schoolId: string, params: UseSchoolExamsParams) {
  const status = params.status ?? null;
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;
  return useQuery({
    queryKey: ['platform', 'schools', schoolId, 'exams', status, page, pageSize],
    queryFn: () =>
      unwrap(
        apiClient.GET('/platform/schools/{id}/exams', {
          params: {
            path: { id: schoolId },
            query: { ...(status ? { status } : {}), page, pageSize },
          },
        }),
      ),
    enabled: Boolean(schoolId),
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

export interface UseAuditLogParams {
  schoolId?: string;
  actorUserId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/**
 * B10 — `GET /v1/platform/audit`, the privileged, cross-school connection
 * behind all three F3 audit destinations (`/admin/audit`, the per-school
 * Audit tab, and the per-school Activity tab) — never `GET /v1/audit`
 * (that one is school-session-scoped, structurally unreachable from a
 * Software Admin's platform session; see `audit-log-table.tsx`'s own doc
 * comment for the full reasoning). Co-located here with `useSchools`, not
 * a separate `lib/audit/` directory — this is platform-admin data, same
 * as schools/subscriptions.
 */
export function useAuditLog(params: UseAuditLogParams) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;
  return useQuery({
    queryKey: [
      'platform',
      'audit',
      params.schoolId ?? null,
      params.actorUserId ?? null,
      params.action ?? null,
      params.entityType ?? null,
      params.from ?? null,
      params.to ?? null,
      page,
      pageSize,
    ],
    queryFn: () =>
      unwrap(
        apiClient.GET('/platform/audit', {
          params: {
            query: {
              ...(params.schoolId ? { schoolId: params.schoolId } : {}),
              ...(params.actorUserId ? { actorUserId: params.actorUserId } : {}),
              ...(params.action ? { action: params.action } : {}),
              ...(params.entityType ? { entityType: params.entityType } : {}),
              ...(params.from ? { from: params.from } : {}),
              ...(params.to ? { to: params.to } : {}),
              page,
              pageSize,
            },
          },
        }),
      ),
  });
}

/** ADR-0005 amendment: short, free web addresses for a new school's name. */
export function useSchoolAddressSuggestions(name: string) {
  return useQuery({
    queryKey: ['platform', 'school-address', 'suggestions', name],
    queryFn: () =>
      unwrap(
        apiClient.GET('/platform/schools/address-suggestions', { params: { query: { name } } }),
      ),
    enabled: name.trim().length > 0,
    staleTime: 30_000,
  });
}

/** Whether a new school may take `subdomain`; disabled until it passes the
 * shared format rules, so only a well-formed label reaches the server. */
export function useSchoolAddressAvailability(subdomain: string, enabled: boolean) {
  return useQuery({
    queryKey: ['platform', 'school-address', 'availability', subdomain],
    queryFn: () =>
      unwrap(
        apiClient.GET('/platform/schools/address-availability', {
          params: { query: { subdomain } },
        }),
      ),
    enabled,
    staleTime: 5_000,
  });
}
