/**
 * Base error code enum for the ADR-0033 envelope. This is the B0 starter
 * set — generic, transport- and infrastructure-level failures every
 * endpoint can produce. Domain-specific codes (e.g. ATTEMPT_EXPIRED,
 * ATTEMPT_INVALIDATED) are added by the phase that introduces them and
 * appended here, never invented ad hoc at the call site, so the enum stays
 * the single source of truth the OpenAPI document generates from.
 *
 * `retryable` is fixed per code, not decided per occurrence: the same
 * failure must always tell the offline sync queue the same thing.
 */
export const BASE_ERROR_CODES = {
  VALIDATION_ERROR: { httpStatus: 400, retryable: false },
  UNAUTHENTICATED: { httpStatus: 401, retryable: false },
  FORBIDDEN: { httpStatus: 403, retryable: false },
  NOT_FOUND: { httpStatus: 404, retryable: false },
  CONFLICT: { httpStatus: 409, retryable: false },
  IDEMPOTENCY_KEY_REPLAY_MISMATCH: { httpStatus: 409, retryable: false },
  RATE_LIMITED: { httpStatus: 429, retryable: true },
  INTERNAL_ERROR: { httpStatus: 500, retryable: true },
  SERVICE_UNAVAILABLE: { httpStatus: 503, retryable: true },

  // B1 (Identity & Authentication) — see docs/roadmaps/backend-roadmap.md's
  // B1 DoD item 8: a MUST_CHANGE_PASSWORD/MUST_SET_PASSWORD account is
  // blocked from every authenticated route except password/change, enforced
  // centrally by AuthGuard so it can't be bypassed by calling another route.
  PASSWORD_CHANGE_REQUIRED: { httpStatus: 403, retryable: false },

  // B3 (Platform, Schools & Subscriptions).
  //
  // ACTIVATION_KEY_INVALID: the one response for "no such key" AND "this key
  // belongs to a different school" — enumeration-resistant by design, same
  // 404-not-403 rationale as NOT_FOUND above (never disclose existence
  // across a tenant boundary). ALREADY_USED/EXPIRED are distinct 409s
  // because /v1/activation/verify's whole purpose is telling a legitimate
  // admin *why* their key doesn't work, before they commit to a password —
  // unlike login, there is no account-enumeration concern for a key the
  // caller must already physically possess.
  ACTIVATION_KEY_INVALID: { httpStatus: 404, retryable: false },
  ACTIVATION_KEY_ALREADY_USED: { httpStatus: 409, retryable: false },
  ACTIVATION_KEY_EXPIRED: { httpStatus: 409, retryable: false },
  SUBSCRIPTION_PERIOD_OVERLAP: { httpStatus: 409, retryable: false },

  // Roadmap DoD item 4: "Suspension blocks school access immediately" —
  // enforced centrally by AuthGuard (identity module) on *every*
  // authenticated request, not just new logins, so an already-open session
  // stops working the moment a platform override is set. Distinct codes
  // (not a generic FORBIDDEN) because, unlike activation-key enumeration,
  // there is no secrecy concern here — the subdomain's existence and
  // branding are already publicly visible before any credentials are
  // entered (GET /tenant/resolve), so a specific, honest reason is more
  // useful than a vague one. Never returned for EXPIRED alone — ADR-0015
  // explicitly keeps login/reads/renewal working through an expired
  // subscription; only an explicit platform override blocks login itself.
  SCHOOL_ACCESS_SUSPENDED: { httpStatus: 403, retryable: false },
  SCHOOL_ACCESS_DEACTIVATED: { httpStatus: 403, retryable: false },
} as const;

export type BaseErrorCode = keyof typeof BASE_ERROR_CODES;

export function isKnownBaseErrorCode(code: string): code is BaseErrorCode {
  return Object.prototype.hasOwnProperty.call(BASE_ERROR_CODES, code);
}
