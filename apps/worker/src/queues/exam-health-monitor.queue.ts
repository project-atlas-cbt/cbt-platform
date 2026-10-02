import { Worker, type ConnectionOptions, type Job, type Queue } from 'bullmq';
import { prisma, withTenant } from '@atlas/db';
import type { OperationalAlert } from '@atlas/notifications';
import {
  applyAlertTransitions,
  evaluateExamHealth,
  readHealthWindow,
  type AlertCondition,
  type AlertKey,
  type AlertTransition,
  type ExamHealthThresholds,
  type HealthRedis,
  type Logger,
  type QueueHealth,
} from '@atlas/observability';

export const EXAM_HEALTH_MONITOR_QUEUE_NAME = 'atlas-exam-health-monitor';
const SWEEP_JOB_ID = 'exam-health-monitor';
export const EXAM_HEALTH_SNAPSHOT_KEY = 'atlas:health:snapshot';

const ALERT_TITLES: Record<AlertKey, string> = {
  ANSWER_SAVE_SUCCESS_LOW: 'Answer save success rate dropped',
  SUBMISSION_LATENCY_HIGH: 'Submission latency is high',
  MARKING_QUEUE_BACKLOG: 'Marking queue is backing up',
  AUTH_FAILURE_SPIKE: 'Spike in failed sign-ins',
};

/** The marking queue surface this job reads — a BullMQ `Queue` satisfies it. */
export interface MarkingQueueProbe {
  getJobCounts(...types: Array<'waiting' | 'active' | 'failed'>): Promise<Record<string, number>>;
  getJobs(
    types: Array<'waiting'>,
    start?: number,
    end?: number,
    asc?: boolean,
  ): Promise<Array<{ timestamp: number } | undefined>>;
}

export interface ExamHealthMonitorDeps {
  redis: HealthRedis & { set(key: string, value: string): Promise<unknown> };
  markingQueue: MarkingQueueProbe;
  dispatchAlert: (alert: OperationalAlert) => Promise<void>;
  windowMinutes: number;
  thresholds: ExamHealthThresholds;
  logger?: Logger;
  now?: () => number;
}

export interface ExamHealthSnapshot {
  at: string;
  activeAttempts: number;
  markingQueue: QueueHealth;
  conditions: AlertCondition[];
}

async function countActiveAttempts(): Promise<number> {
  // Cross-school by iteration under each tenant — atlas_app can't see
  // across schools any other way (CLAUDE.md engineering facts).
  const schools = await prisma.school.findMany({ select: { id: true } });
  let total = 0;
  for (const school of schools) {
    total += await withTenant(prisma, school.id, (tx) =>
      tx.examAttempt.count({ where: { schoolId: school.id, state: 'IN_PROGRESS' } }),
    );
  }
  return total;
}

async function probeMarkingQueue(queue: MarkingQueueProbe, now: number): Promise<QueueHealth> {
  const counts = await queue.getJobCounts('waiting', 'active', 'failed');
  const [oldest] = await queue.getJobs(['waiting'], 0, 0, true);
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    failed: counts.failed ?? 0,
    oldestWaitingAgeMs: oldest ? Math.max(0, now - oldest.timestamp) : null,
  };
}

/**
 * B20 Exam Health Monitor (09 §37; DoD 7). One evaluation: read the sliding
 * window the API's ExamTelemetryService fills, add live state (active
 * attempts, marking backlog), evaluate, and dispatch only on FIRING /
 * RESOLVED transitions. The snapshot is kept in Redis for operators and the
 * OpenTelemetry gauges.
 */
export async function runExamHealthMonitor(deps: ExamHealthMonitorDeps): Promise<{
  snapshot: ExamHealthSnapshot;
  transitions: AlertTransition[];
}> {
  const now = deps.now?.() ?? Date.now();
  const [window, activeAttempts, markingQueue] = await Promise.all([
    readHealthWindow(deps.redis, deps.windowMinutes, now),
    countActiveAttempts(),
    probeMarkingQueue(deps.markingQueue, now),
  ]);
  const conditions = evaluateExamHealth({ window, activeAttempts, markingQueue }, deps.thresholds);
  const transitions = await applyAlertTransitions(deps.redis, conditions, now);

  for (const { condition, transition } of transitions) {
    await deps
      .dispatchAlert({
        alertKey: condition.key,
        severity: transition === 'RESOLVED' ? 'warning' : condition.severity,
        title: ALERT_TITLES[condition.key],
        summary: condition.summary,
        transition,
      })
      .catch((err: unknown) =>
        deps.logger?.error({ err, alertKey: condition.key }, 'Alert dispatch failed'),
      );
  }

  const snapshot: ExamHealthSnapshot = {
    at: new Date(now).toISOString(),
    activeAttempts,
    markingQueue,
    conditions,
  };
  await deps.redis.set(EXAM_HEALTH_SNAPSHOT_KEY, JSON.stringify(snapshot));
  return { snapshot, transitions };
}

export function createExamHealthMonitorWorker(
  connection: ConnectionOptions,
  deps: ExamHealthMonitorDeps,
  onSnapshot?: (snapshot: ExamHealthSnapshot) => void,
): Worker {
  return new Worker(
    EXAM_HEALTH_MONITOR_QUEUE_NAME,
    async (_job: Job) => {
      const { snapshot } = await runExamHealthMonitor(deps);
      onSnapshot?.(snapshot);
    },
    {
      connection,
      concurrency: 1,
      lockDuration: 120_000,
      lockRenewTime: 30_000,
      stalledInterval: 30_000,
      maxStalledCount: 1,
    },
  );
}

export async function scheduleExamHealthMonitor(queue: Queue, everyMs: number): Promise<void> {
  await queue.upsertJobScheduler(
    SWEEP_JOB_ID,
    { every: everyMs },
    { opts: { removeOnComplete: true, removeOnFail: 10 } },
  );
}
