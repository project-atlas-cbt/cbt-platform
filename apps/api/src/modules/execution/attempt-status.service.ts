import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { computeResultTotals, type AttemptSnapshotDocumentV1 } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AttemptFinalizationService } from './attempt-finalization.service.js';
import { loadAttemptWithOwnerOrThrow, type AttemptWithOwner } from './attempt-mappers.js';
import type { AttemptStatusResponseDto } from './dto/attempt.dto.js';

/**
 * `GET /v1/attempts/:id/status` (B14) — post-submission status for the
 * confirmation screen (`04 §59`). Every `marking` field is a live aggregate
 * over `AttemptQuestionResult` rows, computed on every read.
 *
 * Still deliberately does NOT read the `Result` row, now that B15 has built
 * one. This endpoint answers "did my submission go through, and is marking
 * finished?" — an execution question, available the instant marking
 * completes and regardless of publication. The `Result` is the academic
 * record, gated by ADR-0010's visibility rules and served by
 * `student-results.v1`. Reading the result here would leak an unpublished
 * score through the execution surface.
 *
 * B15 did make the two share their arithmetic: both go through
 * `@atlas/domain`'s `computeResultTotals`, so the number shown here and the
 * number persisted on the result can never disagree.
 */
@Injectable()
export class AttemptStatusService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly finalization: AttemptFinalizationService,
  ) {}

  async getStatus(
    schoolId: string,
    actor: AuthorizedActor,
    attemptId: string,
  ): Promise<AttemptStatusResponseDto> {
    const attempt = await loadAttemptWithOwnerOrThrow(schoolId, attemptId);
    const decision = await this.authz.evaluate(actor, 'studentCbt.resume', {
      schoolId,
      ownerUserId: attempt.studentProfile.membership.userId,
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to view this attempt.',
      });
    }

    let current: AttemptWithOwner = attempt;
    if (attempt.state === 'IN_PROGRESS') {
      await this.finalization.finalizeIfExpired(schoolId, attemptId, new Date());
      current = await loadAttemptWithOwnerOrThrow(schoolId, attemptId);
    }

    if (!current.snapshot) {
      // Structurally impossible — start()'s own transaction always writes
      // the attempt and its snapshot together, or neither (B13 DoD item 1).
      throw new AppHttpException({
        code: 'INTERNAL',
        message: 'This attempt has no snapshot.',
        httpStatus: 500,
      });
    }
    const document = current.snapshot.document as unknown as AttemptSnapshotDocumentV1;
    const questionCount = document.questions.length;

    const results = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptQuestionResult.findMany({
        where: { schoolId, attemptId },
        select: {
          examQuestionId: true,
          correctness: true,
          awardedMarks: true,
          maximumMarks: true,
        },
      }),
    );

    const markedCount = results.length;
    // B15 extracted this arithmetic into @atlas/domain so the live aggregate
    // here and the persisted `Result` row the marking worker writes are the
    // same computation, not two implementations that could drift.
    const totals = computeResultTotals(
      results.map((r) => ({
        examQuestionId: r.examQuestionId,
        correctness: r.correctness,
        awardedMarks: r.awardedMarks,
        maximumMarks: r.maximumMarks,
      })),
    );
    const { correctCount, incorrectCount, unansweredCount, partialCount } = totals;
    const awardedMarks = totals.earnedMarks;
    const maximumMarks = totals.totalMarks;

    const isFinalized = current.state === 'SUBMITTED' || current.state === 'AUTO_SUBMITTED';
    const markingComplete = isFinalized && questionCount > 0 && markedCount >= questionCount;
    const markingStatus: AttemptStatusResponseDto['marking']['status'] = !isFinalized
      ? 'NOT_APPLICABLE'
      : markingComplete
        ? 'COMPLETE'
        : 'PENDING';

    return {
      attemptId: current.id,
      examId: current.examId,
      state: current.state,
      submittedAt: current.submittedAt?.toISOString() ?? null,
      marking: {
        status: markingStatus,
        questionCount,
        markedCount,
        correctCount,
        incorrectCount,
        unansweredCount,
        partialCount,
        awardedMarks,
        maximumMarks,
        percentage: markingComplete && maximumMarks > 0 ? totals.percentage : null,
      },
    };
  }
}
