import { prisma, withTenant } from '@atlas/db';
import type { ScopeResolverFn } from '../authorization/scope-resolvers.js';

/**
 * The real `ASSIGNED` resolver (closes B2's fail-closed placeholder —
 * `scope-resolvers.ts`'s own doc comment names this as B6's job). Checks
 * the actor holds an active `TeacherAssignment` for the resource's
 * `classSubjectId` — the exact mechanism DoD item 4 describes: "assigning
 * Mathematics/SS2A grants exactly that scope and nothing adjacent."
 *
 * Mirrors `department-scope.resolver.ts`'s exact shape. Same caveat that
 * resolver already recorded: `PermissionGuard` never constructs a
 * `ResourceContext` today (no call site passes one), so this resolver only
 * becomes reachable over HTTP once a later phase's controller (B8/B9's
 * question/exam endpoints) explicitly calls
 * `AuthorizationService.evaluate(actor, id, { classSubjectId })` itself —
 * proven directly here by a resolver-level integration test instead.
 */
export function createAssignedScopeResolver(): ScopeResolverFn {
  return async (actor, resource) => {
    if (actor.kind !== 'SCHOOL') return false;
    if (!actor.roles.includes('TEACHER')) return false;
    const classSubjectId = resource?.classSubjectId;
    if (classSubjectId === undefined) return false;

    return withTenant(prisma, actor.schoolId, async (tx) => {
      const teacherProfile = await tx.teacherProfile.findUnique({
        where: {
          schoolId_membershipId: { schoolId: actor.schoolId, membershipId: actor.membershipId },
        },
        select: { id: true },
      });
      if (!teacherProfile) return false;

      const activeAssignment = await tx.teacherAssignment.findFirst({
        where: {
          schoolId: actor.schoolId,
          teacherProfileId: teacherProfile.id,
          classSubjectId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      return activeAssignment !== null;
    });
  };
}
