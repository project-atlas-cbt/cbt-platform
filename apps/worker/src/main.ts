import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { loadEnv, loadRootEnv, redisConnectionFromUrl } from '@atlas/config';
import { createPlatformSettingsReader, prisma } from '@atlas/db';
import {
  FAILED_JOB_RETENTION,
  ATTEMPT_MARKING_QUEUE_NAME,
  RESULT_ADJUSTMENT_QUEUE_NAME,
  type AttemptMarkingJobPayload,
  type ResultAdjustmentJobPayload,
} from '@atlas/domain';
import {
  NOTIFICATION_DISPATCH_QUEUE_NAME,
  OPERATIONAL_ALERT_TEMPLATE,
  operationalAlertVariables,
  type NotificationDispatchJobPayload,
  type OperationalAlert,
} from '@atlas/notifications';
import {
  DEFAULT_EXAM_HEALTH_THRESHOLDS,
  captureAlert,
  captureError,
  createLogger,
  flushSentry,
  initMetrics,
  initSentry,
  initTelemetry,
  registerHealthGauges,
  runWithLogContext,
  shutdownMetrics,
  shutdownTelemetry,
} from '@atlas/observability';
import { createProbeWorker } from './queues/probe.queue.js';
import {
  ATTEMPT_AUTO_SUBMIT_QUEUE_NAME,
  createAttemptAutoSubmitWorker,
  scheduleAttemptAutoSubmitSweep,
  AUTO_SUBMIT_SWEEP_JOB_ID,
} from './queues/attempt-auto-submit.queue.js';
import { createAttemptMarkingWorker } from './queues/attempt-marking.queue.js';
import { startLoadShedGate } from './load-shed-gate.js';
import { startScheduleGuard } from './schedule-guard.js';
import { reconcileJob } from './job-reconcile.js';
import { createResultAdjustmentWorker } from './queues/result-adjustment.queue.js';
import {
  SUBSCRIPTION_EXPIRY_QUEUE_NAME,
  createSubscriptionExpiryWorker,
  scheduleSubscriptionExpirySweep,
} from './queues/subscription-expiry.queue.js';
import {
  ORPHAN_MEDIA_REPORT_QUEUE_NAME,
  createOrphanMediaReportWorker,
  scheduleOrphanMediaReport,
} from './queues/orphan-media-report.queue.js';
import {
  IMPORT_EXPIRY_QUEUE_NAME,
  createImportExpiryWorker,
  scheduleImportExpirySweep,
} from './queues/import-expiry.queue.js';
import {
  UNASSIGNED_STUDENTS_DIGEST_QUEUE_NAME,
  createUnassignedStudentsDigestWorker,
  scheduleUnassignedStudentsDigest,
} from './queues/unassigned-students-digest.queue.js';
import {
  EXAM_CONTROL_REFRESH_QUEUE_NAME,
  createExamControlRefreshWorker,
  scheduleExamControlRefreshSweep,
} from './queues/exam-control-refresh.queue.js';
import {
  ANALYTICS_REFRESH_QUEUE_NAME,
  createAnalyticsRefreshWorker,
  scheduleAnalyticsRefresh,
} from './queues/analytics-refresh.queue.js';
import {
  EXAM_HEALTH_MONITOR_QUEUE_NAME,
  createExamHealthMonitorWorker,
  scheduleExamHealthMonitor,
  type ExamHealthSnapshot,
} from './queues/exam-health-monitor.queue.js';
import {
  RETENTION_QUEUE_NAME,
  createRetentionWorker,
  scheduleRetentionSweep,
} from './queues/retention.queue.js';

/** B22: how often the worker checks that its job schedulers still exist. */
const SCHEDULE_GUARD_MS = 30_000;

async function main() {
  loadRootEnv();
  const env = loadEnv();

  // B20 (08 §18, 09 §35): tracing (result generation joins the submit
  // trace via the job's carrier), metrics, Sentry, and the structured
  // redacting logger — before any queue starts.
  initTelemetry({ serviceName: 'atlas-worker', otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT });
  initMetrics({ serviceName: 'atlas-worker', otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT });
  initSentry({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    serviceName: 'atlas-worker',
    release: env.RELEASE_VERSION,
  });
  const logger = createLogger({ service: 'worker', level: env.LOG_LEVEL });

  // Proves the worker process shares the tenancy-aware Prisma client with
  // the API (ADR-0023: "Background workers and exports inherit the same
  // guarantee as request handlers").
  await prisma.$queryRaw`SELECT 1`;

  const redisUrl = new URL(env.REDIS_URL);
  const connection = redisConnectionFromUrl(redisUrl.toString());

  const probeWorker = createProbeWorker(connection);
  // B22: bounded commands (no ~73 s hang while Redis is down) and an
  // 'error' listener, so a dropped connection is logged, rate-limited,
  // instead of ioredis's unhandled-error noise on every reconnect attempt.
  const redis = new Redis(env.REDIS_URL, {
    commandTimeout: env.REDIS_COMMAND_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
  });
  let lastRedisErrorLogAt = 0;
  redis.on('error', (err: Error) => {
    if (Date.now() - lastRedisErrorLogAt < 30_000) return;
    lastRedisErrorLogAt = Date.now();
    logger.warn({ err: err.message }, 'Redis connection error (retrying)');
  });

  // B10: this process is now a *producer only* onto the shared
  // notification-dispatch queue — apps/api's worker-hosted consumer
  // (started only from its own main.ts, never via Nest's module lifecycle)
  // owns the actual template rendering/send, reusing the one shared
  // NOTIFICATION_CHANNEL/TemplateRegistry every module in that process
  // already registers templates against. This process no longer
  // constructs its own ConsoleNotificationChannel/TemplateRegistry at all
  // — see queues/templates.ts's own doc comment for the full history.
  const notificationDispatchQueue = new Queue<NotificationDispatchJobPayload>(
    NOTIFICATION_DISPATCH_QUEUE_NAME,
    { connection },
  );
  const enqueueDispatch = async (
    payload: NotificationDispatchJobPayload,
    jobId?: string,
  ): Promise<void> => {
    await notificationDispatchQueue.add('dispatch', payload, {
      ...(jobId !== undefined && { jobId }),
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: FAILED_JOB_RETENTION,
    });
  };

  const subscriptionExpiryWorker = createSubscriptionExpiryWorker(connection, {
    enqueueDispatch,
    redis,
  });
  const subscriptionExpiryQueue = new Queue(SUBSCRIPTION_EXPIRY_QUEUE_NAME, { connection });
  await scheduleSubscriptionExpirySweep(
    subscriptionExpiryQueue,
    env.SUBSCRIPTION_SWEEP_INTERVAL_MS,
  );

  // B10: "students missing a class assignment" digest for Moderator.
  const unassignedStudentsDigestWorker = createUnassignedStudentsDigestWorker(connection, {});
  const unassignedStudentsDigestQueue = new Queue(UNASSIGNED_STUDENTS_DIGEST_QUEUE_NAME, {
    connection,
  });
  await scheduleUnassignedStudentsDigest(
    unassignedStudentsDigestQueue,
    env.UNASSIGNED_STUDENTS_DIGEST_INTERVAL_MS,
  );

  // B4: orphan-media reporting — report only, never deletes (see this
  // job's own doc comment).
  const orphanMediaReportWorker = createOrphanMediaReportWorker(connection, { redis });
  const orphanMediaReportQueue = new Queue(ORPHAN_MEDIA_REPORT_QUEUE_NAME, { connection });
  await scheduleOrphanMediaReport(orphanMediaReportQueue, env.MEDIA_ORPHAN_SWEEP_INTERVAL_MS);

  // B7: import staging-expiry sweep (A-17) — report/transition only, same
  // shape as orphan-media reporting above.
  const importExpiryWorker = createImportExpiryWorker(connection, {});
  const importExpiryQueue = new Queue(IMPORT_EXPIRY_QUEUE_NAME, { connection });
  await scheduleImportExpirySweep(importExpiryQueue, env.IMPORT_EXPIRY_SWEEP_INTERVAL_MS);

  // B12: Exam Control Center aggregate refresh + stale-exam detection,
  // merged into one per-tenant pass (see this job's own doc comment).
  const examControlRefreshWorker = createExamControlRefreshWorker(connection, {
    redis,
    staleThresholdMs: env.EXAM_STALENESS_THRESHOLD_MS,
    // B21: active exams every tick; the every-school scan (staleness only)
    // at this slower cadence.
    activity: { fullScanEveryMs: env.EXAM_CONTROL_FULL_SCAN_INTERVAL_MS, lastFullScanAt: 0 },
  });
  const examControlRefreshQueue = new Queue(EXAM_CONTROL_REFRESH_QUEUE_NAME, { connection });
  await scheduleExamControlRefreshSweep(
    examControlRefreshQueue,
    env.EXAM_CONTROL_REFRESH_INTERVAL_MS,
  );

  const analyticsRefreshWorker = createAnalyticsRefreshWorker(connection, { redis });
  const analyticsRefreshQueue = new Queue(ANALYTICS_REFRESH_QUEUE_NAME, { connection });
  await scheduleAnalyticsRefresh(analyticsRefreshQueue, env.ANALYTICS_REFRESH_INTERVAL_MS);

  // B14: this process is a producer onto the shared marking queue — both
  // its own ADR-0004 sweeper (below) and apps/api's submit()/end()/
  // opportunistic-finalisation paths enqueue here; the marking-job
  // consumer (attemptMarkingWorker) lives in THIS same process, since
  // marking needs no apps/api-only Nest DI (attempt-marking.queue.ts's own
  // doc comment has the full reasoning) — unlike the notification-dispatch
  // queue above, this process is producer AND consumer for this one.
  const attemptMarkingQueue = new Queue<AttemptMarkingJobPayload>(ATTEMPT_MARKING_QUEUE_NAME, {
    connection,
  });
  const enqueueMarking = async (
    payload: AttemptMarkingJobPayload,
    jobId?: string,
  ): Promise<void> => {
    await attemptMarkingQueue.add('mark', payload, {
      ...(jobId !== undefined && { jobId }),
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: FAILED_JOB_RETENTION,
    });
  };
  const attemptMarkingWorker = createAttemptMarkingWorker(
    connection,
    {
      invalidateAnalytics: async (schoolId) => {
        await redis.incr(`atlas:analytics:school:${schoolId}:version`);
        await redis.del('atlas:analytics:platform:overview');
      },
    },
    env.MARKING_CONCURRENCY,
  );

  // B14: ADR-0004's sweeper — the authority half of "a background sweeper
  // as the authority, plus opportunistic finalisation, sharing one
  // idempotent routine" (apps/api's AttemptFinalizationService is the
  // opportunistic half).
  // B22: a producer handle for the adjustment queue, used only by the
  // reconciliation pass to re-queue an adjustment whose job was lost.
  const resultAdjustmentQueue = new Queue<ResultAdjustmentJobPayload>(
    RESULT_ADJUSTMENT_QUEUE_NAME,
    { connection },
  );
  const attemptAutoSubmitWorker = createAttemptAutoSubmitWorker(connection, {
    enqueueMarking,
    // B22: re-queues marking lost to an outage or a worker crash.
    reconcileMarking: (payload) =>
      reconcileJob(attemptMarkingQueue, `mark-${payload.attemptId}`, () =>
        enqueueMarking(payload, `mark-${payload.attemptId}`),
      ),
    // Same options as apps/api's ResultAdjustmentQueueService (the producer).
    reconcileAdjustment: (payload) =>
      reconcileJob(resultAdjustmentQueue, `adjust-${payload.operationId}`, async () => {
        await resultAdjustmentQueue.add('adjust', payload, {
          jobId: `adjust-${payload.operationId}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: true,
          removeOnFail: FAILED_JOB_RETENTION,
        });
      }),
  });
  const attemptAutoSubmitQueue = new Queue(ATTEMPT_AUTO_SUBMIT_QUEUE_NAME, { connection });

  // B15: ADR-0025's bulk-adjustment consumer. Consumer-only in this process
  // — apps/api's ResultAdjustmentQueueService is the sole producer, since an
  // adjustment always originates from an authenticated, audited staff action
  // rather than from any scheduled sweep.
  const resultAdjustmentWorker = createResultAdjustmentWorker(connection, {
    invalidateAnalytics: async (schoolId) => {
      await redis.incr(`atlas:analytics:school:${schoolId}:version`);
      await redis.del('atlas:analytics:platform:overview');
    },
  });
  await scheduleAttemptAutoSubmitSweep(
    attemptAutoSubmitQueue,
    env.ATTEMPT_AUTO_SUBMIT_SWEEP_INTERVAL_MS,
  );

  // B20: operational/security alerts — structured log + Sentry + an email
  // per operations alert recipient, rendered by apps/api from the shared
  // dispatch queue (this process registers no templates of its own).
  // ADR-0036: recipients come from System Configuration (OPS_ALERT_EMAILS
  // by default), re-read at most every 30 seconds.
  const platformSettings = createPlatformSettingsReader(prisma, env, {
    onError: (err) => logger.warn({ err }, 'Platform settings unreadable; using env values'),
  });
  const dispatchAlert = async (alert: OperationalAlert): Promise<void> => {
    const level = alert.severity === 'critical' ? 'error' : 'warn';
    logger[level]({ alert }, 'Operational alert');
    captureAlert(`${alert.title}: ${alert.summary}`, level === 'error' ? 'error' : 'warning', {
      alertKey: alert.alertKey,
      transition: alert.transition,
    });
    const variables = operationalAlertVariables(alert);
    const { opsAlertEmails } = (await platformSettings.get()).values;
    for (const to of opsAlertEmails) {
      await enqueueDispatch({ to, template: OPERATIONAL_ALERT_TEMPLATE.name, variables });
    }
  };

  // B20: Exam Health Monitor (09 §37) — answer-save success, submission
  // latency, marking backlog, auth-failure spikes; alerts on transitions.
  let lastHealthSnapshot: ExamHealthSnapshot | undefined;
  registerHealthGauges(() => ({
    activeAttempts: lastHealthSnapshot?.activeAttempts ?? 0,
    queues: lastHealthSnapshot
      ? {
          [ATTEMPT_MARKING_QUEUE_NAME]: {
            waiting: lastHealthSnapshot.markingQueue.waiting,
            failed: lastHealthSnapshot.markingQueue.failed,
          },
        }
      : {},
  }));
  const examHealthMonitorWorker = createExamHealthMonitorWorker(
    connection,
    {
      redis,
      markingQueue: attemptMarkingQueue,
      dispatchAlert,
      windowMinutes: env.EXAM_HEALTH_WINDOW_MINUTES,
      thresholds: {
        ...DEFAULT_EXAM_HEALTH_THRESHOLDS,
        answerSaveSuccessMin: env.EXAM_HEALTH_ANSWER_SUCCESS_MIN,
        answerSaveMinSample: env.EXAM_HEALTH_ANSWER_MIN_SAMPLE,
      },
      logger,
    },
    (snapshot) => {
      lastHealthSnapshot = snapshot;
    },
  );
  const examHealthMonitorQueue = new Queue(EXAM_HEALTH_MONITOR_QUEUE_NAME, { connection });
  await scheduleExamHealthMonitor(examHealthMonitorQueue, env.EXAM_HEALTH_INTERVAL_MS);

  // B20: retention sweep (ADR-0028 amended) — operational data only.
  const retentionWorker = createRetentionWorker(connection, { logger });
  const retentionQueue = new Queue(RETENTION_QUEUE_NAME, { connection });
  await scheduleRetentionSweep(retentionQueue, env.RETENTION_SWEEP_INTERVAL_MS);

  // B22: re-registers the job schedulers if Redis lost them (schedule-guard.ts).
  const reassertSchedules = async (): Promise<void> => {
    await scheduleSubscriptionExpirySweep(
      subscriptionExpiryQueue,
      env.SUBSCRIPTION_SWEEP_INTERVAL_MS,
    );
    await scheduleUnassignedStudentsDigest(
      unassignedStudentsDigestQueue,
      env.UNASSIGNED_STUDENTS_DIGEST_INTERVAL_MS,
    );
    await scheduleOrphanMediaReport(orphanMediaReportQueue, env.MEDIA_ORPHAN_SWEEP_INTERVAL_MS);
    await scheduleImportExpirySweep(importExpiryQueue, env.IMPORT_EXPIRY_SWEEP_INTERVAL_MS);
    await scheduleExamControlRefreshSweep(
      examControlRefreshQueue,
      env.EXAM_CONTROL_REFRESH_INTERVAL_MS,
    );
    await scheduleAnalyticsRefresh(analyticsRefreshQueue, env.ANALYTICS_REFRESH_INTERVAL_MS);
    await scheduleAttemptAutoSubmitSweep(
      attemptAutoSubmitQueue,
      env.ATTEMPT_AUTO_SUBMIT_SWEEP_INTERVAL_MS,
    );
    await scheduleExamHealthMonitor(examHealthMonitorQueue, env.EXAM_HEALTH_INTERVAL_MS);
    await scheduleRetentionSweep(retentionQueue, env.RETENTION_SWEEP_INTERVAL_MS);
  };
  const scheduleGuard = startScheduleGuard({
    sentinel: attemptAutoSubmitQueue,
    sentinelId: AUTO_SUBMIT_SWEEP_JOB_ID,
    reassert: reassertSchedules,
    onRestored: () =>
      logger.warn('Job schedulers were missing (Redis lost its data) — registered them again'),
    everyMs: SCHEDULE_GUARD_MS,
  });

  // Same 'error'-event risk as the Workers below, for the Queue (enqueue)
  // side of each connection.
  for (const queue of [
    subscriptionExpiryQueue,
    orphanMediaReportQueue,
    importExpiryQueue,
    unassignedStudentsDigestQueue,
    examControlRefreshQueue,
    analyticsRefreshQueue,
    notificationDispatchQueue,
    attemptMarkingQueue,
    attemptAutoSubmitQueue,
    examHealthMonitorQueue,
    retentionQueue,
  ]) {
    queue.on('error', (err) => {
      logger.error({ err, queue: queue.name }, 'Queue connection error');
    });
  }

  for (const worker of [
    probeWorker,
    subscriptionExpiryWorker,
    orphanMediaReportWorker,
    importExpiryWorker,
    unassignedStudentsDigestWorker,
    examControlRefreshWorker,
    analyticsRefreshWorker,
    attemptMarkingWorker,
    attemptAutoSubmitWorker,
    resultAdjustmentWorker,
    examHealthMonitorWorker,
    retentionWorker,
  ]) {
    worker.on('completed', (job) => {
      logger.debug({ jobId: job.id, queue: worker.name }, 'Job completed');
    });
    worker.on('failed', (job, err) => {
      runWithLogContext({ queue: worker.name, ...(job?.id && { jobId: job.id }) }, () => {
        logger.error({ err }, 'Job failed');
      });
      captureError(err, { queue: worker.name });
    });
    // Worker extends EventEmitter and emits 'error' for connection-level
    // failures (e.g. a dropped/failed Redis connection) — an unhandled
    // 'error' event throws synchronously and crashes this process. Found
    // during B7's review of its own new import-expiry worker; applied to
    // every worker in this shared loop since none of them had one either.
    worker.on('error', (err) => {
      logger.error({ err, queue: worker.name }, 'Worker connection error');
    });
  }

  // B21 (R-12): background work yields to live exams under load.
  const loadShedGate = startLoadShedGate(
    redis,
    [
      analyticsRefreshWorker,
      unassignedStudentsDigestWorker,
      orphanMediaReportWorker,
      importExpiryWorker,
      subscriptionExpiryWorker,
      resultAdjustmentWorker,
      retentionWorker,
    ],
    logger,
  );

  logger.info(
    {
      queues: [
        probeWorker.name,
        subscriptionExpiryWorker.name,
        orphanMediaReportWorker.name,
        importExpiryWorker.name,
        unassignedStudentsDigestWorker.name,
        examControlRefreshWorker.name,
        analyticsRefreshWorker.name,
        attemptAutoSubmitWorker.name,
        attemptMarkingWorker.name,
        resultAdjustmentWorker.name,
        examHealthMonitorWorker.name,
        retentionWorker.name,
      ],
      producerQueues: [NOTIFICATION_DISPATCH_QUEUE_NAME],
    },
    `${env.PRODUCT_NAME} worker listening`,
  );

  // B22: bounded, like apps/api's. Active jobs get WORKER_CLOSE_TIMEOUT_MS
  // to finish; a worker that cannot close (a Redis connection cut while it
  // was blocked waiting for a job can leave BullMQ waiting forever) is
  // abandoned — its held job is redelivered by the stalled-job check on
  // another worker. SHUTDOWN_TIMEOUT_MS bounds the whole sequence.
  const WORKER_CLOSE_TIMEOUT_MS = 10_000;
  const closeBounded = async (worker: { name: string; close(): Promise<void> }) => {
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), WORKER_CLOSE_TIMEOUT_MS);
    });
    const outcome = await Promise.race([worker.close().then(() => 'closed' as const), timedOut]);
    clearTimeout(timer);
    if (outcome === 'timeout') {
      logger.warn({ worker: worker.name }, 'Worker did not close in time; abandoning it');
    }
  };
  const shutdown = async () => {
    scheduleGuard.stop();
    logger.info('Worker shutting down');
    setTimeout(() => {
      logger.error({ timeoutMs: env.SHUTDOWN_TIMEOUT_MS }, 'Shutdown timed out; exiting');
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS).unref();
    loadShedGate.stop();
    await Promise.all(
      [
        probeWorker,
        subscriptionExpiryWorker,
        orphanMediaReportWorker,
        importExpiryWorker,
        unassignedStudentsDigestWorker,
        examControlRefreshWorker,
        analyticsRefreshWorker,
        attemptMarkingWorker,
        resultAdjustmentWorker,
        attemptAutoSubmitWorker,
        examHealthMonitorWorker,
        retentionWorker,
      ].map((w) => closeBounded(w)),
    );
    await subscriptionExpiryQueue.close();
    await orphanMediaReportQueue.close();
    await importExpiryQueue.close();
    await unassignedStudentsDigestQueue.close();
    await examControlRefreshQueue.close();
    await analyticsRefreshQueue.close();
    await notificationDispatchQueue.close();
    await attemptMarkingQueue.close();
    await attemptAutoSubmitQueue.close();
    await resultAdjustmentQueue.close();
    await examHealthMonitorQueue.close();
    await retentionQueue.close();
    await Promise.all([shutdownTelemetry(), shutdownMetrics(), flushSentry()]);
    redis.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  };
  // process.on expects a void-returning listener; wrapping avoids handing
  // it an async function directly (whose rejection would otherwise be
  // unhandled) — see @typescript-eslint/no-misused-promises.
  let shuttingDown = false;
  const onSignal = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void shutdown().catch((err: unknown) => {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    });
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
}

main().catch((err: unknown) => {
  // The structured logger may not exist yet (env validation failed);
  // EnvValidationError lists variable names, never values.
  console.error('[worker] failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
