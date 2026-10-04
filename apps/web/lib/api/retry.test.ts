import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError, parseRetryAfter, toApiError } from './error';
import { MAX_QUERY_RETRIES, retryDelayFor, shouldRetryQuery } from './retry';

const shed = (retryAfterMs?: number) =>
  new ApiError({
    code: 'SERVICE_UNAVAILABLE',
    message: 'busy',
    retryable: true,
    correlationId: 'c',
    httpStatus: 503,
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  });

describe('parseRetryAfter', () => {
  it('reads delta-seconds and HTTP-dates', () => {
    expect(parseRetryAfter('30')).toBe(30_000);
    const now = Date.parse('2026-10-03T12:00:00Z');
    expect(parseRetryAfter('Sat, 03 Oct 2026 12:00:10 GMT', now)).toBe(10_000);
    expect(parseRetryAfter('garbage')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it('toApiError carries the header onto the error', () => {
    const err = toApiError(
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'm', retryable: true, correlationId: 'x' } },
      503,
      'f',
      new Headers({ 'Retry-After': '30' }),
    );
    expect(err.retryAfterMs).toBe(30_000);
  });
});

describe('retryDelayFor (B21: never sooner than Retry-After, always jittered)', () => {
  it('waits at least Retry-After, plus up to 30 % jitter', () => {
    expect(retryDelayFor(0, shed(30_000), () => 0)).toBe(30_000);
    expect(retryDelayFor(0, shed(30_000), () => 1)).toBe(39_000);
  });

  it('otherwise backs off exponentially with jitter, capped at 30 s', () => {
    expect(retryDelayFor(0, new NetworkError(), () => 0)).toBe(500);
    expect(retryDelayFor(3, new NetworkError(), () => 1)).toBe(8_000);
    expect(retryDelayFor(10, new NetworkError(), () => 1)).toBe(30_000);
  });
});

describe('shouldRetryQuery', () => {
  it('retries retryable failures a bounded number of times', () => {
    expect(shouldRetryQuery(0, shed(1000))).toBe(true);
    expect(shouldRetryQuery(MAX_QUERY_RETRIES, shed(1000))).toBe(false);
  });

  it('never resends what the server said not to retry', () => {
    const forbidden = new ApiError({
      code: 'FORBIDDEN',
      message: 'no',
      retryable: false,
      correlationId: 'c',
      httpStatus: 403,
    });
    expect(shouldRetryQuery(0, forbidden)).toBe(false);
  });
});
