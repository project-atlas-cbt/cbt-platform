import { describe, expect, it } from 'vitest';
import { resolveLandingRoute } from './role-priority';

describe('resolveLandingRoute', () => {
  it('routes a single-role membership to its own workspace', () => {
    expect(resolveLandingRoute(['TEACHER'])).toBe('/teacher');
    expect(resolveLandingRoute(['STUDENT'])).toBe('/student');
  });

  it('prefers the higher-priority role when a membership holds more than one', () => {
    expect(resolveLandingRoute(['TEACHER', 'HOD'])).toBe('/hod');
    expect(resolveLandingRoute(['STUDENT', 'SCHOOL_ADMIN'])).toBe('/school');
  });

  it('is order-independent — priority, not array order, decides', () => {
    expect(resolveLandingRoute(['HOD', 'MODERATOR'])).toBe('/moderator');
  });

  it('returns null for an empty role list', () => {
    expect(resolveLandingRoute([])).toBeNull();
  });

  it('returns null for a role with no known landing route (e.g. a platform-only role)', () => {
    expect(resolveLandingRoute(['SOFTWARE_ADMIN'])).toBeNull();
  });
});
