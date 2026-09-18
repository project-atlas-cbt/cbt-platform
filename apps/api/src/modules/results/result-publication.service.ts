import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { loadExamOrThrow } from '../exams/exam-mappers.js';
import { NotificationService } from '../notification-center/notification.service.js';
import { AnalyticsCacheService } from '../analytics/analytics-cache.service.js';
import { AuditService } from '../operations/audit-event.service.js';
import {
  auditRoleFor,
  isExamCreator,
  requireSchoolActorForResults,
  resolveResultResourceContext,
} from './result-scope.util.js';
import type {
  PublishResultsDto,
  ResultPublicationResponseDto,
  UnpublishResultsDto,
  WithholdResultDto,
} from './dto/result.dto.js';

interface ActorContext {
  actorUserId: string;
}

/**
 * ADR-0010's visibility half: `ResultPublication`, one row per exam, is the
 * authority for whether students may see an exam's results — and
 * `Result.withheld` is the per-result exception for a disputed script,
 * rather than fragmenting publication itself (audit A-09).
 *
 * Publication never touches a `Result` row. That separation is the whole
 * point of the ADR: it is what lets an ADJUSTED result stay published, and
 * what makes "is this exam published?" a single-row answer.
 */
@Injectable()
export class ResultPublicationService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly analyticsCache: AnalyticsCacheService,
  ) {}

  async publish(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    dto: PublishResultsDto,
    ctx: ActorContext,
  ): Promise<ResultPublicationResponseDto> {
    const schoolActor = requireSchoolActorForResults(actor);
    const exam = await loadExamOrThrow(schoolId, examId);
    await this.assertAllowed(schoolId, actor, exam, 'results.publish');
    await this.assertPolicyPermits(schoolId, schoolActor, exam);

    const publication = await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.resultPublication.findUnique({
        where: { schoolId_examId: { schoolId, examId } },
      });

      // ADR-0025: publishing while a bulk adjustment is mid-flight would be
      // exactly the partially-regraded cohort the hold exists to prevent.
      // This is also X-14's "recalculation racing a concurrent publication"
      // resolved deterministically: the adjustment wins, and the release is
      // refused rather than silently reordered.
      if (existing?.adjustmentInProgress) {
        throw new AppHttpException({
          code: 'CONFLICT',
          message:
            'An adjustment is currently being applied to this exam. Publish once it has completed.',
        });
      }

      return tx.resultPublication.upsert({
        where: { schoolId_examId: { schoolId, examId } },
        create: {
          schoolId,
          examId,
          status: 'PUBLISHED',
          publishedByMembershipId: schoolActor.membershipId,
          publishedAt: new Date(),
        },
        update: {
          status: 'PUBLISHED',
          publishedByMembershipId: schoolActor.membershipId,
          publishedAt: new Date(),
        },
      });
    });

    const affected = await this.countVisibleResults(schoolId, examId);

    await this.audit.record({
      schoolId,
      actorUserId: ctx.actorUserId,
      actorRole: auditRoleFor(schoolActor),
      action: 'RESULT_PUBLISHED',
      entityType: 'Exam',
      entityId: examId,
      ...(dto.note !== undefined && { reason: dto.note }),
      metadata: { affectedResultCount: affected },
    });

    await this.notifyStudents(schoolId, examId, exam.title);
    await this.analyticsCache.invalidateSchool(schoolId);

    return this.toDto(publication, affected, schoolId);
  }

  async unpublish(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    dto: UnpublishResultsDto,
    ctx: ActorContext,
  ): Promise<ResultPublicationResponseDto> {
    const schoolActor = requireSchoolActorForResults(actor);
    const exam = await loadExamOrThrow(schoolId, examId);
    await this.assertAllowed(schoolId, actor, exam, 'results.unpublish');
    await this.assertPolicyPermits(schoolId, schoolActor, exam);

    const affected = await this.countVisibleResults(schoolId, examId);

    const publication = await withTenant(prisma, schoolId, (tx) =>
      tx.resultPublication.upsert({
        where: { schoolId_examId: { schoolId, examId } },
        create: { schoolId, examId, status: 'UNPUBLISHED' },
        update: {
          status: 'UNPUBLISHED',
          unpublishedByMembershipId: schoolActor.membershipId,
          unpublishedAt: new Date(),
        },
      }),
    );

    await this.audit.record({
      schoolId,
      actorUserId: ctx.actorUserId,
      actorRole: auditRoleFor(schoolActor),
      action: 'RESULT_UNPUBLISHED',
      entityType: 'Exam',
      entityId: examId,
      reason: dto.reason,
      metadata: { affectedResultCount: affected },
    });
    await this.analyticsCache.invalidateSchool(schoolId);

    return this.toDto(publication, affected, schoolId);
  }

  /** ADR-0010's individual withholding — a disputed result held back without
   * unpublishing the other thirty-nine. */
  async withhold(
    schoolId: string,
    actor: AuthorizedActor,
    resultId: string,
    dto: WithholdResultDto,
    ctx: ActorContext,
  ): Promise<{ status: 'ok' }> {
    return this.setWithheld(schoolId, actor, resultId, true, dto.reason, ctx);
  }

  async release(
    schoolId: string,
    actor: AuthorizedActor,
    resultId: string,
    dto: WithholdResultDto,
    ctx: ActorContext,
  ): Promise<{ status: 'ok' }> {
    return this.setWithheld(schoolId, actor, resultId, false, dto.reason, ctx);
  }

  private async setWithheld(
    schoolId: string,
    actor: AuthorizedActor,
    resultId: string,
    withheld: boolean,
    reason: string,
    ctx: ActorContext,
  ): Promise<{ status: 'ok' }> {
    const schoolActor = requireSchoolActorForResults(actor);

    const result = await withTenant(prisma, schoolId, (tx) =>
      tx.result.findUnique({ where: { id: resultId }, select: { id: true, examId: true } }),
    );
    if (!result) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Result not found.' });
    }

    const exam = await loadExamOrThrow(schoolId, result.examId);
    await this.assertAllowed(schoolId, actor, exam, 'results.withhold');
    await this.assertPolicyPermits(schoolId, schoolActor, exam);

    await withTenant(prisma, schoolId, (tx) =>
      tx.result.update({
        where: { id: resultId },
        data: {
          withheld,
          withheldReason: reason,
          withheldByMembershipId: schoolActor.membershipId,
          withheldAt: new Date(),
        },
      }),
    );

    await this.audit.record({
      schoolId,
      actorUserId: ctx.actorUserId,
      actorRole: auditRoleFor(schoolActor),
      action: withheld ? 'RESULT_WITHHELD' : 'RESULT_RELEASED',
      entityType: 'Result',
      entityId: resultId,
      reason,
    });
    await this.analyticsCache.invalidateSchool(schoolId);

    return { status: 'ok' };
  }

  /**
   * DoD item 7 — "A teacher cannot override a school-locked publication
   * policy." This is the deferral B11 recorded explicitly for B15: that
   * phase seeded `Exam.resultPolicy` from the school default and left the
   * lock check here.
   *
   * The rule reads off both axes. `Exam.resultPolicy` names WHO releases;
   * `School.resultPolicyLocked` says whether a teacher (or HOD — neither is
   * "administrative" below) may act outside it. So a non-administrative
   * actor may act only when the exam's own policy actually names them — and
   * when the school has locked its policy, not even a divergent seeded value
   * on an older exam lets them through.
   *
   * Called from all four actions this service exposes — `publish`,
   * `unpublish`, `withhold`, and `release` — not `publish` alone. Withholding
   * or releasing one result, and unpublishing a whole exam, are each just as
   * much "who controls what a student sees" as publishing is; the
   * permission table's own comment on `results.withhold` says as much
   * ("graded exactly like `results.publish`... anyone who may release a
   * cohort may hold one of its results back"). Found and closed by
   * post-implementation review: the original pass wired this into `publish`
   * only, so a teacher locked out of publishing could still unpublish their
   * own exam's results, or withhold/release an individual one, bypassing the
   * school's lock entirely.
   */
  private async assertPolicyPermits(
    schoolId: string,
    actor: Extract<AuthorizedActor, { kind: 'SCHOOL' }>,
    exam: { resultPolicy: string },
  ): Promise<void> {
    const isAdministrative =
      actor.roles.includes('SCHOOL_ADMIN') || actor.roles.includes('MODERATOR');
    if (isAdministrative) return;

    const school = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { resultPolicy: true, resultPolicyLocked: true },
    });

    const effectivePolicy = school.resultPolicyLocked ? school.resultPolicy : exam.resultPolicy;

    if (effectivePolicy !== 'TEACHER') {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: school.resultPolicyLocked
          ? 'This school has locked result publication to administrative release.'
          : 'This exam is configured for administrative result release.',
      });
    }
  }

  private async assertAllowed(
    schoolId: string,
    actor: AuthorizedActor,
    exam: Parameters<typeof resolveResultResourceContext>[2],
    permissionId: 'results.publish' | 'results.unpublish' | 'results.withhold',
  ): Promise<void> {
    const resource = await resolveResultResourceContext(schoolId, actor, exam);
    const decision = await this.authz.evaluate(actor, permissionId, resource);
    if (!decision.allowed && !isExamCreator(actor, exam)) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to change result visibility for this exam.',
      });
    }
  }

  /** Results a release actually makes visible: finalised, not withheld. The
   * count is reported back and audited so "publish" is never a silent
   * no-op on an exam whose marking has not finished. */
  private async countVisibleResults(schoolId: string, examId: string): Promise<number> {
    return withTenant(prisma, schoolId, (tx) =>
      tx.result.count({
        where: { schoolId, examId, state: { in: ['FINAL', 'ADJUSTED'] }, withheld: false },
      }),
    );
  }

  /**
   * B10 declared `RESULT_PUBLISHED` in `NotificationType` and left the
   * producer to this phase (its own DoD item 6). Notifies only the students
   * whose result the release actually made visible — never the withheld or
   * still-processing ones, who would be told to look at something they
   * cannot see.
   *
   * Best-effort: `NotificationService.record()` swallows its own failures by
   * design, so a notification problem never fails a publication that has
   * already committed.
   */
  private async notifyStudents(schoolId: string, examId: string, examTitle: string): Promise<void> {
    const results = await withTenant(prisma, schoolId, (tx) =>
      tx.result.findMany({
        where: { schoolId, examId, state: { in: ['FINAL', 'ADJUSTED'] }, withheld: false },
        select: {
          id: true,
          studentProfile: { select: { membership: { select: { userId: true } } } },
        },
      }),
    );

    for (const result of results) {
      await this.notifications.record({
        schoolId,
        recipientUserId: result.studentProfile.membership.userId,
        type: 'RESULT_PUBLISHED',
        title: 'Your result is available',
        content: `Your result for ${examTitle} has been published.`,
        relatedEntityType: 'Result',
        relatedEntityId: result.id,
      });
    }
  }

  private async toDto(
    publication: {
      examId: string;
      status: 'PUBLISHED' | 'UNPUBLISHED';
      publishedAt: Date | null;
      publishedByMembershipId: string | null;
      unpublishedAt: Date | null;
      adjustmentInProgress: boolean;
    },
    affectedResultCount: number,
    schoolId: string,
  ): Promise<ResultPublicationResponseDto> {
    const publishedByName = publication.publishedByMembershipId
      ? ((
          await withTenant(prisma, schoolId, (tx) =>
            tx.schoolMembership.findUnique({
              where: { id: publication.publishedByMembershipId as string },
              select: { user: { select: { displayName: true } } },
            }),
          )
        )?.user.displayName ?? null)
      : null;

    return {
      examId: publication.examId,
      status: publication.status,
      publishedAt: publication.publishedAt?.toISOString() ?? null,
      publishedByName,
      unpublishedAt: publication.unpublishedAt?.toISOString() ?? null,
      adjustmentInProgress: publication.adjustmentInProgress,
      affectedResultCount,
    };
  }
}
