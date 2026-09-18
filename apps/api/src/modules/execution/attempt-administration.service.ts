import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { rollUpParticipation, type ExamParticipationStatus } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { BreakGlassService } from '../authorization/break-glass.service.js';
import { AnalyticsCacheService } from '../analytics/analytics-cache.service.js';
import { AuditService } from '../operations/audit-event.service.js';
import { NotificationService } from '../notification-center/notification.service.js';
import { requireSchoolActor } from '../questions/question-scope.util.js';
import { loadParentExamOrThrow } from './exam-control-mappers.js';
import { ExamControlStreamService } from './exam-control-stream.service.js';
import type {
  GrantMakeupAuthorizationDto,
  GrantRetryAuthorizationDto,
  InvalidateAttemptDto,
  ExamParticipationResponseDto,
} from './dto/participation.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

function expiryOrThrow(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const expiresAt = new Date(value);
  if (expiresAt <= new Date()) {
    throw new AppHttpException({
      code: 'VALIDATION_ERROR',
      message: 'Authorization expiry must be in the future.',
    });
  }
  return expiresAt;
}

async function expireAuthorizations(
  tx: Prisma.TransactionClient,
  schoolId: string,
  examId: string,
  studentProfileIds: string[],
): Promise<void> {
  await tx.attemptAuthorization.updateMany({
    where: {
      schoolId,
      examId,
      studentProfileId: { in: studentProfileIds },
      status: 'AUTHORIZED',
      expiresAt: { lte: new Date() },
    },
    data: { status: 'EXPIRED' },
  });
}

@Injectable()
export class AttemptAdministrationService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly stream: ExamControlStreamService,
    private readonly breakGlass: BreakGlassService,
    private readonly analyticsCache: AnalyticsCacheService,
  ) {}

  private async authorize(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    permission: string,
  ) {
    const exam = await loadParentExamOrThrow(schoolId, examId);
    const decision = await this.authz.evaluate(actor, permission, {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      examId,
      ...(exam.departmentId && { departmentId: exam.departmentId }),
    });
    if (!decision.allowed)
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission for this examination action.',
      });
    return exam;
  }

  async grantMakeup(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    dto: GrantMakeupAuthorizationDto,
    auditCtx: ActorContext,
  ) {
    const exam = await this.authorize(schoolId, actor, examId, 'examAdmin.grantMakeup');
    if (exam.status !== 'COMPLETED') {
      throw new AppHttpException({
        code: 'CONFLICT',
        message: 'Makeup access can only be granted after examination completion.',
      });
    }
    const actorMembershipId = requireSchoolActor(actor).membershipId;
    const expiresAt = expiryOrThrow(dto.expiresAt);
    const result = await withTenant(prisma, schoolId, async (tx) => {
      await expireAuthorizations(tx, schoolId, examId, dto.studentProfileIds);
      const absentStudentIds = new Set(
        (
          await tx.examParticipation.findMany({
            where: {
              schoolId,
              examId,
              studentProfileId: { in: dto.studentProfileIds },
              status: 'ABSENT',
            },
            select: { studentProfileId: true },
          })
        ).map((participation) => participation.studentProfileId),
      );
      if (absentStudentIds.size !== dto.studentProfileIds.length) {
        throw new AppHttpException({
          code: 'CONFLICT',
          message: 'Makeup access can only be granted to students with a recorded absence.',
        });
      }
      const session = await tx.examSession.create({
        data: { schoolId, examId, sessionType: 'MAKEUP', openedByMembershipId: actorMembershipId },
      });
      await tx.examSessionParticipant.createMany({
        data: dto.studentProfileIds.map((studentProfileId) => ({
          schoolId,
          examSessionId: session.id,
          studentProfileId,
          authorizedByMembershipId: actorMembershipId,
        })),
      });
      const authorizations = await Promise.all(
        dto.studentProfileIds.map((studentProfileId) =>
          tx.attemptAuthorization.create({
            data: {
              schoolId,
              examId,
              examSessionId: session.id,
              studentProfileId,
              type: 'MAKEUP',
              reason: dto.reason.trim(),
              authorizedByMembershipId: actorMembershipId,
              ...(expiresAt !== undefined && { expiresAt }),
            },
          }),
        ),
      );
      return { session, authorizations };
    });
    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'MAKEUP_GRANTED',
      entityType: 'ExamSession',
      entityId: result.session.id,
      reason: dto.reason.trim(),
      metadata: { examId, studentProfileIds: dto.studentProfileIds },
    });
    const students = await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.findMany({
        where: { schoolId, id: { in: dto.studentProfileIds } },
        select: { membership: { select: { userId: true } } },
      }),
    );
    for (const student of students)
      await this.notifications.record({
        schoolId,
        recipientUserId: student.membership.userId,
        type: 'MAKEUP_GRANTED',
        title: 'Makeup exam access granted',
        content: `Makeup access has been granted for "${exam.title}".`,
        relatedEntityType: 'Exam',
        relatedEntityId: examId,
      });
    await this.stream.publishUpdate(schoolId, examId);
    return result.authorizations.map((authorization) => ({
      id: authorization.id,
      status: authorization.status,
      examSessionId: authorization.examSessionId,
    }));
  }

  async grantRetry(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    dto: GrantRetryAuthorizationDto,
    auditCtx: ActorContext,
  ) {
    const exam = await this.authorize(schoolId, actor, examId, 'examAdmin.authorizeRetry');
    if (exam.status !== 'COMPLETED') {
      throw new AppHttpException({
        code: 'CONFLICT',
        message: 'Retry access can only be granted after examination completion.',
      });
    }
    const actorMembershipId = requireSchoolActor(actor).membershipId;
    const expiresAt = expiryOrThrow(dto.expiresAt);
    const authorization = await withTenant(prisma, schoolId, async (tx) => {
      await expireAuthorizations(tx, schoolId, examId, [dto.studentProfileId]);
      const completedAttemptCount = await tx.examAttempt.count({
        where: {
          schoolId,
          examId,
          studentProfileId: dto.studentProfileId,
          state: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
        },
      });
      if (completedAttemptCount === 0) {
        throw new AppHttpException({
          code: 'CONFLICT',
          message: 'Retry access requires an existing submitted attempt.',
        });
      }
      const session = await tx.examSession.create({
        data: { schoolId, examId, sessionType: 'SPECIAL', openedByMembershipId: actorMembershipId },
      });
      await tx.examSessionParticipant.create({
        data: {
          schoolId,
          examSessionId: session.id,
          studentProfileId: dto.studentProfileId,
          authorizedByMembershipId: actorMembershipId,
        },
      });
      return tx.attemptAuthorization.create({
        data: {
          schoolId,
          examId,
          examSessionId: session.id,
          studentProfileId: dto.studentProfileId,
          type: 'RETRY',
          reason: dto.reason.trim(),
          authorizedByMembershipId: actorMembershipId,
          ...(expiresAt !== undefined && { expiresAt }),
        },
      });
    });
    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'ATTEMPT_RETRY_AUTHORIZED',
      entityType: 'AttemptAuthorization',
      entityId: authorization.id,
      reason: dto.reason.trim(),
      metadata: { examId, studentProfileId: dto.studentProfileId },
    });
    await this.stream.publishUpdate(schoolId, examId);
    return {
      id: authorization.id,
      status: authorization.status,
      examSessionId: authorization.examSessionId,
    };
  }

  async revoke(
    schoolId: string,
    actor: AuthorizedActor,
    authorizationId: string,
    auditCtx: ActorContext,
  ) {
    const authorization = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptAuthorization.findFirst({
        where: { schoolId, id: authorizationId },
        include: { exam: { select: { createdByMembershipId: true, departmentId: true } } },
      }),
    );
    if (!authorization)
      throw new AppHttpException({
        code: 'NOT_FOUND',
        message: 'Attempt authorization not found.',
      });
    const permission =
      authorization.type === 'MAKEUP' ? 'examAdmin.grantMakeup' : 'examAdmin.authorizeRetry';
    const decision = await this.authz.evaluate(actor, permission, {
      schoolId,
      ownerMembershipId: authorization.exam.createdByMembershipId,
      examId: authorization.examId,
      ...(authorization.exam.departmentId && { departmentId: authorization.exam.departmentId }),
    });
    if (!decision.allowed)
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to revoke this authorization.',
      });
    const actorMembershipId = requireSchoolActor(actor).membershipId;
    const update = await withTenant(prisma, schoolId, (tx) =>
      tx.attemptAuthorization.updateMany({
        where: { schoolId, id: authorizationId, status: 'AUTHORIZED' },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedByMembershipId: actorMembershipId,
        },
      }),
    );
    if (update.count !== 1)
      throw new AppHttpException({
        code: 'CONFLICT',
        message: 'Only an unused authorization can be revoked.',
      });
    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'ATTEMPT_AUTHORIZATION_REVOKED',
      entityType: 'AttemptAuthorization',
      entityId: authorizationId,
      metadata: { examId: authorization.examId },
    });
    await this.stream.publishUpdate(schoolId, authorization.examId);
  }

  async invalidate(
    schoolId: string,
    actor: AuthorizedActor,
    attemptId: string,
    dto: InvalidateAttemptDto,
    auditCtx: ActorContext,
  ) {
    const attempt = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.findFirst({
        where: { schoolId, id: attemptId },
        include: { exam: { select: { createdByMembershipId: true, departmentId: true } } },
      }),
    );
    if (!attempt) throw new AppHttpException({ code: 'NOT_FOUND', message: 'Attempt not found.' });
    const decision = await this.authz.evaluate(actor, 'examAdmin.invalidateAttempt', {
      schoolId,
      ownerMembershipId: attempt.exam.createdByMembershipId,
      examId: attempt.examId,
      ...(attempt.exam.departmentId && { departmentId: attempt.exam.departmentId }),
    });
    if (!decision.allowed)
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to invalidate this attempt.',
      });
    const actorMembershipId = requireSchoolActor(actor).membershipId;
    const updated = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.updateMany({
        where: {
          schoolId,
          id: attemptId,
          state: { in: ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED'] },
        },
        data: {
          state: 'INVALIDATED',
          invalidationReason: dto.reason.trim(),
          invalidatedAt: new Date(),
          invalidatedByMembershipId: actorMembershipId,
        },
      }),
    );
    if (updated.count !== 1)
      throw new AppHttpException({
        code: 'CONFLICT',
        message: 'This attempt cannot be invalidated.',
      });
    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'ATTEMPT_INVALIDATED',
      entityType: 'ExamAttempt',
      entityId: attemptId,
      reason: dto.reason.trim(),
      metadata: { examId: attempt.examId },
    });
    await this.stream.publishUpdate(schoolId, attempt.examId);
    await this.analyticsCache.invalidateSchool(schoolId);
  }

  async invalidateWithBreakGlass(
    schoolId: string,
    actor: AuthorizedActor,
    attemptId: string,
    dto: InvalidateAttemptDto,
  ): Promise<void> {
    const reason = dto.reason.trim();
    const attempt = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.findFirst({ where: { schoolId, id: attemptId }, select: { examId: true } }),
    );
    if (!attempt) throw new AppHttpException({ code: 'NOT_FOUND', message: 'Attempt not found.' });

    await this.breakGlass.execute(
      actor,
      {
        schoolId,
        permissionId: 'examAdmin.invalidateAttempt',
        reason,
        entityType: 'ExamAttempt',
        entityId: attemptId,
        metadata: { examId: attempt.examId },
      },
      async () => {
        const updated = await withTenant(prisma, schoolId, (tx) =>
          tx.examAttempt.updateMany({
            where: {
              schoolId,
              id: attemptId,
              state: { in: ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED'] },
            },
            data: { state: 'INVALIDATED', invalidationReason: reason, invalidatedAt: new Date() },
          }),
        );
        if (updated.count !== 1) {
          throw new AppHttpException({
            code: 'CONFLICT',
            message: 'This attempt cannot be invalidated.',
          });
        }
        await this.audit.record({
          schoolId,
          actorUserId: actor.userId,
          actorRole: 'SOFTWARE_ADMIN',
          action: 'ATTEMPT_INVALIDATED',
          entityType: 'ExamAttempt',
          entityId: attemptId,
          reason,
          metadata: { examId: attempt.examId, breakGlass: true },
        });
      },
    );
    await this.stream.publishUpdate(schoolId, attempt.examId);
    await this.analyticsCache.invalidateSchool(schoolId);
  }

  async listParticipation(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
  ): Promise<ExamParticipationResponseDto> {
    await this.authorize(schoolId, actor, examId, 'examAdmin.controlCenter');
    const rows = await withTenant(prisma, schoolId, (tx) =>
      tx.examSessionParticipant.findMany({
        where: { schoolId, session: { examId } },
        include: {
          studentProfile: {
            select: {
              id: true,
              membership: { select: { user: { select: { displayName: true } } } },
            },
          },
          session: { select: { id: true } },
        },
      }),
    );
    const attempts = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.findMany({
        where: { schoolId, examId },
        include: { result: { select: { id: true } } },
        orderBy: { attemptNumber: 'desc' },
      }),
    );
    const participations = await withTenant(prisma, schoolId, (tx) =>
      tx.examParticipation.findMany({ where: { schoolId, examId } }),
    );
    const students = new Map<string, ExamParticipationResponseDto['students'][number]>();
    for (const row of rows) {
      const attempt = attempts.find(
        (entry) =>
          entry.examSessionId === row.examSessionId &&
          entry.studentProfileId === row.studentProfileId,
      );
      const participation = participations.find(
        (entry) =>
          entry.examSessionId === row.examSessionId &&
          entry.studentProfileId === row.studentProfileId,
      );
      const current = students.get(row.studentProfileId) ?? {
        studentProfileId: row.studentProfileId,
        studentName: row.studentProfile.membership.user.displayName,
        rollupStatus: 'PENDING',
        sessions: [],
      };
      current.sessions.push({
        examSessionId: row.examSessionId,
        status: participation?.status ?? 'PENDING',
        attemptId: attempt?.id ?? null,
        resultId: attempt?.result?.id ?? null,
      });
      students.set(row.studentProfileId, current);
    }
    for (const student of students.values())
      student.rollupStatus = rollUpParticipation(
        student.sessions.map((session) => ({
          status: session.status as ExamParticipationStatus,
          hasNonInvalidatedAttempt:
            session.attemptId !== null &&
            attempts.some(
              (attempt) =>
                attempt.id === session.attemptId &&
                attempt.state !== 'INVALIDATED' &&
                attempt.state !== 'CANCELLED',
            ),
        })),
      );
    return { examId, students: [...students.values()] };
  }
}
