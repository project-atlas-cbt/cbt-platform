import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'atlas:allowPendingPasswordChange';

/**
 * Marks a route as reachable even while the caller's `credentialState` is
 * `MUST_CHANGE_PASSWORD`/`MUST_SET_PASSWORD` — used by exactly one route,
 * `POST /auth/password/change` itself (B1 DoD item 8: the forced-change
 * gate is enforced centrally by AuthGuard, not per-controller, specifically
 * so it "cannot be bypassed by calling any other endpoint" — this decorator
 * is the single, explicit exception to that rule, not a general escape hatch).
 */
export const AllowPendingPasswordChange = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);
