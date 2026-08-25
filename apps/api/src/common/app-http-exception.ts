import { HttpStatus } from '@nestjs/common';
import { BASE_ERROR_CODES, isKnownBaseErrorCode } from '@atlas/domain';

export interface AppHttpExceptionOptions {
  /** A base code (packages/domain) or a domain-specific code added by a later phase. */
  code: string;
  message: string;
  /** Required for codes outside BASE_ERROR_CODES, since there's nothing to default from. */
  httpStatus?: number;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

/**
 * The exception type domain code should throw for any error the client
 * needs to distinguish by `code`. HttpExceptionFilter turns this directly
 * into the ADR-0033 envelope; nothing else should be caught-and-rethrown
 * as a raw NestJS HttpException once a stable code exists for it.
 */
export class AppHttpException extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(options: AppHttpExceptionOptions) {
    super(options.message);
    this.name = 'AppHttpException';
    this.code = options.code;

    const known: { httpStatus: number; retryable: boolean } | undefined = isKnownBaseErrorCode(
      options.code,
    )
      ? BASE_ERROR_CODES[options.code]
      : undefined;

    if (options.httpStatus === undefined && known === undefined) {
      throw new Error(
        `AppHttpException with unknown code "${options.code}" must specify httpStatus explicitly.`,
      );
    }

    this.httpStatus = options.httpStatus ?? known?.httpStatus ?? HttpStatus.INTERNAL_SERVER_ERROR;
    this.retryable = options.retryable ?? known?.retryable ?? false;
    // exactOptionalPropertyTypes: assigning `undefined` explicitly is not
    // the same as leaving the property absent, so this is conditional
    // rather than a direct `this.details = options.details`.
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}
