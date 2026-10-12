import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { searchWords } from '../users/person.util.js';
import { registerNewEnrollment, registeredSubjectIds } from './subject-registration-sync.util.js';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import type {
  CreateRolloverPlanDto,
  RolloverPlanResponseDto,
  RolloverQueryDto,
  UpdateRolloverDecisionsDto,
  UpdateRolloverStructureDto,
} from './dto/rollover.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}
type Tx = Prisma.TransactionClient;
const NEXT_LEVEL: Record<string, string | undefined> = {
  JSS1: 'JSS2',
  JSS2: 'JSS3',
  JSS3: 'SS1',
  SS1: 'SS2',
  SS2: 'SS3',
  SS3: undefined,
};
const CONTINUING = new Set(['PROMOTE', 'REPEAT']);

@Injectable()
export class RolloverService {
  constructor(private readonly audit: AuditService) {}

  async readiness(schoolId: string, sessionId: string) {
    return withTenant(prisma, schoolId, (tx) => this.readinessInTx(tx, schoolId, sessionId));
  }

  private async readinessInTx(tx: Tx, schoolId: string, sessionId: string) {
    const session = await tx.academicSession.findUnique({ where: { id: sessionId } });
    if (!session)
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Academic session not found.' });
    const [activeExams, pendingResults, activeStudents] = await Promise.all([
      tx.exam.count({ where: { schoolId, academicSessionId: sessionId, status: 'OPEN' } }),
      tx.result.count({
        where: { schoolId, state: 'PROCESSING', exam: { academicSessionId: sessionId } },
      }),
      tx.studentEnrollment.count({
        where: { schoolId, academicSessionId: sessionId, status: 'ACTIVE' },
      }),
    ]);
    return {
      sessionId,
      sessionStatus: session.status,
      activeExams,
      pendingResults,
      activeStudents,
      ready: activeExams === 0 && pendingResults === 0,
    };
  }

  async close(schoolId: string, sessionId: string, actor: ActorContext) {
    const closed = await withTenant(prisma, schoolId, async (tx) => {
      await this.lockSession(tx, schoolId, sessionId);
      const readiness = await this.readinessInTx(tx, schoolId, sessionId);
      if (readiness.sessionStatus !== 'CURRENT')
        throw new AppHttpException({
          code: 'VALIDATION_ERROR',
          message: 'Only the current session may be closed through rollover.',
        });
      if (!readiness.ready)
        throw new AppHttpException({
          code: 'VALIDATION_ERROR',
          message: 'Active exams or pending results must be resolved before closing this session.',
        });
      await tx.academicTerm.updateMany({
        where: { schoolId, academicSessionId: sessionId, status: 'CURRENT' },
        data: { status: 'CLOSED' },
      });
      return tx.academicSession.update({ where: { id: sessionId }, data: { status: 'CLOSED' } });
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'ACADEMIC_SESSION_CLOSED',
      entityType: 'AcademicSession',
      entityId: sessionId,
    });
    return closed;
  }

  async createPlan(
    schoolId: string,
    sourceSessionId: string,
    dto: CreateRolloverPlanDto,
    actor: ActorContext,
  ) {
    const plan = await withTenant(prisma, schoolId, async (tx) => {
      await this.lockSession(tx, schoolId, sourceSessionId);
      await this.lockSession(tx, schoolId, dto.targetAcademicSessionId);
      const [source, target, readiness, targetClasses, existing] = await Promise.all([
        tx.academicSession.findUnique({ where: { id: sourceSessionId } }),
        tx.academicSession.findUnique({ where: { id: dto.targetAcademicSessionId } }),
        this.readinessInTx(tx, schoolId, sourceSessionId),
        tx.classGroup.count({
          where: { schoolId, academicSessionId: dto.targetAcademicSessionId },
        }),
        tx.rolloverPlan.findUnique({
          where: {
            schoolId_sourceAcademicSessionId: {
              schoolId,
              sourceAcademicSessionId: sourceSessionId,
            },
          },
        }),
      ]);
      if (!source || !target)
        throw new AppHttpException({
          code: 'NOT_FOUND',
          message: 'Source or target academic session not found.',
        });
      if (existing) {
        if (existing.targetAcademicSessionId !== dto.targetAcademicSessionId)
          throw new AppHttpException({
            code: 'VALIDATION_ERROR',
            message: 'The source session already has a rollover plan for another target.',
          });
        return existing;
      }
      if (source.status !== 'CLOSED' || !readiness.ready)
        throw new AppHttpException({
          code: 'VALIDATION_ERROR',
          message: 'The source session must be closed and ready for rollover.',
        });
      if (!['DRAFT', 'UPCOMING'].includes(target.status) || targetClasses > 0)
        throw new AppHttpException({
          code: 'VALIDATION_ERROR',
          message: 'Target session must be an empty DRAFT or UPCOMING session.',
        });
      if (target.startDate <= source.endDate)
        throw new AppHttpException({
          code: 'VALIDATION_ERROR',
          message: 'Target session must begin after the source session ends.',
        });
      if (
        await tx.rolloverPlan.findUnique({
          where: {
            schoolId_targetAcademicSessionId: { schoolId, targetAcademicSessionId: target.id },
          },
        })
      )
        throw new AppHttpException({
          code: 'VALIDATION_ERROR',
          message: 'The target session is already reserved by another rollover plan.',
        });
      const created = await tx.rolloverPlan.create({
        data: {
          schoolId,
          sourceAcademicSessionId: sourceSessionId,
          targetAcademicSessionId: target.id,
          readinessSnapshot: readiness,
          generatedByUserId: actor.actorUserId,
          status: 'READY',
        },
      });
      const classes = await tx.classGroup.findMany({
        where: { schoolId, academicSessionId: sourceSessionId, status: 'ACTIVE' },
      });
      if (classes.length)
        await tx.rolloverClassDraft.createMany({
          data: classes.map((c) => ({
            schoolId,
            rolloverPlanId: created.id,
            sourceClassId: c.id,
            defaultStreamId: c.defaultStreamId,
            name: c.name,
            level: c.level,
            arm: c.arm,
          })),
        });
      const drafts = await tx.rolloverClassDraft.findMany({
        where: { schoolId, rolloverPlanId: created.id },
      });
      const draftBySource = new Map(drafts.map((d) => [d.sourceClassId, d]));
      const offerings = await tx.classSubject.findMany({
        where: {
          schoolId,
          academicSessionId: sourceSessionId,
          status: 'ACTIVE',
          classGroupSession: { status: 'ACTIVE' },
          subject: { status: 'ACTIVE' },
        },
      });
      if (offerings.length)
        await tx.rolloverOfferingDraft.createMany({
          data: offerings.map((o) => ({
            schoolId,
            rolloverPlanId: created.id,
            sourceClassSubjectId: o.id,
            targetDraftClassId: draftBySource.get(o.classId)!.id,
            subjectId: o.subjectId,
          })),
        });
      const enrollments = await tx.studentEnrollment.findMany({
        where: {
          schoolId,
          academicSessionId: sourceSessionId,
          status: 'ACTIVE',
          classGroupSession: { status: 'ACTIVE' },
        },
        include: { classGroupSession: true },
      });
      if (enrollments.length)
        await tx.rolloverDecision.createMany({
          data: enrollments.map((e) => {
            const proposed = NEXT_LEVEL[e.classGroupSession.level] ? 'PROMOTE' : 'GRADUATE';
            const targetDraft =
              proposed === 'PROMOTE'
                ? drafts.find(
                    (d) =>
                      d.included &&
                      d.level === NEXT_LEVEL[e.classGroupSession.level] &&
                      d.arm === e.classGroupSession.arm &&
                      d.defaultStreamId === e.classGroupSession.defaultStreamId,
                  )
                : undefined;
            return {
              schoolId,
              rolloverPlanId: created.id,
              sourceEnrollmentId: e.id,
              sourceAcademicSessionId: sourceSessionId,
              sourceClassId: e.classId,
              proposedOutcome: proposed,
              outcome: proposed,
              targetDraftClassId: targetDraft?.id ?? null,
              reason:
                proposed === 'GRADUATE'
                  ? 'SYSTEM_FINAL_LEVEL_GRADUATION'
                  : 'SYSTEM_LEVEL_PROGRESSION',
            };
          }),
        });
      const teacherAssignments = await tx.teacherAssignment.findMany({
        where: {
          schoolId,
          academicSessionId: sourceSessionId,
          status: 'ACTIVE',
          teacherProfile: {
            employmentStatus: 'ACTIVE',
            membership: {
              status: 'ACTIVE',
              roleAssignments: { some: { role: 'TEACHER', status: 'ACTIVE' } },
            },
          },
          classSubject: {
            status: 'ACTIVE',
            classGroupSession: { status: 'ACTIVE' },
            subject: { status: 'ACTIVE' },
          },
        },
        include: { teacherProfile: true, classSubject: true },
      });
      if (teacherAssignments.length)
        await tx.rolloverStaffAssignmentDraft.createMany({
          data: teacherAssignments.map((a) => ({
            schoolId,
            rolloverPlanId: created.id,
            assignmentKind: 'TEACHER',
            sourceAssignmentId: a.id,
            membershipId: a.teacherProfile.membershipId,
            targetDraftClassId: draftBySource.get(a.classSubject.classId)?.id ?? null,
            subjectId: a.classSubject.subjectId,
          })),
        });
      const hods = await tx.hODAssignment.findMany({
        where: {
          schoolId,
          academicSessionId: sourceSessionId,
          status: 'ACTIVE',
          membership: {
            status: 'ACTIVE',
            roleAssignments: { some: { role: 'HOD', status: 'ACTIVE' } },
          },
          department: { status: 'ACTIVE' },
        },
      });
      if (hods.length)
        await tx.rolloverStaffAssignmentDraft.createMany({
          data: hods.map((a) => ({
            schoolId,
            rolloverPlanId: created.id,
            assignmentKind: 'HOD',
            sourceAssignmentId: a.id,
            membershipId: a.membershipId,
            departmentId: a.departmentId,
          })),
        });
      return created;
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'ACADEMIC_ROLLOVER_PLAN_GENERATED',
      entityType: 'RolloverPlan',
      entityId: plan.id,
    });
    return this.getPlan(schoolId, plan.id, {});
  }

  async getPlan(
    schoolId: string,
    planId: string,
    query: RolloverQueryDto,
    reader?: { membershipId: string; roles: Role[] },
  ): Promise<RolloverPlanResponseDto> {
    return withTenant(prisma, schoolId, async (tx) => {
      const plan = await tx.rolloverPlan.findUnique({ where: { id: planId } });
      if (!plan)
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Rollover plan not found.' });
      const page = query.page ?? 1,
        pageSize = Math.min(query.pageSize ?? 50, 100);
      const departments = reader?.roles.includes('HOD')
        ? (
            await tx.hODAssignment.findMany({
              where: { schoolId, membershipId: reader.membershipId, status: 'ACTIVE' },
              select: { departmentId: true },
            })
          ).map((a) => a.departmentId)
        : null;
      // ADR-0038: classes no longer carry a department, so an HOD reviews
      // the classes taught a subject of a department they head.
      const allowedClassIds =
        departments === null
          ? null
          : (
              await tx.classGroup.findMany({
                where: {
                  schoolId,
                  academicSessionId: plan.sourceAcademicSessionId,
                  classSubjects: { some: { subject: { departmentId: { in: departments } } } },
                },
                select: { id: true },
              })
            ).map((c) => c.id);
      const sourceClassFilter: Prisma.ClassGroupWhereInput = {
        ...(query.streamId !== undefined && { defaultStreamId: query.streamId }),
        ...(query.sourceLevel !== undefined && {
          level: query.sourceLevel as Prisma.EnumClassLevelFilter,
        }),
      };
      const decisionWhere: Prisma.RolloverDecisionWhereInput = {
        schoolId,
        rolloverPlanId: planId,
        ...(allowedClassIds !== null && { sourceClassId: { in: allowedClassIds } }),
        ...(query.outcome !== undefined && { outcome: query.outcome }),
        ...(query.sourceClassId !== undefined && { sourceClassId: query.sourceClassId }),
        ...((query.streamId !== undefined || query.sourceLevel !== undefined) && {
          sourceClass: { is: sourceClassFilter },
        }),
        ...(query.overriddenOnly && { overriddenAt: { not: null } }),
        ...(searchWords(query.q).length > 0 && {
          sourceEnrollment: {
            is: {
              AND: searchWords(query.q).map((word) => ({
                studentProfile: {
                  OR: [
                    { studentId: { contains: word, mode: 'insensitive' as const } },
                    ...(['firstName', 'middleName', 'lastName'] as const).map((field) => ({
                      membership: {
                        user: { [field]: { contains: word, mode: 'insensitive' as const } },
                      },
                    })),
                  ],
                },
              })),
            },
          },
        }),
      };
      const [total, decisions, classes, offerings, staffAssignments] = await Promise.all([
        tx.rolloverDecision.count({ where: decisionWhere }),
        tx.rolloverDecision.findMany({
          where: decisionWhere,
          orderBy: { id: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            sourceClass: { select: { id: true, name: true, level: true, arm: true } },
            sourceEnrollment: {
              select: {
                id: true,
                studentProfile: {
                  select: {
                    id: true,
                    studentId: true,
                    membership: {
                      select: {
                        id: true,
                        loginIdentifier: true,
                        user: {
                          select: {
                            id: true,
                            firstName: true,
                            middleName: true,
                            lastName: true,
                            displayName: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        tx.rolloverClassDraft.findMany({
          where: {
            schoolId,
            rolloverPlanId: planId,
            ...(allowedClassIds !== null && { sourceClassId: { in: allowedClassIds } }),
          },
        }),
        tx.rolloverOfferingDraft.findMany({ where: { schoolId, rolloverPlanId: planId } }),
        tx.rolloverStaffAssignmentDraft.findMany({ where: { schoolId, rolloverPlanId: planId } }),
      ]);
      const visibleDraftIds = new Set(classes.map((draft) => draft.id));
      return {
        id: plan.id,
        sourceAcademicSessionId: plan.sourceAcademicSessionId,
        targetAcademicSessionId: plan.targetAcademicSessionId,
        status: plan.status,
        version: plan.version,
        readiness: plan.readinessSnapshot as Record<string, unknown>,
        decisions,
        structure: {
          classes,
          offerings:
            departments === null
              ? offerings
              : offerings.filter((draft) => visibleDraftIds.has(draft.targetDraftClassId)),
          staffAssignments:
            departments === null
              ? staffAssignments
              : staffAssignments.filter(
                  (draft) =>
                    (draft.departmentId && departments.includes(draft.departmentId)) ||
                    (draft.targetDraftClassId && visibleDraftIds.has(draft.targetDraftClassId)),
                ),
        },
        pagination: { page, pageSize, total },
      };
    });
  }

  async updateDecisions(
    schoolId: string,
    planId: string,
    dto: UpdateRolloverDecisionsDto,
    actor: ActorContext,
  ) {
    await withTenant(prisma, schoolId, async (tx) => {
      const plan = await this.lockEditablePlan(tx, schoolId, planId, dto.version);
      const [drafts, decisions] = await Promise.all([
        tx.rolloverClassDraft.findMany({
          where: { schoolId, rolloverPlanId: plan.id, included: true },
          select: { id: true, level: true },
        }),
        tx.rolloverDecision.findMany({
          where: {
            schoolId,
            rolloverPlanId: plan.id,
            id: { in: dto.decisions.map((item) => item.decisionId) },
          },
          include: { sourceClass: { select: { level: true } } },
        }),
      ]);
      if (decisions.length !== dto.decisions.length)
        throw new AppHttpException({
          code: 'NOT_FOUND',
          message: 'One or more rollover decisions were not found.',
        });
      const draftById = new Map(drafts.map((draft) => [draft.id, draft]));
      const decisionById = new Map(decisions.map((decision) => [decision.id, decision]));
      for (const change of dto.decisions) {
        const decision = decisionById.get(change.decisionId)!;
        this.validateDecision(
          change.outcome,
          change.targetDraftClassId,
          decision.sourceClass.level,
          draftById,
        );
        await tx.rolloverDecision.update({
          where: { id: change.decisionId },
          data: {
            outcome: change.outcome,
            targetDraftClassId: change.targetDraftClassId ?? null,
            reason: change.reason.trim(),
            overriddenByUserId: actor.actorUserId,
            overriddenAt: new Date(),
          },
        });
      }
      await tx.rolloverPlan.update({ where: { id: plan.id }, data: { version: { increment: 1 } } });
    });
    for (const change of dto.decisions)
      await this.audit.record({
        schoolId,
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        action: 'ACADEMIC_ROLLOVER_DECISION_OVERRIDDEN',
        reason: change.reason.trim(),
        entityType: 'RolloverDecision',
        entityId: change.decisionId,
      });
    return this.getPlan(schoolId, planId, {});
  }

  async updateStructure(
    schoolId: string,
    planId: string,
    dto: UpdateRolloverStructureDto,
    actor: ActorContext,
  ) {
    await withTenant(prisma, schoolId, async (tx) => {
      const plan = await this.lockEditablePlan(tx, schoolId, planId, dto.version);
      await Promise.all([
        this.applyStructureChanges(
          tx.rolloverClassDraft,
          schoolId,
          plan.id,
          dto.classes,
          'included',
        ),
        this.applyStructureChanges(
          tx.rolloverOfferingDraft,
          schoolId,
          plan.id,
          dto.offerings,
          'included',
        ),
        this.applyStructureChanges(
          tx.rolloverStaffAssignmentDraft,
          schoolId,
          plan.id,
          dto.staffAssignments,
          'confirmed',
        ),
      ]);
      await tx.rolloverPlan.update({ where: { id: plan.id }, data: { version: { increment: 1 } } });
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'ACADEMIC_ROLLOVER_STRUCTURE_UPDATED',
      entityType: 'RolloverPlan',
      entityId: planId,
    });
    return this.getPlan(schoolId, planId, {});
  }

  private async applyStructureChanges(
    delegate: { updateMany: (args: never) => Promise<{ count: number }> },
    schoolId: string,
    planId: string,
    changes: { draftId: string; included?: boolean; confirmed?: boolean }[] | undefined,
    field: 'included' | 'confirmed',
  ) {
    for (const change of changes ?? []) {
      const value = field === 'included' ? change.included : change.confirmed;
      const result = await delegate.updateMany({
        where: { schoolId, rolloverPlanId: planId, id: change.draftId },
        data: { [field]: value },
      } as never);
      if (result.count !== 1)
        throw new AppHttpException({
          code: 'NOT_FOUND',
          message: 'Rollover structure draft not found.',
        });
    }
  }

  private validateDecision(
    outcome: string,
    targetDraftClassId: string | null | undefined,
    sourceLevel: string,
    drafts: Map<string, { level: string }>,
  ) {
    if (!CONTINUING.has(outcome)) {
      if (targetDraftClassId)
        throw new AppHttpException({
          code: 'VALIDATION_ERROR',
          message: 'Departing students cannot have a target class.',
        });
      return;
    }
    const target = targetDraftClassId ? drafts.get(targetDraftClassId) : undefined;
    if (!target)
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Continuing students require an included target class draft.',
      });
    if (outcome === 'PROMOTE' && target.level !== NEXT_LEVEL[sourceLevel])
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'A promotion target must be in the next academic level.',
      });
    if (outcome === 'REPEAT' && target.level !== sourceLevel)
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'A repeat target must remain in the same academic level.',
      });
  }

  private async lockSession(tx: Tx, schoolId: string, sessionId: string) {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM academic_sessions WHERE id = ${sessionId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
    if (rows.length !== 1)
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Academic session not found.' });
  }
  private async lockEditablePlan(tx: Tx, schoolId: string, planId: string, version: number) {
    await tx.$queryRaw`SELECT id FROM rollover_plans WHERE id = ${planId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
    const plan = await tx.rolloverPlan.findFirst({ where: { schoolId, id: planId } });
    if (!plan)
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Rollover plan not found.' });
    if (plan.status !== 'READY' || plan.version !== version)
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message:
          'This rollover plan changed or is no longer editable; reload it before continuing.',
      });
    return plan;
  }

  async commit(schoolId: string, planId: string, version: number, actor: ActorContext) {
    await withTenant(prisma, schoolId, async (tx) => {
      const plan = await this.lockEditablePlan(tx, schoolId, planId, version);
      await this.lockSession(tx, schoolId, plan.sourceAcademicSessionId);
      await this.lockSession(tx, schoolId, plan.targetAcademicSessionId);
      const readiness = await this.readinessInTx(tx, schoolId, plan.sourceAcademicSessionId);
      if (!readiness.ready || readiness.sessionStatus !== 'CLOSED')
        throw new AppHttpException({
          code: 'VALIDATION_ERROR',
          message: 'The source session is no longer ready to commit.',
        });
      const [target, targetClasses, targetTerms, draftClasses, draftOfferings, staff, decisions] =
        await Promise.all([
          tx.academicSession.findUnique({ where: { id: plan.targetAcademicSessionId } }),
          tx.classGroup.count({
            where: { schoolId, academicSessionId: plan.targetAcademicSessionId },
          }),
          tx.academicTerm.findMany({
            where: { schoolId, academicSessionId: plan.targetAcademicSessionId },
            orderBy: { sequence: 'asc' },
          }),
          tx.rolloverClassDraft.findMany({
            where: { schoolId, rolloverPlanId: plan.id, included: true },
          }),
          tx.rolloverOfferingDraft.findMany({
            where: { schoolId, rolloverPlanId: plan.id, included: true },
          }),
          tx.rolloverStaffAssignmentDraft.findMany({
            where: { schoolId, rolloverPlanId: plan.id, confirmed: true },
          }),
          tx.rolloverDecision.findMany({
            where: { schoolId, rolloverPlanId: plan.id },
            include: { sourceEnrollment: true, sourceClass: true },
          }),
        ]);
      if (
        !target ||
        !['DRAFT', 'UPCOMING'].includes(target.status) ||
        targetClasses > 0 ||
        targetTerms.length === 0 ||
        targetTerms.some((term) => term.status === 'CURRENT')
      )
        throw new AppHttpException({
          code: 'VALIDATION_ERROR',
          message: 'Target session is no longer an empty, term-configured rollover destination.',
        });
      const classMap = new Map<string, string>();
      for (const draft of draftClasses) {
        const created = await tx.classGroup.create({
          data: {
            schoolId,
            academicSessionId: target.id,
            defaultStreamId: draft.defaultStreamId,
            name: draft.name,
            level: draft.level,
            arm: draft.arm,
          },
        });
        classMap.set(draft.id, created.id);
      }
      // ADR-0038: an offering keeps its kind (compulsory or elective) and
      // its automatic streams into the new session.
      const sourceOfferings = new Map(
        (
          await tx.classSubject.findMany({
            where: { schoolId, id: { in: draftOfferings.map((d) => d.sourceClassSubjectId) } },
            select: { id: true, kind: true, streams: { select: { streamId: true } } },
          })
        ).map((o) => [o.id, o]),
      );
      const offeringMap = new Map<string, string>();
      for (const draft of draftOfferings) {
        const classId = classMap.get(draft.targetDraftClassId);
        if (!classId)
          throw new AppHttpException({
            code: 'VALIDATION_ERROR',
            message: 'An included offering targets an excluded class.',
          });
        const created = await tx.classSubject.create({
          data: {
            schoolId,
            academicSessionId: target.id,
            classId,
            subjectId: draft.subjectId,
            kind: sourceOfferings.get(draft.sourceClassSubjectId)?.kind ?? 'COMPULSORY',
          },
        });
        const streams = sourceOfferings.get(draft.sourceClassSubjectId)?.streams ?? [];
        if (streams.length > 0)
          await tx.classSubjectStream.createMany({
            data: streams.map((s) => ({
              schoolId,
              classSubjectId: created.id,
              streamId: s.streamId,
            })),
          });
        offeringMap.set(`${draft.targetDraftClassId}:${draft.subjectId}`, created.id);
      }
      const draftLevel = new Map(draftClasses.map((draft) => [draft.id, draft]));
      for (const decision of decisions) {
        const sourceEnrollment = decision.sourceEnrollment;
        if (
          sourceEnrollment.status !== 'ACTIVE' ||
          sourceEnrollment.academicSessionId !== plan.sourceAcademicSessionId ||
          sourceEnrollment.classId !== decision.sourceClassId
        )
          throw new AppHttpException({
            code: 'VALIDATION_ERROR',
            message:
              'A source enrollment changed after plan generation; regenerate the rollover plan.',
          });
        this.validateDecision(
          decision.outcome,
          decision.targetDraftClassId,
          decision.sourceClass.level,
          draftLevel,
        );
        const continuing = CONTINUING.has(decision.outcome);
        const oldStatus =
          decision.outcome === 'TRANSFER'
            ? 'TRANSFERRED'
            : decision.outcome === 'WITHDRAW'
              ? 'WITHDRAWN'
              : 'COMPLETED';
        await tx.studentEnrollment.update({
          where: { id: decision.sourceEnrollmentId },
          data: { status: oldStatus, endDate: new Date() },
        });
        if (continuing) {
          const classId = classMap.get(decision.targetDraftClassId!);
          if (!classId)
            throw new AppHttpException({
              code: 'VALIDATION_ERROR',
              message: 'Student target class is excluded.',
            });
          // ADR-0038: a student placed in a streamed arm takes its stream;
          // in a mixed arm they keep the stream they had.
          const enrollment = await tx.studentEnrollment.create({
            data: {
              schoolId,
              studentProfileId: sourceEnrollment.studentProfileId,
              academicSessionId: target.id,
              classId,
              streamId:
                draftLevel.get(decision.targetDraftClassId!)?.defaultStreamId ??
                sourceEnrollment.streamId,
              startDate: new Date(),
            },
          });
          // ADR-0038: the new class's compulsory subjects, plus the subjects
          // the student took last session where the new class offers them.
          await registerNewEnrollment(
            tx,
            schoolId,
            enrollment,
            await registeredSubjectIds(tx, schoolId, sourceEnrollment.id),
          );
        } else if (decision.outcome === 'GRADUATE' || decision.outcome === 'WITHDRAW')
          await tx.studentProfile.update({
            where: { id: sourceEnrollment.studentProfileId },
            data: {
              status: decision.outcome === 'GRADUATE' ? 'GRADUATED' : 'WITHDRAWN',
              ...(decision.outcome === 'GRADUATE' && { graduationDate: new Date() }),
            },
          });
        if (!continuing) {
          const profile = await tx.studentProfile.findUniqueOrThrow({
            where: { id: sourceEnrollment.studentProfileId },
          });
          await tx.roleAssignment.updateMany({
            where: {
              schoolId,
              membershipId: profile.membershipId,
              role: 'STUDENT',
              status: 'ACTIVE',
            },
            data: { status: 'ENDED', effectiveTo: new Date() },
          });
          await tx.schoolMembership.update({
            where: { id: profile.membershipId },
            data: { status: 'ENDED', leftAt: new Date() },
          });
        }
        await tx.rolloverDecision.update({
          where: { id: decision.id },
          data: { committedAt: new Date() },
        });
        await this.audit.recordInTx(tx, {
          schoolId,
          actorUserId: actor.actorUserId,
          actorRole: actor.actorRole,
          action: 'ACADEMIC_ROLLOVER_DECISION_COMMITTED',
          entityType: 'RolloverDecision',
          entityId: decision.id,
        });
      }
      await this.validateConfirmedStaff(tx, schoolId, staff, classMap, offeringMap);
      for (const draft of staff) {
        if (draft.assignmentKind === 'HOD')
          await tx.hODAssignment.create({
            data: {
              schoolId,
              membershipId: draft.membershipId,
              departmentId: draft.departmentId!,
              academicSessionId: target.id,
              startDate: new Date(),
            },
          });
        else {
          const teacher = await tx.teacherProfile.findUniqueOrThrow({
            where: { schoolId_membershipId: { schoolId, membershipId: draft.membershipId } },
          });
          await tx.teacherAssignment.create({
            data: {
              schoolId,
              teacherProfileId: teacher.id,
              classSubjectId: offeringMap.get(`${draft.targetDraftClassId}:${draft.subjectId}`)!,
              academicSessionId: target.id,
              startDate: new Date(),
            },
          });
        }
      }
      await tx.teacherAssignment.updateMany({
        where: { schoolId, academicSessionId: plan.sourceAcademicSessionId, status: 'ACTIVE' },
        data: { status: 'ENDED', endDate: new Date() },
      });
      await tx.hODAssignment.updateMany({
        where: { schoolId, academicSessionId: plan.sourceAcademicSessionId, status: 'ACTIVE' },
        data: { status: 'ENDED', endDate: new Date() },
      });
      await tx.academicSession.update({
        where: { id: plan.sourceAcademicSessionId },
        data: { status: 'ARCHIVED' },
      });
      await tx.academicSession.update({ where: { id: target.id }, data: { status: 'CURRENT' } });
      await tx.academicTerm.update({
        where: { id: targetTerms[0]!.id },
        data: { status: 'CURRENT' },
      });
      await tx.rolloverPlan.update({
        where: { id: plan.id },
        data: {
          status: 'COMMITTED',
          committedAt: new Date(),
          committedByUserId: actor.actorUserId,
          version: { increment: 1 },
        },
      });
      await this.audit.recordInTx(tx, {
        schoolId,
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        action: 'ACADEMIC_ROLLOVER_COMMITTED',
        entityType: 'RolloverPlan',
        entityId: planId,
      });
    });
    return this.getPlan(schoolId, planId, {});
  }

  private async validateConfirmedStaff(
    tx: Tx,
    schoolId: string,
    staff: {
      assignmentKind: string;
      membershipId: string;
      targetDraftClassId: string | null;
      subjectId: string | null;
      departmentId: string | null;
    }[],
    classMap: Map<string, string>,
    offeringMap: Map<string, string>,
  ) {
    for (const draft of staff) {
      if (draft.assignmentKind === 'TEACHER') {
        const teacher = await tx.teacherProfile.findFirst({
          where: {
            schoolId,
            membershipId: draft.membershipId,
            employmentStatus: 'ACTIVE',
            membership: {
              status: 'ACTIVE',
              roleAssignments: { some: { role: 'TEACHER', status: 'ACTIVE' } },
            },
          },
          select: { id: true },
        });
        if (
          !teacher ||
          !draft.targetDraftClassId ||
          !draft.subjectId ||
          !classMap.has(draft.targetDraftClassId) ||
          !offeringMap.has(`${draft.targetDraftClassId}:${draft.subjectId}`)
        )
          throw new AppHttpException({
            code: 'VALIDATION_ERROR',
            message:
              'A confirmed teacher proposal is no longer valid; remove or correct it before commit.',
          });
      } else {
        const hod = await tx.schoolMembership.findFirst({
          where: {
            schoolId,
            id: draft.membershipId,
            status: 'ACTIVE',
            roleAssignments: { some: { role: 'HOD', status: 'ACTIVE' } },
          },
          select: { id: true },
        });
        if (!hod || !draft.departmentId)
          throw new AppHttpException({
            code: 'VALIDATION_ERROR',
            message:
              'A confirmed HOD proposal is no longer valid; remove or correct it before commit.',
          });
      }
    }
  }
}
