import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import type { Env } from '@atlas/config';
import { AppHttpException } from '../../../common/app-http-exception.js';

export const MARKETING_KEY_HEADER = 'x-marketing-key';

const digest = (v: string) => createHash('sha256').update(v).digest();

/**
 * ADR-0034 amendment: only the marketing site's own server may write page
 * views and contacts. It proves that with the shared `MARKETING_INGEST_KEY`
 * in a header. With no key configured the routes do not exist (404), so a
 * server that never set one exposes nothing.
 */
@Injectable()
export class MarketingIngestGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get('MARKETING_INGEST_KEY', { infer: true });
    if (!expected) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Not found.' });
    }
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const header = req.headers[MARKETING_KEY_HEADER];
    const given = Array.isArray(header) ? header[0] : header;
    // Compare fixed-length digests so neither length nor content leaks by timing.
    if (!given || !timingSafeEqual(digest(given), digest(expected))) {
      throw new AppHttpException({ code: 'UNAUTHENTICATED', message: 'Invalid ingest key.' });
    }
    return true;
  }
}
