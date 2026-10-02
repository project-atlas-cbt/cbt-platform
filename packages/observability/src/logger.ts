import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import { trace } from '@opentelemetry/api';
import { currentLogContext } from './log-context.js';
import { REDACT_PATHS, REDACTED, scrubText } from './redaction.js';

export type { Logger } from 'pino';

export interface CreateLoggerOptions {
  /** `api`, `worker`, … — the `service` field on every line. */
  service: string;
  level?: string;
  /** Test hook: capture lines instead of writing to stdout. */
  destination?: DestinationStream;
}

/**
 * B20: the one structured JSON logger for apps/api and apps/worker (08 §18,
 * 09 §35). Every line carries `service`, plus — from the async log context
 * and the active OpenTelemetry span — `correlationId`, `schoolId`,
 * `userId`, `jobId`, `traceId`, `spanId` when known. Sensitive keys are
 * redacted structurally (REDACT_PATHS) and the message text is scrubbed
 * (emails, token query parameters, bearer tokens, session cookies).
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const config: LoggerOptions = {
    level: options.level ?? process.env.LOG_LEVEL ?? 'info',
    base: { service: options.service },
    messageKey: 'msg',
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: REDACTED },
    formatters: {
      level: (label) => ({ level: label }),
    },
    mixin() {
      const ctx = currentLogContext();
      const span = trace.getActiveSpan()?.spanContext();
      return {
        ...(ctx?.correlationId && { correlationId: ctx.correlationId }),
        ...(ctx?.schoolId && { schoolId: ctx.schoolId }),
        ...(ctx?.userId && { userId: ctx.userId }),
        ...(ctx?.jobId && { jobId: ctx.jobId }),
        ...(ctx?.queue && { queue: ctx.queue }),
        ...(span &&
          span.traceId !== '00000000000000000000000000000000' && {
            traceId: span.traceId,
            spanId: span.spanId,
          }),
      };
    },
    hooks: {
      // Scrub every string argument (the message and any interpolation
      // values) — pino's path redaction only sees object keys.
      logMethod(args, method) {
        const scrubbed = args.map((a: unknown) => (typeof a === 'string' ? scrubText(a) : a));
        return method.apply(this, scrubbed as Parameters<typeof method>);
      },
    },
    serializers: {
      err: (err: unknown) => serializeError(err),
      error: (err: unknown) => serializeError(err),
    },
  };
  return options.destination ? pino(config, options.destination) : pino(config);
}

/** Errors are serialised with their message/stack scrubbed — a Prisma or
 * driver error message can quote row values. */
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return {
      type: err.name,
      message: scrubText(err.message),
      ...(err.stack && { stack: scrubText(err.stack) }),
      ...(typeof code === 'string' && { code }),
    };
  }
  return { message: scrubText(String(err)) };
}
