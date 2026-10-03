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
      // A refused exam-path call (4xx — a probe, the security suites, a stale
      // client) is not exam traffic: it must neither switch exam protection
      // on nor stand in for exam-path latency. A server error (5xx) is real
      // exam traffic in trouble and still counts.
      const servedExamWrite = examWrite && (res.statusCode < 400 || res.statusCode >= 500);
      this.monitor.requestFinished(servedExamWrite ? performance.now() - began : undefined);
      if (reporting) this.monitor.reportingFinished();
    };
    res.once('finish', finish);
    res.once('close', finish);
    next();
  }
}
