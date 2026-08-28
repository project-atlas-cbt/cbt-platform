import type { Role } from '@atlas/domain';

/**
 * The evaluated identity AuthorizationService reasons about — deliberately
 * separate from AuthGuard's `AuthenticatedUser` (identity module) so the
 * engine itself stays testable with plain fixtures (2026-08-26 decision:
 * break-glass and the effective-access function were originally tested via
 * direct actor construction, not a real login flow, since Software Admin
 * login had no endpoint until B3).
 *
 * `SCHOOL` is produced by AuthGuard (identity module); `PLATFORM` by
 * PlatformAuthGuard (B3, platform module) — see
 * PermissionGuard's actorFromAuthenticatedUser for where the two map onto
 * this type, and PlatformRoleAssignment's own schema doc comment for the
 * matching 2026-08-26 decision on how the platform identity is represented.
 */
export type AuthorizedActor =
  | { kind: 'SCHOOL'; userId: string; schoolId: string; membershipId: string; roles: Role[] }
  | { kind: 'PLATFORM'; userId: string; roles: Role[] };

/**
 * What's known about the concrete resource instance a permission check is
 * against — absent entirely for CREATE/list-type checks with no single
 * target yet. Every field is optional because different scope predicates
 * care about different facts, and most resources this table describes
 * don't exist in the schema yet (see PermissionRule.awaitingResource).
 */
export interface ResourceContext {
  /** The resource's owning school — checked against the actor's own
   * school before any grant/scope logic runs at all (DoD item 11: a
   * cross-tenant mismatch is NOT_FOUND, never reached as a scope
   * question). */
  schoolId?: string;
  /** OWNED: the membership that created/owns this resource (or is an
   * active delegate — e.g. ExamAdministrator, wired by B12 into this same
   * field's resolver). */
  ownerMembershipId?: string;
  /** SELF: the user this resource is *about* (their own account, their
   * own audit trail) — distinct from ownerMembershipId, which is about
   * authorship, not identity. */
  ownerUserId?: string;
  /** DEPARTMENT (B5): the department this resource belongs to, either
   * directly (a Department/HODAssignment resource) or via a two-hop join
   * a later phase's caller resolves itself before constructing this context
   * (e.g. B9's Question -> Subject.departmentId). See
   * academics/department-scope.resolver.ts. */
  departmentId?: string;
}

export type AuthorizationOutcome = 'ALLOWED' | 'FORBIDDEN' | 'NOT_FOUND';

export interface AuthorizationDecision {
  allowed: boolean;
  outcome: AuthorizationOutcome;
  ruleId: string;
  /** Set when allowed=true: which of the actor's roles and scope produced
   * the decision. */
  matchedRole?: Role;
  matchedScope?: string;
  /** Set when at least one of the actor's roles has a BREAK_GLASS grant
   * for this rule — evaluate() itself never allows on this basis; a
   * caller must invoke BreakGlassService explicitly (never a substitute
   * for an ordinary GRANTED scope). */
  requiresBreakGlass: boolean;
}
