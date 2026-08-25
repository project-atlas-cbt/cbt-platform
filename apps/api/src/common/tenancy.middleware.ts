import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { TenancyContextService } from './tenancy-context.service.js';

export const SCHOOL_ID_HEADER = 'x-school-id';

/**
 * B0 placeholder resolution only: reads a school id from a header so the
 * tenancy primitive (context + RLS session variable) can be built and
 * tested end to end before real resolution exists.
 *
 * B1 (ADR-0005) replaces this with subdomain-at-login resolution and
 * session-carried school id; B2 makes the resulting context the single
 * input every authorization check reads. Nothing downstream should trust
 * this header once B1 lands — tracked so it isn't missed.
 */
@Injectable()
export class TenancyMiddleware implements NestMiddleware {
  constructor(private readonly tenancy: TenancyContextService) {}

  use(req: FastifyRequest['raw'], _res: FastifyReply['raw'], next: () => void) {
    const header = req.headers[SCHOOL_ID_HEADER];
    const schoolId = (Array.isArray(header) ? header[0] : header) ?? null;
    this.tenancy.run(schoolId, next);
  }
}
