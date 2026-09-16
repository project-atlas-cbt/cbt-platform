import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import type { ExamResponseDto } from '../exams/dto/exam.dto.js';
import { toExamResponseDtoFresh } from '../exams/exam.util.js';
import { AuditService } from '../operations/audit-event.service.js';
import { requireSchoolActor } from '../questions/question-scope.util.js';
import type { CompleteExamDto } from './dto/exam-control-center.dto.js';
import { loadParentExamOrThrow } from './exam-control-mappers.js';
import { ExamControlStreamService } from './exam-control-stream.service.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

type CompleteOutcome =
  | { kind: 'SESSIONS_STILL_OPEN' }
  | { kind: 'ATTEMPTS_STILL_IN_PROGRESS' }
  | { kind: 'STALE_ABSENTEE_LIST' }
  | { kind: 'NOT_COMPLETABLE' }
  | { kind: 'OK'; absentCount: number };

/**
 * End Examination remains one atomic operator action. B16 changes the
 * participation authority from exam-wide to one row per exam sitting.
 */
@Injectable()
export class ExamCompletionService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly stream: ExamControlStreamService,
  ) {}

  async complete(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    dto: CompleteExamDto,
    auditCtx: ActorContext,
  ): Promise<ExamResponseDto> {
    const exam = await loadParentExamOrThrow(schoolId, examId);
    const resource = {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      examId: exam.id,
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
    };
    if (!(await this.authz.evaluate(actor, 'examAdmin.controlCenter', resource)).allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to end this examination.',
      });
    }
    if (!(await this.authz.evaluate(actor, 'examAdmin.markAbsence', resource)).allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to confirm absences for this exam.',
      });
    }

    const member = requireSchoolActor(actor);
    const submittedStudentIds = new Set(dto.confirmedAbsentStudentProfileIds);
    const outcome = await withTenant(
      prisma,
      schoolId,
      async (tx): Promise<CompleteOutcome> => {
        await tx.$queryRaw`
          SELECT id FROM exams
          WHERE id = ${examId}::uuid AND school_id = ${schoolId}::uuid
          FOR UPDATE
        `;

        const inProgressAttempts = await tx.examAttempt.count({
          where: { schoolId, examId, state: 'IN_PROGRESS' },
        });
        if (inProgressAttempts > 0) return { kind: 'ATTEMPTS_STILL_IN_PROGRESS' };

        const openSessions = await tx.examSession.count({
          where: { schoolId, examId, status: 'OPEN' },
        });
        if (openSessions > 0) return { kind: 'SESSIONS_STILL_OPEN' };

        const participants = await tx.examSessionParticipant.findMany({
          where: {
            schoolId,
            status: 'AUTHORIZED',
            session: { schoolId, examId },
          },
          select: { studentProfileId: true, examSessionId: true },
        });
        const existingParticipation = await tx.examParticipation.findMany({
          where: { schoolId, examId },
          select: { studentProfileId: true, examSessionId: true },
        });
        const markedSittings = new Set(
          existingParticipation.map(
            (row) => `${row.examSessionId}:${row.studentProfileId}`,
          ),
        );
        const pendingSittings = participants.filter(
          (row) => !markedSittings.has(`${row.examSessionId}:${row.studentProfileId}`),
        );
        const pendingStudentIds = new Set(
          pendingSittings.map((row) => row.studentProfileId),
        );
        const absenteeListMatches =
          pendingStudentIds.size === submittedStudentIds.size &&
          [...pendingStudentIds].every((id) => submittedStudentIds.has(id));
        if (!absenteeListMatches) return { kind: 'STALE_ABSENTEE_LIST' };

        const claim = await tx.exam.updateMany({
          where: { schoolId, id: examId, status: { in: ['OPEN', 'CLOSED'] } },
          data: { status: 'COMPLETED' },
        });
        if (claim.count === 0) return { kind: 'NOT_COMPLETABLE' };

        await tx.examSession.updateMany({
          where: { schoolId, examId, status: { in: ['OPEN', 'CLOSED'] } },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        if (pendingSittings.length > 0) {
          await tx.examParticipation.createMany({
            data: pendingSittings.map((row) => ({
              schoolId,
              examId,
              examSessionId: row.examSessionId,
              studentProfileId: row.studentProfileId,
              status: 'ABSENT',
              markedByMembershipId: member.membershipId,
            })),
          });
        }
        return { kind: 'OK', absentCount: pendingSittings.length };
      },
    );

    if (outcome.kind === 'SESSIONS_STILL_OPEN') {
      throw new AppHttpException({
        code: 'EXAM_SESSIONS_STILL_OPEN',
        message: 'Close every open session before ending the examination.',
      });
    }
    if (outcome.kind === 'ATTEMPTS_STILL_IN_PROGRESS') {
      throw new AppHttpException({
        code: 'EXAM_HAS_IN_PROGRESS_ATTEMPTS',
        message: 'This exam still has attempts in progress.',
      });
    }
    if (outcome.kind === 'STALE_ABSENTEE_LIST') {
      throw new AppHttpException({
        code: 'STALE_ABSENTEE_LIST',
        message:
          'The confirmed absentee list does not match the current pending set — refresh and retry.',
      });
    }
    if (outcome.kind === 'NOT_COMPLETABLE') {
      throw new AppHttpException({
        code: 'EXAM_NOT_COMPLETABLE',
        message: 'This exam is no longer in a state that permits completion.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_COMPLETED',
      entityType: 'Exam',
      entityId: examId,
    });
    if (outcome.absentCount > 0) {
      await this.audit.record({
        schoolId,
        actorUserId: auditCtx.actorUserId,
        actorRole: auditCtx.actorRole,
        action: 'EXAM_PARTICIPATION_MARKED_ABSENT',
        entityType: 'Exam',
        entityId: examId,
        metadata: { absentCount: outcome.absentCount },
      });
    }
    await this.stream.publishUpdate(schoolId, examId);
    return toExamResponseDtoFresh(schoolId, examId);
  }
}
