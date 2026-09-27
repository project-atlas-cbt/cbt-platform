import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { loadEnv, loadRootEnv } from '@atlas/config';
import { prisma } from '@atlas/db';
import {
  initializeObservability,
  shutdownObservability,
  structuredLog,
} from '@atlas/observability';
import { ATTEMPT_MARKING_QUEUE_NAME, type AttemptMarkingJobPayload } from '@atlas/domain';
import {
  NOTIFICATION_DISPATCH_QUEUE_NAME,
  type NotificationDispatchJobPayload,
} from '@atlas/notifications';
import { createProbeWorker } from './queues/probe.queue.js';
import {
  ATTEMPT_AUTO_SUBMIT_QUEUE_NAME,
  createAttemptAutoSubmitWorker,
  scheduleAttemptAutoSubmitSweep,
} from './queues/attempt-auto-submit.queue.js';
import { createAttemptMarkingWorker } from './queues/attempt-marking.queue.js';
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
  RETENTION_QUEUE_NAME,
  createRetentionWorker,
  scheduleRetentionSweep,
} from './queues/retention.queue.js';

async function main() {
  loadRootEnv();
  const env = loadEnv();
  initializeObservability({
    serviceName: 'atlas-worker',
    environment: env.OBSERVABILITY_ENVIRONMENT,
    ...(env.OTEL_EXPORTER_OTLP_ENDPOINT ? { otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT } : {}),
    ...(env.SENTRY_DSN ? { sentryDsn: env.SENTRY_DSN } : {}),
  });

  // Proves the worker process shares the tenancy-aware Prisma client with
  // the API (ADR-0023: "Background workers and exports inherit the same
  // guarantee as request handlers").
  await prisma.$queryRaw`SELECT 1`;

  const redisUrl = new URL(env.REDIS_URL);
  const connection = { host: redisUrl.hostname, port: Number(redisUrl.port) || 6379 };

  const probeWorker = createProbeWorker(connection);
  const redis = new Redis(env.REDIS_URL);

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
      removeOnFail: 10,
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
  });
  const examControlRefreshQueue = new Queue(EXAM_CONTROL_REFRESH_QUEUE_NAME, { connection });
  await scheduleExamControlRefreshSweep(
    examControlRefreshQueue,
    env.EXAM_CONTROL_REFRESH_INTERVAL_MS,
  );

  const analyticsRefreshWorker = createAnalyticsRefreshWorker(connection, { redis });
  const analyticsRefreshQueue = new Queue(ANALYTICS_REFRESH_QUEUE_NAME, { connection });
  await scheduleAnalyticsRefresh(analyticsRefreshQueue, env.ANALYTICS_REFRESH_INTERVAL_MS);

  const retentionWorker = createRetentionWorker(connection, {
    policy: {
      expiredSessionRetentionDays: env.EXPIRED_SESSION_RETENTION_DAYS,
      expiredPasswordResetRetentionDays: env.EXPIRED_PASSWORD_RESET_RETENTION_DAYS,
    },
  });
  const retentionQueue = new Queue(RETENTION_QUEUE_NAME, { connection });
  await scheduleRetentionSweep(retentionQueue, env.RETENTION_SWEEP_INTERVAL_MS);

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
      removeOnFail: 10,
    });
  };
  const attemptMarkingWorker = createAttemptMarkingWorker(connection, {
    invalidateAnalytics: async (schoolId) => {
      await redis.incr(`atlas:analytics:school:${schoolId}:version`);
      await redis.del('atlas:analytics:platform:overview');
    },
  });

  // B14: ADR-0004's sweeper — the authority half of "a background sweeper
  // as the authority, plus opportunistic finalisation, sharing one
  // idempotent routine" (apps/api's AttemptFinalizationService is the
  // opportunistic half).
  const attemptAutoSubmitWorker = createAttemptAutoSubmitWorker(connection, {
    enqueueMarking,
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
    retentionQueue,
  ]) {
    queue.on('error', (err) => {
      structuredLog('error', 'worker.queue.connection-error', { queue: queue.name }, err);
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
    retentionWorker,
  ]) {
    worker.on('completed', (job) => {
      structuredLog('info', 'worker.job.completed', {
        queue: worker.name,
        jobId: job.id ?? null,
      });
    });
    worker.on('failed', (job, err) => {
      structuredLog(
        'error',
        'worker.job.failed',
        { queue: worker.name, jobId: job?.id ?? null },
        err,
      );
    });
    // Worker extends EventEmitter and emits 'error' for connection-level
    // failures (e.g. a dropped/failed Redis connection) — an unhandled
    // 'error' event throws synchronously and crashes this process. Found
    // during B7's review of its own new import-expiry worker; applied to
    // every worker in this shared loop since none of them had one either.
    worker.on('error', (err) => {
      structuredLog('error', 'worker.connection-error', { queue: worker.name }, err);
    });
  }

  structuredLog('info', 'worker.started', { queueCount: 11 });

  const shutdown = async () => {
    structuredLog('info', 'worker.shutting-down');
    await Promise.all([
      probeWorker.close(),
      subscriptionExpiryWorker.close(),
      orphanMediaReportWorker.close(),
      importExpiryWorker.close(),
      unassignedStudentsDigestWorker.close(),
      examControlRefreshWorker.close(),
      analyticsRefreshWorker.close(),
      attemptMarkingWorker.close(),
      resultAdjustmentWorker.close(),
      attemptAutoSubmitWorker.close(),
      retentionWorker.close(),
    ]);
    await subscriptionExpiryQueue.close();
    await orphanMediaReportQueue.close();
    await importExpiryQueue.close();
    await unassignedStudentsDigestQueue.close();
    await examControlRefreshQueue.close();
    await analyticsRefreshQueue.close();
    await notificationDispatchQueue.close();
    await attemptMarkingQueue.close();
    await attemptAutoSubmitQueue.close();
    await retentionQueue.close();
    redis.disconnect();
    await prisma.$disconnect();
    await shutdownObservability();
    process.exit(0);
  };
  // process.on expects a void-returning listener; wrapping avoids handing
  // it an async function directly (whose rejection would otherwise be
  // unhandled) — see @typescript-eslint/no-misused-promises.
  const onSignal = () => {
    void shutdown().catch((err: unknown) => {
      structuredLog('error', 'worker.shutdown.failed', {}, err);
      process.exit(1);
    });
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
}

main().catch((err) => {
  structuredLog('error', 'worker.start.failed', {}, err);
  process.exit(1);
});
