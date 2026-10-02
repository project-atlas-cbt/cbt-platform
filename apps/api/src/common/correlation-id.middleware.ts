import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { v7 as uuidv7 } from 'uuid';
import { runWithLogContext } from '@atlas/observability';

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

/** B20: an inbound id is client-controlled text that lands in every log
 * line and a response header — accept only a short, plain token, otherwise
 * mint our own (prevents log forging via embedded newlines/JSON and header
 * abuse via oversized values). */
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{8,128}$/u;

/**
 * Every response carries a correlation id (ADR-0033 error envelope field),
 * reusing an inbound id if the caller (or an upstream proxy) already set
 * one, so a client-reported error can be traced through server logs.
 *
 * B20: the rest of the request runs inside an async log context carrying
 * that id, so every structured log line written while serving it
 * (TenancyMiddleware adds the school, AuthGuard the user) is correlated.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void) {
    const header = req.headers[CORRELATION_ID_HEADER];
    const inbound = Array.isArray(header) ? header[0] : header;
    const correlationId = inbound && SAFE_CORRELATION_ID.test(inbound) ? inbound : uuidv7();
    req.correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    runWithLogContext({ correlationId }, next);
  }
}
