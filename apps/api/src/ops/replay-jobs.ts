/**
 * B22 operator command — replays background jobs that failed every retry
 * (08 §25 "worker crash" / "result worker failure"). Failed jobs are kept
 * for 14 days (FAILED_JOB_RETENTION); marking and result adjustments are
 * also re-queued automatically by the worker's reconciliation pass, up to
 * three times, so this is for what that pass left `exhausted` and for
 * imports, exports, pre-cache and notifications.
 *
 *   pnpm --filter @atlas/api ops:replay-jobs -- --actor <adminUserId> \
 *     --reason "..." [--queue <name>|all] [--job <id>] [--apply]
 *
 * Dry run by default: lists what would be replayed. --apply retries them
 * and records one platform-level JOB_REPLAYED audit event. Requires shell
 * access to a production task, which is itself the control.
 */
import { loadEnv, loadRootEnv, redisConnectionFromUrl } from '@atlas/config';
import { prisma } from '@atlas/db';
import { AuditActionRegistry } from '../modules/operations/audit-action.registry.js';
import { AuditService } from '../modules/operations/audit-event.service.js';
import { assertSoftwareAdmin, parseArgs, requireArg } from './cli-args.js';
import { REPLAYABLE_QUEUES, replayFailedJobs } from './job-replay.js';

export const OPS_AUDIT_ACTIONS = { jobReplayed: 'JOB_REPLAYED' } as const;

loadRootEnv();

async function main(): Promise<void> {
  const env = loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const actor = requireArg(args, 'actor');
  const reason = requireArg(args, 'reason');
  await assertSoftwareAdmin(prisma, actor);

  const queueArg = typeof args.queue === 'string' ? args.queue : 'all';
  const queues =
    queueArg === 'all' ? REPLAYABLE_QUEUES : REPLAYABLE_QUEUES.filter((q) => q === queueArg);
  if (queues.length === 0) {
    throw new Error(`--queue must be "all" or one of: ${REPLAYABLE_QUEUES.join(', ')}`);
  }
  const jobId = typeof args.job === 'string' ? args.job : undefined;
  const apply = args.apply === true;

  const { jobs, replayed } = await replayFailedJobs({
    connection: redisConnectionFromUrl(env.REDIS_URL),
    queues,
    ...(jobId !== undefined && { jobId }),
    apply,
  });
  for (const job of jobs) console.log(JSON.stringify(job));
  if (!apply) {
    console.log(JSON.stringify({ mode: 'DRY_RUN', failedJobs: jobs.length }));
    console.log('Nothing changed. Re-run with --apply to replay.');
    return;
  }
  const registry = new AuditActionRegistry();
  registry.registerAll(Object.values(OPS_AUDIT_ACTIONS));
  await new AuditService(registry).recordPlatform({
    actorUserId: actor,
    actorRole: 'SOFTWARE_ADMIN',
    action: OPS_AUDIT_ACTIONS.jobReplayed,
    entityType: 'BackgroundJob',
    reason,
    metadata: {
      via: 'operator-cli',
      replayed,
      jobs: jobs.map((j) => ({ queue: j.queue, jobId: j.jobId })),
    },
  });
  console.log(JSON.stringify({ mode: 'APPLIED', replayed }));
}

main()
  .catch((err: unknown) => {
    console.error('[ops:replay-jobs] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
