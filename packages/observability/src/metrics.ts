import { metrics, type Counter, type Histogram, type Meter } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

/**
 * B20 (09 §36 "the metrics I particularly care about"): OpenTelemetry
 * instruments for the examination metrics, exported OTLP/HTTP when
 * `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Without an endpoint the API's
 * no-op meter is used and these calls cost nothing. The Exam Health
 * Monitor does NOT depend on this export — it reads its own Redis buckets
 * (exam-health.ts) so alerting works with no vendor configured.
 */
let meterProvider: MeterProvider | undefined;

export function initMetrics(options: {
  serviceName: string;
  otlpEndpoint?: string | undefined;
  exportIntervalMs?: number;
}): void {
  if (meterProvider || !options.otlpEndpoint) return;
  meterProvider = new MeterProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: options.serviceName }),
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${options.otlpEndpoint.replace(/\/$/u, '')}/v1/metrics`,
        }),
        exportIntervalMillis: options.exportIntervalMs ?? 15_000,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);
}

export async function shutdownMetrics(): Promise<void> {
  await meterProvider?.shutdown();
  meterProvider = undefined;
}

function meter(): Meter {
  return metrics.getMeter('atlas');
}

export type AnswerSaveOutcome = 'ok' | 'failed' | 'rejected';

interface ExamInstruments {
  answerSave: Counter;
  answerSaveDuration: Histogram;
  attemptStart: Counter;
  submission: Counter;
  submissionDuration: Histogram;
  resultGenerated: Counter;
  resultGenerationDuration: Histogram;
}

let instruments: ExamInstruments | undefined;

/** Lazily created so they bind to whichever meter provider is registered
 * by the time the first measurement happens. */
export function examInstruments(): ExamInstruments {
  if (instruments) return instruments;
  const m = meter();
  instruments = {
    answerSave: m.createCounter('atlas.answer_save', {
      description: 'Answer save requests by outcome (ok | failed | rejected).',
    }),
    answerSaveDuration: m.createHistogram('atlas.answer_save.duration', { unit: 'ms' }),
    attemptStart: m.createCounter('atlas.attempt.start'),
    submission: m.createCounter('atlas.submission', {
      description: 'Submissions by kind (manual | auto).',
    }),
    submissionDuration: m.createHistogram('atlas.submission.duration', { unit: 'ms' }),
    resultGenerated: m.createCounter('atlas.result.generated'),
    resultGenerationDuration: m.createHistogram('atlas.result.generation.duration', {
      unit: 'ms',
    }),
  };
  return instruments;
}

/** Observable gauges registered by the worker's health job, which already
 * computes these each tick. */
export function registerHealthGauges(
  read: () => {
    activeAttempts: number;
    queues: Record<string, { waiting: number; failed: number }>;
  },
): void {
  const m = meter();
  m.createObservableGauge('atlas.active_attempts').addCallback((r) => {
    r.observe(read().activeAttempts);
  });
  m.createObservableGauge('atlas.queue.waiting').addCallback((r) => {
    for (const [queue, s] of Object.entries(read().queues)) r.observe(s.waiting, { queue });
  });
  m.createObservableGauge('atlas.queue.failed').addCallback((r) => {
    for (const [queue, s] of Object.entries(read().queues)) r.observe(s.failed, { queue });
  });
}
