import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AuditService } from '../operations/audit-event.service.js';
import { ExamReadinessService } from './exam-readiness.service.js';
import {
  EXAM_LIST_INCLUDE,
  loadExamOrThrow,
  toExamListItemResponseDto,
  toExamResponseDto,
} from './exam-mappers.js';
import {
  assertTermBelongsToSession,
  requireSchoolActor,
  requireTeacherAssignedToAnyClass,
  requireTeacherProfileForExam,
  resolveAndValidateClassTargets,
} from './exam-scope.util.js';
import { toExamResponseDtoFresh } from './exam.util.js';
import { loadSchoolResultSettings } from '../platform/school-result-settings.util.js';
import type {
  CancelExamDto,
  CreateExamDto,
  ExamListResponseDto,
  ExamResponseDto,
  ListExamsQueryDto,
  UpdateExamDto,
} from './dto/exam.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

/** `exams.v1` (B11) — exam identity/lifecycle: create, list, get, edit
 * draft, delete draft, cancel, archive, and the `DRAFT → READY` transition.
 * Question selection lives in `ExamQuestionService`; configuration in
 * `ExamConfigurationService` — both mirror this service's own "authorize
 * before revealing, then check DRAFT-only state" ordering exactly. */
/** Matches no membership: evaluates a permission as if the actor did not own the resource. */
const NO_OWNER = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class ExamService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly readiness: ExamReadinessService,
  ) {}

  /** DoD items 1/3: creates the `Exam` + its default `ExamSection` + its
   * `ExamClass` targeting rows in one transaction, only within the actor's
   * real assigned scope (ADR-0013's "at least one targeted class" rule),
   * with `resultPolicy`/`resultDetailVisibility` seeded from the school's
   * current values (F5/B3 gap-closure), and its duration, attempt limit,
   * navigation and randomisation seeded from the school's Assessment Rules
   * (05 §58). With no default duration set, `durationSeconds` starts at `0`
   * — 05 §23 names "zero duration" as one of the readiness checklist's own
   * failure states, so such an exam starts unready until
   * `PUT .../configuration` sets it. */
  async create(
    schoolId: string,
    actor: AuthorizedActor,
    dto: CreateExamDto,
    auditCtx: ActorContext,
  ): Promise<ExamResponseDto> {
    const schoolActor = requireSchoolActor(actor);
    const teacherProfile = await requireTeacherProfileForExam(schoolId, schoolActor.membershipId);

    const subject = await withTenant(prisma, schoolId, (tx) =>
      tx.subject.findFirst({
        where: { schoolId, id: dto.subjectId },
        select: { id: true, departmentId: true },
      }),
    );
    if (!subject) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Subject not found.' });
    }

    await withTenant(prisma, schoolId, (tx) =>
      assertTermBelongsToSession(tx, {
        schoolId,
        academicTermId: dto.academicTermId,
        academicSessionId: dto.academicSessionId,
      }),
    );

    const resolvedClasses = await withTenant(prisma, schoolId, (tx) =>
      resolveAndValidateClassTargets(tx, {
        schoolId,
        subjectId: dto.subjectId,
        academicSessionId: dto.academicSessionId,
        classIds: dto.classIds,
      }),
    );

    await requireTeacherAssignedToAnyClass(this.authz, actor, 'exam.create', {
      schoolId,
      teacherProfileId: teacherProfile.id,
      candidateClassSubjectIds: resolvedClasses.map((c) => c.classSubjectId),
    });

    const school = await withTenant(prisma, schoolId, (tx) =>
      tx.school.findUniqueOrThrow({
        where: { id: schoolId },
        select: {
          resultPolicy: true,
          resultDetailVisibility: true,
          defaultExamDurationSeconds: true,
          defaultAttemptLimit: true,
          defaultNavigationPolicy: true,
          defaultRandomizeQuestions: true,
          defaultRandomizeOptions: true,
        },
      }),
    );

    const examId = await withTenant(prisma, schoolId, async (tx) => {
      const exam = await tx.exam.create({
        data: {
          schoolId,
          academicSessionId: dto.academicSessionId,
          academicTermId: dto.academicTermId,
          subjectId: dto.subjectId,
          departmentId: subject.departmentId,
          title: dto.title,
          examType: dto.examType,
          durationSeconds: school.defaultExamDurationSeconds ?? 0,
          attemptLimit: school.defaultAttemptLimit,
          navigationPolicy: school.defaultNavigationPolicy,
          randomizeQuestions: school.defaultRandomizeQuestions,
          randomizeOptions: school.defaultRandomizeOptions,
          resultPolicy: school.resultPolicy,
          resultDetailVisibility: school.resultDetailVisibility,
          createdByMembershipId: schoolActor.membershipId,
        },
      });
      await tx.examSection.create({ data: { schoolId, examId: exam.id } });
      await tx.examClass.createMany({
        data: resolvedClasses.map((c) => ({
          schoolId,
          examId: exam.id,
          classSubjectId: c.classSubjectId,
        })),
      });
      return exam.id;
    });

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_CREATED',
      entityType: 'Exam',
      entityId: examId,
    });

    return toExamResponseDtoFresh(schoolId, examId);
  }

  async list(
    schoolId: string,
    actor: AuthorizedActor,
    query: ListExamsQueryDto,
  ): Promise<ExamListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const scopeFilter = await this.buildScopeFilter(schoolId, actor);
    const where: Prisma.ExamWhereInput = {
      schoolId,
      ...scopeFilter,
      ...(query.status !== undefined && { status: query.status }),
      ...(query.academicSessionId !== undefined && { academicSessionId: query.academicSessionId }),
      ...(query.academicTermId !== undefined && { academicTermId: query.academicTermId }),
      ...(query.subjectId !== undefined && { subjectId: query.subjectId }),
      ...(query.departmentId !== undefined && { departmentId: query.departmentId }),
      ...(query.teacherMembershipId !== undefined && {
        createdByMembershipId: query.teacherMembershipId,
      }),
      ...(query.classId !== undefined && {
        classes: { some: { classSubject: { classId: query.classId } } },
      }),
    };

    const [exams, total] = await withTenant(prisma, schoolId, (tx) =>
      Promise.all([
        tx.exam.findMany({
          where,
          include: EXAM_LIST_INCLUDE,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.exam.count({ where }),
      ]),
    );

    return { exams: exams.map(toExamListItemResponseDto), total, page, pageSize };
  }

  async get(schoolId: string, actor: AuthorizedActor, id: string): Promise<ExamResponseDto> {
    const exam = await loadExamOrThrow(schoolId, id);
    const resource = await this.resolveViewResourceContext(schoolId, actor, exam);
    const decision = await this.authz.evaluate(actor, 'exam.viewAll', resource);
    if (!decision.allowed && !this.isCreator(actor, exam)) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Exam not found.' });
    }
    return toExamResponseDto(exam, await loadSchoolResultSettings(schoolId));
  }

  /** `GET /v1/exams/:id/available-questions` — the subject/level pair the
   * controller feeds into `QuestionService.list()` to browse approved
   * questions available for binding (05 §20), reusing that service's own
   * existing filter/pagination logic verbatim rather than reimplementing
   * it. Gated by `exam.useApprovedQuestions` specifically (not
   * `exam.viewAll` — same grant shape, but a distinct permission id so the
   * audit/authorization trail attributes the right capability). */
  async assertUsableForQuestionSelection(
    schoolId: string,
    actor: AuthorizedActor,
    id: string,
  ): Promise<{ subjectId: string; level: string | null }> {
    const exam = await loadExamOrThrow(schoolId, id);
    const resource = await this.resolveViewResourceContext(schoolId, actor, exam);
    const decision = await this.authz.evaluate(actor, 'exam.useApprovedQuestions', resource);
    if (!decision.allowed && !this.isCreator(actor, exam)) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Exam not found.' });
    }
    return {
      subjectId: exam.subjectId,
      level: exam.classes[0]?.classSubject.classGroupSession.level ?? null,
    };
  }

  /** DRAFT-only identity edit (title/examType/session/term/subject/class
   * targeting). When `classIds` is given it fully replaces the targeted-
   * class set; when omitted but `subjectId`/`academicSessionId` changes,
   * the EXISTING set is re-validated against the new values instead of
   * being silently cleared (`AGENTS.md` §20 — prefer preserving data over
   * a shortcut) — a mismatch surfaces the same class-agreement error codes
   * `create()` uses, asking the caller to also supply `classIds`. */
  async editDraft(
    schoolId: string,
    actor: AuthorizedActor,
    id: string,
    dto: UpdateExamDto,
    auditCtx: ActorContext,
  ): Promise<ExamResponseDto> {
    const exam = await loadExamOrThrow(schoolId, id);
    const decision = await this.authz.evaluate(actor, 'exam.editDraft', {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to edit this exam.',
      });
    }
    if (exam.status !== 'DRAFT') {
      throw new AppHttpException({
        code: 'EXAM_NOT_DRAFT',
        message: 'This exam can only be edited while in DRAFT.',
      });
    }

    const newSessionId = dto.academicSessionId ?? exam.academicSessionId;
    const newTermId = dto.academicTermId ?? exam.academicTermId;
    const newSubjectId = dto.subjectId ?? exam.subjectId;

    let newDepartmentId = exam.departmentId;
    if (dto.subjectId !== undefined && dto.subjectId !== exam.subjectId) {
      // Extracted to a local const: TS doesn't preserve the `!== undefined`
      // narrowing of `dto.subjectId` across the arrow-function closure
      // boundary passed to withTenant() under exactOptionalPropertyTypes.
      const newSubjectIdForLookup = dto.subjectId;
      const subject = await withTenant(prisma, schoolId, (tx) =>
        tx.subject.findFirst({
          where: { schoolId, id: newSubjectIdForLookup },
          select: { departmentId: true },
        }),
      );
      if (!subject) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Subject not found.' });
      }
      newDepartmentId = subject.departmentId;
    }

    if (dto.academicSessionId !== undefined || dto.academicTermId !== undefined) {
      await withTenant(prisma, schoolId, (tx) =>
        assertTermBelongsToSession(tx, {
          schoolId,
          academicTermId: newTermId,
          academicSessionId: newSessionId,
        }),
      );
    }

    // Conditional updateMany (`WHERE status = 'DRAFT'`) rather than the
    // plain `update()` this originally used — the same concurrency idiom
    // `ready()`/`cancel()`/`archive()` already use. Without it, a `ready()`
    // landing between the DRAFT check above and this write would still be
    // correctly blocked by the migration's own immutability triggers, but
    // as a raw, unhandled Postgres exception (a generic 500) instead of a
    // clean `EXAM_NOT_DRAFT` — found in review, not by any test. The class-
    // target mutation is gated on the same guard, inside the same
    // transaction, so a losing race never reaches the child-table triggers
    // at all.
    const { count } = await withTenant(prisma, schoolId, async (tx) => {
      let resolvedClassSubjectIds: string[] | undefined;
      if (dto.classIds !== undefined) {
        const resolved = await resolveAndValidateClassTargets(tx, {
          schoolId,
          subjectId: newSubjectId,
          academicSessionId: newSessionId,
          classIds: dto.classIds,
        });
        resolvedClassSubjectIds = resolved.map((c) => c.classSubjectId);
      } else if (dto.subjectId !== undefined || dto.academicSessionId !== undefined) {
        const existingClassIds = exam.classes.map((c) => c.classSubject.classId);
        const resolved =
          existingClassIds.length > 0
            ? await resolveAndValidateClassTargets(tx, {
                schoolId,
                subjectId: newSubjectId,
                academicSessionId: newSessionId,
                classIds: existingClassIds,
              })
            : [];
        resolvedClassSubjectIds = resolved.map((c) => c.classSubjectId);
      }

      // Bug audit P1-8: the check above ran against the exam as it stands.
      // A move to another subject or other classes must also be one the
      // actor could have made in the first place.
      await this.assertMayRetarget(schoolId, actor, {
        ownerMembershipId: exam.createdByMembershipId,
        currentDepartmentId: exam.departmentId,
        newDepartmentId,
        newClassSubjectIds: resolvedClassSubjectIds,
      });

      const updated = await tx.exam.updateMany({
        where: { id, status: 'DRAFT' },
        data: {
          ...(dto.academicSessionId !== undefined && { academicSessionId: dto.academicSessionId }),
          ...(dto.academicTermId !== undefined && { academicTermId: dto.academicTermId }),
          ...(dto.subjectId !== undefined && {
            subjectId: dto.subjectId,
            departmentId: newDepartmentId,
          }),
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.examType !== undefined && { examType: dto.examType }),
        },
      });
      if (updated.count === 0) {
        return { count: 0 };
      }

      if (resolvedClassSubjectIds !== undefined) {
        await tx.examClass.deleteMany({ where: { schoolId, examId: id } });
        if (resolvedClassSubjectIds.length > 0) {
          await tx.examClass.createMany({
            data: resolvedClassSubjectIds.map((classSubjectId) => ({
              schoolId,
              examId: id,
              classSubjectId,
            })),
          });
        }
      }
      return { count: updated.count };
    });
    if (count === 0) {
      throw new AppHttpException({
        code: 'EXAM_NOT_DRAFT',
        message: 'This exam is no longer in DRAFT.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_UPDATED',
      entityType: 'Exam',
      entityId: id,
    });

    return toExamResponseDtoFresh(schoolId, id);
  }

  async deleteDraft(
    schoolId: string,
    actor: AuthorizedActor,
    id: string,
    auditCtx: ActorContext,
  ): Promise<void> {
    const exam = await loadExamOrThrow(schoolId, id);
    const decision = await this.authz.evaluate(actor, 'exam.deleteDraft', {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to delete this exam.',
      });
    }
    if (exam.status !== 'DRAFT') {
      throw new AppHttpException({
        code: 'EXAM_NOT_DRAFT',
        message: 'Only a DRAFT exam can be deleted.',
      });
    }

    // Cascades to ExamClass/ExamSection/ExamQuestion (onDelete: Cascade);
    // the QuestionRevision rows themselves are Restrict-protected and
    // untouched.
    await withTenant(prisma, schoolId, (tx) => tx.exam.delete({ where: { id } }));

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_DELETED',
      entityType: 'Exam',
      entityId: id,
    });
  }

  /** DoD item 5: re-runs the exact same readiness check `GET .../readiness`
   * exposes, then transitions atomically via a conditional `updateMany`
   * (`WHERE status = 'DRAFT'`) — the established concurrency idiom (B5's
   * session activation, B7's import confirm/commit, B9's `decide()`): two
   * concurrent calls on the same DRAFT exam can never both succeed. */
  async ready(
    schoolId: string,
    actor: AuthorizedActor,
    id: string,
    auditCtx: ActorContext,
  ): Promise<ExamResponseDto> {
    const exam = await loadExamOrThrow(schoolId, id);
    const decision = await this.authz.evaluate(actor, 'exam.publish', {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to ready this exam.',
      });
    }
    if (exam.status !== 'DRAFT') {
      throw new AppHttpException({
        code: 'EXAM_NOT_DRAFT',
        message: 'Only a DRAFT exam can be made READY.',
      });
    }

    const readinessResult = await this.readiness.evaluate(schoolId, id);
    if (!readinessResult.ready) {
      throw new AppHttpException({
        code: 'EXAM_NOT_READY',
        message: 'This exam does not yet satisfy every readiness check.',
        details: { checks: readinessResult.checks },
      });
    }

    const { count } = await withTenant(prisma, schoolId, (tx) =>
      tx.exam.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'READY' } }),
    );
    if (count === 0) {
      throw new AppHttpException({
        code: 'EXAM_NOT_DRAFT',
        message: 'This exam is no longer in DRAFT.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_READY',
      entityType: 'Exam',
      entityId: id,
    });

    return toExamResponseDtoFresh(schoolId, id);
  }

  /** DoD item 7: only from `DRAFT` or `READY` (07 §14) — an `OPEN` exam's
   * cancellation is a controlled administrative workflow B12's own scope
   * owns (students may already have attempts), not this one. Mandatory
   * reason, audited. */
  async cancel(
    schoolId: string,
    actor: AuthorizedActor,
    id: string,
    dto: CancelExamDto,
    auditCtx: ActorContext,
  ): Promise<ExamResponseDto> {
    const exam = await loadExamOrThrow(schoolId, id);
    const decision = await this.authz.evaluate(actor, 'exam.cancel', {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to cancel this exam.',
      });
    }

    const schoolActor = requireSchoolActor(actor);
    const { count } = await withTenant(prisma, schoolId, (tx) =>
      tx.exam.updateMany({
        where: { id, status: { in: ['DRAFT', 'READY'] } },
        data: {
          status: 'CANCELLED',
          cancelledReason: dto.reason,
          cancelledAt: new Date(),
          cancelledByMembershipId: schoolActor.membershipId,
        },
      }),
    );
    if (count === 0) {
      throw new AppHttpException({
        code: 'EXAM_NOT_CANCELLABLE',
        message: 'Only a DRAFT or READY exam can be cancelled.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_CANCELLED',
      entityType: 'Exam',
      entityId: id,
      reason: dto.reason,
    });

    return toExamResponseDtoFresh(schoolId, id);
  }

  /** Always allowed from DRAFT/READY/CANCELLED — mirrors `QuestionService
   * .archive()`'s own "deactivation/archival never blocked" precedent.
   * OPEN/CLOSED/COMPLETED don't exist yet in this phase (B12/B13 produce
   * them); the guard is real regardless of how a row eventually reaches
   * one. */
  async archive(
    schoolId: string,
    actor: AuthorizedActor,
    id: string,
    auditCtx: ActorContext,
  ): Promise<ExamResponseDto> {
    const exam = await loadExamOrThrow(schoolId, id);
    const decision = await this.authz.evaluate(actor, 'exam.archive', {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to archive this exam.',
      });
    }

    const { count } = await withTenant(prisma, schoolId, (tx) =>
      tx.exam.updateMany({
        where: { id, status: { in: ['DRAFT', 'READY', 'CANCELLED'] } },
        data: { status: 'ARCHIVED', archivedAt: new Date() },
      }),
    );
    if (count === 0) {
      throw new AppHttpException({
        code: 'EXAM_NOT_ARCHIVABLE',
        message: 'This exam cannot be archived from its current status.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_ARCHIVED',
      entityType: 'Exam',
      entityId: id,
    });

    return toExamResponseDtoFresh(schoolId, id);
  }

  /** `exam.viewAll`/`exam.useApprovedQuestions` are graded `ASSIGNED` for
   * TEACHER, not `OWNED` — so, on their own, they deny a teacher who
   * authored an exam but was later reassigned away from every one of its
   * targeted classes, even though `list()`'s own `buildScopeFilter` always
   * keeps such an exam visible in the list (a deliberate "safe superset,"
   * per its own comment) and every `OWNED`-gated mutation (`editDraft`,
   * `addQuestions`, `ready`, `cancel`, `archive`, ...) stays reachable to
   * them regardless. Without this fallback, the exam would appear in the
   * list but 404 on open — a real inconsistency found in review, not by any
   * test. `get()`/`assertUsableForQuestionSelection()` both check this
   * alongside the real `evaluate()` decision, so authorship alone is always
   * enough to view (never to configure/publish/etc. — those still go
   * through the real `OWNED` grant on their own permission id). */
  /**
   * `editDraft` is OWNED for a Teacher and DEPARTMENT for an HOD, both
   * evaluated against the exam's current subject. Moving the exam is held
   * to the rules that applied when it was created:
   * - a new department must be inside the actor's scope (an HOD cannot
   *   move an exam into another department's subject);
   * - new classes must include one the actor teaches, as `create()`
   *   requires, unless the actor holds the exam by school or department
   *   scope rather than only by owning it.
   */
  private async assertMayRetarget(
    schoolId: string,
    actor: AuthorizedActor,
    params: {
      ownerMembershipId: string;
      currentDepartmentId: string | null;
      newDepartmentId: string | null;
      newClassSubjectIds: string[] | undefined;
    },
  ): Promise<void> {
    const forbidden = () =>
      new AppHttpException({
        code: 'EXAM_OUT_OF_SCOPE',
        message: 'You can only move this exam to subjects and classes within your own scope.',
      });

    if (params.newDepartmentId !== params.currentDepartmentId) {
      const decision = await this.authz.evaluate(actor, 'exam.editDraft', {
        schoolId,
        ownerMembershipId: params.ownerMembershipId,
        ...(params.newDepartmentId !== null && { departmentId: params.newDepartmentId }),
      });
      if (!decision.allowed) throw forbidden();
    }

    const newClassSubjectIds = params.newClassSubjectIds;
    if (newClassSubjectIds === undefined) return;

    // Allowed without owning the exam: School Admin, Moderator, or the HOD of
    // the exam's (new) department. They need no teaching assignment. The nil
    // owner makes OWNED fail (it passes when no owner is given at all).
    const byScope = await this.authz.evaluate(actor, 'exam.editDraft', {
      schoolId,
      ownerMembershipId: NO_OWNER,
      ...(params.newDepartmentId !== null && { departmentId: params.newDepartmentId }),
    });
    if (byScope.allowed) return;

    const schoolActor = requireSchoolActor(actor);
    const profile = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.findUnique({
        where: {
          schoolId_membershipId: { schoolId, membershipId: schoolActor.membershipId },
        },
        select: { id: true },
      }),
    );
    if (!profile) throw forbidden();
    const assignment = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherAssignment.findFirst({
        where: {
          schoolId,
          teacherProfileId: profile.id,
          status: 'ACTIVE',
          classSubjectId: { in: newClassSubjectIds },
        },
        select: { id: true },
      }),
    );
    if (!assignment) throw forbidden();
  }

  private isCreator(actor: AuthorizedActor, exam: { createdByMembershipId: string }): boolean {
    return actor.kind === 'SCHOOL' && actor.membershipId === exam.createdByMembershipId;
  }

  /** Builds the `ResourceContext` `get()`'s `exam.viewAll` check needs —
   * `departmentId` (HOD DEPARTMENT) plus a best-effort `classSubjectId`
   * (TEACHER ASSIGNED, resolved against ANY of the exam's own targeted
   * classes — mirrors `QuestionService.resolveResourceContext`'s own
   * precedent, widened from one class to N the same way
   * `requireTeacherAssignedToAnyClass` widens creation's check). Authorship
   * alone isn't encoded here — see `isCreator()`'s own doc comment for why
   * that's checked as a separate fallback by each caller instead. */
  private async resolveViewResourceContext(
    schoolId: string,
    actor: AuthorizedActor,
    exam: {
      createdByMembershipId: string;
      departmentId: string | null;
      classes: { classSubjectId: string }[];
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
        const examClassSubjectIds = exam.classes.map((c) => c.classSubjectId);
        const assignment =
          examClassSubjectIds.length > 0
            ? await withTenant(prisma, schoolId, (tx) =>
                tx.teacherAssignment.findFirst({
                  where: {
                    schoolId,
                    teacherProfileId: teacherProfile.id,
                    status: 'ACTIVE',
                    classSubjectId: { in: examClassSubjectIds },
                  },
                  select: { classSubjectId: true },
                }),
              )
            : null;
        if (assignment) classSubjectId = assignment.classSubjectId;
      }
    }

    return {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
      ...(classSubjectId !== undefined && { classSubjectId }),
    };
  }

  /** Role-based server-side scoping for `list()` — mirrors `QuestionService
   * .buildScopeFilter()`'s own precedent exactly (a per-row `evaluate()`
   * call would be too slow for a list). TEACHER additionally always sees
   * their own authored exams regardless of current assignment (an exam
   * they created stays visible to them even if later reassigned away from
   * every one of its targeted classes) — a safe superset, since it's their
   * own resource either way. */
  private async buildScopeFilter(
    schoolId: string,
    actor: AuthorizedActor,
  ): Promise<Prisma.ExamWhereInput> {
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
      return { departmentId: { in: departmentIds } };
    }
    if (actor.roles.includes('TEACHER')) {
      const teacherProfile = await withTenant(prisma, schoolId, (tx) =>
        tx.teacherProfile.findUnique({
          where: { schoolId_membershipId: { schoolId, membershipId: actor.membershipId } },
          select: { id: true },
        }),
      );
      if (!teacherProfile) return { createdByMembershipId: actor.membershipId };
      const assignments = await withTenant(prisma, schoolId, (tx) =>
        tx.teacherAssignment.findMany({
          where: { schoolId, teacherProfileId: teacherProfile.id, status: 'ACTIVE' },
          select: { classSubjectId: true },
        }),
      );
      const classSubjectIds = assignments.map((a) => a.classSubjectId);
      return {
        OR: [
          { createdByMembershipId: actor.membershipId },
          ...(classSubjectIds.length > 0
            ? [{ classes: { some: { classSubjectId: { in: classSubjectIds } } } }]
            : []),
        ],
      };
    }
    return { id: { in: [] } };
  }
}
