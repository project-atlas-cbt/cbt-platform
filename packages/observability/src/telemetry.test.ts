import { afterAll, describe, expect, it } from 'vitest';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import {
  initTelemetry,
  injectTraceContext,
  shutdownTelemetry,
  withExtractedTraceContext,
  withSpan,
} from './telemetry.js';

const exporter = new InMemorySpanExporter();
initTelemetry({ serviceName: 'test', exporter });

afterAll(async () => {
  await shutdownTelemetry();
});

describe('telemetry', () => {
  it('records spans with attributes and error status', async () => {
    await withSpan('ok.span', { 'atlas.attempt_id': 'a1' }, () => Promise.resolve(1));
    await expect(withSpan('bad.span', {}, () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    const spans = exporter.getFinishedSpans();
    const ok = spans.find((s) => s.name === 'ok.span')!;
    const bad = spans.find((s) => s.name === 'bad.span')!;
    expect(ok.attributes['atlas.attempt_id']).toBe('a1');
    expect(bad.status.code).toBe(2); // ERROR
    expect(bad.events.some((e) => e.name === 'exception')).toBe(true);
  });

  it('continues a trace across a job boundary via the injected carrier', async () => {
    exporter.reset();
    let carrier: Record<string, string> = {};
    await withSpan('producer', {}, () => {
      carrier = injectTraceContext();
      return Promise.resolve();
    });
    expect(carrier.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
    await withExtractedTraceContext(carrier, () =>
      withSpan('consumer', {}, () => Promise.resolve()),
    );
    const [producer, consumer] = ['producer', 'consumer'].map((n) =>
      exporter.getFinishedSpans().find((s) => s.name === n)!,
    );
    expect(consumer!.spanContext().traceId).toBe(producer!.spanContext().traceId);
    expect(consumer!.parentSpanContext?.spanId).toBe(producer!.spanContext().spanId);
  });
});
