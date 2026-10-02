/**
 * B14: the cross-process contract for the marking job — mirrors
 * `packages/notifications/src/dispatch-queue.ts`'s exact shape and
 * reasoning.
 *
 * The consumer lives in `apps/worker` (see `attempt-marking.queue.ts`
 * there) — unlike B7's import processor or B10's notification-dispatch
 * processor (both hosted in `apps/api`, since they reuse Nest-DI-resolved
 * singletons `apps/worker` cannot reach), marking has no such dependency:
 * it reads `AttemptQuestionSnapshot`/`AttemptAnswer` and writes
 * `AttemptQuestionResult` via plain Prisma, with no audit event of its own
 * (marking's outcome is implicit in row existence — `ATTEMPT_SUBMITTED`/
 * `ATTEMPT_AUTO_SUBMITTED` are already recorded by whichever path finalized
 * the attempt). `apps/worker` cannot import `apps/api/src` at all (only
 * `packages/*` are shared across apps), but a bare queue-name/payload
 * contract has no other shared surface to justify its own package the way
 * `@atlas/notifications`' channel/template abstraction did — this lives in
 * `@atlas/domain` instead, which both `apps/api` (producer — `submit()`/
 * `end()`/opportunistic finalisation) and `apps/worker` (producer — the
 * ADR-0004 sweeper; consumer — the marking job itself) already depend on.
 */
export const ATTEMPT_MARKING_QUEUE_NAME = 'atlas-attempt-marking';

export interface AttemptMarkingJobPayload {
  schoolId: string;
  attemptId: string;
  /** B20: W3C trace-context carrier from the enqueuing request (submit),
   * so the worker's result-generation span joins the same trace. Optional —
   * jobs enqueued before B20, or by the sweeper outside any span, carry none. */
  trace?: Record<string, string>;
}
