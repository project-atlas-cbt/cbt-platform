import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AuditService } from '../operations/audit-event.service.js';
import { deriveExamLevel, loadExamOrThrow } from './exam-mappers.js';
import type { ExamResponseDto, SetExamQuestionsDto } from './dto/exam.dto.js';
import { toExamResponseDtoFresh } from './exam.util.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

/** `PUT /v1/exams/:id/questions` — always a full replace of the exam's
 * single default section's question set (07 §8.3, ADR-0029). Every bound
 * revision must currently be `APPROVED` and belong to a `Question` matching
 * the exam's own subject and (derived) level — the service-layer half of
 * DoD items 2/9; this migration's own hand-written trigger is the
 * unconditional database-level half that holds even against a direct
 * insert. */
@Injectable()
export class ExamQuestionService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  async setSelection(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    dto: SetExamQuestionsDto,
    auditCtx: ActorContext,
  ): Promise<ExamResponseDto> {
    const exam = await loadExamOrThrow(schoolId, examId);

    const decision = await this.authz.evaluate(actor, 'exam.addQuestions', {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to modify this exam.',
      });
    }
    if (exam.status !== 'DRAFT') {
      throw new AppHttpException({
        code: 'EXAM_NOT_DRAFT',
        message: 'Questions can only be changed while the exam is in DRAFT.',
      });
    }

    const revisionIds = dto.questions.map((q) => q.questionRevisionId);
    const uniqueRevisionIds = new Set(revisionIds);
    if (uniqueRevisionIds.size !== revisionIds.length) {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'A question revision was selected more than once.',
      });
    }

    const examLevel = deriveExamLevel(exam);
    const defaultSectionId = exam.sections[0]?.id;
    if (!defaultSectionId) {
      // Structurally unreachable — ExamService.create() always creates the
      // default section in the same transaction as the exam (ADR-0029).
      throw new AppHttpException({
        code: 'INTERNAL_ERROR',
        message: 'This exam has no default section.',
        httpStatus: 500,
      });
    }

    const revisions =
      revisionIds.length === 0
        ? []
        : await withTenant(prisma, schoolId, (tx) =>
            tx.questionRevision.findMany({
              where: { schoolId, id: { in: revisionIds } },
              select: {
                id: true,
                status: true,
                marks: true,
                question: { select: { subjectId: true, level: true } },
              },
            }),
          );
    const byId = new Map(revisions.map((r) => [r.id, r]));

    const rows = dto.questions.map((entry, index) => {
      const revision = byId.get(entry.questionRevisionId);
      if (!revision) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Question revision not found.' });
      }
      if (revision.status !== 'APPROVED') {
        throw new AppHttpException({
          code: 'EXAM_REVISION_NOT_APPROVED',
          message: 'Only approved question revisions may be added to an exam.',
        });
      }
      if (revision.question.subjectId !== exam.subjectId || revision.question.level !== examLevel) {
        throw new AppHttpException({
          code: 'EXAM_QUESTION_OUT_OF_SCOPE',
          message: "This question does not match the exam's subject and level.",
        });
      }
      const marks = entry.marks ?? revision.marks;
      if (marks <= 0) {
        throw new AppHttpException({
          code: 'EXAM_MARKS_INVALID',
          message: 'Marks must be a positive number.',
        });
      }
      return {
        schoolId,
        examId,
        examSectionId: defaultSectionId,
        questionRevisionId: entry.questionRevisionId,
        sequence: index + 1,
        marks,
      };
    });

    await withTenant(prisma, schoolId, async (tx) => {
      await tx.examQuestion.deleteMany({ where: { schoolId, examId } });
      if (rows.length > 0) {
        await tx.examQuestion.createMany({ data: rows });
      }
    });

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_QUESTIONS_UPDATED',
      entityType: 'Exam',
      entityId: examId,
      metadata: { questionCount: rows.length },
    });

    return toExamResponseDtoFresh(schoolId, examId);
  }
}
