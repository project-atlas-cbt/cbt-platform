import { describe, expect, it } from 'vitest';
import { PLATFORM_ROLES, ROLES, SCHOOL_ROLES } from './roles.js';

describe('roles (docs/02-roles-permissions.md)', () => {
  it('has exactly the six canonical roles', () => {
    expect(ROLES).toEqual([
      'SOFTWARE_ADMIN',
      'SCHOOL_ADMIN',
      'MODERATOR',
      'HOD',
      'TEACHER',
      'STUDENT',
    ]);
  });

  it('splits into platform and school roles with no overlap and no gaps', () => {
    const combined = [...PLATFORM_ROLES, ...SCHOOL_ROLES].sort();
    expect(combined).toEqual([...ROLES].sort());
    const overlap = PLATFORM_ROLES.filter((r) => (SCHOOL_ROLES as readonly string[]).includes(r));
    expect(overlap).toEqual([]);
  });

  it('SOFTWARE_ADMIN is the only platform-level role', () => {
    expect(PLATFORM_ROLES).toEqual(['SOFTWARE_ADMIN']);
  });
});
