import type { Role } from '@atlas/domain';
import type { AuthenticatedUser } from '../identity/auth.guard.js';

/**
 * Every academics `.manage` permission is granted to both SCHOOL_ADMIN and
 * MODERATOR (never a single-role-only route like SchoolBrandingService's
 * own hardcoded-actorRole precedent) — `AuthenticatedUser.roles` can
 * legitimately contain either, or in principle both, so audit entries need
 * a real resolution instead of an arbitrary `roles[0]`. Preference order
 * matches the permission table's own role ordering (SCHOOL_ADMIN listed
 * first everywhere); a caller reaching this function has already passed
 * PermissionGuard, so one of these two is always present.
 */
export function resolveActorRole(user: AuthenticatedUser): Role {
  if (user.roles.includes('SCHOOL_ADMIN')) return 'SCHOOL_ADMIN';
  if (user.roles.includes('MODERATOR')) return 'MODERATOR';
  return user.roles[0] ?? 'SCHOOL_ADMIN';
}
