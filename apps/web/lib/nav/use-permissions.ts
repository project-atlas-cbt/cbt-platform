'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * The shape both `usePermissions` and `usePlatformPermissions` return —
 * exactly the pair `useNavigation`/`usePlatformNavigation`'s shared
 * `computeNavItems` needs (`data`/`isLoading`/`isError`), not the full
 * `UseQueryResult` surface. Declared once so the school/platform variants
 * stay interchangeable to any caller that only needs this much.
 */
export type PermissionsQueryResult = Pick<
  UseQueryResult<Awaited<ReturnType<typeof fetchPermissions>>>,
  'data' | 'isLoading' | 'isError'
>;

function fetchPermissions() {
  return unwrap(apiClient.GET('/me/permissions', {}));
}

function fetchPlatformPermissions() {
  return unwrap(apiClient.GET('/platform/auth/permissions', {}));
}

/**
 * `GET /me/permissions` (B2) — "the effective capability set for the
 * current user in the current school, so the frontend can hide what the
 * user cannot do... a usability affordance, never a security control"
 * (backend-roadmap.md's B2 section, verbatim). Fetched once per session
 * the same way `lib/auth/auth-context.tsx` fetches `/auth/me` —
 * `staleTime: Infinity` because the only things that change it (a role
 * reassignment) already force a fresh login/session, not a background
 * poll.
 *
 * School-scoped only — backed by the school `AuthGuard`. Software Admin
 * sessions must use `usePlatformPermissions` instead; see its own doc
 * comment for the bug this split fixed.
 */
export function usePermissions() {
  return useQuery({
    queryKey: ['me', 'permissions'],
    queryFn: fetchPermissions,
    staleTime: Infinity,
  });
}

/**
 * The Software Admin equivalent of `usePermissions`, against
 * `GET /platform/auth/permissions` instead of the school-only
 * `GET /me/permissions`. A real gap found by live browser testing: no
 * platform-scoped route for this ever existed, so every load of the
 * Platform Admin shell 401'd trying to reach the school one — see
 * `platform-auth.controller.ts`'s `permissions()` route for the backend
 * half of this fix.
 */
export function usePlatformPermissions() {
  return useQuery({
    queryKey: ['platform-auth', 'permissions'],
    queryFn: fetchPlatformPermissions,
    staleTime: Infinity,
  });
}

/**
 * Whether the current actor holds a specific `PERMISSION_TABLE` row id,
 * outright (never through a break-glass-only grant — same exclusion
 * `useNavigation` applies). First real consumer: F5's School Settings
 * screens, gating edit controls for Moderator's view-only posture. `false`
 * while permissions are still loading, matching `useNavigation`'s own
 * fail-closed default.
 *
 * School-scoped only, like `usePermissions` — every current caller is a
 * school-workspace screen.
 */
export function useHasPermission(resource: string): boolean {
  const { data } = usePermissions();
  if (!data) return false;
  return data.permissions.some((p) => p.resource === resource && !p.breakGlass);
}
