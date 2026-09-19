import { Worker, type ConnectionOptions, type Job, type Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { prisma, withTenant } from '@atlas/db';
import { rollUpParticipation } from '@atlas/domain';
import {
  EXAM_CONTROL_CACHE_TTL_SECONDS,
  examControlChannel,
  examControlStreamKey,
  type ExamControlCenterSnapshot,
} from '@atlas/domain';

export const EXAM_CONTROL_REFRESH_QUEUE_NAME = 'atlas-exam-control-refresh-sweep';
// A stable jobId so re-scheduling on every process restart doesn't pile up
// duplicate repeatable jobs — same idiom as every other sweep in this file.
const SWEEP_JOB_ID = 'sweep';

const STREAM_MAXLEN = 1000;
const STREAM_TTL_SECONDS = 2 * 60 * 60;

export interface ExamControlRefreshSweepDeps {
  // `xadd`'s real ioredis type is a complex overloaded variadic signature —
  // `Pick` off the real client type rather than hand-rolling an interface
  // that can never quite match it (found by `tsc`, not by inspection).
  redis: Pick<Redis, 'get' | 'set' | 'publish' | 'xadd' | 'expire'>;
  staleThresholdMs: number;
  now?: () => Date;
}

/**
 * B12: merges the roadmap's two named Background-jobs bullets ("Control
 * Center aggregate refresh" and "stale-exam detection") into one per-tenant
 * pass — both need to iterate the identical "exams currently OPEN or
 * CLOSED" set — mirroring `subscription-expiry.queue.ts`'s own precedent of
 * combining related per-tenant work exactly.
 *
 * A plain async function (not a class, no Nest DI), directly unit/
 * integration-testable without standing up BullMQ, matching every sweep in
 * this file. Iterates schools one at a time via `withTenant` — RLS blocks
 * any unscoped cross-school query, the same real constraint every prior
 * sweep in this file already documents.
 *
 * This is a SEPARATE, independent computation from `apps/api`'s own
 * `exam-control-snapshot.util.ts` (the live-compute fallback `GET
 * .../control` uses on a cache miss, and what every mutation's own SSE
 * publish call recomputes from) — `apps/worker` cannot import from
 * `apps/api` (only `packages/*` are shared across apps, the same
 * constraint `import-worker-bootstrap.ts`'s own doc comment already
 * records for B7). Kept structurally identical by both reading from
 * `packages/domain`'s shared `ExamControlCenterSnapshot` shape rather than
 * duplicating that type definition too.
 */
export async function runExamControlRefreshSweep(deps: ExamControlRefreshSweepDeps): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const schools = await prisma.school.findMany({ select: { id: true } });

  for (const school of schools) {
    // One school's failure must never abort the sweep for every other
    // school — the same log-and-continue idiom every sweep in this file
    // already uses.
    try {
      const exams = await withTenant(prisma, school.id, (tx) =>
        tx.exam.findMany({
          where: { schoolId: school.id, status: { in: ['OPEN', 'CLOSED'] } },
          select: { id: true, status: true },
        }),
      );

      for (const exam of exams) {
        const snapshot = await computeSnapshot(
          school.id,
          exam.id,
          exam.status,
          deps.staleThresholdMs,
          now,
        );
        const key = examControlChannel(school.id, exam.id);
        const payload = JSON.stringify(snapshot);

        const prior = await deps.redis.get(key);
        // A TTL, not a plain SET: this sweep only ever iterates exams
        // currently OPEN/CLOSED, so once an exam moves to
        // COMPLETED/CANCELLED/ARCHIVED nothing touches this key again — a
        // plain SET would leave that exam's last snapshot in Redis forever,
        // served by GET /control indefinitely (found in review). The TTL
        // is refreshed on every tick this sweep still considers the exam
        // live, and matches the write-through TTL apps/api's own
        // publishUpdate() uses for the same key.
        await deps.redis.set(key, payload, 'EX', EXAM_CONTROL_CACHE_TTL_SECONDS);

        // Publish/append only on a MATERIAL change — `computedAt` alone
        // changes every tick regardless, so comparing the raw JSON would
        // always differ and defeat the point of this check entirely.
        if (!snapshotsEqualIgnoringComputedAt(prior, payload)) {
          const streamKey = examControlStreamKey(school.id, exam.id);
          await deps.redis.publish(key, payload);
          await deps.redis.xadd(streamKey, 'MAXLEN', '~', STREAM_MAXLEN, '*', 'event', payload);
          await deps.redis.expire(streamKey, STREAM_TTL_SECONDS);
        }
      }
    } catch (err) {
      console.error(`[worker] exam-control-refresh sweep failed for school ${school.id}:`, err);
    }
  }
}

function snapshotsEqualIgnoringComputedAt(priorRaw: string | null, currentRaw: string): boolean {
  if (priorRaw === null) return false;
  try {
    const prior = JSON.parse(priorRaw) as Record<string, unknown>;
    const current = JSON.parse(currentRaw) as Record<string, unknown>;
    delete prior.computedAt;
    delete current.computedAt;
    return JSON.stringify(prior) === JSON.stringify(current);
  } catch {
    return false;
  }
}

async function computeSnapshot(
  schoolId: string,
  examId: string,
  examStatus: string,
  staleThresholdMs: number,
  now: Date,
): Promise<ExamControlCenterSnapshot> {
  return withTenant(prisma, schoolId, async (tx) => {
    const sessions = await tx.examSession.findMany({
      where: { schoolId, examId },
      orderBy: { openedAt: 'asc' },
    });
    const sessionIds = sessions.map((s) => s.id);

    const participants =
      sessionIds.length === 0
        ? []
        : await tx.examSessionParticipant.findMany({
            where: { schoolId, examSessionId: { in: sessionIds }, status: 'AUTHORIZED' },
            select: { studentProfileId: true, examSessionId: true },
          });
    const authorizedCount = new Set(participants.map((participant) => participant.studentProfileId))
      .size;

    // B13: real ExamAttempt data — duplicated (not shared) against
    // apps/api's own identical `exam-control-snapshot.util.ts` computation,
    // same cross-app-boundary constraint as the display-name resolution
    // just below. Independent counts, never derived by subtraction.
    const activeAttemptRows = await tx.examAttempt.findMany({
      where: { schoolId, examId, state: { in: ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED'] } },
      select: { studentProfileId: true, state: true },
    });
    const inProgressCount = new Set(
      activeAttemptRows
        .filter((attempt) => attempt.state === 'IN_PROGRESS')
        .map((attempt) => attempt.studentProfileId),
    ).size;
    const submittedCount = new Set(
      activeAttemptRows
        .filter((attempt) => attempt.state === 'SUBMITTED' || attempt.state === 'AUTO_SUBMITTED')
        .map((attempt) => attempt.studentProfileId),
    ).size;
    const liveAttempts = await tx.examAttempt.findMany({
      where: { schoolId, examId, state: 'IN_PROGRESS' },
      select: { studentProfileId: true, state: true, expiresAt: true },
    });
    const allAttempts = await tx.examAttempt.findMany({
      where: { schoolId, examId },
      select: { studentProfileId: true, examSessionId: true, state: true },
    });
    const participations = await tx.examParticipation.findMany({
      where: { schoolId, examId },
      select: { studentProfileId: true, examSessionId: true, status: true },
    });
    const rollups = [
      ...new Set(participants.map((participant) => participant.studentProfileId)),
    ].map((studentProfileId) =>
      rollUpParticipation(
        participants
          .filter((participant) => participant.studentProfileId === studentProfileId)
          .map((participant) => {
            const participation = participations.find(
              (entry) =>
                entry.studentProfileId === studentProfileId &&
                entry.examSessionId === participant.examSessionId,
            );
            return {
              status: participation?.status ?? null,
              hasNonInvalidatedAttempt: allAttempts.some(
                (attempt) =>
                  attempt.studentProfileId === studentProfileId &&
                  attempt.examSessionId === participant.examSessionId &&
                  attempt.state !== 'INVALIDATED' &&
                  attempt.state !== 'CANCELLED',
              ),
            };
          }),
      ),
    );
    const absentCount = rollups.filter((status) => status === 'ABSENT').length;

    // F12 gap closure: resolved the same way `apps/api`'s own
    // `exam-control-mappers.ts::resolveMembershipDisplayNames` resolves it —
    // duplicated, not shared, since this worker cannot import `apps/api`
    // code (only `packages/*` crosses that boundary, the same constraint
    // this function's own doc comment already records for the rest of this
    // computation).
    const membershipIds = [
      ...new Set(
        sessions
          .flatMap((s) => [s.openedByMembershipId, s.closedByMembershipId])
          .filter((id): id is string => id !== null),
      ),
    ];
    const nameRows =
      membershipIds.length === 0
        ? []
        : await tx.schoolMembership.findMany({
            where: { schoolId, id: { in: membershipIds } },
            select: { id: true, user: { select: { displayName: true } } },
          });
    const names = new Map(nameRows.map((row) => [row.id, row.user.displayName]));

    let openSince: Date | null = null;
    for (const session of sessions) {
      if (session.status !== 'OPEN') continue;
      const openedFrom = session.reopenedAt ?? session.openedAt;
      if (openSince === null || openedFrom < openSince) openSince = openedFrom;
    }
    const isStale = openSince !== null && now.getTime() - openSince.getTime() > staleThresholdMs;

    return {
      examId,
      examStatus: examStatus as ExamControlCenterSnapshot['examStatus'],
      sessions: sessions.map((s) => ({
        id: s.id,
        examId: s.examId,
        sessionType: s.sessionType,
        status: s.status,
        openedAt: s.openedAt.toISOString(),
        openedByMembershipId: s.openedByMembershipId,
        openedByName: names.get(s.openedByMembershipId) ?? 'Unknown',
        closedAt: s.closedAt?.toISOString() ?? null,
        closedByMembershipId: s.closedByMembershipId,
        closedByName: s.closedByMembershipId
          ? (names.get(s.closedByMembershipId) ?? 'Unknown')
          : null,
        reopenedAt: s.reopenedAt?.toISOString() ?? null,
        completedAt: s.completedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      aggregate: {
        authorizedCount,
        notStartedCount: rollups.filter((status) => status === 'PENDING').length,
        inProgressCount,
        submittedCount,
        absentCount,
        attemptDataAvailable: true,
      },
      liveAttempts: liveAttempts.map((a) => ({
        studentProfileId: a.studentProfileId,
        status: a.state,
        timeRemainingSeconds: Math.max(
          0,
          Math.floor((a.expiresAt.getTime() - now.getTime()) / 1000),
        ),
      })),
      staleness: {
        isStale,
        openSince: openSince?.toISOString() ?? null,
        thresholdMs: staleThresholdMs,
      },
      computedAt: now.toISOString(),
    };
  });
}

export function createExamControlRefreshWorker(
  connection: ConnectionOptions,
  deps: ExamControlRefreshSweepDeps,
): Worker {
  return new Worker(
    EXAM_CONTROL_REFRESH_QUEUE_NAME,
    async (_job: Job) => {
      await runExamControlRefreshSweep(deps);
    },
    {
      connection,
      // This is a whole-school, then whole-exam sweep. The 5s cadence is a
      // freshness target, not a safe upper bound on its runtime. BullMQ's
      // 30s default lock could expire mid-sweep, causing the scheduler to
      // reclaim the job and the original worker to later log
      // "Missing lock … moveToFinished". Keep exactly one serial pass and
      // renew a deliberately longer lease while its I/O is in flight.
      concurrency: 1,
      lockDuration: 120_000,
      lockRenewTime: 30_000,
      stalledInterval: 30_000,
      maxStalledCount: 1,
    },
  );
}

export async function scheduleExamControlRefreshSweep(
  queue: Queue,
  everyMs: number,
): Promise<void> {
  await queue.upsertJobScheduler(
    SWEEP_JOB_ID,
    { every: everyMs },
    { opts: { removeOnComplete: true, removeOnFail: 10 } },
  );
}
