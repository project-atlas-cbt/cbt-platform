import { Worker, type ConnectionOptions, type Job, type Queue } from 'bullmq';
import { prisma, withTenant } from '@atlas/db';
import { attemptGraceWindowSeconds, type AttemptMarkingJobPayload } from '@atlas/domain';

export const ATTEMPT_AUTO_SUBMIT_QUEUE_NAME = 'atlas-attempt-auto-submit-sweep';
// A stable jobId so re-scheduling on every process restart doesn't pile up
// duplicate repeatable jobs — same idiom as every other sweep in this file.
const SWEEP_JOB_ID = 'sweep';

export interface AttemptAutoSubmitSweepDeps {
  /** Enqueues onto the shared `ATTEMPT_MARKING_QUEUE_NAME` queue — the
   * marking-job consumer (this same process, `attempt-marking.queue.ts`)
   * picks it up. Injected rather than constructed here so this function
   * stays directly unit/integration-testable without standing up a real
   * BullMQ `Queue`. */
  enqueueMarking: (payload: AttemptMarkingJobPayload, jobId?: string) => Promise<void>;
  now?: () => Date;
}

/**
 * ADR-0004: "a background sweeper as the authority, plus opportunistic
 * finalisation, sharing one idempotent routine." This IS the authority half
 * — `apps/api`'s `AttemptFinalizationService` is the opportunistic half,
 * both applying the identical grace-window boundary via `@atlas/domain`'s
 * `attemptGraceWindowSeconds()` (this codebase's own AGENTS.md §5 names
 * exactly this class of drift risk by name; a hand-duplicated grace-window
 * calculation would be unacceptable here).
 *
 * A plain async function (not a class, no Nest DI: the worker process has
 * none) so it's directly unit/integration-testable without standing up
 * BullMQ at all, matching every sweep in this file (`subscription-expiry
 * .queue.ts`, `exam-control-refresh.queue.ts`). Iterates schools one at a
 * time via `withTenant`, never a single global query — `ExamAttempt` is
 * RLS-protected (`FORCE ROW LEVEL SECURITY`), so `atlas_app` cannot see
 * rows across multiple schools in one unscoped query, the same real
 * constraint every prior sweep in this file already documents.
 *
 * Per-attempt `try/catch`, not just per-school — one level finer than the
 * per-school-only precedent every other sweep in this file uses, since a
 * single attempt's audit-write or enqueue failure is a much narrower blast
 * radius than a whole tenant's failure, and there is no reason a
 * transient failure on one student's attempt should delay finalising every
 * other abandoned attempt in the same school on this same tick.
 *
 * Re-derives the "is this attempt still IN_PROGRESS" condition atomically
 * at write time via the conditional `updateMany`'s own `state:
 * 'IN_PROGRESS'` filter — the same two-step "find candidates, then
 * conditionally act" shape `AttemptLifecycleService.start()`'s own
 * advisory-lock-plus-insert uses. A `count === 0` result is a normal,
 * silent no-op: it means an `apps/api` opportunistic-finalisation path (or
 * a manual submit) already won this exact attempt between this sweep's own
 * `findMany` and this `updateMany` — never treated as an error.
 *
 * Shares one known, narrow, documented residual risk with `apps/api`'s own
 * `AttemptFinalizationService` — see that class's own doc comment: an
 * `enqueueMarking` failure after a successful transition has no automatic
 * retry path (the transition itself must commit immediately regardless,
 * per ADR-0004, unlike `subscription-expiry.queue.ts`'s own deferrable
 * "mark handled only after a successful enqueue" pattern).
 */
export async function runAttemptAutoSubmitSweep(deps: AttemptAutoSubmitSweepDeps): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const cutoff = new Date(now.getTime() - attemptGraceWindowSeconds() * 1000);
  const schools = await prisma.school.findMany({ select: { id: true } });

  for (const school of schools) {
    try {
      const expired = await withTenant(prisma, school.id, (tx) =>
        tx.examAttempt.findMany({
          where: { schoolId: school.id, state: 'IN_PROGRESS', expiresAt: { lte: cutoff } },
          select: { id: true },
        }),
      );

      for (const { id: attemptId } of expired) {
        try {
          const { count } = await withTenant(prisma, school.id, (tx) =>
            tx.examAttempt.updateMany({
              where: { schoolId: school.id, id: attemptId, state: 'IN_PROGRESS' },
              data: { state: 'AUTO_SUBMITTED', submittedAt: now },
            }),
          );
          if (count === 0) continue; // already finalized by another path — safe no-op.

          const attempt = await withTenant(prisma, school.id, (tx) =>
            tx.examAttempt.findUniqueOrThrow({
              where: { id: attemptId },
              select: {
                studentProfile: { select: { membership: { select: { userId: true } } } },
              },
            }),
          );
          // Attributed to the attempt's own student — AuditEvent.actorUserId/
          // actorRole are non-nullable and Role has no SYSTEM value, the
          // same convention apps/api's own AttemptFinalizationService uses
          // for this identical action. Written directly via Prisma, not
          // through AuditService (Nest DI, unavailable in this process) —
          // the same direct-write precedent this file's own sibling sweeps
          // already use for Notification rows.
          await withTenant(prisma, school.id, (tx) =>
            tx.auditEvent.create({
              data: {
                schoolId: school.id,
                actorUserId: attempt.studentProfile.membership.userId,
                actorRole: 'STUDENT',
                action: 'ATTEMPT_AUTO_SUBMITTED',
                entityType: 'ExamAttempt',
                entityId: attemptId,
              },
            }),
          );

          await deps.enqueueMarking({ schoolId: school.id, attemptId }, `mark-${attemptId}`);
        } catch (err) {
          console.error(`[worker] attempt-auto-submit failed for attempt ${attemptId}:`, err);
        }
      }
    } catch (err) {
      console.error(`[worker] attempt-auto-submit sweep failed for school ${school.id}:`, err);
    }
  }
}

export function createAttemptAutoSubmitWorker(
  connection: ConnectionOptions,
  deps: AttemptAutoSubmitSweepDeps,
): Worker {
  return new Worker(
    ATTEMPT_AUTO_SUBMIT_QUEUE_NAME,
    async (_job: Job) => {
      await runAttemptAutoSubmitSweep(deps);
    },
    { connection },
  );
}

export async function scheduleAttemptAutoSubmitSweep(queue: Queue, everyMs: number): Promise<void> {
  await queue.upsertJobScheduler(
    SWEEP_JOB_ID,
    { every: everyMs },
    { opts: { removeOnComplete: true, removeOnFail: 10 } },
  );
}
