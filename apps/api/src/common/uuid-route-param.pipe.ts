import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { AppHttpException } from './app-http-exception.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ID_PARAM = /^(?:id|[a-z][A-Za-z]*Id)$/u;

/**
 * B20 input validation (08 §16 "validate all external input"): every route
 * parameter named `id` or `…Id` must be a UUID, checked once, globally,
 * before any handler or query runs. Found by the B20 input-attack suite:
 * ~80 id-bearing routes passed a malformed segment straight to Postgres,
 * whose uuid cast error surfaced as an unhandled 500 (B19 had fixed the
 * same class of bug for rollover routes alone, one ParseUUIDPipe at a
 * time). Not an injection — Prisma parameterises everything — but a crash
 * on hostile input, and noise in the error tracker.
 */
@Injectable()
export class UuidRouteParamPipe implements PipeTransform<unknown> {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'param' || !metadata.data || !ID_PARAM.test(metadata.data)) return value;
    if (typeof value === 'string' && UUID.test(value)) return value;
    throw new AppHttpException({
      code: 'VALIDATION_ERROR',
      message: `Route parameter "${metadata.data}" must be a UUID.`,
    });
  }
}
