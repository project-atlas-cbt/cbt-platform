/**
 * B20 Exam Health Monitor (09 §37; DoD 7): "Suppose 500 students are
 * currently taking exams. Then suddenly Answer Save Success 98.9% → 91.2%
 * → 76%. That should trigger an operational alert."
 *
 * The API records outcomes into per-minute Redis counters (cheap INCRs on
 * the hot answer path — no queue, per 09 §17); the worker reads a sliding
 * window, evaluates it here, and dispatches on state transitions only.
 * Backend-independent on purpose: the monitor must work even when no
 * observability vendor is configured, because the thing it watches is the
 * product's most important path. The same numbers also go to OpenTelemetry
 * metrics for dashboards (metrics.ts).
 */

/** Minimal Redis surface — satisfied by ioredis, mockable in unit tests. */
export interface HealthRedis {
  incrby(key: string, increment: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, secondsToken: 'EX', seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
}

export const HEALTH_COUNTERS = [
  'answer_save_ok',
  /** Server-side failure (5xx / unexpected error) — what the alert measures. */
  'answer_save_failed',
  /** Policy rejection (attempt expired, not writable, stale sequence) — a
   * correct answer from the server, NOT a failure; tracked for context. */
  'answer_save_rejected',
  'attempt_started',
  'submission_count',
  'auth_failure',
] as const;
export type HealthCounter = (typeof HEALTH_COUNTERS)[number];

/** Submission latency histogram bucket upper bounds (ms). */
export const SUBMISSION_LATENCY_BUCKETS_MS = [250, 500, 1000, 2000, 5000, 10000] as const;

const KEY_PREFIX = 'atlas:health';
const BUCKET_TTL_SECONDS = 2 * 60 * 60;

export function minuteOf(atMs: number): number {
  return Math.floor(atMs / 60_000);
}

export function counterKey(counter: string, minute: number): string {
  return `${KEY_PREFIX}:${counter}:${minute}`;
}

function latencyBucketCounter(ms: number): string {
  const bound = SUBMISSION_LATENCY_BUCKETS_MS.find((b) => ms <= b);
  return `submission_latency_le_${bound ?? 'inf'}`;
}

export async function recordHealthCounter(
  redis: HealthRedis,
  counter: HealthCounter,
  atMs: number = Date.now(),
  increment = 1,
): Promise<void> {
  const key = counterKey(counter, minuteOf(atMs));
  await redis.incrby(key, increment);
  await redis.expire(key, BUCKET_TTL_SECONDS);
}

export async function recordSubmissionLatency(
  redis: HealthRedis,
  latencyMs: number,
  atMs: number = Date.now(),
): Promise<void> {
  const minute = minuteOf(atMs);
  for (const counter of ['submission_count', latencyBucketCounter(latencyMs)]) {
    const key = counterKey(counter, minute);
    await redis.incrby(key, 1);
    await redis.expire(key, BUCKET_TTL_SECONDS);
  }
}

async function sumWindow(
  redis: HealthRedis,
  counter: string,
  endMinute: number,
  windowMinutes: number,
): Promise<number> {
  const keys = Array.from({ length: windowMinutes }, (_, i) => counterKey(counter, endMinute - i));
  const values = await redis.mget(...keys);
  return values.reduce((acc, v) => acc + (v ? Number(v) : 0), 0);
}

export interface HealthWindow {
  windowMinutes: number;
  answerSaveOk: number;
  answerSaveFailed: number;
  answerSaveRejected: number;
  attemptStarted: number;
  submissionCount: number;
  /** Count per latency bucket upper bound (ms), `Infinity` for overflow. */
  submissionLatency: Array<{ le: number; count: number }>;
  authFailures: number;
}

export async function readHealthWindow(
  redis: HealthRedis,
  windowMinutes: number,
  atMs: number = Date.now(),
): Promise<HealthWindow> {
  // The current minute is still filling; include it — a sharp drop should
  // alert within a minute, not after the minute closes.
  const end = minuteOf(atMs);
  const sum = (c: string) => sumWindow(redis, c, end, windowMinutes);
  const bounds: number[] = [...SUBMISSION_LATENCY_BUCKETS_MS, Infinity];
  const latency = await Promise.all(
    bounds.map(async (le) => ({
      le,
      count: await sum(`submission_latency_le_${Number.isFinite(le) ? le : 'inf'}`),
    })),
  );
  return {
    windowMinutes,
    answerSaveOk: await sum('answer_save_ok'),
    answerSaveFailed: await sum('answer_save_failed'),
    answerSaveRejected: await sum('answer_save_rejected'),
    attemptStarted: await sum('attempt_started'),
    submissionCount: await sum('submission_count'),
    submissionLatency: latency,
    authFailures: await sum('auth_failure'),
  };
}

/** Approximate percentile from the bucketed histogram (upper bound of the
 * bucket containing the rank) — conservative: never under-reports. */
export function percentileFromBuckets(
  buckets: Array<{ le: number; count: number }>,
  p: number,
): number | null {
  const total = buckets.reduce((a, b) => a + b.count, 0);
  if (total === 0) return null;
  const rank = Math.ceil(total * p);
  let seen = 0;
  for (const b of buckets) {
    seen += b.count;
    if (seen >= rank) return b.le;
  }
  return Infinity;
}

export interface QueueHealth {
  waiting: number;
  active: number;
  failed: number;
  /** Age of the oldest waiting job, ms; null when nothing is waiting. */
  oldestWaitingAgeMs: number | null;
}

export interface ExamHealthInput {
  window: HealthWindow;
  activeAttempts: number;
  markingQueue: QueueHealth;
}

export interface ExamHealthThresholds {
  /** Fire when success rate drops below this (0..1). 09 §37's own example
   * is 98.9% → 91.2% → 76%; 95% catches the second step. */
  answerSaveSuccessMin: number;
  /** Below this many saves in the window, the rate is noise — no verdict. */
  answerSaveMinSample: number;
  submissionP95MaxMs: number;
  submissionMinSample: number;
  markingQueueWaitingMax: number;
  markingQueueOldestMaxMs: number;
  authFailuresMax: number;
}

export const DEFAULT_EXAM_HEALTH_THRESHOLDS: ExamHealthThresholds = {
  answerSaveSuccessMin: 0.95,
  answerSaveMinSample: 50,
  submissionP95MaxMs: 5000,
  submissionMinSample: 20,
  markingQueueWaitingMax: 500,
  markingQueueOldestMaxMs: 5 * 60_000,
  authFailuresMax: 300,
};

export type AlertKey =
  | 'ANSWER_SAVE_SUCCESS_LOW'
  | 'SUBMISSION_LATENCY_HIGH'
  | 'MARKING_QUEUE_BACKLOG'
  | 'AUTH_FAILURE_SPIKE';

export interface AlertCondition {
  key: AlertKey;
  firing: boolean;
  severity: 'warning' | 'critical';
  /** Human summary — numbers only, no tenant names or PII. */
  summary: string;
  /** Machine-readable numbers for dashboards / the alert payload. */
  facts: Record<string, number | null>;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function evaluateExamHealth(
  input: ExamHealthInput,
  thresholds: ExamHealthThresholds = DEFAULT_EXAM_HEALTH_THRESHOLDS,
): AlertCondition[] {
  const w = input.window;
  const attempted = w.answerSaveOk + w.answerSaveFailed;
  const successRate = attempted === 0 ? null : w.answerSaveOk / attempted;
  const answerFiring =
    attempted >= thresholds.answerSaveMinSample &&
    successRate !== null &&
    successRate < thresholds.answerSaveSuccessMin;

  const p95 = percentileFromBuckets(w.submissionLatency, 0.95);
  const latencyFiring =
    w.submissionCount >= thresholds.submissionMinSample &&
    p95 !== null &&
    p95 > thresholds.submissionP95MaxMs;

  const q = input.markingQueue;
  const backlogFiring =
    q.waiting > thresholds.markingQueueWaitingMax ||
    (q.oldestWaitingAgeMs !== null && q.oldestWaitingAgeMs > thresholds.markingQueueOldestMaxMs);

  const authFiring = w.authFailures > thresholds.authFailuresMax;

  return [
    {
      key: 'ANSWER_SAVE_SUCCESS_LOW',
      firing: answerFiring,
      severity: successRate !== null && successRate < 0.8 ? 'critical' : 'warning',
      summary:
        successRate === null
          ? `No answer saves in the last ${w.windowMinutes} min.`
          : `Answer save success ${pct(successRate)} over ${attempted} saves in the last ${w.windowMinutes} min ` +
            `(threshold ${pct(thresholds.answerSaveSuccessMin)}; ${input.activeAttempts} active attempts).`,
      facts: {
        successRate,
        attempted,
        failed: w.answerSaveFailed,
        rejected: w.answerSaveRejected,
        activeAttempts: input.activeAttempts,
      },
    },
    {
      key: 'SUBMISSION_LATENCY_HIGH',
      firing: latencyFiring,
      severity: 'warning',
      summary: `Submission p95 ≤ ${p95 === null ? 'n/a' : `${p95} ms`} over ${w.submissionCount} submissions (threshold ${thresholds.submissionP95MaxMs} ms).`,
      facts: { p95Ms: p95 === Infinity ? null : p95, submissions: w.submissionCount },
    },
    {
      key: 'MARKING_QUEUE_BACKLOG',
      firing: backlogFiring,
      severity: 'warning',
      summary: `Marking queue: ${q.waiting} waiting, ${q.active} active, ${q.failed} failed; oldest waiting ${q.oldestWaitingAgeMs === null ? 'n/a' : `${Math.round(q.oldestWaitingAgeMs / 1000)} s`}.`,
      facts: { ...q },
    },
    {
      key: 'AUTH_FAILURE_SPIKE',
      firing: authFiring,
      severity: 'warning',
      summary: `${w.authFailures} failed sign-ins in the last ${w.windowMinutes} min (threshold ${thresholds.authFailuresMax}).`,
      facts: { authFailures: w.authFailures },
    },
  ];
}

export interface AlertTransition {
  condition: AlertCondition;
  transition: 'FIRING' | 'RESOLVED';
}

const alertStateKey = (key: AlertKey) => `${KEY_PREFIX}:alert:${key}`;

/**
 * Fire-once / resolve-once: an alert notifies when it starts firing and
 * when it clears, never on every evaluation in between — an exam outage
 * must not also become an inbox flood. State lives in Redis so a worker
 * restart doesn't re-fire everything.
 */
export async function applyAlertTransitions(
  redis: HealthRedis,
  conditions: AlertCondition[],
  atMs: number = Date.now(),
): Promise<AlertTransition[]> {
  const transitions: AlertTransition[] = [];
  for (const condition of conditions) {
    const stateKey = alertStateKey(condition.key);
    const wasFiring = (await redis.get(stateKey)) !== null;
    if (condition.firing && !wasFiring) {
      await redis.set(stateKey, String(atMs), 'EX', 7 * 24 * 60 * 60);
      transitions.push({ condition, transition: 'FIRING' });
    } else if (!condition.firing && wasFiring) {
      await redis.del(stateKey);
      transitions.push({ condition, transition: 'RESOLVED' });
    }
  }
  return transitions;
}
