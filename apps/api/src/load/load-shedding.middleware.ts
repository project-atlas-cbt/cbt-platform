import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { LoadMonitorService } from './load-monitor.service.js';

/** B21: counts every request in flight (the monitor's second saturation
 * signal). No database work — it runs before tenancy resolution. */
@Injectable()
export class InFlightMiddleware implements NestMiddleware {
  constructor(private readonly monitor: LoadMonitorService) {}

  use(_req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void): void {
    this.monitor.requestStarted();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      this.monitor.requestFinished();
    };
    res.once('finish', finish);
    res.once('close', finish);
    next();
  }
}
