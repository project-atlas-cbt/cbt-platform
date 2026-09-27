import { metrics, SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import * as Sentry from '@sentry/node';

export interface ObservabilityOptions {
  serviceName: string;
  environment: string;
  otlpEndpoint?: string;
  sentryDsn?: string;
}

let sdk: NodeSDK | null = null;

function redactSensitiveText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      '[redacted-id]',
    )
    .replace(/\b(?:bearer\s+)?[A-Za-z0-9_-]{32,}\b/gi, '[redacted-secret]');
}

/**
 * Initialises vendor-neutral telemetry. With no endpoint configured the
 * OpenTelemetry API remains a safe no-op, which keeps local development and
 * tests deterministic while production fails no requests merely because its
 * telemetry backend is temporarily unavailable.
 */
export function initializeObservability(options: ObservabilityOptions): void {
  if (options.sentryDsn) {
    Sentry.init({
      dsn: options.sentryDsn,
      environment: options.environment,
      sendDefaultPii: false,
      beforeSend(event) {
        // B20 log/telemetry hygiene: request bodies, cookies, credentials and
        // query strings may contain identifiers or answer content. They are
        // never required to diagnose a server exception.
        if (event.request) {
          delete event.request.cookies;
          delete event.request.data;
          delete event.request.query_string;
          if (event.request.url) {
            try {
              const url = new URL(event.request.url, 'http://redaction.invalid');
              event.request.url = `${url.pathname}${url.hash}`;
            } catch {
              event.request.url = '[redacted-url]';
            }
          }
          if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
            delete event.request.headers['x-csrf-token'];
          }
        }
        delete event.user;
        if (event.message) event.message = redactSensitiveText(event.message);
        for (const value of event.exception?.values ?? []) {
          if (value.value) value.value = redactSensitiveText(value.value);
        }
        for (const breadcrumb of event.breadcrumbs ?? []) {
          if (breadcrumb.message) breadcrumb.message = redactSensitiveText(breadcrumb.message);
          delete breadcrumb.data;
        }
        return event;
      },
    });
  }

  if (!options.otlpEndpoint || sdk) {
    return;
  }

  const endpoint = options.otlpEndpoint.replace(/\/+$/, '');
  sdk = new NodeSDK({
    serviceName: options.serviceName,
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      exportIntervalMillis: 30_000,
    }),
  });
  sdk.start();
}

export async function shutdownObservability(): Promise<void> {
  await Promise.all([sdk?.shutdown(), Sentry.flush(2_000)]);
  sdk = null;
}

export async function traceOperation<T>(
  name: string,
  attributes: Attributes,
  operation: () => Promise<T>,
): Promise<T> {
  return trace.getTracer('atlas').startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: SpanStatusCode.ERROR });
      Sentry.captureException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

const meter = metrics.getMeter('atlas');

export const examMetrics = {
  activeAttempts: meter.createUpDownCounter('exam.active_attempts'),
  attemptStarts: meter.createCounter('exam.attempt_starts'),
  answerSaves: meter.createCounter('exam.answer_saves'),
  answerSaveLatency: meter.createHistogram('exam.answer_save_latency_ms', { unit: 'ms' }),
  answerSyncFailures: meter.createCounter('exam.answer_sync_failures'),
  submissions: meter.createCounter('exam.submissions'),
  submissionLatency: meter.createHistogram('exam.submission_latency_ms', { unit: 'ms' }),
  resultGenerationLatency: meter.createHistogram('exam.result_generation_latency_ms', {
    unit: 'ms',
  }),
  operationalAlerts: meter.createCounter('exam.operational_alerts'),
};

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type SafeLogValue = string | number | boolean | null | undefined;
export type SafeLogFields = Record<string, SafeLogValue>;

const sensitiveKey =
  /answer|password|secret|token|cookie|authorization|credential|content|email|name/i;

/**
 * Structured logs accept scalar, pre-selected fields only and reject common
 * sensitive key names. Callers must never pass request bodies or arbitrary
 * domain objects.
 */
export function structuredLog(
  level: LogLevel,
  event: string,
  fields: SafeLogFields = {},
  error?: unknown,
): void {
  const safeFields = Object.fromEntries(
    Object.entries(fields).filter(([key, value]) => !sensitiveKey.test(key) && value !== undefined),
  );
  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...safeFields,
  };
  if (error !== undefined) {
    payload.errorType = error instanceof Error ? error.name : 'UnknownError';
  }
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function captureOperationalAlert(message: string, fields: SafeLogFields): void {
  Sentry.captureMessage(message, {
    level: 'error',
    tags: Object.fromEntries(
      Object.entries(fields)
        .filter(
          ([key, value]) =>
            !sensitiveKey.test(key) && (typeof value === 'string' || typeof value === 'number'),
        )
        .map(([key, value]) => [key, String(value)]),
    ),
  });
}
