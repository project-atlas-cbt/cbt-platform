import { prisma, withTenant } from '@atlas/db';
import type { ScopeResolverFn } from '../authorization/scope-resolvers.js';

/**
 * The real `DEPARTMENT` resolver (closes B2's fail-closed placeholder —
 * `scope-resolvers.ts`'s own doc comment names this as B5's job). Checks
 * the actor holds an active `HODAssignment` for the resource's department.
 *
 * B8 gap-closure: when `resource` is undefined — `PermissionGuard`'s own
 * bare `@Authorized(id)` check, which never constructs a `ResourceContext`
 * — this now resolves `true` (optimistic pass), mirroring `OWNED`/`SELF`'s
 * own established convention in `scope-resolvers.ts` exactly ("no target
 * yet to check against — the service filters/verifies precisely"). Found
 * only once B8 tried to route a real HTTP request through a DEPARTMENT-
 * graded permission for the first time: the original "deny when resource is
 * undefined" behaviour meant `@Authorized('questionBank.view')` (HOD:
 * DEPARTMENT) would 403 an HOD's `GET /v1/questions` at the guard itself,
 * before the handler/service ever got a chance to filter the list to their
 * own department — the exact same shape of gap `OWNED` already avoids for
 * `questionBank.editOwnDraft`/`.deleteOwnDraft`. A resource-specific check
 * (e.g. a single question's real department) still resolves precisely, as
 * before — only the "no resource given at all" case changed.
 */
export function createDepartmentScopeResolver(): ScopeResolverFn {
  return async (actor, resource) => {
    if (actor.kind !== 'SCHOOL') return false;
    if (!actor.roles.includes('HOD')) return false;
    if (!resource) return true;
    const departmentId = resource.departmentId;
    if (departmentId === undefined) return false;

    const activeAssignment = await withTenant(prisma, actor.schoolId, (tx) =>
      tx.hODAssignment.findFirst({
        where: {
          schoolId: actor.schoolId,
          membershipId: actor.membershipId,
          departmentId,
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
    );
    return activeAssignment !== null;
  };
}
