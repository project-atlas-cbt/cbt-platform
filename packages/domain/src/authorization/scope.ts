/**
 * The closed scope-predicate vocabulary B2 (docs/roadmaps/backend-roadmap.md)
 * resolves audit finding A-03 into. `02-roles-permissions.md`'s matrix uses
 * at least 22 undefined terms ("Limited", "Own", "Assigned", "Department",
 * ...) on top of its own five-term legend; every one of those terms is
 * re-expressed as one of these seven predicates by permission-table.ts,
 * per A-03's own recommended interpretation.
 *
 * A predicate describes *how* a grant is scoped, not whether it is granted
 * — denial/break-glass/system are separate `Grant` kinds (see grant.ts).
 */
export const SCOPE_PREDICATES = [
  /** No access. Used internally by helpers; a real PermissionRule should
   * use a DENIED grant instead of NONE, which exists mainly so a scope
   * resolver has a defined "matches nothing" value to return. */
  'NONE',
  /** The current actor's own record (own account, own submitted answers,
   * own audit trail) — narrower than OWNED, which is about authored
   * resources rather than the actor's own identity. */
  'SELF',
  /** A resource the actor created or has been actively delegated authority
   * over (ADR-0012 / M-15's ExamAdministrator: "own exam" = created_by OR
   * active delegate). */
  'OWNED',
  /** A resource within the actor's explicit academic assignment — a
   * teacher's assigned subject+class combinations (02 rule 1). Requires
   * TeacherAssignment (B6); unregistered until then (see scope-resolvers
   * in apps/api's AuthorizationModule). */
  'ASSIGNED',
  /** A resource within the actor's assigned department — an HOD's academic
   * governance boundary (02 rule 2). Requires Department (B5); unregistered
   * until then. */
  'DEPARTMENT',
  /** Any resource belonging to the actor's own school. Tenant boundary
   * enforcement itself is RLS + AuthGuard's tenancy context (ADR-0023) —
   * this predicate is about role authority *within* that boundary. */
  'SCHOOL',
  /** Platform-wide — Software Admin's own operational domain (school CRUD,
   * subscriptions, activation, platform analytics/audit). Never implies
   * unrestricted school-academic authority — see ADR-0012. */
  'PLATFORM',
] as const;

export type ScopePredicate = (typeof SCOPE_PREDICATES)[number];
