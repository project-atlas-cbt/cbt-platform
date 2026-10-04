export { REDACT_PATHS, REDACTED, scrubText, scrubValue, isSensitiveKey } from './redaction.js';
export {
  runWithLogContext,
  enrichLogContext,
  enterLogContext,
  currentLogContext,
  type LogContext,
} from './log-context.js';
export { createLogger, serializeError, type Logger, type CreateLoggerOptions } from './logger.js';
export {
  initTelemetry,
  shutdownTelemetry,
  getTracer,
  withSpan,
  injectTraceContext,
  withExtractedTraceContext,
  CRITICAL_SPANS,
  TRACER_NAME,
  type TraceCarrier,
  type InitTelemetryOptions,
} from './telemetry.js';
export {
  initMetrics,
  shutdownMetrics,
  examInstruments,
  registerHealthGauges,
  recordDependencyFallback,
  recordWorkReconciled,
  type AnswerSaveOutcome,
  type DegradedDependency,
} from './metrics.js';
export {
  initSentry,
  isSentryEnabled,
  scrubSentryEvent,
  captureError,
  captureAlert,
  flushSentry,
  type InitSentryOptions,
} from './sentry.js';
export {
  HEALTH_COUNTERS,
  SUBMISSION_LATENCY_BUCKETS_MS,
  DEFAULT_EXAM_HEALTH_THRESHOLDS,
  minuteOf,
  counterKey,
  recordHealthCounter,
  recordSubmissionLatency,
  readHealthWindow,
  percentileFromBuckets,
  evaluateExamHealth,
  applyAlertTransitions,
  type HealthRedis,
  type HealthCounter,
  type HealthWindow,
  type QueueHealth,
  type ExamHealthInput,
  type ExamHealthThresholds,
  type AlertKey,
  type AlertCondition,
  type AlertTransition,
} from './exam-health.js';
// Test support: lets integration suites assert on finished spans.
export { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
