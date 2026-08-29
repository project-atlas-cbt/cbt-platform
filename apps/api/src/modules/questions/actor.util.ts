import type { Role } from '@atlas/domain';
import type { AuthenticatedUser } from '../identity/auth.guard.js';

/**
 * Mirrors `academics/actor.util.ts`'s own `resolveActorRole` shape, but
 * with TEACHER first: every create/edit/submit action in this module is
 * TEACHER-OWNED-only, and archive/view are also reachable by HOD/School
 * Admin/Moderator — a caller who happens to hold more than one role should
 * still have the audit trail read as the role that actually did the
 * authoring, not silently reattributed to a broader administrative role.
 */
export function resolveQuestionActorRole(user: AuthenticatedUser): Role {
  if (user.roles.includes('TEACHER')) return 'TEACHER';
  if (user.roles.includes('HOD')) return 'HOD';
  if (user.roles.includes('SCHOOL_ADMIN')) return 'SCHOOL_ADMIN';
  if (user.roles.includes('MODERATOR')) return 'MODERATOR';
  return user.roles[0] ?? 'TEACHER';
}
