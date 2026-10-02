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
