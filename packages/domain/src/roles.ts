/**
 * The six canonical roles (docs/02-roles-permissions.md; CLAUDE.md "Canonical
 * Roles"). Closed set — do not add permanent roles without explicit product
 * approval (CLAUDE.md working rule).
 */
export const ROLES = [
  'SOFTWARE_ADMIN',
  'SCHOOL_ADMIN',
  'MODERATOR',
  'HOD',
  'TEACHER',
  'STUDENT',
] as const;

export type Role = (typeof ROLES)[number];

/** SOFTWARE_ADMIN is the only platform-level role; the rest are school-scoped. */
export const PLATFORM_ROLES = ['SOFTWARE_ADMIN'] as const satisfies readonly Role[];
export const SCHOOL_ROLES = [
  'SCHOOL_ADMIN',
  'MODERATOR',
  'HOD',
  'TEACHER',
  'STUDENT',
] as const satisfies readonly Role[];
