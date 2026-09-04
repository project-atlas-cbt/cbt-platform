import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AuditService } from '../operations/audit-event.service.js';
import { requireSchoolActor } from '../questions/question-scope.util.js';
import { runUniqueGuarded } from '../academics/prisma-error.util.js';
import {
  EXAM_ADMINISTRATOR_INCLUDE,
  loadParentExamOrThrow,
  toExamAdministratorResponseDto,
} from './exam-control-mappers.js';
import type {
  AssignExamAdministratorDto,
  ExamAdministratorResponseDto,
} from './dto/exam-session.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

/**
 * ADR-0012/M-15 — the minimal management surface `ExamAdministrator`
 * delegation structurally needs to ever be populated. Confirmed with the
 * project owner during B12 planning (2026-09-04) as a small, necessary
 * addition beyond the roadmap's literal endpoint list: without this,
 * `ExamAdministrator` and its `OWNED`-resolver wiring would exist with no
 * way to ever create a row.
 */
@Injectable()
export class ExamAdministratorService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  private async assertCanManage(schoolId: string, actor: AuthorizedActor, examId: string) {
    const exam = await loadParentExamOrThrow(schoolId, examId);
    const decision = await this.authz.evaluate(actor, 'exam.manageAdministrators', {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      // Deliberately omits `examId`, unlike every other exam.*/examAdmin.*
      // check in this module. The ExamAdministrator-aware OWNED resolver
      // (exam-administrator-scope.resolver.ts) only reaches its delegate
      // lookup when `resource.examId` is present — without it, a mismatched
      // `ownerMembershipId` resolves to a plain denial instead. That's the
      // point here: ADR-0012/M-15's own design is that a delegate may
      // *operate* an exam but must never be able to grant or revoke
      // delegation itself — only the exam's true creator (an exact
      // ownerMembershipId match) or a SCHOOL/DEPARTMENT-scoped admin may.
      // Found in review: with `examId` included (as every other check in
      // this module correctly does), an active delegate would pass this
      // check too, since the resolver treats "true creator" and "active
      // delegate" identically for every other OWNED-graded exam permission
      // by design — this is the one row where that equivalence must not
      // hold.
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: "You do not have permission to manage this exam's administrators.",
      });
    }
    return exam;
  }

  async assign(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    dto: AssignExamAdministratorDto,
    auditCtx: ActorContext,
  ): Promise<ExamAdministratorResponseDto> {
    await this.assertCanManage(schoolId, actor, examId);

    const delegateMembership = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findFirst({
        where: { schoolId, id: dto.membershipId, status: 'ACTIVE' },
        select: { id: true },
      }),
    );
    if (!delegateMembership) {
      throw new AppHttpException({
        code: 'EXAM_ADMINISTRATOR_REQUIRES_ACTIVE_MEMBERSHIP',
        message: 'The named membership does not have an active account at this school.',
      });
    }

    // Structurally guaranteed SCHOOL by this point — assertCanManage() would
    // already have thrown FORBIDDEN for a PLATFORM actor, since
    // exam.manageAdministrators denies SOFTWARE_ADMIN outright.
    const schoolActor = requireSchoolActor(actor);

    const adminId = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, async (tx) => {
          const created = await tx.examAdministrator.create({
            data: {
              schoolId,
              examId,
              membershipId: dto.membershipId,
              assignedByMembershipId: schoolActor.membershipId,
            },
          });
          return created.id;
        }),
      'This membership is already an active administrator for this exam.',
    );

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_ADMINISTRATOR_ASSIGNED',
      entityType: 'Exam',
      entityId: examId,
      metadata: { membershipId: dto.membershipId },
    });

    const created = await withTenant(prisma, schoolId, (tx) =>
      tx.examAdministrator.findUniqueOrThrow({
        where: { id: adminId },
        include: EXAM_ADMINISTRATOR_INCLUDE,
      }),
    );
    return toExamAdministratorResponseDto(created);
  }

  async revoke(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    membershipId: string,
    auditCtx: ActorContext,
  ): Promise<void> {
    await this.assertCanManage(schoolId, actor, examId);

    const { count } = await withTenant(prisma, schoolId, (tx) =>
      tx.examAdministrator.updateMany({
        where: { schoolId, examId, membershipId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      }),
    );
    if (count === 0) {
      throw new AppHttpException({
        code: 'NOT_FOUND',
        message: 'No active administrator delegation found for this membership on this exam.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_ADMINISTRATOR_REVOKED',
      entityType: 'Exam',
      entityId: examId,
      metadata: { membershipId },
    });
  }
}
