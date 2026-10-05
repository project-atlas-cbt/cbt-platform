import type { Guide } from './types';

interface PermissionGrant {
  resource: string;
  breakGlass?: boolean;
}

/**
 * ADR-0035 decision 2: a guide shows when the user holds at least one of its
 * `requires` permissions outright (break-glass grants excluded, the same
 * rule `useNavigation` applies). `null` permissions means they could not be
 * loaded: every guide in the role's set is shown rather than none, because
 * help matters most when something is failing and guide text is not
 * sensitive. The role's set itself is already fixed by the route.
 *
 * Presentation only: every screen a guide links to stays enforced by
 * `PermissionGuard` on the server.
 */
export function visibleGuides(
  guides: readonly Guide[],
  permissions: readonly PermissionGrant[] | null,
): readonly Guide[] {
  if (permissions === null) return guides;
  const granted = new Set(permissions.filter((p) => !p.breakGlass).map((p) => p.resource));
  return guides.filter(
    (guide) => guide.requires.length === 0 || guide.requires.some((id) => granted.has(id)),
  );
}
