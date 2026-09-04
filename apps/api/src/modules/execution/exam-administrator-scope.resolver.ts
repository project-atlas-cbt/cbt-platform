import { prisma, withTenant } from '@atlas/db';
import type { ScopeResolverFn } from '../authorization/scope-resolvers.js';

/**
 * ADR-0012/M-15: "own exam" means `created_by` OR an active
 * `ExamAdministrator` delegate. Replaces `scope-resolvers.ts`'s built-in
 * `OWNED` resolver wholesale — see that file's own doc comment for why this
 * is `register('OWNED', ...)`, not a distinct `registerOverride` method.
 *
 * Reimplements the plain ownership check inline (identical to the built-in
 * `OWNED` function, four lines) rather than trying to capture-and-wrap the
 * pre-registration resolver — `ScopeResolverRegistry` has no `get()` to read
 * it back before replacing it. Falls through to an `ExamAdministrator`
 * lookup only when plain ownership fails AND `resource.examId` is present —
 * every non-exam `OWNED`-graded permission in this codebase (there are
 * several, e.g. `questionBank.editOwnDraft`) never sets `examId`, so this
 * resolver is functionally identical to the plain one for every resource
 * that isn't an exam.
 */
export function createExamAdministratorAwareOwnedResolver(): ScopeResolverFn {
  return async (actor, resource) => {
    if (actor.kind !== 'SCHOOL') return false;
    if (!resource) return true;
    if (resource.schoolId !== undefined && resource.schoolId !== actor.schoolId) return false;
    if (resource.ownerMembershipId === undefined) return true;
    if (resource.ownerMembershipId === actor.membershipId) return true;

    if (resource.examId === undefined) return false;

    const examId = resource.examId;
    const delegation = await withTenant(prisma, actor.schoolId, (tx) =>
      tx.examAdministrator.findFirst({
        where: {
          schoolId: actor.schoolId,
          examId,
          membershipId: actor.membershipId,
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
    );
    return delegation !== null;
  };
}
