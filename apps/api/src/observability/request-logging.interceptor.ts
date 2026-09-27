import { CallHandler, ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { catchError, finalize, throwError, type Observable } from 'rxjs';
import { structuredLog } from '@atlas/observability';
import { TenancyContextService } from '../common/tenancy-context.service.js';

/**
 * Request logs are deliberately metadata-only. Query strings, request
 * bodies, user identifiers, cookies and headers are excluded by
 * construction so answer content and credentials cannot leak through an
 * accidental serializer.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly tenancy: TenancyContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const response = http.getResponse<FastifyReply>();
    const startedAt = performance.now();
    let failed = false;

    return next.handle().pipe(
      catchError((error: unknown) => {
        failed = true;
        structuredLog(
          'error',
          'http.request.failed',
          {
            correlationId: request.raw.correlationId,
            schoolId: this.tenancy.schoolId,
            method: request.method,
            route: request.routeOptions?.url ?? 'unmatched',
            statusCode: response.statusCode,
            durationMs: Math.round(performance.now() - startedAt),
          },
          error,
        );
        return throwError(() => error);
      }),
      finalize(() => {
        if (failed) return;
        structuredLog('info', 'http.request.completed', {
          correlationId: request.raw.correlationId,
          schoolId: this.tenancy.schoolId,
          method: request.method,
          route: request.routeOptions?.url ?? 'unmatched',
          statusCode: response.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        });
      }),
    );
  }
}
