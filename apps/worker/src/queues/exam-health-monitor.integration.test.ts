/**
 * B20 DoD 7: "The Exam Health Monitor alerts on a simulated drop in
 * answer-save success (09 §37)." Real Redis (the same per-minute buckets
 * apps/api's ExamTelemetryService writes) and real Postgres (active-attempt
 * count); the marking queue and the alert sink are stand-ins so the test
 * can observe exactly what would have been dispatched.
 *
 * Buckets are written at a fixed far-future minute so this test can never
 * collide with genuine traffic counters in a shared dev Redis.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { prisma } from '@atlas/db';
import type { OperationalAlert } from '@atlas/notifications';
import { DEFAULT_EXAM_HEALTH_THRESHOLDS, recordHealthCounter } from '@atlas/observability';
import { EXAM_HEALTH_SNAPSHOT_KEY, runExamHealthMonitor } from './exam-health-monitor.queue.js';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const T0 = Date.UTC(2099, 0, 1, 12, 0, 30);
const ALERT_STATE_KEYS = [
  'ANSWER_SAVE_SUCCESS_LOW',
  'SUBMISSION_LATENCY_HIGH',
  'MARKING_QUEUE_BACKLOG',
  'AUTH_FAILURE_SPIKE',
].map((k) => `atlas:health:alert:${k}`);

const idleQueue = {
  getJobCounts: () => Promise.resolve({ waiting: 0, active: 0, failed: 0 }),
  getJobs: () => Promise.resolve([]),
};

async function record(counter: 'answer_save_ok' | 'answer_save_failed', n: number, at: number) {
  await recordHealthCounter(redis, counter, at, n);
}

async function clearBuckets(): Promise<void> {
  const keys = await redis.keys('atlas:health:*:678492*'); // the 2099 minutes used above
  if (keys.length) await redis.del(...keys);
}

describe('Exam Health Monitor (B20, 09 §37)', () => {
  const dispatched: OperationalAlert[] = [];
  const run = (at: number) =>
    runExamHealthMonitor({
      redis,
      markingQueue: idleQueue,
      dispatchAlert: (a) => {
        dispatched.push(a);
        return Promise.resolve();
      },
      windowMinutes: 5,
      thresholds: DEFAULT_EXAM_HEALTH_THRESHOLDS,
      now: () => at,
    });

  beforeEach(async () => {
    dispatched.length = 0;
    await redis.del(...ALERT_STATE_KEYS);
    await clearBuckets();
  });

  afterAll(async () => {
    await redis.del(...ALERT_STATE_KEYS);
    await clearBuckets();
    redis.disconnect();
    await prisma.$disconnect();
  });

  it('stays quiet at 98.9%, fires once as success falls to 91% then 76%, and resolves on recovery', async () => {
    // 98.9% — healthy (09 §37's own starting figure).
    await record('answer_save_ok', 989, T0);
    await record('answer_save_failed', 11, T0);
    await run(T0);
    expect(dispatched).toEqual([]);

    // Next minute: the window now reads ~(989+500)/(1000+600) ≈ 93% → fires.
    const t1 = T0 + 60_000;
    await record('answer_save_ok', 500, t1);
    await record('answer_save_failed', 100, t1);
    const first = await run(t1);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      alertKey: 'ANSWER_SAVE_SUCCESS_LOW',
      transition: 'FIRING',
    });
    expect(first.snapshot.conditions.find((c) => c.key === 'ANSWER_SAVE_SUCCESS_LOW')!.firing).toBe(
      true,
    );

    // Worse still (→ ~76% for this minute) — still firing, no second alert.
    const t2 = T0 + 2 * 60_000;
    await record('answer_save_ok', 760, t2);
    await record('answer_save_failed', 240, t2);
    await run(t2);
    expect(dispatched).toHaveLength(1);

    // Recovery: six minutes later the window holds only healthy saves.
    const t3 = T0 + 8 * 60_000;
    await record('answer_save_ok', 1000, t3);
    await run(t3);
    expect(dispatched).toHaveLength(2);
    expect(dispatched[1]).toMatchObject({
      alertKey: 'ANSWER_SAVE_SUCCESS_LOW',
      transition: 'RESOLVED',
    });

    const snapshot = JSON.parse((await redis.get(EXAM_HEALTH_SNAPSHOT_KEY))!) as {
      activeAttempts: number;
    };
    expect(snapshot.activeAttempts).toBeGreaterThanOrEqual(0);
  });

  it('alerts on a marking backlog (oldest waiting job too old)', async () => {
    await run(T0); // baseline, nothing firing
    await runExamHealthMonitor({
      redis,
      markingQueue: {
        getJobCounts: () => Promise.resolve({ waiting: 3, active: 0, failed: 0 }),
        getJobs: () => Promise.resolve([{ timestamp: T0 - 10 * 60_000 }]),
      },
      dispatchAlert: (a) => {
        dispatched.push(a);
        return Promise.resolve();
      },
      windowMinutes: 5,
      thresholds: DEFAULT_EXAM_HEALTH_THRESHOLDS,
      now: () => T0,
    });
    expect(dispatched.map((d) => d.alertKey)).toEqual(['MARKING_QUEUE_BACKLOG']);
  });
});
