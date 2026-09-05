import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { AttemptSnapshotDocumentV1 } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AttemptFinalizationService } from './attempt-finalization.service.js';
import { loadAttemptWithOwnerOrThrow, type AttemptWithOwner } from './attempt-mappers.js';
import type { AttemptStatusResponseDto } from './dto/attempt.dto.js';

/**
 * `GET /v1/attempts/:id/status` (B14) — post-submission status for the
 * confirmation screen (`04 §59`). Deliberately does NOT read or construct a
 * `Result` row — that entity doesn't exist until B15 (this phase's own
 * confirmed decision: B14 stays entity-free for `Result`). Every `marking`
 * field is a live aggregate over `AttemptQuestionResult` rows, computed on
 * every read — never cached, never persisted as a second copy of the truth.
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
        select: { correctness: true, awardedMarks: true, maximumMarks: true },
      }),
    );

    const markedCount = results.length;
    const correctCount = results.filter((r) => r.correctness === 'CORRECT').length;
    const incorrectCount = results.filter((r) => r.correctness === 'INCORRECT').length;
    const unansweredCount = results.filter((r) => r.correctness === 'UNANSWERED').length;
    const partialCount = results.filter((r) => r.correctness === 'PARTIAL').length;
    const awardedMarks = results.reduce((sum, r) => sum + r.awardedMarks, 0);
    const maximumMarks = results.reduce((sum, r) => sum + r.maximumMarks, 0);

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
        percentage:
          markingComplete && maximumMarks > 0
            ? Math.round((awardedMarks / maximumMarks) * 10000) / 100
            : null,
      },
    };
  }
}
