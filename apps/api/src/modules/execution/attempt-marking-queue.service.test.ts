/**
 * B20 DoD 5: the marking job carries the enqueuing request's W3C trace
 * context, so the worker's result-generation span joins the submit trace.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  InMemorySpanExporter,
  initTelemetry,
  shutdownTelemetry,
  withSpan,
} from '@atlas/observability';
import { DependencyHealth } from '../../common/dependency-health.js';
import { AttemptMarkingQueueService } from './attempt-marking-queue.service.js';

const exporter = new InMemorySpanExporter();
initTelemetry({ serviceName: 'test', exporter });

afterAll(async () => {
  await shutdownTelemetry();
});

describe('AttemptMarkingQueueService.enqueue (B20 trace propagation)', () => {
  it('stamps the active trace context onto the job payload', async () => {
    const service = new AttemptMarkingQueueService(
      { get: () => 2000 } as never,
      new DependencyHealth(),
    );
    const add = vi.fn().mockResolvedValue(undefined);
    (service as unknown as { queue: { add: typeof add } }).queue = { add };

    let traceId = '';
    await withSpan('attempt.submit', {}, async (span) => {
      traceId = span.spanContext().traceId;
      await service.enqueue({ schoolId: 's1', attemptId: 'a1' });
    });

    const [, data] = add.mock.calls[0]! as [string, { trace: Record<string, string> }];
    expect(data).toMatchObject({ schoolId: 's1', attemptId: 'a1' });
    expect(data.trace.traceparent).toContain(traceId);
  });
});
