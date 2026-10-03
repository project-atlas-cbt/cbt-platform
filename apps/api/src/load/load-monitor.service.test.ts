import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import type { Env } from '@atlas/config';
import { LoadMonitorService } from './load-monitor.service.js';

const CONFIG: Partial<Env> = {
  LOAD_SHED_ENABLED: true,
  LOAD_SHED_EVENT_LOOP_P99_MS: 200,
  LOAD_SHED_MAX_IN_FLIGHT: 256,
  LOAD_SHED_EXAM_P95_MS: 200,
  LOAD_SHED_ELU: 0.9,
  LOAD_SHED_HOLD_MS: 30_000,
  SSE_MAX_CONNECTIONS_PER_PROCESS: 500,
};

function monitor() {
  const redis = {
    set: vi.fn().mockResolvedValue('OK'),
    exists: vi.fn().mockResolvedValue(0),
  };
  const config = { get: (k: keyof Env) => CONFIG[k] } as unknown as ConfigService<Env, true>;
  const m = new LoadMonitorService(redis as unknown as Redis, config);
  m.onModuleInit();
  return { m, redis };
}

let busy = 0;

/** One 1 s window of `n` exam write-path requests taking `ms` each. */
function window(m: LoadMonitorService, n: number, ms: number) {
  for (let i = 0; i < n; i++) {
    m.requestStarted();
    m.requestFinished(ms);
  }
  vi.advanceTimersByTime(1_000);
}

describe('LoadMonitorService exam-latency signal (B21, R-12)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The real figure measures this test's own synchronous loop; each test
    // sets the busy fraction it needs.
    busy = 0;
    vi.spyOn(performance, 'eventLoopUtilization').mockImplementation(() => ({
      idle: 0,
      active: 0,
      utilization: busy,
    }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sheds reporting after three consecutive slow exam-path windows, with the event loop idle', () => {
    const { m, redis } = monitor();
    vi.advanceTimersByTime(16_000); // past warm-up
    window(m, 50, 400);
    window(m, 50, 400);
    expect(m.level).toBe('none');
    window(m, 50, 300);
    expect(m.level).toBe('deferrable');
    expect(m.shouldShed('deferrable')).toBe(true);
    expect(m.shouldShed('critical')).toBe(false);
    expect(m.snapshot().examP95Ms).toBe(300);
    expect(redis.set).toHaveBeenCalledOnce(); // cluster signal raised
    m.onModuleDestroy();
  });

  it('sheds standard traffic too at twice the threshold', () => {
    const { m } = monitor();
    vi.advanceTimersByTime(16_000);
    for (let i = 0; i < 3; i++) window(m, 50, 900);
    expect(m.level).toBe('standard');
    m.onModuleDestroy();
  });

  it('ignores thin windows, a single slow window, and boot', () => {
    const { m } = monitor();
    for (let i = 0; i < 3; i++) window(m, 50, 900); // inside the 15 s warm-up
    expect(m.level).toBe('none');
    vi.advanceTimersByTime(16_000);
    for (let i = 0; i < 5; i++) window(m, 10, 5_000); // too few for a p95
    expect(m.level).toBe('none');
    window(m, 50, 900);
    window(m, 50, 50);
    window(m, 50, 900);
    window(m, 50, 900);
    expect(m.level).toBe('none');
    m.onModuleDestroy();
  });

  it('does not count requests outside the exam write path', () => {
    const { m } = monitor();
    vi.advanceTimersByTime(16_000);
    for (let w = 0; w < 4; w++) {
      for (let i = 0; i < 50; i++) {
        m.requestStarted();
        m.requestFinished();
      }
      vi.advanceTimersByTime(1_000);
    }
    expect(m.level).toBe('none');
    m.onModuleDestroy();
  });

  it('sheds reporting when the process is CPU-pegged, before any request is timed slow', () => {
    busy = 0.5;
    const { m } = monitor();
    vi.advanceTimersByTime(16_000);
    expect(m.level).toBe('none');
    busy = 0.97;
    // Fast exam traffic (well under the latency threshold) while pegged.
    window(m, 50, 20);
    window(m, 50, 20);
    expect(m.level).toBe('none');
    window(m, 50, 20);
    expect(m.level).toBe('deferrable'); // never 'standard' from utilisation alone
    expect(m.snapshot().eventLoopUtilization).toBe(0.97);
    m.onModuleDestroy();
  });

  it('does not shed a pegged process that is serving no exam traffic', () => {
    const { m, redis } = monitor();
    vi.advanceTimersByTime(16_000);
    busy = 0.99; // e.g. one school-wide analytics request, no exam running
    for (let w = 0; w < 5; w++) window(m, 5, 20);
    expect(m.level).toBe('none');
    expect(redis.set).not.toHaveBeenCalled();
    m.onModuleDestroy();
  });
});
