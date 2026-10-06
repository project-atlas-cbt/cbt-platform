import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AttemptFinalizationService } from './attempt-finalization.service.js';
import { loadAttemptHeaderOrThrow, type AttemptHeader } from './attempt-mappers.js';
import { loadSnapshotIndex } from './attempt-write-context.js';
import type { AttemptStatusResponseDto } from './dto/attempt.dto.js';

/**
 * `GET /v1/attempts/:id/status` (B14) — post-submission status for the
 * confirmation screen (`04 §59`): "did my submission go through, and is
 * marking finished?" — an execution question, answered from live counts
 * of `AttemptQuestionResult` rows.
 *
 * It returns NO marks or correct/incorrect counts (2026-10-06). It used to,
 * which put a student's score on the confirmation screen the moment marking
 * finished — before any release and regardless of the exam's "what
 * students see" setting. Scores reach students only through
 * `student-results.v1`, gated by ADR-0010's publication and visibility
 * rules.
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
    const attempt = await loadAttemptHeaderOrThrow(schoolId, attemptId);
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

    let current: AttemptHeader = attempt;
    if (attempt.state === 'IN_PROGRESS') {
      await this.finalization.finalizeIfExpired(schoolId, attemptId, new Date());
      current = await loadAttemptHeaderOrThrow(schoolId, attemptId);
    }

    // B21: post-submit status is polled every 5 s by every student (F13),
    // so the question count comes from the cached immutable-snapshot index
    // rather than re-reading the whole snapshot document per poll.
    const index = await loadSnapshotIndex(schoolId, attemptId);
    if (!index) {
      // Structurally impossible — start()'s own transaction always writes
      // the attempt and its snapshot together, or neither (B13 DoD item 1).
      throw new AppHttpException({
        code: 'INTERNAL',
        message: 'This attempt has no snapshot.',
        httpStatus: 500,
      });
    }
    const questionCount = index.size;

    const markedCount = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptQuestionResult.count({ where: { schoolId, attemptId } }),
    );

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
      },
    };
  }
}
