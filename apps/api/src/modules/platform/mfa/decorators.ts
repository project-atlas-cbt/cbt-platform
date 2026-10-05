import { SetMetadata } from '@nestjs/common';

export const ALLOW_MFA_ENROLMENT_PENDING_KEY = 'atlas:allowMfaEnrolmentPending';

/**
 * B20: marks the few platform routes a Software Admin may still reach while
 * PLATFORM_MFA_REQUIRED is on and they have no second factor yet — the
 * enrolment routes themselves, plus sign-out and "who am I". Every other
 * platform route answers MFA_ENROLMENT_REQUIRED. Mirrors identity's
 * `@AllowPendingPasswordChange()`.
 */
export const AllowMfaEnrolmentPending = () => SetMetadata(ALLOW_MFA_ENROLMENT_PENDING_KEY, true);

export const ALLOW_PLATFORM_PASSWORD_CHANGE_PENDING_KEY =
  'atlas:allowPlatformPasswordChangePending';

/**
 * A Software Admin still on the temporary password the operator CLI emailed
 * them (`credentialState` MUST_CHANGE_PASSWORD) reaches only the routes
 * carrying this: the password change itself, plus sign-out, "who am I" and
 * the two-step setup routes that come before it in the first sign-in.
 * Every other platform route answers PASSWORD_CHANGE_REQUIRED. The platform
 * twin of identity's `@AllowPendingPasswordChange()`, kept separate by the
 * same convention as the two session guards.
 */
export const AllowPlatformPasswordChangePending = () =>
  SetMetadata(ALLOW_PLATFORM_PASSWORD_CHANGE_PENDING_KEY, true);
