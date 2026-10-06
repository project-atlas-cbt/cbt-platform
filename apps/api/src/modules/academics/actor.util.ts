import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
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

/**
 * `assignments.view` is SCHOOL for School Admin and Moderator, DEPARTMENT
 * for an HOD, and SELF for a Teacher or Student. Returns the membership a
 * SELF-only actor is limited to, or `undefined` when a broader grant
 * applies (bug audit P2-9: the SELF grant was never given an owner, so it
 * allowed any record).
 */
export function selfOnlyMembershipId(user: AuthenticatedUser): string | undefined {
  const broader = user.roles.some((r) => r === 'SCHOOL_ADMIN' || r === 'MODERATOR' || r === 'HOD');
  return broader ? undefined : user.membershipId;
}

export function forbiddenOtherRecord(): AppHttpException {
  return new AppHttpException({
    code: 'FORBIDDEN',
    message: 'You can only view your own records.',
  });
}
