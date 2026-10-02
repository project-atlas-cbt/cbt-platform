import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { evaluateWriteAdmissibility, type AttemptSnapshotDocumentV1 } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AttemptFinalizationService } from './attempt-finalization.service.js';
import { loadAttemptWithOwnerOrThrow, type AttemptWithOwner } from './attempt-mappers.js';
import { AttemptEventService } from './attempt-event.service.js';
import type {
  BatchAnswerItemDto,
  BatchAnswerResultDto,
  SaveAnswerBatchDto,
  SaveAnswerBatchResponseDto,
  SaveAnswerDto,
  SaveAnswerResponseDto,
} from './dto/attempt.dto.js';
import { CRITICAL_SPANS, withSpan } from '@atlas/observability';
import { ExamTelemetryService } from './exam-telemetry.service.js';

interface UpsertOutcome {
  accepted: boolean;
  sequenceNumber: number;
  answeredAt: Date;
}

/**
 * ADR-0007 + ADR-0003, the single hottest path in the product (`09 §45`:
 * "the interactive path stays tiny"). Every write here:
 *
 * 1. Is admissibility-checked against SERVER receipt time only (ADR-0003) —
 *    a client-supplied timestamp is never trusted for this.
 * 2. Is ordering-checked against the client-assigned `sequenceNumber`
 *    (ADR-0007/X-04) via one atomic, race-free SQL statement (see
 *    `upsertAnswer` below) — not a separate SELECT-then-branch-then-write,
 *    which would leave a real race window between two concurrent writers
 *    to the same (attempt, question) on their very FIRST write (no row yet
 *    to lock). `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE` is
 *    Postgres's own atomic "keep only the higher-value write" idiom and is
 *    correct under concurrency without any additional lock — a real,
 *    scoped refinement of this phase's own plan, found during
 *    implementation (`R-07`'s own "confine raw SQL to a small,
 *    explicitly-named set of exam-engine repository methods").
 * 3. NEVER touches the parent `exam_attempts` row inside this write's own
 *    transaction (R-03) — `lastSeenAt` is a separate, post-commit,
 *    best-effort call to `AttemptEventService.touchLastSeen`.
 * 4. Writes an `AttemptAnswerEvent` row for BOTH an accepted write (same
 *    transaction as the `AttemptAnswer` upsert, ADR-0007) and a rejected
 *    one (its own, separate insert — nothing else happened in that request
 *    to share a transaction with) — "final submitted state must remain
 *    reconstructable" extends to what a client attempted and was refused.
 */
@Injectable()
export class AttemptAnswerService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly attemptEvents: AttemptEventService,
    private readonly finalization: AttemptFinalizationService,
    private readonly telemetry: ExamTelemetryService,
  ) {}

  /** B20: span + outcome metric around the unchanged save path (the Exam
   * Health Monitor's answer-save success rate is computed from these). */
  async saveAnswer(
    schoolId: string,
    actor: AuthorizedActor,
    attemptId: string,
    examQuestionId: string,
    dto: SaveAnswerDto,
    receivedAt: Date,
  ): Promise<SaveAnswerResponseDto> {
    const began = performance.now();
    return withSpan(
      CRITICAL_SPANS.answerSave,
      {
        'atlas.school_id': schoolId,
        'atlas.attempt_id': attemptId,
        'atlas.exam_question_id': examQuestionId,
      },
      async (span) => {
        try {
          const result = await this.saveAnswerInner(
            schoolId,
            actor,
            attemptId,
            examQuestionId,
            dto,
            receivedAt,
          );
          span.setAttribute('atlas.accepted', result.accepted);
          this.telemetry.answerSave(result.accepted ? 'ok' : 'rejected', performance.now() - began);
          return result;
        } catch (err) {
          this.telemetry.answerSave(
            ExamTelemetryService.classifyError(err),
            performance.now() - began,
          );
          throw err;
        }
      },
    );
  }

  async saveAnswerBatch(
    schoolId: string,
    actor: AuthorizedActor,
    attemptId: string,
    dto: SaveAnswerBatchDto,
    receivedAt: Date,
  ): Promise<SaveAnswerBatchResponseDto> {
    return withSpan(
      CRITICAL_SPANS.answerSaveBatch,
      {
        'atlas.school_id': schoolId,
        'atlas.attempt_id': attemptId,
        'atlas.batch_size': dto.answers.length,
      },
      async () => {
        try {
          const result = await this.saveAnswerBatchInner(
            schoolId,
            actor,
            attemptId,
            dto,
            receivedAt,
          );
          // Per item: an unexpected server error inside one item surfaces
          // as rejectionCode INTERNAL (saveBatchItem's catch-all).
          for (const item of result.results) {
            this.telemetry.answerSave(
              item.accepted ? 'ok' : item.rejectionCode === 'INTERNAL' ? 'failed' : 'rejected',
            );
          }
          return result;
        } catch (err) {
          this.telemetry.answerSave(ExamTelemetryService.classifyError(err));
          throw err;
        }
      },
    );
  }

  private async saveAnswerInner(
    schoolId: string,
    actor: AuthorizedActor,
    attemptId: string,
    examQuestionId: string,
    dto: SaveAnswerDto,
    receivedAt: Date,
  ): Promise<SaveAnswerResponseDto> {
    const attempt = await this.authorizeAndLoad(schoolId, actor, attemptId);
    const outcome = await this.writeAnswer(schoolId, attempt, examQuestionId, dto, receivedAt);
    void this.attemptEvents.touchLastSeen(schoolId, attemptId);
    return {
      examQuestionId,
      accepted: outcome.accepted,
      sequenceNumber: outcome.sequenceNumber,
      gradeWindowFlag: evaluateWriteAdmissibility(attempt.expiresAt, receivedAt) === 'GRACE_WINDOW',
      answeredAt: outcome.answeredAt.toISOString(),
    };
  }

  /** `POST /v1/attempts/:id/answers/batch` — flushes an offline queue.
   * Never all-or-nothing: one stale/rejected item must not drop the other
   * valid answers in the same flush. `receivedAt` is captured once, at the
   * top of the batch, and reused for every item — a slow batch must not
   * let later items see a technically-later "now" the earlier items in the
   * same request didn't (every item in one flush is admissibility-checked
   * against the same moment). */
  private async saveAnswerBatchInner(
    schoolId: string,
    actor: AuthorizedActor,
    attemptId: string,
    dto: SaveAnswerBatchDto,
    receivedAt: Date,
  ): Promise<SaveAnswerBatchResponseDto> {
    const attempt = await this.authorizeAndLoad(schoolId, actor, attemptId);
    const results: BatchAnswerResultDto[] = [];
    for (const item of dto.answers) {
      results.push(await this.saveBatchItem(schoolId, attempt, item, receivedAt));
    }
    void this.attemptEvents.touchLastSeen(schoolId, attemptId);
    return { results };
  }

  private async authorizeAndLoad(
    schoolId: string,
    actor: AuthorizedActor,
    attemptId: string,
  ): Promise<AttemptWithOwner> {
    const attempt = await loadAttemptWithOwnerOrThrow(schoolId, attemptId);
    const decision = await this.authz.evaluate(actor, 'studentCbt.answer', {
      schoolId,
      ownerUserId: attempt.studentProfile.membership.userId,
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to answer questions on this attempt.',
      });
    }
    return attempt;
  }

  private async saveBatchItem(
    schoolId: string,
    attempt: AttemptWithOwner,
    item: BatchAnswerItemDto,
    receivedAt: Date,
  ): Promise<BatchAnswerResultDto> {
    try {
      const outcome = await this.writeAnswer(
        schoolId,
        attempt,
        item.examQuestionId,
        item,
        receivedAt,
      );
      return {
        examQuestionId: item.examQuestionId,
        accepted: outcome.accepted,
        gradeWindowFlag:
          evaluateWriteAdmissibility(attempt.expiresAt, receivedAt) === 'GRACE_WINDOW',
      };
    } catch (error) {
      const code = error instanceof AppHttpException ? error.code : 'INTERNAL';
      return {
        examQuestionId: item.examQuestionId,
        accepted: false,
        rejectionCode: code,
        gradeWindowFlag: false,
      };
    }
  }

  /** Shared by both the single-answer and batch paths — wraps
   * `writeAnswerInner` so EVERY rejection (validation, admissibility,
   * ordering, or a genuinely unexpected failure) records one
   * `AttemptAnswerEvent`, not just the two paths that used to remember to
   * call `recordRejectedEvent` explicitly (Found in review — B13 gap
   * closure: `ATTEMPT_NOT_WRITABLE` and both `ATTEMPT_QUESTION_NOT_IN
   * _SNAPSHOT` cases left no forensic trail at all, and the batch flush's
   * own catch-all recorded nothing for a truly unanticipated error).
   * "Final submitted state must remain reconstructable" (ADR-0007)
   * extends to what a client attempted and was refused, regardless of
   * why. Best-effort: a failure to log the rejection must never mask or
   * replace the original error. */
  private async writeAnswer(
    schoolId: string,
    attempt: AttemptWithOwner,
    examQuestionId: string,
    dto: Pick<SaveAnswerDto, 'selectedOptionId' | 'sequenceNumber' | 'source'>,
    receivedAt: Date,
  ): Promise<UpsertOutcome> {
    try {
      return await this.writeAnswerInner(schoolId, attempt, examQuestionId, dto, receivedAt);
    } catch (error) {
      const reason =
        error instanceof AppHttpException
          ? error.message
          : 'Unexpected error while saving this answer.';
      await this.recordRejectedEvent(
        schoolId,
        attempt.id,
        examQuestionId,
        dto,
        receivedAt,
        reason,
      ).catch(() => undefined);
      throw error;
    }
  }

  /** The actual save logic — "is this attempt still writable" through the
   * DB write itself. Every throw here goes through `writeAnswer`'s own
   * centralized rejection-event recording; nothing here should call
   * `recordRejectedEvent` directly any more. */
  private async writeAnswerInner(
    schoolId: string,
    attempt: AttemptWithOwner,
    examQuestionId: string,
    dto: Pick<SaveAnswerDto, 'selectedOptionId' | 'sequenceNumber' | 'source'>,
    receivedAt: Date,
  ): Promise<UpsertOutcome> {
    // Fast-fail service-layer check — the real, unconditional backstop is
    // `attempt_answers_immutable_when_attempt_not_in_progress` (the DB
    // trigger), matching this codebase's universal service-check +
    // trigger-backstop pattern.
    if (attempt.state !== 'IN_PROGRESS') {
      throw new AppHttpException({
        code: 'ATTEMPT_NOT_WRITABLE',
        message: 'This attempt is no longer accepting answers.',
      });
    }

    const admissibility = evaluateWriteAdmissibility(attempt.expiresAt, receivedAt);
    if (admissibility === 'REJECTED') {
      // B14 (ADR-0004): "any server request touching an expired attempt
      // finalises it immediately" — a best-effort side effect only,
      // mirroring this file's own recordRejectedEvent precedent just
      // below (awaited so it completes deterministically, its own failure
      // swallowed rather than propagated). The client-visible response for
      // a late ANSWER write is unchanged — still rejected, same code —
      // only submit()'s own late-arrival response changes, per this
      // phase's confirmed decision.
      await this.finalization
        .finalizeIfExpired(schoolId, attempt.id, receivedAt)
        .catch(() => undefined);
      throw new AppHttpException({
        code: 'ATTEMPT_WRITE_WINDOW_CLOSED',
        message: 'This attempt has expired and the grace window for late answers has closed.',
      });
    }
    const gradeWindowFlag = admissibility === 'GRACE_WINDOW';

    const document = attempt.snapshot?.document as unknown as AttemptSnapshotDocumentV1 | undefined;
    const question = document?.questions.find((q) => q.examQuestionId === examQuestionId);
    if (!question) {
      throw new AppHttpException({
        code: 'ATTEMPT_QUESTION_NOT_IN_SNAPSHOT',
        message: 'This question does not belong to this attempt.',
      });
    }
    if (
      dto.selectedOptionId != null &&
      !question.options.some((o) => o.optionId === dto.selectedOptionId)
    ) {
      throw new AppHttpException({
        code: 'ATTEMPT_QUESTION_NOT_IN_SNAPSHOT',
        message: 'This option does not belong to this question.',
      });
    }

    const answerState = dto.selectedOptionId != null ? 'ANSWERED' : 'UNANSWERED';
    const upserted = await withTenant(prisma, schoolId, async (tx) => {
      // Atomic, race-free "keep only the higher-or-equal-sequence write" —
      // see this file's own header comment for why this single statement
      // replaces a SELECT-then-branch-then-write. `<=` (not `<`) so a
      // genuine retry of the SAME sequence number is accepted as an
      // idempotent no-op-equivalent success (DoD item 9), while a
      // strictly lower sequence is rejected (DoD item 8/X-04).
      const rows = await tx.$queryRaw<{ sequence_number: number; answered_at: Date }[]>`
        INSERT INTO attempt_answers
          (id, school_id, attempt_id, exam_question_id, selected_option_id, state, sequence_number, answered_at, last_saved_at, grade_window_flag)
        VALUES
          (uuidv7(), ${schoolId}::uuid, ${attempt.id}::uuid, ${examQuestionId}::uuid, ${dto.selectedOptionId ?? null}::uuid, ${answerState}::"AttemptAnswerState", ${dto.sequenceNumber}::int, ${receivedAt}::timestamptz, ${receivedAt}::timestamptz, ${gradeWindowFlag}::boolean)
        ON CONFLICT (school_id, attempt_id, exam_question_id)
        DO UPDATE SET
          selected_option_id = EXCLUDED.selected_option_id,
          state = EXCLUDED.state,
          sequence_number = EXCLUDED.sequence_number,
          answered_at = EXCLUDED.answered_at,
          last_saved_at = EXCLUDED.last_saved_at,
          grade_window_flag = EXCLUDED.grade_window_flag
        WHERE attempt_answers.sequence_number <= EXCLUDED.sequence_number
        RETURNING sequence_number, answered_at
      `;
      if (rows.length === 0) return null;

      await tx.attemptAnswerEvent.create({
        data: {
          schoolId,
          attemptId: attempt.id,
          examQuestionId,
          sequenceNumber: dto.sequenceNumber,
          selectedOptionId: dto.selectedOptionId ?? null,
          receivedAt,
          source: dto.source ?? 'online',
          gradeWindowFlag,
          accepted: true,
        },
      });
      return rows[0]!;
    });

    if (upserted === null) {
      throw new AppHttpException({
        code: 'ATTEMPT_ANSWER_SEQUENCE_STALE',
        message: 'A newer answer for this question already exists.',
      });
    }

    return {
      accepted: true,
      sequenceNumber: upserted.sequence_number,
      answeredAt: upserted.answered_at,
    };
  }

  private async recordRejectedEvent(
    schoolId: string,
    attemptId: string,
    examQuestionId: string,
    dto: Pick<SaveAnswerDto, 'selectedOptionId' | 'sequenceNumber' | 'source'>,
    receivedAt: Date,
    rejectionReason: string,
  ): Promise<void> {
    await withTenant(prisma, schoolId, (tx) =>
      tx.attemptAnswerEvent.create({
        data: {
          schoolId,
          attemptId,
          examQuestionId,
          sequenceNumber: dto.sequenceNumber,
          selectedOptionId: dto.selectedOptionId ?? null,
          receivedAt,
          source: dto.source ?? 'online',
          gradeWindowFlag: false,
          accepted: false,
          rejectionReason,
        },
      }),
    );
  }
}
