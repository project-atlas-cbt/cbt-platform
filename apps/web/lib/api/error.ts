import { isErrorEnvelope } from '@atlas/validation';

/**
 * The typed shape every part of the UI branches on — never raw `message`
 * text (doctrine §7 "Error states": "surface the error envelope's
 * `retryable` flag... to decide whether to offer a retry action"). Built
 * from the ADR-0033 envelope `@atlas/validation` already validates
 * server-side; this is the one place that parsing happens client-side too.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly correlationId: string;
  readonly details: Record<string, unknown> | undefined;
  readonly httpStatus: number | undefined;
  /** F20 (B21): the server's `Retry-After`, in ms — sent with a load-shed
   * `503 SERVICE_UNAVAILABLE`. A client that retries sooner costs the server
   * CPU per refusal (capacity plan §6), so every retry path honours it. */
  readonly retryAfterMs: number | undefined;

  constructor(options: {
    code: string;
    message: string;
    retryable: boolean;
    correlationId: string;
    details?: Record<string, unknown>;
    httpStatus?: number;
    retryAfterMs?: number;
  }) {
    super(options.message);
    this.name = 'ApiError';
    this.code = options.code;
    this.retryable = options.retryable;
    this.correlationId = options.correlationId;
    this.details = options.details;
    this.httpStatus = options.httpStatus;
    this.retryAfterMs = options.retryAfterMs;
  }
}

/**
 * A network failure never reached the server at all — no correlation id,
 * no envelope. Distinguished from `ApiError` so the UI can offer a retry
 * without implying the server rejected anything (`retryable` is always
 * true here: there's no server-declared reason not to retry a request
 * that never arrived).
 */
export class NetworkError extends Error {
  readonly retryable = true;
  constructor(message = 'Could not reach the server. Check your connection and try again.') {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * `Retry-After` is either delta-seconds or an HTTP-date (RFC 9110 §10.2.3).
 * Returns ms from `now`, or undefined when absent/unparseable. The API
 * exposes the header to cross-origin JS (`exposedHeaders`, F20).
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/** Normalises anything openapi-fetch/fetch can throw or return into one of the two types above. */
export function toApiError(
  body: unknown,
  httpStatus: number,
  fallbackMessage: string,
  headers?: Pick<Headers, 'get'>,
): ApiError {
  const retryAfterMs = parseRetryAfter(headers?.get('retry-after'));
  const retryAfter = retryAfterMs !== undefined ? { retryAfterMs } : {};
  if (isErrorEnvelope(body)) {
    return new ApiError({
      code: body.error.code,
      message: body.error.message,
      retryable: body.error.retryable,
      correlationId: body.error.correlationId,
      ...(body.error.details ? { details: body.error.details } : {}),
      httpStatus,
      ...retryAfter,
    });
  }

  // A non-2xx response that isn't a recognisable envelope (e.g. an
  // upstream proxy error page) — still typed, still branchable, just with
  // no correlation id to show.
  return new ApiError({
    code: 'UNKNOWN_ERROR',
    message: fallbackMessage,
    retryable: httpStatus >= 500,
    correlationId: 'unknown',
    httpStatus,
    ...retryAfter,
  });
}

export function isRetryable(error: unknown): boolean {
  return error instanceof ApiError ? error.retryable : error instanceof NetworkError;
}

/**
 * B21 load shedding: the API refuses reporting work (analytics, reports,
 * exports, search, imports) and new Control Center streams with
 * `503 SERVICE_UNAVAILABLE` while examinations are under heavy load. The UI
 * treats that as a calm, temporary state — not a failure.
 */
export function isTemporarilyUnavailable(error: unknown): error is ApiError {
  return (
    error instanceof ApiError && error.httpStatus === 503 && error.code === 'SERVICE_UNAVAILABLE'
  );
}
