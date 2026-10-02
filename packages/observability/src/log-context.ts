import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * B20 (08 §18 "structured logs with correlation identifiers and tenant
 * context where safe"): the per-request / per-job context every log line
 * carries. Populated by apps/api's CorrelationIdMiddleware + TenancyMiddleware
 * and by apps/worker's job wrapper; read by the logger's mixin. Ids only —
 * never names or other PII.
 */
export interface LogContext {
  correlationId?: string;
  schoolId?: string;
  userId?: string;
  jobId?: string;
  queue?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
  return storage.run({ ...ctx }, fn);
}

/** Adds fields to the current context in place (e.g. the school once the
 * tenancy middleware resolves it). No-op outside a context. */
export function enrichLogContext(fields: Partial<LogContext>): void {
  const current = storage.getStore();
  if (!current) return;
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) (current as Record<string, unknown>)[k] = v;
  }
}

export function currentLogContext(): LogContext | undefined {
  return storage.getStore();
}

/** Fastify's onRequest hook runs the rest of the request lifecycle in the
 * same async chain only if the store is entered (not `run`) there. */
export function enterLogContext(ctx: LogContext): void {
  storage.enterWith({ ...ctx });
}
