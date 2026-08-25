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
} as const;

export type BaseErrorCode = keyof typeof BASE_ERROR_CODES;

export function isKnownBaseErrorCode(code: string): code is BaseErrorCode {
  return Object.prototype.hasOwnProperty.call(BASE_ERROR_CODES, code);
}
