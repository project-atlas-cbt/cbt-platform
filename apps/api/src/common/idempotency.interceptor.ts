import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import { of, type Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { isValidIdempotencyKey } from '@atlas/validation';
import type { Env } from '@atlas/config';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { AppHttpException } from './app-http-exception.js';

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface StoredResponse {
  status: number;
  body: unknown;
  requestFingerprint: string;
}

/**
 * ADR-0033: a client-generated UUIDv7 in `Idempotency-Key`, one per logical
 * operation. A replay of the same key returns the original response
 * unchanged; the same key with a different payload is a 409, never a
 * silent overwrite. Stored in Redis with a bounded TTL (env
 * IDEMPOTENCY_KEY_TTL_SECONDS, default 24h — longer than any attempt).
 *
 * Only applies to mutating methods; GET/HEAD pass through untouched.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // NestInterceptor allows `Observable<any> | Promise<Observable<any>>` —
  // every branch below must resolve to an Observable, never a bare value,
  // or Nest's runtime pipeline breaks silently on whichever branch got it
  // wrong.
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const res = context.switchToHttp().getResponse<FastifyReply>();

    if (!MUTATING_METHODS.has(req.method)) {
      return next.handle();
    }

    const rawKey = req.headers[IDEMPOTENCY_KEY_HEADER];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!key) {
      // Not every mutating endpoint requires idempotency (B0 leaves this
      // permissive); endpoints that must have one enforce it themselves.
      return next.handle();
    }
    if (!isValidIdempotencyKey(key)) {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Idempotency-Key must be a UUIDv7.',
      });
    }

    const fingerprint = fingerprintRequest(req);
    // B20: scoped to the caller. Unscoped, a key is a bearer handle on
    // someone else's stored response — any caller who learned (or guessed)
    // a key could replay it with the same URL and body and be handed the
    // original caller's response body. Guards have already run here, so
    // req.user is the authenticated principal (or absent on public routes).
    const redisKey = `idempotency:${idempotencyScope(req)}:${key}`;
    const existingRaw = await this.redis.get(redisKey);

    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as StoredResponse;
      if (existing.requestFingerprint !== fingerprint) {
        throw new AppHttpException({
          code: 'IDEMPOTENCY_KEY_REPLAY_MISMATCH',
          message: 'This Idempotency-Key was already used with a different request payload.',
        });
      }
      res.status(existing.status);
      return of(existing.body);
    }

    const ttl = this.config.get('IDEMPOTENCY_KEY_TTL_SECONDS', { infer: true });
    return next.handle().pipe(
      tap((body: unknown) => {
        const stored: StoredResponse = {
          status: res.statusCode,
          body,
          requestFingerprint: fingerprint,
        };
        // NX: the first completed response for a key is the one every replay
        // gets — a concurrent duplicate finishing second never overwrites it.
        void this.redis.set(redisKey, JSON.stringify(stored), 'EX', ttl, 'NX');
      }),
    );
  }
}

function idempotencyScope(req: FastifyRequest): string {
  const user = req.user;
  if (user?.kind === 'SCHOOL') return `school:${user.schoolId}:user:${user.userId}`;
  if (user?.kind === 'PLATFORM') return `platform:user:${user.userId}`;
  return `anon:${createHash('sha256')
    .update(req.ip ?? '')
    .digest('hex')
    .slice(0, 16)}`;
}

function fingerprintRequest(req: FastifyRequest): string {
  const hash = createHash('sha256');
  hash.update(req.method);
  hash.update(req.url);
  hash.update(JSON.stringify(req.body ?? null));
  return hash.digest('hex');
}
