import type { Role } from '@atlas/domain';

/** Mirrors IdentityService.me()'s response shape (apps/api/src/modules/identity). */
export interface CurrentUser {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  status: string;
}

export interface CurrentMembership {
  id: string;
  loginIdentifier: string;
  status: string;
}

export interface AuthMe {
  user: CurrentUser;
  membership: CurrentMembership;
  roles: Role[];
  effectiveSchoolId: string;
}

/**
 * `password-change-required` has no `me` payload at all — `AuthGuard`
 * rejects `GET /auth/me` itself with `PASSWORD_CHANGE_REQUIRED` for a
 * pending-change account (apps/api/src/modules/identity/auth.guard.ts).
 * This is the *only* signal for that state; it is never a field on a
 * successful response.
 */
export type AuthStatus =
  'loading' | 'authenticated' | 'unauthenticated' | 'password-change-required';
