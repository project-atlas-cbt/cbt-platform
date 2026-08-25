import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { v7 as uuidv7 } from 'uuid';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

// NestJS middleware under the Fastify adapter receives the *raw* Node
// request/response (FastifyRequest['raw'], i.e. http.IncomingMessage), not
// the Fastify-decorated FastifyRequest — so this augments 'node:http', and
// later code reads it back the same way: `request.raw.correlationId`
// (see http-exception.filter.ts), where `request.raw` is this same object.
declare module 'node:http' {
  interface IncomingMessage {
    correlationId: string;
  }
}

/**
 * Every response carries a correlation id (ADR-0033 error envelope field),
 * reusing an inbound id if the caller (or an upstream proxy) already set
 * one, so a client-reported error can be traced through server logs.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void) {
    const inbound = req.headers[CORRELATION_ID_HEADER];
    const correlationId = (Array.isArray(inbound) ? inbound[0] : inbound) || uuidv7();
    req.correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
