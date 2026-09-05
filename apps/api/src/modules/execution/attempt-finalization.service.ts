import { Injectable, Logger } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { attemptGraceWindowSeconds } from '@atlas/domain';
import { AuditService } from '../operations/audit-event.service.js';
import { AttemptMarkingQueueService } from './attempt-marking-queue.service.js';
import { ExamControlStreamService } from './exam-control-stream.service.js';

/**
 * ADR-0004's shared idempotent finalisation routine — the `apps/api` half.
 * `apps/worker`'s own sweeper (`attempt-auto-submit.queue.ts`) implements
 * the identical conditional-transition idiom independently — it cannot
 * import this class (only `packages/*` crosses the `apps/api`/`apps/worker`
 * boundary), but both share `@atlas/domain`'s `attemptGraceWindowSeconds()`
 * so the two can never disagree about the grace-window boundary itself.
 *
 * One atomic conditional `UPDATE ... WHERE state = 'IN_PROGRESS' AND
 * expires_at <= cutoff` folds ADR-0003's grace-window cutoff directly into
 * the WHERE clause (no separate load-then-branch) — this IS "any server
 * request touching an expired attempt finalises it immediately," called
 * from every relevant `apps/api` touchpoint (heartbeat, answer-write's own
 * rejection path, `submit()`'s own rejection path, `resume()`,
 * `GET /status`).
 *
 * Returns whether THIS call performed the transition. Every caller must be
 * safe with `false` — it means either the attempt was never actually
 * expired, or another path (the sweeper, or a racing `apps/api` request)
 * already won; the attempt's own current state is authoritative regardless
 * of which path produced it.
 *
 * Known, narrow residual risk (documented, not silently accepted): the
 * state transition itself must commit immediately, unconditionally,
 * regardless of downstream availability (ADR-0004) — so, unlike
 * `subscription-expiry.queue.ts`'s own "don't mark a threshold handled
 * until the dispatch enqueue actually succeeds" pattern, this method
 * cannot defer the transition until `marking.enqueue()` succeeds. If that
 * one call fails (e.g. a Redis outage at that exact instant — the same
 * Redis every other part of this platform already depends on), the
 * attempt is correctly finalized, but marking is never enqueued for it and
 * nothing currently re-discovers and retries that gap later. Not fixed
 * here: doing so would need a genuinely new "finalized attempts with no
 * marking output and no pending job" reconciliation scan, beyond this
 * phase's own scope — recorded here for whoever next revisits this class
 * of gap (a Candidate for B14's own hardening pass or B21).
 *
 * Everything from the transition onward (loading the student for
 * attribution, the audit write, the Control Center publish, the marking
 * enqueue) is a best-effort side effect of a transition that has ALREADY
 * durably committed — never a reason to fail the caller. `heartbeat()`,
 * `resume()`, and `GET /status` all document themselves as non-blocking,
 * and `submit()`'s own late-arrival branch is meant to degrade to a clean
 * 200, not an error — none of the four call sites of this method wrap it
 * in a `try/catch` of their own (only `AttemptAnswerService
 * .writeAnswerInner()`'s rejection path does, via `.catch(() => undefined)`
 * on the call itself), so this method must never let a downstream failure
 * escape as a thrown exception. Found in review: an earlier version let
 * `audit.record`/`stream.publishUpdate`/`marking.enqueue` throw
 * unguarded — a single Redis blip (shared by both the stream and the
 * queue) would have turned an opportunistic, incidental side-check into a
 * 500 on `GET /:id`, `POST /:id/heartbeat`, and `GET /:id/status`, even
 * though the transition itself had already succeeded. Fixed by catching
 * and logging here, mirroring `apps/worker`'s own per-attempt `try/catch`
 * in its sweeper (`attempt-auto-submit.queue.ts`) — the return value is
 * `true` once the transition itself has committed, regardless of whether
 * these side effects succeeded.
 */
@Injectable()
export class AttemptFinalizationService {
  private readonly logger = new Logger(AttemptFinalizationService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly stream: ExamControlStreamService,
    private readonly marking: AttemptMarkingQueueService,
  ) {}

  async finalizeIfExpired(schoolId: string, attemptId: string, now: Date): Promise<boolean> {
    const cutoff = new Date(now.getTime() - attemptGraceWindowSeconds() * 1000);

    const { count } = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.updateMany({
        where: { schoolId, id: attemptId, state: 'IN_PROGRESS', expiresAt: { lte: cutoff } },
        data: { state: 'AUTO_SUBMITTED', submittedAt: now },
      }),
    );
    if (count === 0) return false;

    try {
      const attempt = await withTenant(prisma, schoolId, (tx) =>
        tx.examAttempt.findUniqueOrThrow({
          where: { id: attemptId },
          select: {
            examId: true,
            studentProfile: { select: { membership: { select: { userId: true } } } },
          },
        }),
      );

      // Attributed to the attempt's own student — matches every other
      // system-initiated action in this schema: AuditEvent.actorUserId/
      // actorRole are non-nullable and Role has no SYSTEM value, so a system
      // action is recorded against its subject, the only option the schema
      // permits (the same convention decision 1's BINDING_MISMATCH signal and
      // every other B13 system path already use).
      await this.audit.record({
        schoolId,
        actorUserId: attempt.studentProfile.membership.userId,
        actorRole: 'STUDENT',
        action: 'ATTEMPT_AUTO_SUBMITTED',
        entityType: 'ExamAttempt',
        entityId: attemptId,
      });
      await this.stream.publishUpdate(schoolId, attempt.examId);
      await this.marking.enqueue({ schoolId, attemptId }, `mark-${attemptId}`);
    } catch (error) {
      // The transition above already committed — this is a best-effort
      // side effect, not the outcome the caller is waiting on. Swallowed
      // and logged loudly rather than thrown, per this class's own doc
      // comment; see that comment for the known residual risk this leaves
      // (a lost marking-enqueue is not currently retried by anything else).
      this.logger.error(
        `finalizeIfExpired: attempt ${attemptId} transitioned to AUTO_SUBMITTED, but a ` +
          `downstream side effect (audit write / Control Center publish / marking enqueue) ` +
          `failed: ${String(error)}`,
      );
    }

    return true;
  }
}
