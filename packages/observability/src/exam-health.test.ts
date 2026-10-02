import { describe, expect, it } from 'vitest';
import {
  applyAlertTransitions,
  DEFAULT_EXAM_HEALTH_THRESHOLDS,
  evaluateExamHealth,
  percentileFromBuckets,
  readHealthWindow,
  recordHealthCounter,
  recordSubmissionLatency,
  type HealthRedis,
  type HealthWindow,
} from './exam-health.js';

function fakeRedis(): HealthRedis & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    incrby(key, inc) {
      const v = Number(store.get(key) ?? 0) + inc;
      store.set(key, String(v));
      return Promise.resolve(v);
    },
    expire() {
      return Promise.resolve(1);
    },
    mget(...keys) {
      return Promise.resolve(keys.map((k) => store.get(k) ?? null));
    },
    get(key) {
      return Promise.resolve(store.get(key) ?? null);
    },
    set(key, value) {
      store.set(key, value);
      return Promise.resolve('OK');
    },
    del(...keys) {
      for (const k of keys) store.delete(k);
      return Promise.resolve(keys.length);
    },
  };
}

const emptyWindow = (over: Partial<HealthWindow> = {}): HealthWindow => ({
  windowMinutes: 5,
  answerSaveOk: 0,
  answerSaveFailed: 0,
  answerSaveRejected: 0,
  attemptStarted: 0,
  submissionCount: 0,
  submissionLatency: [],
  authFailures: 0,
  ...over,
});
const idleQueue = { waiting: 0, active: 0, failed: 0, oldestWaitingAgeMs: null };

const answerAlert = (w: HealthWindow) =>
  evaluateExamHealth({ window: w, activeAttempts: 500, markingQueue: idleQueue }).find(
    (c) => c.key === 'ANSWER_SAVE_SUCCESS_LOW',
  )!;

describe('evaluateExamHealth — answer save success (09 §37)', () => {
  it('does not fire at 98.9%', () => {
    expect(answerAlert(emptyWindow({ answerSaveOk: 989, answerSaveFailed: 11 })).firing).toBe(
      false,
    );
  });

  it('fires at 91.2% (warning) and at 76% (critical)', () => {
    const a = answerAlert(emptyWindow({ answerSaveOk: 912, answerSaveFailed: 88 }));
    expect(a.firing).toBe(true);
    expect(a.severity).toBe('warning');
    const b = answerAlert(emptyWindow({ answerSaveOk: 760, answerSaveFailed: 240 }));
    expect(b.firing).toBe(true);
    expect(b.severity).toBe('critical');
  });

  it('ignores policy rejections (expired attempts are a correct answer, not a failure)', () => {
    expect(answerAlert(emptyWindow({ answerSaveOk: 900, answerSaveRejected: 500 })).firing).toBe(
      false,
    );
  });

  it('gives no verdict below the minimum sample', () => {
    expect(answerAlert(emptyWindow({ answerSaveOk: 10, answerSaveFailed: 30 })).firing).toBe(false);
  });
});

describe('evaluateExamHealth — other conditions', () => {
  it('fires on high submission p95 and marking backlog', () => {
    const out = evaluateExamHealth({
      window: emptyWindow({
        submissionCount: 40,
        submissionLatency: [
          { le: 1000, count: 20 },
          { le: 10000, count: 20 },
        ],
      }),
      activeAttempts: 10,
      markingQueue: { waiting: 10, active: 1, failed: 0, oldestWaitingAgeMs: 10 * 60_000 },
    });
    expect(out.find((c) => c.key === 'SUBMISSION_LATENCY_HIGH')!.firing).toBe(true);
    expect(out.find((c) => c.key === 'MARKING_QUEUE_BACKLOG')!.firing).toBe(true);
  });

  it('fires on an auth-failure spike', () => {
    const out = evaluateExamHealth({
      window: emptyWindow({ authFailures: DEFAULT_EXAM_HEALTH_THRESHOLDS.authFailuresMax + 1 }),
      activeAttempts: 0,
      markingQueue: idleQueue,
    });
    expect(out.find((c) => c.key === 'AUTH_FAILURE_SPIKE')!.firing).toBe(true);
  });
});

describe('percentileFromBuckets', () => {
  it('returns the bucket bound containing the rank', () => {
    expect(
      percentileFromBuckets(
        [
          { le: 250, count: 90 },
          { le: 500, count: 9 },
          { le: 1000, count: 1 },
        ],
        0.95,
      ),
    ).toBe(500);
    expect(percentileFromBuckets([], 0.95)).toBeNull();
  });
});

describe('Redis buckets and alert transitions', () => {
  it('records counters and latency, then reads them back over the window', async () => {
    const redis = fakeRedis();
    const now = Date.UTC(2026, 9, 2, 10, 0, 30);
    await recordHealthCounter(redis, 'answer_save_ok', now, 3);
    await recordHealthCounter(redis, 'answer_save_failed', now - 60_000);
    await recordHealthCounter(redis, 'answer_save_failed', now - 10 * 60_000); // outside window
    await recordSubmissionLatency(redis, 700, now);
    const w = await readHealthWindow(redis, 5, now);
    expect(w.answerSaveOk).toBe(3);
    expect(w.answerSaveFailed).toBe(1);
    expect(w.submissionCount).toBe(1);
    expect(w.submissionLatency.find((b) => b.le === 1000)!.count).toBe(1);
  });

  it('notifies once on FIRING, stays quiet while firing, notifies once on RESOLVED', async () => {
    const redis = fakeRedis();
    const firing = evaluateExamHealth({
      window: emptyWindow({ answerSaveOk: 700, answerSaveFailed: 300 }),
      activeAttempts: 500,
      markingQueue: idleQueue,
    });
    const healthy = evaluateExamHealth({
      window: emptyWindow({ answerSaveOk: 1000 }),
      activeAttempts: 500,
      markingQueue: idleQueue,
    });
    const t1 = await applyAlertTransitions(redis, firing);
    expect(t1.map((t) => [t.condition.key, t.transition])).toEqual([
      ['ANSWER_SAVE_SUCCESS_LOW', 'FIRING'],
    ]);
    expect(await applyAlertTransitions(redis, firing)).toEqual([]);
    const t3 = await applyAlertTransitions(redis, healthy);
    expect(t3.map((t) => [t.condition.key, t.transition])).toEqual([
      ['ANSWER_SAVE_SUCCESS_LOW', 'RESOLVED'],
    ]);
    expect(await applyAlertTransitions(redis, healthy)).toEqual([]);
  });
});
