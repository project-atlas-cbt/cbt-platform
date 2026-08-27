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

/** Mirrors `PlatformAuthController_me`'s response shape
 * (apps/api/src/modules/platform/dto/platform-me-response.dto.ts) — the
 * Software Admin equivalent of `CurrentUser`/`AuthMe` above. Deliberately a
 * separate, parallel type rather than a union member of `AuthMe`: the two
 * sessions (`PlatformSession` vs. `Session`) are unrelated mechanisms by
 * backend convention (see CLAUDE.md's B3 notes), and a platform account has
 * no `SchoolMembership`/`effectiveSchoolId` at all. */
export interface PlatformCurrentUser {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  status: string;
}

export interface PlatformMe {
  user: PlatformCurrentUser;
  /** Active `PlatformRoleAssignment.role` values — always `['SOFTWARE_ADMIN']`
   * today given the DB `CHECK` constraint, but typed as `Role[]` for
   * consistency with `AuthMe.roles`. */
  roles: Role[];
}

/** No `password-change-required` state: B3 shipped no forced-password-change
 * gate for platform accounts (recorded as a deferral in its own change-log
 * entry) — there is no `/v1/platform/auth/password/change` endpoint yet. */
export type PlatformAuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
