import { Inject, Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { NotificationChannel } from '@atlas/notifications';
import type { QuestionReviewDecision } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { NOTIFICATION_CHANNEL } from '../../notifications/notifications.module.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AuditService } from '../operations/audit-event.service.js';
import { requireSchoolActor } from '../questions/question-scope.util.js';
import {
  QUESTION_FOR_REVIEW_INCLUDE,
  toHistoryItemDto,
  toQueueItemDto,
  toWorkspaceResponseDto,
  type QuestionForReview,
  type QuestionForReviewWithRevision,
} from './question-review-mappers.js';
import {
  QUESTION_REVIEW_APPROVED_TEMPLATE,
  QUESTION_REVIEW_CHANGES_REQUESTED_TEMPLATE,
  QUESTION_REVIEW_REJECTED_TEMPLATE,
} from './templates.js';
import type {
  ApproveQuestionReviewDto,
  QuestionReviewHistoryItemDto,
  QuestionReviewHistoryResponseDto,
  QuestionReviewQueueResponseDto,
  QuestionReviewQueueSubjectGroupDto,
  QuestionReviewWorkspaceResponseDto,
  RejectQuestionReviewDto,
  RequestChangesQuestionReviewDto,
} from './dto/question-review.dto.js';

interface ActorContext {
  actorUserId: string;
}

/** `question-review.v1` (B9) — the HOD review queue, review workspace, the
 * three decision endpoints, and immutable review history. Every decision
 * runs the same shared `decide()`, in this order: the real two-hop
 * department-scope `evaluate()` call first (`QuestionService
 * .resolveResourceContext()`'s own established pattern — `Subject
 * .departmentId` resolved by this caller before constructing the
 * `ResourceContext`, exactly as ADR-0001 requires) so nothing about the
 * question's state is revealed to an out-of-scope actor, then the
 * self-review check, then one transaction writing both the
 * revision-status transition (guarded atomically against a concurrent
 * decision) and the new `QuestionReview` row, then an audit event and a
 * best-effort teacher notification. */
@Injectable()
export class QuestionReviewService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_CHANNEL) private readonly notifications: NotificationChannel,
  ) {}

  /** DoD item 1: every department the actor may decide for (HOD: their own
   * active `HODAssignment`s only; SCHOOL_ADMIN: every department — matches
   * `questionBank.review`'s own grant shape). `null` means "no department
   * filter" (see every department); `[]` means "no access at all." */
  private async resolveDepartmentScope(
    schoolId: string,
    actor: AuthorizedActor,
  ): Promise<string[] | null> {
    if (actor.kind !== 'SCHOOL') return [];
    if (actor.roles.includes('SCHOOL_ADMIN')) return null;
    if (actor.roles.includes('HOD')) {
      const assignments = await withTenant(prisma, schoolId, (tx) =>
        tx.hODAssignment.findMany({
          where: { schoolId, membershipId: actor.membershipId, status: 'ACTIVE' },
          select: { departmentId: true },
        }),
      );
      return assignments.map((a) => a.departmentId);
    }
    return [];
  }

  async getQueue(
    schoolId: string,
    actor: AuthorizedActor,
  ): Promise<QuestionReviewQueueResponseDto> {
    const departmentIds = await this.resolveDepartmentScope(schoolId, actor);
    if (departmentIds !== null && departmentIds.length === 0) {
      return { subjects: [] };
    }

    const questions = await withTenant(prisma, schoolId, (tx) =>
      tx.question.findMany({
        where: {
          schoolId,
          archivedAt: null,
          currentRevision: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
          ...(departmentIds !== null && { subject: { departmentId: { in: departmentIds } } }),
        },
        include: QUESTION_FOR_REVIEW_INCLUDE,
        // Oldest-submitted-first — matches "queue age" (04 §29/§70): the
        // longest-waiting question surfaces first in each subject's list.
        // Ordered through the *revision's* own updatedAt, not Question's —
        // submit() only ever touches QuestionRevision, never the parent
        // Question row, so Question.updatedAt reflects the last time the
        // question itself changed (creation, or a resubmission cycle's
        // currentRevisionId repoint), not when the pending revision was
        // actually submitted. This is the same field toQueueItemDto's own
        // `submittedAt` uses — the sort key and the displayed value must
        // agree.
        orderBy: { currentRevision: { updatedAt: 'asc' } },
      }),
    );

    const bySubject = new Map<string, QuestionReviewQueueSubjectGroupDto>();
    for (const question of questions) {
      // Structurally shouldn't happen (a SUBMITTED/UNDER_REVIEW status can
      // only exist on a real currentRevision), but narrows the type rather
      // than asserting.
      if (!question.currentRevision) continue;
      const withRevision = question as QuestionForReviewWithRevision;
      const item = toQueueItemDto(withRevision);
      const existing = bySubject.get(question.subjectId);
      if (existing) {
        existing.pendingCount += 1;
        existing.items.push(item);
      } else {
        bySubject.set(question.subjectId, {
          subjectId: question.subjectId,
          subjectName: question.subject.name,
          pendingCount: 1,
          items: [item],
        });
      }
    }
    return { subjects: [...bySubject.values()] };
  }

  async getWorkspace(
    schoolId: string,
    actor: AuthorizedActor,
    questionId: string,
  ): Promise<QuestionReviewWorkspaceResponseDto> {
    const question = await this.loadQuestionForReview(schoolId, questionId);
    const decision = await this.authz.evaluate(actor, 'questionBank.review', {
      schoolId,
      ...(question.subject.departmentId !== null && {
        departmentId: question.subject.departmentId,
      }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Question not found.' });
    }
    const history = await this.loadHistory(schoolId, questionId);
    return toWorkspaceResponseDto(question, history);
  }

  async getHistory(
    schoolId: string,
    actor: AuthorizedActor,
    questionId: string,
  ): Promise<QuestionReviewHistoryResponseDto> {
    const question = await this.loadQuestionForReview(schoolId, questionId);
    const decision = await this.authz.evaluate(actor, 'questionBank.comment.view', {
      schoolId,
      ownerMembershipId: question.authorProfile.membership.id,
      ...(question.subject.departmentId !== null && {
        departmentId: question.subject.departmentId,
      }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Question not found.' });
    }
    return { history: await this.loadHistory(schoolId, questionId) };
  }

  async approve(
    schoolId: string,
    actor: AuthorizedActor,
    questionId: string,
    dto: ApproveQuestionReviewDto,
    auditCtx: ActorContext,
  ): Promise<QuestionReviewWorkspaceResponseDto> {
    return this.decide(
      schoolId,
      actor,
      questionId,
      'APPROVED',
      dto.note,
      'questionBank.approve',
      'QUESTION_REVIEW_APPROVED',
      auditCtx,
    );
  }

  async reject(
    schoolId: string,
    actor: AuthorizedActor,
    questionId: string,
    dto: RejectQuestionReviewDto,
    auditCtx: ActorContext,
  ): Promise<QuestionReviewWorkspaceResponseDto> {
    return this.decide(
      schoolId,
      actor,
      questionId,
      'REJECTED',
      dto.reason,
      'questionBank.reject',
      'QUESTION_REVIEW_REJECTED',
      auditCtx,
    );
  }

  async requestChanges(
    schoolId: string,
    actor: AuthorizedActor,
    questionId: string,
    dto: RequestChangesQuestionReviewDto,
    auditCtx: ActorContext,
  ): Promise<QuestionReviewWorkspaceResponseDto> {
    return this.decide(
      schoolId,
      actor,
      questionId,
      'REQUEST_CHANGES',
      dto.reason,
      'questionBank.requestChanges',
      'QUESTION_REVIEW_CHANGES_REQUESTED',
      auditCtx,
    );
  }

  /** DoD items 2/3/4/5/6/7/9. `decision` always writes `APPROVED` or
   * `REJECTED` onto the revision (REQUEST_CHANGES maps to `REJECTED` — see
   * `QuestionReview`'s own schema doc comment) in the SAME transaction as
   * the new `QuestionReview` row (roadmap's own Database work
   * requirement); `currentRevisionId` is never repointed (D-12). */
  private async decide(
    schoolId: string,
    actor: AuthorizedActor,
    questionId: string,
    decision: QuestionReviewDecision,
    comment: string | undefined,
    permissionId: string,
    auditAction: string,
    auditCtx: ActorContext,
  ): Promise<QuestionReviewWorkspaceResponseDto> {
    const question = await this.loadQuestionForReview(schoolId, questionId);
    const revision = question.currentRevision;

    // Authorize before revealing anything about this question's state —
    // mirrors getWorkspace()/getHistory()'s own "authorize, then reveal"
    // ordering in this file, and requireOwnedRevision()'s identical
    // "authorize, then inspect state" precedent in
    // question-revision.service.ts. Checking the revision's status first
    // would let an HOD outside this question's department learn its
    // review state (e.g. "already decided", via a 409) before ever being
    // authorized to know the question exists at all — the guard-level
    // @Authorized() check alone can't catch this, since any HOD passes it
    // regardless of department (DEPARTMENT's own "no resource yet ->
    // optimistic pass" behaviour).
    const authzDecision = await this.authz.evaluate(actor, permissionId, {
      schoolId,
      ...(question.subject.departmentId !== null && {
        departmentId: question.subject.departmentId,
      }),
    });
    if (!authzDecision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to review this question.',
      });
    }

    const schoolActor = requireSchoolActor(actor);
    // DoD item 7: a Teacher+HOD combination (07 §5.3 permits holding both)
    // must still be blocked from approving their own question — the
    // DEPARTMENT scope resolver alone can't express this (it only checks
    // HODAssignment<->department, never authorship).
    if (question.authorProfile.membership.id === schoolActor.membershipId) {
      throw new AppHttpException({
        code: 'QUESTION_SELF_REVIEW_FORBIDDEN',
        message: 'You cannot review a question you authored yourself.',
      });
    }

    const revisionStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    const review = await withTenant(prisma, schoolId, async (tx) => {
      // Concurrency guard: the SUBMITTED/UNDER_REVIEW precondition is
      // re-checked atomically inside this UPDATE, not merely by having
      // been read moments earlier — two decisions racing on the same
      // revision (e.g. two HODs approving/rejecting near-simultaneously)
      // must not both succeed. Same conditional-updateMany idiom as B7's
      // import confirm()/commit() claim (imports.service.ts,
      // import-commit.service.ts) and B5's session activation.
      const { count } = await tx.questionRevision.updateMany({
        where: { id: revision.id, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
        data: { status: revisionStatus },
      });
      if (count === 0) {
        throw new AppHttpException({
          code: 'QUESTION_REVISION_NOT_SUBMITTED',
          message: 'This question is not currently awaiting review.',
        });
      }
      return tx.questionReview.create({
        data: {
          schoolId,
          questionRevisionId: revision.id,
          reviewerMembershipId: schoolActor.membershipId,
          decision,
          ...(comment !== undefined && { comment }),
        },
      });
    });

    // Every actor reaching this point has already passed
    // questionBank.{approve,reject,requestChanges} — all three are
    // HOD-DEPARTMENT-only (ADR-0012 denies Software Admin outright, with no
    // break-glass override; Moderator/School Admin/Teacher are denied()
    // outright on all three) — so the actor is always genuinely acting as
    // HOD here, never merely the caller's TEACHER-first display role
    // (resolveQuestionActorRole's own precedent, built for B8's
    // author-attribution case, would misattribute this call if reused).
    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: 'HOD',
      action: auditAction,
      entityType: 'QuestionRevision',
      entityId: revision.id,
      ...(comment !== undefined && { reason: comment }),
      metadata: { decision, questionId, reviewId: review.id },
    });

    await this.dispatchDecisionNotification(question, decision, comment);

    const updatedQuestion = await this.loadQuestionForReview(schoolId, questionId);
    const history = await this.loadHistory(schoolId, questionId);
    return toWorkspaceResponseDto(updatedQuestion, history);
  }

  /** A transient send failure must never fail the decision itself — the
   * `QuestionReview` row and audit event already committed are the durable
   * record regardless (no prior phase's own notification call site in this
   * codebase awaits-and-rethrows either). */
  private async dispatchDecisionNotification(
    question: QuestionForReview,
    decision: QuestionReviewDecision,
    comment: string | undefined,
  ): Promise<void> {
    const email = question.authorProfile.membership.user.email;
    if (!email) return; // structurally shouldn't happen — teachers always have one (B1)

    const template =
      decision === 'APPROVED'
        ? QUESTION_REVIEW_APPROVED_TEMPLATE
        : decision === 'REJECTED'
          ? QUESTION_REVIEW_REJECTED_TEMPLATE
          : QUESTION_REVIEW_CHANGES_REQUESTED_TEMPLATE;
    const detailLine = comment
      ? `\n\n${decision === 'APPROVED' ? 'HOD note' : 'Reason'}: "${comment}"`
      : '';

    try {
      await this.notifications.send({
        to: email,
        template,
        variables: {
          displayName: question.authorProfile.membership.user.displayName,
          detailLine,
        },
      });
    } catch {
      // Best-effort — see this method's own doc comment.
    }
  }

  private async loadQuestionForReview(
    schoolId: string,
    questionId: string,
  ): Promise<QuestionForReviewWithRevision> {
    const question = await withTenant(prisma, schoolId, (tx) =>
      tx.question.findUnique({ where: { id: questionId }, include: QUESTION_FOR_REVIEW_INCLUDE }),
    );
    if (!question || question.schoolId !== schoolId || !question.currentRevision) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Question not found.' });
    }
    return question as QuestionForReviewWithRevision;
  }

  /** DoD item 5: every decision across every revision of the question
   * (not just the current one), oldest first — 04 §31's "Revision 1 ->
   * Rejected ... Revision 2 -> Approved" narrative. */
  private async loadHistory(
    schoolId: string,
    questionId: string,
  ): Promise<QuestionReviewHistoryItemDto[]> {
    const reviews = await withTenant(prisma, schoolId, (tx) =>
      tx.questionReview.findMany({
        where: { schoolId, revision: { questionId } },
        include: {
          revision: { select: { revisionNumber: true } },
          reviewer: { include: { user: { select: { displayName: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return reviews.map(toHistoryItemDto);
  }
}
