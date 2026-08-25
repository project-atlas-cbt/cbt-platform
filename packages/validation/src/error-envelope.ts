import { BASE_ERROR_CODES, type BaseErrorCode } from '@atlas/domain';

/**
 * The ADR-0033 error envelope. Every non-2xx API response takes this shape —
 * `code` is what clients branch on, never `message` text; `retryable` is
 * what the offline sync queue (F13) decides retry-vs-drop from.
 */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    correlationId: string;
    details?: Record<string, unknown>;
  };
}

export interface BuildErrorEnvelopeOptions {
  code: string;
  message: string;
  correlationId: string;
  /** Overrides the code's default retryability. Use sparingly and document why. */
  retryable?: boolean;
  // Explicitly unioned with `undefined` (rather than a bare `?:`) so callers
  // can pass through an already-optional `details` field — e.g.
  // `exception.details` — under this project's exactOptionalPropertyTypes.
  details?: Record<string, unknown> | undefined;
}

/** Looks up the default retryable + HTTP status for a base error code. */
export function describeBaseErrorCode(code: BaseErrorCode) {
  return BASE_ERROR_CODES[code];
}

export function buildErrorEnvelope(options: BuildErrorEnvelopeOptions): ErrorEnvelope {
  const known = Object.prototype.hasOwnProperty.call(BASE_ERROR_CODES, options.code)
    ? BASE_ERROR_CODES[options.code as BaseErrorCode]
    : undefined;

  const retryable = options.retryable ?? known?.retryable ?? false;

  return {
    error: {
      code: options.code,
      message: options.message,
      retryable,
      correlationId: options.correlationId,
      ...(options.details ? { details: options.details } : {}),
    },
  };
}

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const err = (value as { error?: unknown }).error;
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'retryable' in err &&
    'correlationId' in err
  );
}
