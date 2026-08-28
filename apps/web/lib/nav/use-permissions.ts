'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/lib/api';

/**
 * `GET /me/permissions` (B2) — "the effective capability set for the
 * current user in the current school, so the frontend can hide what the
 * user cannot do... a usability affordance, never a security control"
 * (backend-roadmap.md's B2 section, verbatim). Fetched once per session
 * the same way `lib/auth/auth-context.tsx` fetches `/auth/me` —
 * `staleTime: Infinity` because the only things that change it (a role
 * reassignment) already force a fresh login/session, not a background
 * poll.
 */
export function usePermissions() {
  return useQuery({
    queryKey: ['me', 'permissions'],
    queryFn: () => unwrap(apiClient.GET('/me/permissions', {})),
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
 */
export function useHasPermission(resource: string): boolean {
  const { data } = usePermissions();
  if (!data) return false;
  return data.permissions.some((p) => p.resource === resource && !p.breakGlass);
}
