import { describe, expect, it } from 'vitest';
import { BASE_ERROR_CODES, isKnownBaseErrorCode } from './error-codes.js';

describe('BASE_ERROR_CODES (ADR-0033)', () => {
  it('fixes retryable per code rather than leaving it to the caller', () => {
    expect(BASE_ERROR_CODES.SERVICE_UNAVAILABLE.retryable).toBe(true);
    expect(BASE_ERROR_CODES.RATE_LIMITED.retryable).toBe(true);
    expect(BASE_ERROR_CODES.VALIDATION_ERROR.retryable).toBe(false);
    expect(BASE_ERROR_CODES.CONFLICT.retryable).toBe(false);
  });

  it('cross-tenant-shaped codes use 404, never 403 (ADR-0033: never disclose existence)', () => {
    expect(BASE_ERROR_CODES.NOT_FOUND.httpStatus).toBe(404);
  });

  it('isKnownBaseErrorCode narrows correctly', () => {
    expect(isKnownBaseErrorCode('NOT_FOUND')).toBe(true);
    expect(isKnownBaseErrorCode('ATTEMPT_EXPIRED')).toBe(false);
  });
});
