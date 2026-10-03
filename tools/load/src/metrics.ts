import { createHistogram, type RecordableHistogram } from 'node:perf_hooks';

/**
 * Latency/outcome recorder. Histograms come from `perf_hooks` (HDR-style,
 * built in) and record integer microseconds, so percentiles are exact to
 * 1 µs without keeping every sample.
 */

export interface LabelStats {
  label: string;
  count: number;
  ok: number;
  /** 4xx that are *correct* refusals the client handles (e.g. 409 stale sequence) are still 4xx here; budgets decide what counts. */
  status: Record<string, number>;
  networkFailures: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
  bytes: number;
}

interface Bucket {
  histogram: RecordableHistogram;
  status: Map<number, number>;
  networkFailures: number;
  bytes: number;
}

function newBucket(): Bucket {
  return { histogram: createHistogram(), status: new Map(), networkFailures: 0, bytes: 0 };
}

function toMs(us: number): number {
  return Math.round(us / 10) / 100;
}

export class Recorder {
  private readonly buckets = new Map<string, Bucket>();
  /** Per-minute buckets, for endurance drift (does p95 degrade over the hour?). */
  private readonly windows = new Map<string, Map<number, Bucket>>();
  readonly startedAt = Date.now();

  constructor(private readonly windowLabels: ReadonlySet<string> = new Set()) {}

  record(label: string, ms: number, status: number, bytes = 0): void {
    const us = Math.max(1, Math.round(ms * 1000));
    for (const bucket of this.bucketsFor(label)) {
      bucket.histogram.record(us);
      bucket.status.set(status, (bucket.status.get(status) ?? 0) + 1);
      bucket.bytes += bytes;
    }
  }

  recordNetworkFailure(label: string, ms: number): void {
    for (const bucket of this.bucketsFor(label)) {
      bucket.networkFailures += 1;
      bucket.histogram.record(Math.max(1, Math.round(ms * 1000)));
    }
  }

  private bucketsFor(label: string): Bucket[] {
    let bucket = this.buckets.get(label);
    if (!bucket) {
      bucket = newBucket();
      this.buckets.set(label, bucket);
    }
    if (!this.windowLabels.has(label)) return [bucket];
    const minute = Math.floor((Date.now() - this.startedAt) / 60_000);
    let perLabel = this.windows.get(label);
    if (!perLabel) {
      perLabel = new Map();
      this.windows.set(label, perLabel);
    }
    let win = perLabel.get(minute);
    if (!win) {
      win = newBucket();
      perLabel.set(minute, win);
    }
    return [bucket, win];
  }

  stats(label: string): LabelStats | undefined {
    const bucket = this.buckets.get(label);
    return bucket ? summarize(label, bucket) : undefined;
  }

  all(): LabelStats[] {
    return [...this.buckets.entries()]
      .map(([label, bucket]) => summarize(label, bucket))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  windowSeries(label: string): (LabelStats & { minute: number })[] {
    const perLabel = this.windows.get(label);
    if (!perLabel) return [];
    return [...perLabel.entries()]
      .sort(([a], [b]) => a - b)
      .map(([minute, bucket]) => ({ ...summarize(label, bucket), minute }));
  }
}

function summarize(label: string, bucket: Bucket): LabelStats {
  const h = bucket.histogram;
  const status: Record<string, number> = {};
  let ok = 0;
  for (const [code, n] of bucket.status) {
    status[String(code)] = n;
    if (code >= 200 && code < 300) ok += n;
  }
  const count = h.count;
  return {
    label,
    count,
    ok,
    status,
    networkFailures: bucket.networkFailures,
    p50: count ? toMs(h.percentile(50)) : 0,
    p95: count ? toMs(h.percentile(95)) : 0,
    p99: count ? toMs(h.percentile(99)) : 0,
    max: count ? toMs(h.max) : 0,
    mean: count ? toMs(h.mean) : 0,
    bytes: bucket.bytes,
  };
}

/**
 * The project-owner-agreed B21 budgets (2026-10-02), server-side as seen by
 * the client on a clean network. See docs/performance/capacity-plan.md.
 */
export const BUDGETS = {
  answerSave: { p95: 250, p99: 750, successMin: 0.999 },
  start: { p95: 2_000 },
  submit: { p95: 2_000 },
  burstCompletionMs: 60_000,
  analytics: { coldP95: 3_000, cachedP95: 300 },
  labBurstMs: 60_000,
} as const;

export interface BudgetCheck {
  name: string;
  actual: string;
  budget: string;
  pass: boolean;
}

/**
 * Answer-save success excludes correct policy refusals (ADR-0003 window
 * closed, stale sequence) — the Exam Health Monitor makes the same
 * distinction. Network failures and 5xx/429 count as failures.
 */
export function answerSuccessRate(s: LabelStats): number {
  if (s.count === 0) return 1;
  const failed =
    s.networkFailures +
    Object.entries(s.status)
      .filter(([code]) => Number(code) >= 500 || Number(code) === 429)
      .reduce((sum, [, n]) => sum + n, 0);
  return (s.count - failed) / s.count;
}

export function checkLatency(
  name: string,
  s: LabelStats | undefined,
  budget: { p95?: number; p99?: number },
): BudgetCheck[] {
  if (!s) return [{ name, actual: 'no samples', budget: 'samples required', pass: false }];
  const checks: BudgetCheck[] = [];
  if (budget.p95 !== undefined) {
    checks.push({
      name: `${name} p95`,
      actual: `${s.p95} ms`,
      budget: `≤ ${budget.p95} ms`,
      pass: s.p95 <= budget.p95,
    });
  }
  if (budget.p99 !== undefined) {
    checks.push({
      name: `${name} p99`,
      actual: `${s.p99} ms`,
      budget: `≤ ${budget.p99} ms`,
      pass: s.p99 <= budget.p99,
    });
  }
  return checks;
}
