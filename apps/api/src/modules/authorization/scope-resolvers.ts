import { Injectable, Logger } from '@nestjs/common';
import type { ScopePredicate } from '@atlas/domain';
import type { AuthorizedActor, ResourceContext } from './authorization.types.js';

export type ScopeResolverFn = (
  actor: AuthorizedActor,
  resource: ResourceContext | undefined,
) => boolean | Promise<boolean>;

const PLATFORM: ScopeResolverFn = (actor) => actor.kind === 'PLATFORM';

const SCHOOL: ScopeResolverFn = (actor, resource) => {
  if (actor.kind !== 'SCHOOL') return false;
  if (resource?.schoolId !== undefined && resource.schoolId !== actor.schoolId) return false;
  return true;
};

const SELF: ScopeResolverFn = (actor, resource) => {
  if (!resource) return true;
  if (resource.ownerUserId !== undefined) return resource.ownerUserId === actor.userId;
  if (resource.ownerMembershipId !== undefined) {
    return actor.kind === 'SCHOOL' && resource.ownerMembershipId === actor.membershipId;
  }
  return true;
};

const OWNED: ScopeResolverFn = (actor, resource) => {
  if (actor.kind !== 'SCHOOL') return false;
  if (!resource) return true;
  if (resource.schoolId !== undefined && resource.schoolId !== actor.schoolId) return false;
  if (resource.ownerMembershipId === undefined) return true;
  return resource.ownerMembershipId === actor.membershipId;
};

/** Fail-closed per B2's own default-deny requirement: a predicate with no
 * concrete data model behind it yet (ASSIGNED needs TeacherAssignment/B6,
 * DEPARTMENT needs Department/B5) denies rather than guessing, and warns
 * once per predicate so an unregistered resolver in production is loud,
 * not silent. */
function unregisteredResolver(predicate: ScopePredicate): ScopeResolverFn {
  let warned = false;
  return () => {
    if (!warned) {
      warned = true;
      new Logger('ScopeResolverRegistry').warn(
        `No scope resolver registered for "${predicate}" — denying by default (fail-closed). ` +
          'The phase that introduces the backing academic table must call registry.register(...).',
      );
    }
    return false;
  };
}

/**
 * The scope-resolver extension point B2's roadmap text names explicitly:
 * "ASSIGNED and DEPARTMENT... unregistered until [B5/B6]." B5 (Department)
 * and B6 (TeacherAssignment/Enrollment) register real resolvers here
 * instead of this module growing a hard dependency on tables that don't
 * exist yet. B12 does the same for OWNED's ExamAdministrator-delegation
 * extension (M-15/ADR-0012) — not via a distinct `registerOverride` method
 * (this registry never grew one; `register()` is already a full replace,
 * which is all "override" needs), but by calling `register('OWNED', ...)`
 * with a resolver that reimplements the plain `OWNED` check inline (see
 * `exam-control/exam-administrator-scope.resolver.ts`) and falls through to
 * an `ExamAdministrator` lookup only when plain ownership fails.
 */
@Injectable()
export class ScopeResolverRegistry {
  private readonly byPredicate = new Map<ScopePredicate, ScopeResolverFn>([
    ['PLATFORM', PLATFORM],
    ['SCHOOL', SCHOOL],
    ['SELF', SELF],
    ['OWNED', OWNED],
    ['ASSIGNED', unregisteredResolver('ASSIGNED')],
    ['DEPARTMENT', unregisteredResolver('DEPARTMENT')],
    ['NONE', () => false],
  ]);

  /** A later phase's real resolver, keyed by predicate — replaces the
   * built-in fail-closed default (ASSIGNED/DEPARTMENT) or extends a
   * built-in one (e.g. B12 wraps OWNED to also check ExamAdministrator). */
  register(predicate: ScopePredicate, resolver: ScopeResolverFn): void {
    this.byPredicate.set(predicate, resolver);
  }

  async resolve(
    predicate: ScopePredicate,
    actor: AuthorizedActor,
    resource: ResourceContext | undefined,
  ): Promise<boolean> {
    const resolver = this.byPredicate.get(predicate);
    if (!resolver) {
      throw new Error(
        `No scope resolver registered for predicate "${predicate}" — not even the fail-closed default.`,
      );
    }
    return resolver(actor, resource);
  }
}
