import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { loadExamOrThrow } from '../exams/exam-mappers.js';
import { AuditService } from '../operations/audit-event.service.js';
import { ResultAdjustmentQueueService } from './result-adjustment-queue.service.js';
import { toAdjustmentOperationDto } from './result-mappers.js';
import {
  auditRoleFor,
  isExamCreator,
  requireSchoolActorForResults,
  resolveResultResourceContext,
} from './result-scope.util.js';
import type {
  CreateResultAdjustmentDto,
  ResultAdjustmentOperationResponseDto,
} from './dto/result.dto.js';

interface ActorContext {
  actorUserId: string;
}

/**
 * ADR-0025's parent/child bulk adjustment, and the ONLY path in the entire
 * product by which a score changes after marking (05 §53, 02 §6, DoD item
 * 10). There is deliberately no "edit score" endpoint anywhere — every
 * mutation of `Result.earnedMarks` happens inside the adjustment worker,
 * against an operation created here with a mandatory reason and an audited
 * actor.
 *
 * This service only VALIDATES and ENQUEUES. The arithmetic and the per-result
 * writes belong to `apps/worker`'s `result-adjustment.queue.ts`, which is
 * where resumability and idempotency live — a 1,200-result void must survive
 * a crash mid-run without partial application (X-14).
 */
@Injectable()
export class ResultAdjustmentService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly queue: ResultAdjustmentQueueService,
  ) {}

  async create(
    schoolId: string,
    actor: AuthorizedActor,
    dto: CreateResultAdjustmentDto,
    ctx: ActorContext,
  ): Promise<ResultAdjustmentOperationResponseDto> {
    const schoolActor = requireSchoolActorForResults(actor);
    const exam = await loadExamOrThrow(schoolId, dto.examId);

    // MANUAL_OVERRIDE carries its own, stricter permission — School Admin
    // only. Every other type is derived arithmetic against immutable marking
    // evidence; this one sets a score to a number a human chose, which the
    // roadmap calls the most restricted operation in the product.
    const permissionId =
      dto.type === 'MANUAL_OVERRIDE' ? 'results.manualOverride' : 'results.adjust';

    const resource = await resolveResultResourceContext(schoolId, actor, exam);
    const decision = await this.authz.evaluate(actor, permissionId, resource);
    // Deliberately NOT falling back to `isExamCreator` the way the read and
    // publish paths do: authoring an exam does not confer authority to
    // regrade it. `02 §6` denies Teacher score changes outright, and a
    // creator-teacher is exactly the actor that rule is about.
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message:
          dto.type === 'MANUAL_OVERRIDE'
            ? 'Only a School Admin may manually override a result.'
            : 'You do not have permission to adjust results for this exam.',
      });
    }

    this.assertTypeArgumentsValid(dto);

    const targetResults = await this.resolveTargets(schoolId, dto);
    if (targetResults.length === 0) {
      throw new AppHttpException({
        code: 'CONFLICT',
        message: 'No finalised results match this adjustment.',
      });
    }

    const operationId = await withTenant(prisma, schoolId, async (tx) => {
      // ADR-0025: hold the cohort before any child is written, so no partial
      // regrade is ever visible. Confirmed choice: MARK under adjustment
      // rather than auto-unpublish, so the exam's publication state survives
      // untouched and completing the run needs no re-publish step.
      await tx.resultPublication.upsert({
        where: { schoolId_examId: { schoolId, examId: dto.examId } },
        create: {
          schoolId,
          examId: dto.examId,
          status: 'UNPUBLISHED',
          adjustmentInProgress: true,
        },
        update: { adjustmentInProgress: true },
      });

      const operation = await tx.resultAdjustmentOperation.create({
        data: {
          schoolId,
          examId: dto.examId,
          type: dto.type,
          reason: dto.reason,
          status: 'PENDING',
          totalCount: targetResults.length,
          createdByMembershipId: schoolActor.membershipId,
          ...(dto.targetExamQuestionId !== undefined && {
            targetExamQuestionId: dto.targetExamQuestionId,
          }),
          ...(dto.markDelta !== undefined && { markDelta: dto.markDelta }),
          ...(dto.targetResultId !== undefined && { targetResultId: dto.targetResultId }),
          ...(dto.overrideEarnedMarks !== undefined && {
            overrideEarnedMarks: dto.overrideEarnedMarks,
          }),
        },
      });

      return operation.id;
    });

    await this.audit.record({
      schoolId,
      actorUserId: ctx.actorUserId,
      actorRole: auditRoleFor(schoolActor),
      action: dto.type === 'MANUAL_OVERRIDE' ? 'RESULT_MANUAL_OVERRIDE' : 'RESULT_ADJUSTED',
      entityType: 'ResultAdjustmentOperation',
      entityId: operationId,
      reason: dto.reason,
      metadata: {
        examId: dto.examId,
        type: dto.type,
        targetCount: targetResults.length,
        ...(dto.targetExamQuestionId !== undefined && {
          targetExamQuestionId: dto.targetExamQuestionId,
        }),
      },
    });

    await this.queue.enqueue({ schoolId, operationId });

    return this.get(schoolId, actor, operationId);
  }

  async get(
    schoolId: string,
    actor: AuthorizedActor,
    operationId: string,
  ): Promise<ResultAdjustmentOperationResponseDto> {
    const operation = await withTenant(prisma, schoolId, (tx) =>
      tx.resultAdjustmentOperation.findUnique({ where: { id: operationId } }),
    );
    if (!operation) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Adjustment not found.' });
    }

    const exam = await loadExamOrThrow(schoolId, operation.examId);
    const resource = await resolveResultResourceContext(schoolId, actor, exam);
    const decision = await this.authz.evaluate(actor, 'results.viewExamResults', resource);
    if (!decision.allowed && !isExamCreator(actor, exam)) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Adjustment not found.' });
    }

    const createdBy = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findUnique({
        where: { id: operation.createdByMembershipId },
        select: { user: { select: { displayName: true } } },
      }),
    );

    return toAdjustmentOperationDto(operation, createdBy?.user.displayName ?? 'Unknown');
  }

  /**
   * Each type needs exactly the arguments it uses and no others — a
   * VOID_QUESTION with a `markDelta`, or an AWARD_MARK with no delta, is a
   * caller mistake that would otherwise silently become a no-op adjustment
   * with a real audit event behind it.
   */
  private assertTypeArgumentsValid(dto: CreateResultAdjustmentDto): void {
    const fail = (message: string): never => {
      throw new AppHttpException({ code: 'VALIDATION_ERROR', message });
    };

    switch (dto.type) {
      case 'VOID_QUESTION':
        if (!dto.targetExamQuestionId) {
          fail('VOID_QUESTION requires targetExamQuestionId.');
        }
        break;
      case 'AWARD_MARK':
      case 'DEDUCT_MARK':
        if (dto.markDelta === undefined) {
          fail(`${dto.type} requires markDelta.`);
        }
        break;
      case 'MANUAL_OVERRIDE':
        if (!dto.targetResultId) {
          fail('MANUAL_OVERRIDE requires targetResultId — it applies to exactly one result.');
        }
        if (dto.overrideEarnedMarks === undefined) {
          fail('MANUAL_OVERRIDE requires overrideEarnedMarks.');
        }
        break;
      case 'RECALCULATE':
        break;
    }
  }

  /**
   * The results an operation will touch, resolved at creation time so the
   * parent carries a real `totalCount` for progress reporting.
   *
   * VOIDED results are never targeted: ADR-0025 retains them as evidence and
   * excludes them from everything, and adjusting a result whose attempt was
   * invalidated would be meaningless. `PROCESSING` results are excluded too
   * — their marking has not finished, so there is nothing stable to adjust.
   */
  private async resolveTargets(
    schoolId: string,
    dto: CreateResultAdjustmentDto,
  ): Promise<{ id: string }[]> {
    if (dto.type === 'MANUAL_OVERRIDE') {
      const result = await withTenant(prisma, schoolId, (tx) =>
        tx.result.findUnique({
          where: { id: dto.targetResultId as string },
          select: { id: true, examId: true, state: true },
        }),
      );
      if (!result || result.examId !== dto.examId) {
        throw new AppHttpException({
          code: 'NOT_FOUND',
          message: 'Result not found for this exam.',
        });
      }
      if (result.state === 'VOIDED' || result.state === 'PROCESSING') {
        throw new AppHttpException({
          code: 'CONFLICT',
          message: `A ${result.state} result cannot be adjusted.`,
        });
      }
      return [{ id: result.id }];
    }

    return withTenant(prisma, schoolId, (tx) =>
      tx.result.findMany({
        where: { schoolId, examId: dto.examId, state: { in: ['FINAL', 'ADJUSTED'] } },
        select: { id: true },
      }),
    );
  }
}
