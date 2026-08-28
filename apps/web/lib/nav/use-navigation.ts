'use client';

import type { Role } from '@atlas/domain';
import {
  usePermissions,
  usePlatformPermissions,
  type PermissionsQueryResult,
} from './use-permissions';
import { ROLE_WORKSPACES, type NavItem } from './nav-model';

export interface NavigationResult {
  /** `null` while permissions are still loading — callers render a skeleton, not an empty sidebar. */
  items: readonly NavItem[] | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * The pure "which nav items does this permission set unlock" computation —
 * extracted so both the school (`useNavigation`, `GET /me/permissions`) and
 * platform (`usePlatformNavigation`, `GET /platform/auth/permissions`)
 * variants share exactly one filtering rule instead of two copies that
 * could drift. Break-glass-only grants (`ADR-0012`) are excluded from
 * gating: reaching a section only through the audited emergency path
 * shouldn't put it in routine navigation.
 *
 * Presentation only (doctrine §12, `AGENTS.md` §5): `PermissionGuard`/
 * `PlatformAuthGuard` are what actually enforce every route this drives.
 */
function computeNavItems(role: Role, query: PermissionsQueryResult): NavigationResult {
  const { data, isLoading, isError } = query;

  if (isLoading || !data) {
    return { items: null, isLoading, isError };
  }

  const granted = new Set(data.permissions.filter((p) => !p.breakGlass).map((p) => p.resource));
  const hasAny = (prefixes: readonly string[]) =>
    prefixes.some((prefix) => [...granted].some((resource) => resource.startsWith(prefix)));

  const workspace = ROLE_WORKSPACES[role];
  const items = workspace.items.filter((item) => item.match === 'always' || hasAny(item.match));

  return { items, isLoading, isError };
}

/**
 * Derives the visible nav items for one school role's workspace from the
 * live `GET /me/permissions` result — F2 DoD item 1 ("no more, no less")
 * computed, not hand-maintained per role.
 */
export function useNavigation(role: Role): NavigationResult {
  return computeNavItems(role, usePermissions());
}

/**
 * The Software Admin equivalent of `useNavigation`, built against
 * `GET /platform/auth/permissions` instead — a real bug found by live
 * browser testing, not by inspection: `RoleNavigation` used to call
 * `useNavigation`/`usePermissions()` unconditionally for *every* role,
 * including `SOFTWARE_ADMIN`, whose session has no `SchoolMembership` at
 * all — `GET /me/permissions` (the school-only `AuthGuard`-backed route)
 * 401'd forever, leaving the Platform Admin sidebar stuck on its loading
 * skeleton with no nav items ever rendering. See `use-permissions.ts`'s
 * `usePlatformPermissions` doc comment and the new backend route's own
 * comment (`platform-auth.controller.ts`) for the full fix.
 */
export function usePlatformNavigation(role: Role): NavigationResult {
  return computeNavItems(role, usePlatformPermissions());
}
