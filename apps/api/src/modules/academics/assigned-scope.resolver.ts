import { prisma, withTenant } from '@atlas/db';
import type { ScopeResolverFn } from '../authorization/scope-resolvers.js';

/**
 * The real `ASSIGNED` resolver (closes B2's fail-closed placeholder —
 * `scope-resolvers.ts`'s own doc comment names this as B6's job). Checks
 * the actor holds an active `TeacherAssignment` for the resource's
 * `classSubjectId` — the exact mechanism DoD item 4 describes: "assigning
 * Mathematics/SS2A grants exactly that scope and nothing adjacent."
 *
 * Mirrors `department-scope.resolver.ts`'s exact shape, including its B8
 * gap-closure: when `resource` is undefined (`PermissionGuard`'s own bare
 * `@Authorized(id)` check), this now resolves `true` (optimistic pass),
 * mirroring `OWNED`/`SELF`'s established convention — the handler/service
 * is responsible for real per-resource filtering/verification from there
 * (e.g. `QuestionService.create()`'s own explicit `evaluate(actor, id,
 * { classSubjectId })` re-check once the real subject+level join resolves
 * one; `GET /v1/questions`'s own scoped WHERE clause for the list case). A
 * resource-specific check still resolves precisely, as before.
 */
export function createAssignedScopeResolver(): ScopeResolverFn {
  return async (actor, resource) => {
    if (actor.kind !== 'SCHOOL') return false;
    if (!actor.roles.includes('TEACHER')) return false;
    if (!resource) return true;
    const classSubjectId = resource.classSubjectId;
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
