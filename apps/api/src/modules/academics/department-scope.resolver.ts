import { prisma, withTenant } from '@atlas/db';
import type { ScopeResolverFn } from '../authorization/scope-resolvers.js';

/**
 * The real `DEPARTMENT` resolver (closes B2's fail-closed placeholder —
 * `scope-resolvers.ts`'s own doc comment names this as B5's job). Checks
 * the actor holds an active `HODAssignment` for the resource's department.
 *
 * Proves DoD item 6 ("Subject.department_id resolves an HOD's subject
 * scope, proven by the query B9 will use") at the resolver level — no B9
 * controller exists yet to exercise this through HTTP, which is expected
 * for this phase: `PermissionGuard` never constructs a `ResourceContext`
 * today (its only call site always omits `resource`), so this resolver
 * only becomes reachable once a later phase's controller (B9's HOD review
 * queue) explicitly calls `AuthorizationService.evaluate(actor, id,
 * { departmentId })` itself — the same extension point
 * `ScopeResolverRegistry`'s own doc comment anticipates.
 */
export function createDepartmentScopeResolver(): ScopeResolverFn {
  return async (actor, resource) => {
    if (actor.kind !== 'SCHOOL') return false;
    if (!actor.roles.includes('HOD')) return false;
    const departmentId = resource?.departmentId;
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
