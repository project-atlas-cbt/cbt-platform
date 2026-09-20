import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AuditService } from '../operations/audit-event.service.js';
import { requireSchoolActor } from '../questions/question-scope.util.js';
import type { ExamResponseDto } from '../exams/dto/exam.dto.js';
import { toExamResponseDtoFresh } from '../exams/exam.util.js';
import { loadParentExamOrThrow } from './exam-control-mappers.js';
import { ExamControlStreamService } from './exam-control-stream.service.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

/**
 * The exam-level close/reopen actions — confirmed with the project owner
 * during B12 planning (2026-09-04) as a genuine addition distinct from
 * session-level close/reopen (`ExamSessionService`), not merely the
 * roadmap's own literal 9-endpoint contract. Exam-level close cascades
 * every currently-OPEN session to CLOSED in one transaction (no new session
 * may open while the exam itself is CLOSED — `ExamSessionService.open()`
 * checks this); exam-level reopen only lifts that block — it does NOT
 * auto-reopen the sessions the cascade closed, preserving fine-grained
 * operator control over which specific session/batch resumes.
 *
 * `exam.closeNewAttempts` is checked as representative of `exam.pause` too
 * (ADR-0009: the two permission-table rows denote the identical OPEN→CLOSED
 * transition) — see that row's own comment in permission-table.ts.
 */
@Injectable()
export class ExamLifecycleService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly stream: ExamControlStreamService,
  ) {}

  async closeExam(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    auditCtx: ActorContext,
  ): Promise<ExamResponseDto> {
    const exam = await loadParentExamOrThrow(schoolId, examId);
    const decision = await this.authz.evaluate(actor, 'exam.closeNewAttempts', {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      examId: exam.id,
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to close this exam.',
      });
    }

    const schoolActor = requireSchoolActor(actor);
    const now = new Date();
    const cascadedCount = await withTenant(prisma, schoolId, async (tx) => {
      const { count } = await tx.exam.updateMany({
        where: { id: examId, status: 'OPEN' },
        data: { status: 'CLOSED' },
      });
      if (count === 0) return null;
      const cascaded = await tx.examSession.updateMany({
        where: { schoolId, examId, status: 'OPEN' },
        data: { status: 'CLOSED', closedAt: now, closedByMembershipId: schoolActor.membershipId },
      });
      return cascaded.count;
    });
    if (cascadedCount === null) {
      throw new AppHttpException({
        code: 'EXAM_NOT_OPEN',
        message: 'This exam is not currently OPEN.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_CLOSED',
      entityType: 'Exam',
      entityId: examId,
      metadata: { cascadedSessionCount: cascadedCount },
    });
    await this.stream.publishUpdate(schoolId, examId);

    return toExamResponseDtoFresh(schoolId, examId);
  }

  async reopenExam(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    auditCtx: ActorContext,
  ): Promise<ExamResponseDto> {
    const exam = await loadParentExamOrThrow(schoolId, examId);
    const decision = await this.authz.evaluate(actor, 'exam.reopen', {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      examId: exam.id,
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to reopen this exam.',
      });
    }

    const { count } = await withTenant(prisma, schoolId, async (tx) => {
      // Shares B19's session-row lock with rollover close/commit. A closed
      // historical session must never regain an OPEN exam through reopen.
      const [academicSession] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM academic_sessions
        WHERE id = ${exam.academicSessionId}::uuid AND school_id = ${schoolId}::uuid
        FOR UPDATE
      `;
      if (academicSession?.status !== 'CURRENT') return { count: 0 };
      return tx.exam.updateMany({
        where: { id: examId, status: 'CLOSED' },
        data: { status: 'OPEN' },
      });
    });
    if (count === 0) {
      throw new AppHttpException({
        code: 'EXAM_NOT_CLOSED',
        message: 'This exam is not currently CLOSED.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_REOPENED',
      entityType: 'Exam',
      entityId: examId,
    });
    await this.stream.publishUpdate(schoolId, examId);

    return toExamResponseDtoFresh(schoolId, examId);
  }
}
