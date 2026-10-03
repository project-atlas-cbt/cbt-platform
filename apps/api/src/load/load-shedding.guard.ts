import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppHttpException } from '../common/app-http-exception.js';
import { LoadMonitorService } from './load-monitor.service.js';
import { isControlStream, loadTierOf } from './load-tiers.js';

/**
 * B21 (R-12): global guard, registered ahead of every other guard so a shed
 * request costs no session lookup. Answers `503 SERVICE_UNAVAILABLE`
 * (an existing ADR-0033 code, `retryable: true`) with `Retry-After`. The
 * `critical` tier — exam execution and sign-in — always passes.
 */
@Injectable()
export class LoadSheddingGuard implements CanActivate {
  constructor(private readonly monitor: LoadMonitorService) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const url = req.raw.url ?? req.url;
    const tier = loadTierOf(url);
    const refuseStream = isControlStream(url) && this.monitor.shouldRefuseStream();
    if (!refuseStream && !this.monitor.shouldShed(tier)) return true;

    const reply = context.switchToHttp().getResponse<FastifyReply>();
    reply.header('retry-after', String(this.monitor.retryAfterSeconds));
    throw new AppHttpException({
      code: 'SERVICE_UNAVAILABLE',
      message: refuseStream
        ? 'Live updates are paused; this page will refresh automatically.'
        : 'This is temporarily unavailable while examinations are under heavy load. Please try again shortly.',
    });
  }
}
