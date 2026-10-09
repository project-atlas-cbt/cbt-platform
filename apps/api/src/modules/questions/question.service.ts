import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AuditService } from '../operations/audit-event.service.js';
import {
  QUESTION_DETAIL_INCLUDE,
  QUESTION_INCLUDE,
  QUESTION_REVISION_INCLUDE,
  currentRevisionOwnedBy,
  deriveCurrentStatus,
  toQuestionListItemDto,
  toQuestionResponseDto,
} from './question-mappers.js';
import {
  requireSchoolActor,
  requireTeacherAssignedScope,
  requireTeacherProfile,
} from './question-scope.util.js';
import { validateQuestionRevisionForSubmit } from './question-validation.util.js';
import { TopicService } from './topic.service.js';
import type { SubjectListResponseDto } from '../academics/dto/subject.dto.js';
import type {
  BulkArchiveResultDto,
  CreateQuestionDto,
  QuestionCountsResponseDto,
  QuestionListResponseDto,
  QuestionResponseDto,
  ListQuestionsQueryDto,
} from './dto/question.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

/** `questionBank.*`/`questionLifecycle.*` — Question CRUD (create, get,
 * list, counts, archive). Revision-lifecycle actions (`PATCH`, new
 * revision, submit, media attach) live in `QuestionRevisionService`; both
 * share the response-mapping helpers in `question-mappers.ts` so a
 * `Question` and its revisions are always rendered identically regardless
 * of which endpoint produced them. */
@Injectable()
export class QuestionService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly topics: TopicService,
  ) {}

  /** DoD items 1/2/8: creates `Question` + its initial `DRAFT` revision +
   * options in one transaction, only within the actor's real assigned
   * scope (ADR-0001 §2), with the full validation catalogue already
   * satisfied — a freshly created question is a complete, valid MCQ, not a
   * blank shell. */
  async create(
    schoolId: string,
    actor: AuthorizedActor,
    dto: CreateQuestionDto,
    auditCtx: ActorContext,
  ): Promise<QuestionResponseDto> {
    validateQuestionRevisionForSubmit({
      content: dto.content,
      questionType: dto.questionType,
      options: dto.options,
      marks: dto.marks,
    });

    const schoolActor = requireSchoolActor(actor);
    const teacherProfile = await requireTeacherProfile(schoolId, schoolActor.membershipId);
    await requireTeacherAssignedScope(this.authz, actor, 'questionBank.create', {
      schoolId,
      teacherProfileId: teacherProfile.id,
      subjectId: dto.subjectId,
      level: dto.level,
    });

    const topic = dto.topicId
      ? await this.topics.findOrCreate(schoolId, dto.subjectId, { id: dto.topicId })
      : dto.topicName
        ? await this.topics.findOrCreate(schoolId, dto.subjectId, { name: dto.topicName })
        : null;
    const subtopic = dto.subtopicId
      ? await this.topics.findOrCreate(schoolId, dto.subjectId, { id: dto.subtopicId })
      : dto.subtopicName
        ? await this.topics.findOrCreate(schoolId, dto.subjectId, {
            name: dto.subtopicName,
            parentTopicId: topic?.id ?? null,
          })
        : null;

    const question = await withTenant(prisma, schoolId, async (tx) => {
      const created = await tx.question.create({
        data: {
          schoolId,
          subjectId: dto.subjectId,
          level: dto.level,
          authorTeacherProfileId: teacherProfile.id,
        },
      });
      const revision = await tx.questionRevision.create({
        data: {
          schoolId,
          questionId: created.id,
          revisionNumber: 1,
          questionType: dto.questionType,
          content: dto.content,
          topicId: topic?.id ?? null,
          subtopicId: subtopic?.id ?? null,
          difficulty: dto.difficulty,
          marks: dto.marks,
          ...(dto.explanation !== undefined && { explanation: dto.explanation }),
          createdByMembershipId: schoolActor.membershipId,
          status: 'DRAFT',
        },
      });
      // A plain (non-nested) createMany, not `options: { create: [...] }`
      // under the revision relation — QuestionOption's FK to
      // QuestionRevision is composite ([schoolId, questionRevisionId]), and
      // Prisma's generated nested-create input type for a composite-FK
      // relation excludes `schoolId` (it infers both halves from the
      // parent), rejecting an explicit one with "Unknown argument
      // schoolId" — found only by running this against real Prisma
      // codegen output, not by inspection.
      await tx.questionOption.createMany({
        data: dto.options.map((option, index) => ({
          schoolId,
          questionRevisionId: revision.id,
          content: option.content,
          originalOrder: index,
          correctFlag: option.correctFlag,
        })),
      });
      await tx.question.update({
        where: { id: created.id },
        data: { currentRevisionId: revision.id },
      });
      return created.id;
    });

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'QUESTION_CREATED',
      entityType: 'Question',
      entityId: question,
    });

    return this.get(schoolId, actor, question);
  }

  /**
   * Gap-closure found via live testing, not by inspection: the Question
   * Editor's Subject picker (`MetadataPanel`) called `GET
   * /academics/subjects`, gated by `schoolConfig.subject.view` —
   * `denied()` for TEACHER per `02`'s own "Manage subjects" row (matching
   * F6's confirmed "Teacher gets no schoolConfig.* access" decision, a
   * deliberate call about the Academic Structure *workspace*). That denial
   * is correct there; it also left the picker permanently empty, since
   * it's the exact same endpoint — making question authoring (a genuinely
   * granted TEACHER capability, `questionBank.create`: ASSIGNED)
   * impossible in practice regardless of any real assignment.
   *
   * Rather than widen `schoolConfig.subject.view` (a School Configuration
   * grant, deliberately confirmed Teacher-denied at F6), this reuses the
   * already-correctly-scoped `questionBank.create` permission and derives
   * the list directly from the teacher's real `TeacherAssignment` rows —
   * the identical ADR-0001 join `requireTeacherAssignedScope` already
   * checks at save time (`question-scope.util.ts`), applied here to
   * *populate* the picker instead of only validating it after the fact.
   * A side benefit over F9's originally planned "unconstrained" picker: it
   * now only ever offers subjects the teacher can actually save against,
   * closing that phase's own recorded "no client-side teacher-assignment
   * data is reachable" Candidate/Deferred note in the same pass. `Level`
   * stays unconstrained (all `CLASS_LEVELS`) — an out-of-scope subject+level
   * combination still surfaces via `outOfScopeError`, an already-designed-
   * for path, so narrowing Level too is left out of this fix's scope.
   */
  async myAssignedSubjects(
    schoolId: string,
    actor: AuthorizedActor,
  ): Promise<SubjectListResponseDto> {
    const schoolActor = requireSchoolActor(actor);
    const teacherProfile = await requireTeacherProfile(schoolId, schoolActor.membershipId);

    const assignments = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherAssignment.findMany({
        where: { schoolId, teacherProfileId: teacherProfile.id, status: 'ACTIVE' },
        select: { classSubject: { select: { subject: true } } },
      }),
    );

    const bySubjectId = new Map<string, (typeof assignments)[number]['classSubject']['subject']>();
    for (const assignment of assignments) {
      bySubjectId.set(assignment.classSubject.subject.id, assignment.classSubject.subject);
    }

    return {
      subjects: [...bySubjectId.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          departmentId: s.departmentId,
          choiceGroupId: s.choiceGroupId,
          status: s.status,
        })),
    };
  }

  async get(schoolId: string, actor: AuthorizedActor, id: string): Promise<QuestionResponseDto> {
    const question = await withTenant(prisma, schoolId, (tx) =>
      tx.question.findUnique({ where: { id }, include: QUESTION_DETAIL_INCLUDE }),
    );
    if (!question || question.schoolId !== schoolId) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Question not found.' });
    }

    const resource = await this.resolveResourceContext(schoolId, actor, question);
    const decision = await this.authz.evaluate(actor, 'questionBank.view', resource);
    if (!decision.allowed) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Question not found.' });
    }

    return toQuestionResponseDto(question, currentRevisionOwnedBy(actor, question));
  }

  async list(
    schoolId: string,
    actor: AuthorizedActor,
    query: ListQuestionsQueryDto,
  ): Promise<QuestionListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const scopeFilter = await this.buildScopeFilter(schoolId, actor);
    // Every `currentRevision`-nested condition (topic, difficulty, a
    // non-ARCHIVED status) must land in *one* object — three independently
    // spread `{ currentRevision: {...} }` entries at the top level would
    // silently clobber each other (object spread replaces a repeated key
    // wholesale, it doesn't merge nested objects), so combining e.g.
    // `?topicId=X&difficulty=EASY` would silently drop whichever filter was
    // spread first. Found only by tracing a combined-filter call, not by
    // any single-filter test.
    const revisionFilter: Prisma.QuestionRevisionWhereInput = {
      ...(query.topicId !== undefined && { topicId: query.topicId }),
      ...(query.difficulty !== undefined && { difficulty: query.difficulty }),
      ...(query.status !== undefined && query.status !== 'ARCHIVED' && { status: query.status }),
    };
    const where: Prisma.QuestionWhereInput = {
      schoolId,
      ...scopeFilter,
      ...(query.subjectId !== undefined && { subjectId: query.subjectId }),
      ...(query.level !== undefined && { level: query.level }),
      ...(Object.keys(revisionFilter).length > 0 && { currentRevision: revisionFilter }),
      ...this.archivedAtFilter(query.status),
    };

    const [questions, total] = await withTenant(prisma, schoolId, (tx) =>
      Promise.all([
        tx.question.findMany({
          where,
          include: QUESTION_INCLUDE,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.question.count({ where }),
      ]),
    );

    return {
      questions: questions.map((q) => toQuestionListItemDto(q, currentRevisionOwnedBy(actor, q))),
      total,
      page,
      pageSize,
    };
  }

  /**
   * `GET /v1/exams/:id/available-questions`: every unarchived question in
   * the scope with an approved revision, shown as its latest approved
   * revision. `list(status: APPROVED)` filters on the *current* revision,
   * so a question hid from exam building as soon as someone started a new
   * draft of it, and its row carried the draft's id (bug audit P2-5).
   */
  async listBindable(
    schoolId: string,
    actor: AuthorizedActor,
    query: ListQuestionsQueryDto,
  ): Promise<QuestionListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const scopeFilter = await this.buildScopeFilter(schoolId, actor);
    const approved: Prisma.QuestionRevisionWhereInput = {
      status: 'APPROVED',
      ...(query.topicId !== undefined && { topicId: query.topicId }),
      ...(query.difficulty !== undefined && { difficulty: query.difficulty }),
    };
    const where: Prisma.QuestionWhereInput = {
      schoolId,
      ...scopeFilter,
      ...(query.subjectId !== undefined && { subjectId: query.subjectId }),
      ...(query.level !== undefined && { level: query.level }),
      archivedAt: null,
      revisions: { some: approved },
    };

    const [questions, total] = await withTenant(prisma, schoolId, (tx) =>
      Promise.all([
        tx.question.findMany({
          where,
          include: {
            ...QUESTION_INCLUDE,
            revisions: {
              where: { status: 'APPROVED' },
              include: QUESTION_REVISION_INCLUDE,
              orderBy: { revisionNumber: 'desc' },
              take: 1,
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.question.count({ where }),
      ]),
    );

    return {
      questions: questions.map((q) => {
        const asApproved = { ...q, currentRevision: q.revisions[0] ?? null };
        return toQuestionListItemDto(asApproved, currentRevisionOwnedBy(actor, asApproved));
      }),
      total,
      page,
      pageSize,
    };
  }

  async counts(schoolId: string, actor: AuthorizedActor): Promise<QuestionCountsResponseDto> {
    const scopeFilter = await this.buildScopeFilter(schoolId, actor);
    // In-memory rollup, not a raw-SQL groupBy: this school's question bank
    // is a bounded, per-tenant collection (not a cross-school aggregate),
    // so a single findMany selecting only the two fields the derivation
    // needs is simple and correct; a raw-SQL count-by-derived-status could
    // be a later optimization if a school's bank ever grows large enough
    // for it to matter, not before.
    const questions = await withTenant(prisma, schoolId, (tx) =>
      tx.question.findMany({
        where: { schoolId, ...scopeFilter },
        select: { archivedAt: true, currentRevision: { select: { status: true } } },
      }),
    );

    const counts: QuestionCountsResponseDto = {
      draft: 0,
      submitted: 0,
      underReview: 0,
      approved: 0,
      rejected: 0,
      archived: 0,
    };
    for (const question of questions) {
      const status = deriveCurrentStatus(question);
      switch (status) {
        case 'DRAFT':
          counts.draft += 1;
          break;
        case 'SUBMITTED':
          counts.submitted += 1;
          break;
        case 'UNDER_REVIEW':
          counts.underReview += 1;
          break;
        case 'APPROVED':
          counts.approved += 1;
          break;
        case 'REJECTED':
          counts.rejected += 1;
          break;
        case 'ARCHIVED':
          counts.archived += 1;
          break;
      }
    }
    return counts;
  }

  /** Always allowed regardless of the current revision's status — mirrors
   * `SubjectService.deactivate()`'s own "deactivation never blocked"
   * precedent. Only ever sets `Question.archivedAt`; no `QuestionRevision`
   * row is touched (see that field's own schema doc comment) — an approved
   * revision an exam already references stays exactly as it was. */
  async archive(
    schoolId: string,
    actor: AuthorizedActor,
    id: string,
    auditCtx: ActorContext,
  ): Promise<QuestionResponseDto> {
    await this.archiveOne(schoolId, actor, id, auditCtx);
    return this.get(schoolId, actor, id);
  }

  /** Bulk archive — the single-question rules (`questionBank.archive`
   * evaluated per question against its own resource context, one
   * `QUESTION_ARCHIVED` audit row each) applied independently per id, in
   * one request. Best-effort like `bulkSubmit`: a question the actor may not
   * archive, that is missing, or that is already archived lands in `failed`
   * with its reason and never blocks the rest. */
  async bulkArchive(
    schoolId: string,
    actor: AuthorizedActor,
    questionIds: string[],
    auditCtx: ActorContext,
  ): Promise<BulkArchiveResultDto> {
    const archived: BulkArchiveResultDto['archived'] = [];
    const failed: BulkArchiveResultDto['failed'] = [];
    for (const questionId of Array.from(new Set(questionIds))) {
      try {
        await this.archiveOne(schoolId, actor, questionId, auditCtx, { rejectIfArchived: true });
        archived.push({ questionId });
      } catch (err) {
        if (err instanceof AppHttpException) {
          failed.push({
            questionId,
            code: err.code,
            message: err.message || 'This question could not be archived.',
          });
        } else {
          throw err;
        }
      }
    }
    return { archived, failed };
  }

  private async archiveOne(
    schoolId: string,
    actor: AuthorizedActor,
    id: string,
    auditCtx: ActorContext,
    options: { rejectIfArchived?: boolean } = {},
  ): Promise<void> {
    const question = await withTenant(prisma, schoolId, (tx) =>
      tx.question.findUnique({ where: { id }, include: QUESTION_INCLUDE }),
    );
    if (!question || question.schoolId !== schoolId) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Question not found.' });
    }

    const resource = await this.resolveResourceContext(schoolId, actor, question);
    const decision = await this.authz.evaluate(actor, 'questionBank.archive', resource);
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to archive this question.',
      });
    }
    if (options.rejectIfArchived && question.archivedAt !== null) {
      throw new AppHttpException({
        code: 'CONFLICT',
        message: 'This question is already archived.',
      });
    }

    await withTenant(prisma, schoolId, (tx) =>
      tx.question.update({ where: { id }, data: { archivedAt: new Date() } }),
    );
    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'QUESTION_ARCHIVED',
      entityType: 'Question',
      entityId: id,
    });
  }

  /** Builds the full `ResourceContext` a single-question `evaluate()` call
   * needs, covering every scope predicate any role might be graded on for
   * this question: `ownerMembershipId` (TEACHER OWNED on `.archive`),
   * `departmentId` (HOD DEPARTMENT), and `classSubjectId` (TEACHER ASSIGNED
   * on `.view` — resolved via the same ADR-0001 join as creation, but
   * best-effort here: if the actor holds no matching assignment the field
   * is simply omitted, which the ASSIGNED resolver already treats as deny,
   * exactly the correct outcome rather than a thrown error). */
  private async resolveResourceContext(
    schoolId: string,
    actor: AuthorizedActor,
    question: {
      subjectId: string;
      level: string;
      subject: { departmentId: string | null };
      authorProfile: { membership: { id: string } };
    },
  ): Promise<{
    schoolId: string;
    ownerMembershipId: string;
    departmentId?: string;
    classSubjectId?: string;
  }> {
    let classSubjectId: string | undefined;
    if (actor.kind === 'SCHOOL' && actor.roles.includes('TEACHER')) {
      const teacherProfile = await withTenant(prisma, schoolId, (tx) =>
        tx.teacherProfile.findUnique({
          where: { schoolId_membershipId: { schoolId, membershipId: actor.membershipId } },
          select: { id: true },
        }),
      );
      if (teacherProfile) {
        const assignment = await withTenant(prisma, schoolId, (tx) =>
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
            select: { classSubjectId: true },
          }),
        );
        if (assignment) classSubjectId = assignment.classSubjectId;
      }
    }

    return {
      schoolId,
      ownerMembershipId: question.authorProfile.membership.id,
      ...(question.subject.departmentId !== null && {
        departmentId: question.subject.departmentId,
      }),
      ...(classSubjectId !== undefined && { classSubjectId }),
    };
  }

  /** Role-based server-side scoping for the list/counts endpoints — a
   * broadest-applicable-scope-wins tie-break for an actor holding more than
   * one role (SCHOOL_ADMIN/MODERATOR > HOD > TEACHER), matching
   * `resolveActorRole`'s own precedent for the analogous audit-attribution
   * question. Real per-resource `evaluate()` calls (get/archive) don't need
   * this — this is specifically for building an efficient list WHERE
   * clause, which a per-row `evaluate()` call would be too slow for. */
  private async buildScopeFilter(
    schoolId: string,
    actor: AuthorizedActor,
  ): Promise<Prisma.QuestionWhereInput> {
    if (actor.kind !== 'SCHOOL') return { id: { in: [] } };
    if (actor.roles.includes('SCHOOL_ADMIN') || actor.roles.includes('MODERATOR')) {
      return {};
    }
    if (actor.roles.includes('HOD')) {
      const assignments = await withTenant(prisma, schoolId, (tx) =>
        tx.hODAssignment.findMany({
          where: { schoolId, membershipId: actor.membershipId, status: 'ACTIVE' },
          select: { departmentId: true },
        }),
      );
      const departmentIds = assignments.map((a) => a.departmentId);
      if (departmentIds.length === 0) return { id: { in: [] } };
      return { subject: { departmentId: { in: departmentIds } } };
    }
    if (actor.roles.includes('TEACHER')) {
      const teacherProfile = await withTenant(prisma, schoolId, (tx) =>
        tx.teacherProfile.findUnique({
          where: { schoolId_membershipId: { schoolId, membershipId: actor.membershipId } },
          select: { id: true },
        }),
      );
      if (!teacherProfile) return { id: { in: [] } };
      const assignments = await withTenant(prisma, schoolId, (tx) =>
        tx.teacherAssignment.findMany({
          where: { schoolId, teacherProfileId: teacherProfile.id, status: 'ACTIVE' },
          select: {
            classSubject: {
              select: { subjectId: true, classGroupSession: { select: { level: true } } },
            },
          },
        }),
      );
      if (assignments.length === 0) return { id: { in: [] } };
      const pairs = assignments.map((a) => ({
        subjectId: a.classSubject.subjectId,
        level: a.classSubject.classGroupSession.level,
      }));
      return { OR: pairs.map((p) => ({ subjectId: p.subjectId, level: p.level })) };
    }
    return { id: { in: [] } };
  }

  /**
   * B8 import commit path (`ImportCommitService`) — every imported question
   * is authored as the uploader's own `TeacherProfile`
   * (`QUESTION_IMPORT_REQUIRES_TEACHER_PROFILE` already guaranteed one
   * exists at job-creation time). Re-verifies the assignment still covers
   * `(subjectId, level)` at commit time — the same "don't trust a
   * validation-time fact that might be stale by now" re-check
   * `ImportCommitService.enrollStudent` already applies to its own Class
   * resolution, since staging can last up to 24h. Always creates a `DRAFT`
   * revision (05 §18: "never auto-approved"). Idempotent by construction
   * for the resume case: `ImportCommitService` only calls this once per
   * row (guarded by `resultQuestionId` being null), so no separate
   * dedup logic is needed here.
   */
  async createFromImportRow(
    schoolId: string,
    params: {
      teacherProfileId: string;
      createdByMembershipId: string;
      subjectId: string;
      level: string;
      questionType: 'SINGLE_CHOICE' | 'TRUE_FALSE';
      content: string;
      options: { content: string; correctFlag: boolean }[];
      topicId: string | null;
      difficulty: string;
      marks: number;
    },
  ): Promise<{ id: string }> {
    const activeAssignment = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherAssignment.findFirst({
        where: {
          schoolId,
          teacherProfileId: params.teacherProfileId,
          status: 'ACTIVE',
          classSubject: {
            subjectId: params.subjectId,
            classGroupSession: { level: params.level as never },
          },
        },
        select: { id: true },
      }),
    );
    if (!activeAssignment) {
      throw new Error(
        'The assignment covering this subject and level is no longer active (it may have ' +
          'changed since this file was validated).',
      );
    }

    const questionId = await withTenant(prisma, schoolId, async (tx) => {
      const created = await tx.question.create({
        data: {
          schoolId,
          subjectId: params.subjectId,
          level: params.level as never,
          authorTeacherProfileId: params.teacherProfileId,
        },
      });
      const revision = await tx.questionRevision.create({
        data: {
          schoolId,
          questionId: created.id,
          revisionNumber: 1,
          questionType: params.questionType,
          content: params.content,
          topicId: params.topicId,
          difficulty: params.difficulty as never,
          marks: params.marks,
          createdByMembershipId: params.createdByMembershipId,
          status: 'DRAFT',
        },
      });
      // See create()'s own comment: composite-FK nested creates reject an
      // explicit schoolId, so this is a plain createMany, not
      // `options: { create: [...] }`.
      await tx.questionOption.createMany({
        data: params.options.map((option, index) => ({
          schoolId,
          questionRevisionId: revision.id,
          content: option.content,
          originalOrder: index,
          correctFlag: option.correctFlag,
        })),
      });
      await tx.question.update({
        where: { id: created.id },
        data: { currentRevisionId: revision.id },
      });
      return created.id;
    });

    return { id: questionId };
  }

  /** Only the `archivedAt` half of the status filter — the `currentRevision.
   * status` half (for a non-ARCHIVED status) is folded into `list()`'s own
   * combined `revisionFilter` instead, so it composes correctly alongside
   * `topicId`/`difficulty` rather than colliding with them on the same
   * `currentRevision` key. */
  private archivedAtFilter(status: ListQuestionsQueryDto['status']): Prisma.QuestionWhereInput {
    if (status === undefined) return {};
    if (status === 'ARCHIVED') return { archivedAt: { not: null } };
    return { archivedAt: null };
  }
}
