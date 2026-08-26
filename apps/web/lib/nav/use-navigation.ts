'use client';

import type { Role } from '@atlas/domain';
import { usePermissions } from './use-permissions';
import { ROLE_WORKSPACES, type NavItem } from './nav-model';

export interface NavigationResult {
  /** `null` while permissions are still loading — callers render a skeleton, not an empty sidebar. */
  items: readonly NavItem[] | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Derives the visible nav items for one role's workspace from the live
 * `GET /me/permissions` result — F2 DoD item 1 ("no more, no less")
 * computed, not hand-maintained per role. Break-glass-only grants
 * (`ADR-0012`) are excluded from gating: reaching a section only through
 * the audited emergency path shouldn't put it in routine navigation.
 *
 * Presentation only (doctrine §12, `AGENTS.md` §5): `PermissionGuard`
 * (B2) is what actually enforces every route this drives.
 */
export function useNavigation(role: Role): NavigationResult {
  const { data, isLoading, isError } = usePermissions();

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
