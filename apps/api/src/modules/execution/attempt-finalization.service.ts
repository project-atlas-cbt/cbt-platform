import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { attemptGraceWindowSeconds } from '@atlas/domain';
import { AuditService } from '../operations/audit-event.service.js';
import { ensureProcessingResult } from '../results/result-finalization.util.js';
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
 * B22 closed the residual risk this comment used to record (a marking
 * enqueue lost to a Redis outage was never retried): the PROCESSING result
 * committed with the transition is now the durable record that marking is
 * owed, and the worker's reconciliation pass re-enqueues marking for any
 * finalised attempt whose result is still PROCESSING with no live job.
 *
 * Everything after the transition commits (the Control Center publish,
 * the marking enqueue) is a best-effort side effect of a transition that has ALREADY
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
 * though the transition itself had already succeeded. Now the audit row
 * commits inside the transition and the two remaining side effects never
 * throw (`publishSoon` and `enqueueAfterCommit` log and fall back) — the
 * return value is `true` once the transition itself has committed,
 * regardless of whether these side effects succeeded.
 */
@Injectable()
export class AttemptFinalizationService {
  constructor(
    private readonly audit: AuditService,
    private readonly stream: ExamControlStreamService,
    private readonly marking: AttemptMarkingQueueService,
  ) {}

  async finalizeIfExpired(schoolId: string, attemptId: string, now: Date): Promise<boolean> {
    const cutoff = new Date(now.getTime() - attemptGraceWindowSeconds() * 1000);

    let examId: string | undefined;
    const { count } = await withTenant(prisma, schoolId, async (tx) => {
      const transition = await tx.examAttempt.updateMany({
        where: { schoolId, id: attemptId, state: 'IN_PROGRESS', expiresAt: { lte: cutoff } },
        data: { state: 'AUTO_SUBMITTED', submittedAt: now },
      });
      // B15: same transaction as the transition, so ADR-0004's opportunistic
      // finalisation leaves a result row exactly as the interactive submit
      // path does. This is also the case that most needs it — an auto-submit
      // whose marking enqueue then fails would otherwise leave nothing at all
      // for anyone downstream to notice.
      if (transition.count > 0) {
        const owner = await tx.examAttempt.findUniqueOrThrow({
          where: { id: attemptId },
          select: {
            examId: true,
            studentProfileId: true,
            studentProfile: { select: { membership: { select: { userId: true } } } },
          },
        });
        await ensureProcessingResult(tx, {
          schoolId,
          attemptId,
          examId: owner.examId,
          studentProfileId: owner.studentProfileId,
        });
        // Attributed to the attempt's own student — matches every other
        // system-initiated action in this schema: AuditEvent.actorUserId/
        // actorRole are non-nullable and Role has no SYSTEM value, so a system
        // action is recorded against its subject, the only option the schema
        // permits (the same convention decision 1's BINDING_MISMATCH signal and
        // every other B13 system path already use). B22: written in the
        // transition's own transaction, so it can no longer be lost to a
        // failure after commit.
        await this.audit.recordInTx(tx, {
          schoolId,
          actorUserId: owner.studentProfile.membership.userId,
          actorRole: 'STUDENT',
          action: 'ATTEMPT_AUTO_SUBMITTED',
          entityType: 'ExamAttempt',
          entityId: attemptId,
        });
        examId = owner.examId;
      }
      return transition;
    });
    if (count === 0 || examId === undefined) return false;

    // The transition (with its PROCESSING result and audit row) has
    // committed; what follows is best-effort and never throws. A lost
    // marking enqueue is re-discovered by the worker's reconciliation pass
    // (B22), so a Redis outage at this instant delays marking, never loses it.
    await this.stream.publishSoon(schoolId, examId);
    await this.marking.enqueueAfterCommit({ schoolId, attemptId });

    return true;
  }
}
