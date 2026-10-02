import type { LoggerService } from '@nestjs/common';
import type { Logger } from '@atlas/observability';

/**
 * B20: routes every Nest `Logger` call (`new Logger('X').warn(...)`, the
 * framework's own bootstrap lines) through the structured, redacting pino
 * logger from `@atlas/observability`, so the ~20 existing `Logger`
 * instances gain JSON output, correlation/tenant/trace fields and redaction
 * without touching their call sites. Installed in main.ts via
 * `app.useLogger(...)`; test harnesses can pass it as NestFactory's
 * `logger` option to capture output.
 */
export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, ...optional: unknown[]): void {
    this.write('info', message, optional);
  }

  error(message: unknown, ...optional: unknown[]): void {
    this.write('error', message, optional);
  }

  warn(message: unknown, ...optional: unknown[]): void {
    this.write('warn', message, optional);
  }

  debug(message: unknown, ...optional: unknown[]): void {
    this.write('debug', message, optional);
  }

  verbose(message: unknown, ...optional: unknown[]): void {
    this.write('trace', message, optional);
  }

  fatal(message: unknown, ...optional: unknown[]): void {
    this.write('fatal', message, optional);
  }

  /**
   * Nest's convention: the last optional argument is the context (logger
   * name); for `error`, the one before it may be a stack string.
   */
  private write(
    level: 'info' | 'error' | 'warn' | 'debug' | 'trace' | 'fatal',
    message: unknown,
    optional: unknown[],
  ): void {
    const params = [...optional];
    const context = typeof params[params.length - 1] === 'string' ? params.pop() : undefined;
    const fields: Record<string, unknown> = {};
    if (context) fields.context = context;
    if (level === 'error' && typeof params[0] === 'string' && params[0].includes('\n    at ')) {
      fields.stack = params.shift();
    }
    if (message instanceof Error) {
      this.logger[level]({ ...fields, err: message }, message.message);
      return;
    }
    if (message !== null && typeof message === 'object') {
      this.logger[level]({ ...fields, ...(message as Record<string, unknown>) });
      return;
    }
    this.logger[level](fields, String(message));
  }
}
