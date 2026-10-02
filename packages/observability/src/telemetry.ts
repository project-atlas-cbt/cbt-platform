import {
  context,
  propagation,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  type SpanExporter,
  type SpanProcessor,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

/**
 * B20 (08 §18 Tracing; 09 §35 OpenTelemetry): tracing bootstrap shared by
 * apps/api and apps/worker. Manual spans wrap the four critical flows the
 * roadmap names — start attempt, answer sync, submit, result generation —
 * rather than blanket auto-instrumentation, which would add a dependency
 * per library for spans nobody asked for (AGENTS.md §9).
 *
 * Export is OTLP/HTTP to `OTEL_EXPORTER_OTLP_ENDPOINT` when set; with no
 * endpoint the provider still runs (so trace ids reach logs and propagate
 * api → worker) but exports nothing. Tests pass their own exporter.
 */
export const TRACER_NAME = 'atlas';

let provider: NodeTracerProvider | undefined;

export interface InitTelemetryOptions {
  serviceName: string;
  otlpEndpoint?: string | undefined;
  /** Test hook — an in-memory exporter, exported synchronously. */
  exporter?: SpanExporter;
}

export function initTelemetry(options: InitTelemetryOptions): NodeTracerProvider {
  if (provider) return provider;
  const processors: SpanProcessor[] = [];
  if (options.exporter) {
    processors.push(new SimpleSpanProcessor(options.exporter));
  } else if (options.otlpEndpoint) {
    processors.push(
      new BatchSpanProcessor(
        new OTLPTraceExporter({ url: `${options.otlpEndpoint.replace(/\/$/u, '')}/v1/traces` }),
      ),
    );
  }
  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: options.serviceName }),
    spanProcessors: processors,
  });
  provider.register({ propagator: new W3CTraceContextPropagator() });
  return provider;
}

export async function shutdownTelemetry(): Promise<void> {
  await provider?.shutdown();
  provider = undefined;
}

export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

/** Names of the four critical-flow spans (B20 DoD 5) — one place, so the
 * trace-coverage test and the instrumented code can't drift apart. */
export const CRITICAL_SPANS = {
  attemptStart: 'attempt.start',
  answerSave: 'attempt.answer.save',
  answerSaveBatch: 'attempt.answer.save_batch',
  attemptSubmit: 'attempt.submit',
  resultGenerate: 'result.generate',
} as const;

/**
 * Runs `fn` inside an active span; records exceptions and marks the span
 * as errored on throw. Attributes must be ids/enums only — never names or
 * answer content (same hygiene rule as logs).
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return getTracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}

/** W3C trace-context carrier stored in BullMQ job data so a worker span
 * (e.g. result generation) continues the trace of the request that
 * enqueued it (submit). */
export type TraceCarrier = Record<string, string>;

export function injectTraceContext(): TraceCarrier {
  const carrier: TraceCarrier = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

export function withExtractedTraceContext<T>(carrier: TraceCarrier | undefined, fn: () => T): T {
  if (!carrier) return fn();
  return context.with(propagation.extract(context.active(), carrier), fn);
}
