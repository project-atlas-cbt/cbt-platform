import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AuditService } from '../operations/audit-event.service.js';
import {
  QUESTION_REVISION_INCLUDE,
  toRevisionResponseDto,
  type QuestionRevisionWithRelations,
} from './question-mappers.js';
import { requireSchoolActor } from './question-scope.util.js';
import { validateQuestionRevisionForSubmit } from './question-validation.util.js';
import { TopicService } from './topic.service.js';
import type {
  CreateRevisionDto,
  QuestionOptionInputDto,
  QuestionRevisionResponseDto,
  UpdateQuestionRevisionDto,
} from './dto/question.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

/** `PATCH .../revisions/:rev`, `POST .../revisions`, `POST
 * .../revisions/:rev/submit` — every action here operates on a single
 * revision the caller must OWN (TEACHER, `questionBank.editOwnDraft`/
 * `.submitForReview`), verified via `evaluate()` against the revision's own
 * `createdByMembershipId`, never merely assumed from the parent Question's
 * author (07 §7.2's own "created_by" is the revision's own attribute —
 * see that field's schema doc comment). */
@Injectable()
export class QuestionRevisionService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly topics: TopicService,
  ) {}

  /** DoD item 3: freely editable while `DRAFT` — never re-validated against
   * the full catalogue (a partial save may legitimately be incomplete). */
  async updateDraft(
    schoolId: string,
    actor: AuthorizedActor,
    questionId: string,
    revisionId: string,
    dto: UpdateQuestionRevisionDto,
    auditCtx: ActorContext,
  ): Promise<QuestionRevisionResponseDto> {
    const { question, revision } = await this.requireOwnedRevision(
      schoolId,
      actor,
      questionId,
      revisionId,
      'questionBank.editOwnDraft',
    );
    if (revision.status !== 'DRAFT') {
      throw new AppHttpException({
        code: 'QUESTION_REVISION_NOT_DRAFT',
        message: 'Only a draft revision may be edited.',
      });
    }

    const topicRef = await this.resolveTopicRefs(
      schoolId,
      question.subjectId,
      dto,
      revision.topicId,
    );

    const updated = await withTenant(prisma, schoolId, async (tx) => {
      if (dto.options !== undefined) {
        await this.replaceOptions(tx, schoolId, revisionId, dto.options);
      }
      await tx.questionRevision.update({
        where: { id: revisionId },
        data: {
          ...(dto.questionType !== undefined && { questionType: dto.questionType }),
          ...(dto.content !== undefined && { content: dto.content }),
          ...(topicRef.topicId !== undefined && { topicId: topicRef.topicId }),
          ...(topicRef.subtopicId !== undefined && { subtopicId: topicRef.subtopicId }),
          ...(dto.difficulty !== undefined && { difficulty: dto.difficulty }),
          ...(dto.marks !== undefined && { marks: dto.marks }),
          ...(dto.explanation !== undefined && { explanation: dto.explanation }),
        },
      });
      return tx.questionRevision.findUniqueOrThrow({
        where: { id: revisionId },
        include: QUESTION_REVISION_INCLUDE,
      });
    });

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'QUESTION_REVISION_UPDATED',
      entityType: 'QuestionRevision',
      entityId: revisionId,
    });
    return toRevisionResponseDto(updated);
  }

  async deleteDraft(
    schoolId: string,
    actor: AuthorizedActor,
    questionId: string,
    revisionId: string,
    auditCtx: ActorContext,
  ): Promise<void> {
    const { question, revision } = await this.requireOwnedRevision(
      schoolId,
      actor,
      questionId,
      revisionId,
      'questionBank.deleteOwnDraft',
    );
    if (revision.status !== 'DRAFT') {
      throw new AppHttpException({
        code: 'QUESTION_REVISION_NOT_DRAFT',
        message: 'Only a draft revision may be deleted.',
      });
    }
    // DoD item 3: "freely editable and deletable by their author" — no
    // carve-out for a question's only revision. If this is the only one,
    // deleting it would leave a Question with zero revisions and a null
    // currentRevisionId (structurally valid but a confusing empty shell,
    // since Question has no content of its own independent of a
    // revision) — so the Question itself is deleted too, in the same
    // transaction (QuestionRevision's FK to Question is already Cascade,
    // so deleting the Question is sufficient; the revision row goes with
    // it). A teacher who instead wants to keep the Question but stop
    // working on it should archive it (questionBank.archive) — a
    // different, non-destructive action.
    const isOnlyRevision =
      question.currentRevisionId === revisionId && revision.revisionNumber === 1;
    await withTenant(prisma, schoolId, async (tx) => {
      if (isOnlyRevision) {
        await tx.question.delete({ where: { id: questionId } });
        return;
      }
      await tx.questionRevision.delete({ where: { id: revisionId } });
      if (question.currentRevisionId === revisionId) {
        // This draft was started (createRevision) from a still-existing
        // earlier revision (APPROVED/REJECTED) — repoint currentRevisionId
        // back at it rather than leaving it null (SetNull would otherwise
        // fire and hide a perfectly good approved revision behind a
        // "no revision" derived status).
        const previous = await tx.questionRevision.findFirst({
          where: { schoolId, questionId },
          orderBy: { revisionNumber: 'desc' },
        });
        await tx.question.update({
          where: { id: questionId },
          data: { currentRevisionId: previous?.id ?? null },
        });
      }
    });
    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: isOnlyRevision ? 'QUESTION_DELETED' : 'QUESTION_REVISION_DELETED',
      entityType: isOnlyRevision ? 'Question' : 'QuestionRevision',
      entityId: isOnlyRevision ? questionId : revisionId,
    });
  }

  /** DoD items 5/7: a new revision, cloned from the current one, only
   * startable from `APPROVED` or `REJECTED` (never from an already-editable
   * `DRAFT`/locked `SUBMITTED`/`UNDER_REVIEW`, which already have a live
   * revision of their own). Fresh `QuestionOption`/`QuestionMedia` rows —
   * never referencing the source revision's own rows — structurally
   * guarantees the source stays byte-identical afterward, satisfying "the
   * approved one is unchanged" by construction, not convention. */
  async createRevision(
    schoolId: string,
    actor: AuthorizedActor,
    questionId: string,
    dto: CreateRevisionDto,
    auditCtx: ActorContext,
  ): Promise<QuestionRevisionResponseDto> {
    const question = await withTenant(prisma, schoolId, (tx) =>
      tx.question.findUnique({
        where: { id: questionId },
        include: { currentRevision: { include: QUESTION_REVISION_INCLUDE } },
      }),
    );
    if (!question || question.schoolId !== schoolId || !question.currentRevision) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Question not found.' });
    }
    const source = question.currentRevision;
    if (source.status !== 'APPROVED' && source.status !== 'REJECTED') {
      throw new AppHttpException({
        code: 'QUESTION_REVISION_NOT_REVISABLE',
        message: 'A new revision can only be started from an approved or rejected one.',
      });
    }

    const decision = await this.authz.evaluate(actor, 'questionBank.editOwnDraft', {
      schoolId,
      ownerMembershipId: source.createdByMembershipId,
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to revise this question.',
      });
    }

    const schoolActor = requireSchoolActor(actor);
    const topicRef = await this.resolveTopicRefs(schoolId, question.subjectId, dto, source.topicId);
    const options: QuestionOptionInputDto[] =
      dto.options ??
      source.options.map((option) => ({
        content: option.content,
        correctFlag: option.correctFlag,
      }));

    const created = await withTenant(prisma, schoolId, async (tx) => {
      const nextNumber = source.revisionNumber + 1;
      const revision = await tx.questionRevision.create({
        data: {
          schoolId,
          questionId,
          revisionNumber: nextNumber,
          questionType: dto.questionType ?? source.questionType,
          content: dto.content ?? source.content,
          topicId: topicRef.topicId !== undefined ? topicRef.topicId : source.topicId,
          subtopicId: topicRef.subtopicId !== undefined ? topicRef.subtopicId : source.subtopicId,
          difficulty: dto.difficulty ?? source.difficulty,
          marks: dto.marks ?? source.marks,
          ...((dto.explanation !== undefined ? dto.explanation : source.explanation) !== null && {
            explanation: dto.explanation !== undefined ? dto.explanation : source.explanation,
          }),
          createdByMembershipId: schoolActor.membershipId,
          status: 'DRAFT',
        },
      });
      // See question.service.ts's create()/createFromImportRow() own
      // comment: composite-FK nested creates reject an explicit schoolId,
      // so this is a plain createMany, not `options: { create: [...] }`.
      await tx.questionOption.createMany({
        data: options.map((option, index) => ({
          schoolId,
          questionRevisionId: revision.id,
          content: option.content,
          originalOrder: index,
          correctFlag: option.correctFlag,
        })),
      });
      await tx.question.update({
        where: { id: questionId },
        data: { currentRevisionId: revision.id },
      });
      return tx.questionRevision.findUniqueOrThrow({
        where: { id: revision.id },
        include: QUESTION_REVISION_INCLUDE,
      });
    });

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'QUESTION_REVISION_CREATED',
      entityType: 'QuestionRevision',
      entityId: created.id,
      metadata: { fromRevisionId: source.id, fromStatus: source.status },
    });
    return toRevisionResponseDto(created);
  }

  /** DoD item 4: `DRAFT -> SUBMITTED` only — the sole state transition B8
   * itself owns. `SUBMITTED -> UNDER_REVIEW -> APPROVED/REJECTED` is B9's
   * review workflow (`questionBank.review`/`.approve`/`.reject` — no B8
   * endpoint reaches those states; see this module's own doc comment). Runs
   * the full validation catalogue (DoD item 8) — the actual "cannot submit
   * if" gate. */
  async submit(
    schoolId: string,
    actor: AuthorizedActor,
    questionId: string,
    revisionId: string,
    auditCtx: ActorContext,
  ): Promise<QuestionRevisionResponseDto> {
    const { question, revision } = await this.requireOwnedRevision(
      schoolId,
      actor,
      questionId,
      revisionId,
      'questionBank.submitForReview',
    );
    if (revision.status !== 'DRAFT') {
      throw new AppHttpException({
        code: 'QUESTION_REVISION_NOT_DRAFT',
        message: 'Only a draft revision may be submitted.',
      });
    }

    validateQuestionRevisionForSubmit({
      content: revision.content,
      options: revision.options,
      marks: revision.marks,
    });

    // Re-check the teacher's own scope hasn't changed since draft creation
    // (e.g. the subject/class assignment was ended in the meantime) —
    // DoD item 2's "creating outside assigned scope is refused" extends
    // naturally to "and remains refused at submit."
    if (actor.kind === 'SCHOOL' && actor.roles.includes('TEACHER')) {
      const teacherProfile = await withTenant(prisma, schoolId, (tx) =>
        tx.teacherProfile.findUnique({
          where: { schoolId_membershipId: { schoolId, membershipId: actor.membershipId } },
          select: { id: true },
        }),
      );
      const activeAssignment =
        teacherProfile &&
        (await withTenant(prisma, schoolId, (tx) =>
          tx.teacherAssignment.findFirst({
            where: {
              schoolId,
              teacherProfileId: teacherProfile.id,
              status: 'ACTIVE',
              classSubject: {
                subjectId: question.subjectId,
                classGroupSession: { level: question.level as never },
              },
            },
            select: { id: true },
          }),
        ));
      if (!activeAssignment) {
        throw new AppHttpException({
          code: 'QUESTION_OUT_OF_SCOPE',
          message: 'You no longer have an active assignment covering this subject and level.',
        });
      }
    }

    const updated = await withTenant(prisma, schoolId, (tx) =>
      tx.questionRevision.update({
        where: { id: revisionId },
        data: { status: 'SUBMITTED' },
        include: QUESTION_REVISION_INCLUDE,
      }),
    );
    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'QUESTION_REVISION_SUBMITTED',
      entityType: 'QuestionRevision',
      entityId: revisionId,
    });
    return toRevisionResponseDto(updated);
  }

  /** Shared fetch-and-authorize used by every OWNED-graded revision action
   * — resolves the question, its specific revision (guarding against a
   * `:rev` id that doesn't actually belong to `:id`), and re-verifies real
   * ownership via `evaluate()` against the revision's own
   * `createdByMembershipId` rather than trusting the route alone. */
  private async requireOwnedRevision(
    schoolId: string,
    actor: AuthorizedActor,
    questionId: string,
    revisionId: string,
    permissionId: string,
  ): Promise<{
    question: { id: string; subjectId: string; level: string; currentRevisionId: string | null };
    revision: QuestionRevisionWithRelations;
  }> {
    const question = await withTenant(prisma, schoolId, (tx) =>
      tx.question.findUnique({ where: { id: questionId } }),
    );
    if (!question || question.schoolId !== schoolId) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Question not found.' });
    }
    const revision = await withTenant(prisma, schoolId, (tx) =>
      tx.questionRevision.findUnique({
        where: { id: revisionId },
        include: QUESTION_REVISION_INCLUDE,
      }),
    );
    if (!revision || revision.schoolId !== schoolId || revision.questionId !== questionId) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Question revision not found.' });
    }

    const decision = await this.authz.evaluate(actor, permissionId, {
      schoolId,
      ownerMembershipId: revision.createdByMembershipId,
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      });
    }

    return { question, revision };
  }

  /**
   * `existingTopicId` is the revision's (or clone source's) current topic —
   * used as the subtopic's parent fallback when the topic itself isn't part
   * of *this* call (e.g. a `PATCH` supplying only `subtopicName`, leaving
   * the topic unchanged). Without this fallback, a free-text subtopic
   * resolved/created while the topic is merely being carried over — not
   * re-supplied — would nest under `null` (a top-level topic) instead of
   * the topic that will actually apply to this revision, silently
   * mis-parenting it in the `Topic` table.
   */
  private async resolveTopicRefs(
    schoolId: string,
    subjectId: string,
    dto: { topicId?: string; topicName?: string; subtopicId?: string; subtopicName?: string },
    existingTopicId: string | null = null,
  ): Promise<{ topicId?: string | null; subtopicId?: string | null }> {
    const result: { topicId?: string | null; subtopicId?: string | null } = {};
    if (dto.topicId !== undefined) {
      const topic = await this.topics.findOrCreate(schoolId, subjectId, { id: dto.topicId });
      result.topicId = topic.id;
    } else if (dto.topicName !== undefined) {
      const topic = await this.topics.findOrCreate(schoolId, subjectId, { name: dto.topicName });
      result.topicId = topic.id;
    }
    const effectiveTopicId = result.topicId !== undefined ? result.topicId : existingTopicId;
    if (dto.subtopicId !== undefined) {
      const subtopic = await this.topics.findOrCreate(schoolId, subjectId, { id: dto.subtopicId });
      result.subtopicId = subtopic.id;
    } else if (dto.subtopicName !== undefined) {
      const subtopic = await this.topics.findOrCreate(schoolId, subjectId, {
        name: dto.subtopicName,
        parentTopicId: effectiveTopicId,
      });
      result.subtopicId = subtopic.id;
    }
    return result;
  }

  private async replaceOptions(
    tx: Prisma.TransactionClient,
    schoolId: string,
    revisionId: string,
    options: QuestionOptionInputDto[],
  ): Promise<void> {
    const existing = await tx.questionOption.findMany({
      where: { schoolId, questionRevisionId: revisionId },
    });
    const existingIds = new Set(existing.map((option) => option.id));
    for (const option of options) {
      if (option.id !== undefined && !existingIds.has(option.id)) {
        throw new AppHttpException({
          code: 'QUESTION_OPTION_NOT_FOUND',
          message: `Option ${option.id} does not belong to this revision.`,
        });
      }
    }
    await tx.questionOption.deleteMany({ where: { schoolId, questionRevisionId: revisionId } });
    await tx.questionOption.createMany({
      data: options.map((option, index) => ({
        schoolId,
        questionRevisionId: revisionId,
        content: option.content,
        originalOrder: index,
        correctFlag: option.correctFlag,
      })),
    });
  }
}
