import type { Role } from '@atlas/domain';

/**
 * F1 engineering default for "where does a freshly logged-in user land
 * first" — not a permissions decision, and not the real per-role workspace
 * shell (that's F2's job — see `docs/roadmaps/frontend-roadmap.md`'s F2
 * section). A membership can hold more than one `RoleAssignment`
 * (06 §7/§9), so a fixed priority order picks one deterministic landing
 * route. F2's real academic-context/role switcher supersedes this once it
 * exists; until then this is a placeholder choice, not a hidden authority
 * decision — the server remains the real authority on what each role can
 * actually do everywhere else.
 */
const LANDING_PRIORITY: readonly Role[] = [
  'SCHOOL_ADMIN',
  'MODERATOR',
  'HOD',
  'TEACHER',
  'STUDENT',
];

const ROLE_LANDING_ROUTES: Partial<Record<Role, string>> = {
  SCHOOL_ADMIN: '/school',
  MODERATOR: '/moderator',
  HOD: '/hod',
  TEACHER: '/teacher',
  STUDENT: '/student',
};

/**
 * Resolves the first route a just-authenticated user should land on, or
 * `null` if none of their roles has a known landing route yet (e.g. a
 * membership with no active `RoleAssignment` at all — an edge case B2's
 * real authorization engine will make impossible to reach in practice, but
 * the client shouldn't crash on it in the meantime).
 */
export function resolveLandingRoute(roles: readonly Role[]): string | null {
  for (const role of LANDING_PRIORITY) {
    if (roles.includes(role)) {
      return ROLE_LANDING_ROUTES[role] ?? null;
    }
  }
  return null;
}
