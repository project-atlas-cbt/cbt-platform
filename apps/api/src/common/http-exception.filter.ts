import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { buildErrorEnvelope } from '@atlas/validation';
import { isKnownBaseErrorCode } from '@atlas/domain';
import { captureError } from '@atlas/observability';
import { AppHttpException } from './app-http-exception.js';
import { classifyUnavailable, DEPENDENCY_RETRY_AFTER_SECONDS } from './dependency-errors.js';

/**
 * Global filter: every non-2xx response leaves the API in the ADR-0033
 * envelope shape, never a bare NestJS default error body. Domain code
 * throws AppHttpException with a stable `code`; anything else (an
 * unexpected exception, a class-validator failure) is normalised here so a
 * bug can never leak a codeless response to the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();
    const correlationId = req.raw.correlationId ?? 'unknown';

    if (exception instanceof AppHttpException) {
      res.status(exception.httpStatus).send(
        buildErrorEnvelope({
          code: exception.code,
          message: exception.message,
          correlationId,
          retryable: exception.retryable,
          details: exception.details,
        }),
      );
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const { code, message, details } = classifyNestException(status, response);
      res.status(status).send(
        buildErrorEnvelope({
          code,
          message,
          correlationId,
          details,
        }),
      );
      return;
    }

    // B22 (08 §25): a dependency that is briefly unreachable (database
    // connection lost, Redis or object storage down) is a 503 the client
    // retries after a short wait, not an unexpected 500. Logged at warn with
    // the dependency named; the cause is never echoed to the client.
    const unavailable = classifyUnavailable(exception);
    if (unavailable) {
      this.logger.warn({
        msg: 'Dependency unavailable',
        dependency: unavailable,
        err: exception,
        correlationId,
        method: req.method,
        route: req.routeOptions?.url,
      });
      res.header('Retry-After', String(DEPENDENCY_RETRY_AFTER_SECONDS));
      res.status(HttpStatus.SERVICE_UNAVAILABLE).send(
        buildErrorEnvelope({
          code: 'SERVICE_UNAVAILABLE',
          message: 'The service is temporarily unavailable. Please try again shortly.',
          correlationId,
          retryable: true,
        }),
      );
      return;
    }

    // B20: structured, with the correlation id the client also receives —
    // the pino logger serialises `err` with its message/stack scrubbed
    // (a driver error can quote row values). Never the request body.
    this.logger.error({
      msg: 'Unhandled exception',
      err: exception,
      correlationId,
      method: req.method,
      route: req.routeOptions?.url,
    });
    captureError(exception, { correlationId });
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(
      buildErrorEnvelope({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        correlationId,
      }),
    );
  }
}

function classifyNestException(
  status: HttpStatus,
  response: string | object,
): { code: string; message: string; details?: Record<string, unknown> } {
  if (status === HttpStatus.BAD_REQUEST) {
    const body = typeof response === 'object' ? (response as Record<string, unknown>) : {};
    const messages = body.message;
    return {
      code: 'VALIDATION_ERROR',
      message: 'One or more fields failed validation.',
      details: { fields: messages },
    };
  }

  const fallbackByStatus: Record<number, string> = {
    [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
    [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
    [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
    [HttpStatus.CONFLICT]: 'CONFLICT',
    [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  };
  const code = fallbackByStatus[status] ?? 'INTERNAL_ERROR';
  const message =
    typeof response === 'string' ? response : isKnownBaseErrorCode(code) ? code : 'Request failed.';
  return { code, message };
}
