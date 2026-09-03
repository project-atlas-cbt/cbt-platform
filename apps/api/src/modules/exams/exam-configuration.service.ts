import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AuditService } from '../operations/audit-event.service.js';
import { loadExamOrThrow } from './exam-mappers.js';
import type { ExamResponseDto, UpdateExamConfigurationDto } from './dto/exam.dto.js';
import { toExamResponseDtoFresh } from './exam.util.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

/** `PUT /v1/exams/:id/configuration` — duration/attempts/navigation/
 * randomization/result policy/access mode/instructions/accommodations.
 * Split from `exam.service.ts` (rather than folded in) to mirror the route
 * and permission-cluster boundary 1:1: four separate `exam.configure*`
 * permission ids all collapse onto this one endpoint, the same shape as
 * `question.service.ts`/`question-revision.service.ts`'s own established
 * split along a comparable route boundary. */
@Injectable()
export class ExamConfigurationService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  async update(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    dto: UpdateExamConfigurationDto,
    auditCtx: ActorContext,
  ): Promise<ExamResponseDto> {
    const exam = await loadExamOrThrow(schoolId, examId);

    // Every exam.configure* row shares one grant shape (SCHOOL/DEPARTMENT/
    // OWNED), so one evaluate() call against any one of them is equivalent
    // to checking them all — configureDuration is as good a representative
    // as any.
    const decision = await this.authz.evaluate(actor, 'exam.configureDuration', {
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
        message: 'Configuration can only be changed while the exam is in DRAFT.',
      });
    }

    await withTenant(prisma, schoolId, (tx) =>
      tx.exam.update({
        where: { id: examId },
        data: {
          ...(dto.durationSeconds !== undefined && { durationSeconds: dto.durationSeconds }),
          ...(dto.attemptLimit !== undefined && { attemptLimit: dto.attemptLimit }),
          ...(dto.navigationPolicy !== undefined && { navigationPolicy: dto.navigationPolicy }),
          ...(dto.randomizeQuestions !== undefined && {
            randomizeQuestions: dto.randomizeQuestions,
          }),
          ...(dto.randomizeOptions !== undefined && { randomizeOptions: dto.randomizeOptions }),
          ...(dto.resultPolicy !== undefined && { resultPolicy: dto.resultPolicy }),
          ...(dto.resultDetailVisibility !== undefined && {
            resultDetailVisibility: dto.resultDetailVisibility,
          }),
          ...(dto.accessMode !== undefined && { accessMode: dto.accessMode }),
          ...(dto.generalInstructions !== undefined && {
            generalInstructions: dto.generalInstructions,
          }),
          ...(dto.navigationInstructions !== undefined && {
            navigationInstructions: dto.navigationInstructions,
          }),
          ...(dto.submissionInstructions !== undefined && {
            submissionInstructions: dto.submissionInstructions,
          }),
          ...(dto.accommodations !== undefined && { accommodations: dto.accommodations }),
        },
      }),
    );

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_CONFIGURATION_UPDATED',
      entityType: 'Exam',
      entityId: examId,
    });

    return toExamResponseDtoFresh(schoolId, examId);
  }
}
