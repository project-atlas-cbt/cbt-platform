import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { performance } from 'node:perf_hooks';
import { LoadMonitorService } from './load-monitor.service.js';
import { isExamWritePath, loadTierOf } from './load-tiers.js';

/** B21: counts every request in flight and times the exam write path (the
 * monitor's second and third saturation signals). No database work — it
 * runs before tenancy resolution. */
@Injectable()
export class InFlightMiddleware implements NestMiddleware {
  constructor(private readonly monitor: LoadMonitorService) {}

  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void): void {
    this.monitor.requestStarted();
    // Under Fastify's middleware layer `req.url` is rewritten relative to
    // the mount point (it reads "/" here); `originalUrl` is the request's own
    // path. B21 found every exam-gated signal dead until this was used.
    const url = (req as { originalUrl?: string }).originalUrl ?? req.url ?? '';
    const examWrite = isExamWritePath(url);
    const reporting = !examWrite && loadTierOf(url) === 'deferrable';
    if (reporting) this.monitor.reportingStarted();
    const began = examWrite ? performance.now() : 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.monitor.requestFinished(examWrite ? performance.now() - began : undefined);
      if (reporting) this.monitor.reportingFinished();
    };
    res.once('finish', finish);
    res.once('close', finish);
    next();
  }
}
