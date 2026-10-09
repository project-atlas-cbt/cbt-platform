import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import { formalName, sortByPersonName, type Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AuditService } from '../operations/audit-event.service.js';
import { NotificationService } from '../notification-center/notification.service.js';
import { requireSchoolActor } from '../questions/question-scope.util.js';
import { loadExamOrThrow } from '../exams/exam-mappers.js';
import { evaluateExamEligibility } from './exam-eligibility.util.js';
import { PERSON_NAME_SELECT, loadExamSessionOrThrow } from './exam-control-mappers.js';
import { ExamControlStreamService } from './exam-control-stream.service.js';
import type {
  AuthorizeParticipantsDto,
  AuthorizeParticipantsResponseDto,
  EligibleStudentsResponseDto,
  RevokeParticipantDto,
} from './dto/exam-session.dto.js';
import type { GrantExtraTimeDto, GrantLargerTextDto } from './dto/attempt.dto.js';
import { computePendingAbsences } from './pending-absences.util.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

/**
 * X-13/this phase's own Security section: revoking access is permitted only
 * before an attempt starts; afterwards the operator is directed to
 * invalidation (B14's mechanism — `examAdmin.invalidateAttempt` stays
 * `awaitingResource` there). B13 supersedes the B12-era stub (which always
 * returned `false`, no `ExamAttempt` existing yet) with the real check —
 * any attempt at all for this (session, student), regardless of its
 * current state: even a since-`SUBMITTED`/`INVALIDATED` attempt means the
 * student genuinely started, so a plain revoke is still the wrong tool.
 *
 * Takes an already-open `tx`, deliberately — see `revoke()`'s own comment
 * for why this must run in the SAME transaction as the revocation write
 * (Found in review, B13 gap closure), not its own separate one.
 */
async function hasStartedAttempt(
  tx: Prisma.TransactionClient,
  schoolId: string,
  examSessionId: string,
  studentProfileId: string,
): Promise<boolean> {
  const count = await tx.examAttempt.count({
    where: { schoolId, examSessionId, studentProfileId },
  });
  return count > 0;
}

/** Batch authorization/revocation (DoD items 2/3/4/7) and the eligible-
 * students roster (`GET /eligible-students`) — all three share the same
 * `evaluateExamEligibility` predicate (ADR-0006/A-04). */
@Injectable()
export class ExamSessionParticipantService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly stream: ExamControlStreamService,
  ) {}

  async authorize(
    schoolId: string,
    actor: AuthorizedActor,
    examSessionId: string,
    dto: AuthorizeParticipantsDto,
    auditCtx: ActorContext,
  ): Promise<AuthorizeParticipantsResponseDto> {
    const session = await loadExamSessionOrThrow(schoolId, examSessionId);
    const decision = await this.authz.evaluate(actor, 'examAdmin.allowStudent', {
      schoolId,
      ownerMembershipId: session.exam.createdByMembershipId,
      examId: session.exam.id,
      ...(session.exam.departmentId !== null && { departmentId: session.exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to authorize students for this session.',
      });
    }
    // DoD item 4: allowed while OPEN or CLOSED — closing only stops new
    // attempt *starts*, not authorization bookkeeping for the next batch.
    if (session.status !== 'OPEN' && session.status !== 'CLOSED') {
      throw new AppHttpException({
        code: 'EXAM_SESSION_NOT_AUTHORIZABLE',
        message: 'This session can no longer be authorized (it is COMPLETED or CANCELLED).',
      });
    }

    const exam = await loadExamOrThrow(schoolId, session.examId);
    const schoolActor = requireSchoolActor(actor);
    const now = new Date();

    const { results, newlyAuthorized } = await withTenant(prisma, schoolId, async (tx) => {
      const outcomes: { studentProfileId: string; authorized: boolean; failedChecks: string[] }[] =
        [];
      const authorizedIds: string[] = [];
      for (const studentProfileId of dto.studentProfileIds) {
        const eligibility = await evaluateExamEligibility(tx, { schoolId, exam, studentProfileId });
        if (!eligibility.eligible) {
          outcomes.push({
            studentProfileId,
            authorized: false,
            failedChecks: eligibility.failedChecks,
          });
          continue;
        }
        // Read the pre-existing row first — found in review: without this,
        // resubmitting a batch that overlaps an already-AUTHORIZED student
        // (e.g. adding one more name to an existing list) counted that
        // student as "newly authorized" again on every call, sending them a
        // duplicate EXAM_OPENED notification and mislabeling them in the
        // audit event's metadata below. Only a fresh row or a genuine
        // REVOKED->AUTHORIZED transition is "newly" authorized.
        const existing = await tx.examSessionParticipant.findUnique({
          where: {
            schoolId_examSessionId_studentProfileId: { schoolId, examSessionId, studentProfileId },
          },
          select: { status: true },
        });
        const wasAlreadyAuthorized = existing?.status === 'AUTHORIZED';
        await tx.examSessionParticipant.upsert({
          where: {
            schoolId_examSessionId_studentProfileId: { schoolId, examSessionId, studentProfileId },
          },
          create: {
            schoolId,
            examSessionId,
            studentProfileId,
            authorizedByMembershipId: schoolActor.membershipId,
          },
          update: {
            status: 'AUTHORIZED',
            authorizedAt: now,
            authorizedByMembershipId: schoolActor.membershipId,
            revokedAt: null,
            revokedByMembershipId: null,
            revokedReason: null,
          },
        });
        outcomes.push({ studentProfileId, authorized: true, failedChecks: [] });
        if (!wasAlreadyAuthorized) {
          authorizedIds.push(studentProfileId);
        }
      }
      return { results: outcomes, newlyAuthorized: authorizedIds };
    });

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_SESSION_PARTICIPANT_AUTHORIZED',
      entityType: 'ExamSession',
      entityId: examSessionId,
      metadata: { studentProfileIds: newlyAuthorized },
    });
    await this.stream.publishUpdate(schoolId, session.examId);

    if (newlyAuthorized.length > 0) {
      const students = await withTenant(prisma, schoolId, (tx) =>
        tx.studentProfile.findMany({
          where: { schoolId, id: { in: newlyAuthorized } },
          select: { membership: { select: { userId: true } } },
        }),
      );
      for (const student of students) {
        await this.notifications.record({
          schoolId,
          recipientUserId: student.membership.userId,
          type: 'EXAM_OPENED',
          title: 'Exam opened',
          content: `"${exam.title}" is now open for you to attempt.`,
          relatedEntityType: 'Exam',
          relatedEntityId: session.examId,
        });
      }
    }

    return { results };
  }

  async revoke(
    schoolId: string,
    actor: AuthorizedActor,
    examSessionId: string,
    studentProfileId: string,
    dto: RevokeParticipantDto,
    auditCtx: ActorContext,
  ): Promise<void> {
    const session = await loadExamSessionOrThrow(schoolId, examSessionId);
    const decision = await this.authz.evaluate(actor, 'examAdmin.allowStudent', {
      schoolId,
      ownerMembershipId: session.exam.createdByMembershipId,
      examId: session.exam.id,
      ...(session.exam.departmentId !== null && { departmentId: session.exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to revoke access for this session.',
      });
    }

    const schoolActor = requireSchoolActor(actor);
    // Found in review (B13 gap closure): hasStartedAttempt() and the
    // revocation write used to run as two separate, unlocked statements —
    // a start() call landing in the gap between them could create an
    // attempt this check never saw, since start() takes its own advisory
    // lock (school, exam, student), never a lock on
    // exam_session_participants. Both now run inside one transaction,
    // narrowing that window to this transaction's own width.
    const outcome = await withTenant(
      prisma,
      schoolId,
      async (tx): Promise<'STARTED' | 'NOT_AUTHORIZED' | 'OK'> => {
        if (await hasStartedAttempt(tx, schoolId, examSessionId, studentProfileId)) {
          return 'STARTED';
        }

        const { count } = await tx.examSessionParticipant.updateMany({
          where: { schoolId, examSessionId, studentProfileId, status: 'AUTHORIZED' },
          data: {
            status: 'REVOKED',
            revokedAt: new Date(),
            revokedByMembershipId: schoolActor.membershipId,
            revokedReason: dto.reason,
          },
        });
        return count === 0 ? 'NOT_AUTHORIZED' : 'OK';
      },
    );

    if (outcome === 'STARTED') {
      throw new AppHttpException({
        code: 'REVOKE_AFTER_START_REFUSED',
        message:
          'This student has already started their attempt — use invalidation instead of revoking access.',
      });
    }
    if (outcome === 'NOT_AUTHORIZED') {
      throw new AppHttpException({
        code: 'EXAM_SESSION_PARTICIPANT_NOT_AUTHORIZED',
        message: 'This student is not currently authorized for this session.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_SESSION_PARTICIPANT_REVOKED',
      entityType: 'ExamSession',
      entityId: examSessionId,
      reason: dto.reason,
      metadata: { studentProfileId },
    });
    await this.stream.publishUpdate(schoolId, session.examId);
  }

  /** `POST /v1/exam-sessions/:id/participants/:studentId/extra-time` — B13
   * decision 2 (accommodations, X-11). Applies regardless of the
   * participant's current AUTHORIZED/REVOKED status (the grant freezes
   * into `ExamAttempt.durationGrantedSeconds` at a FUTURE attempt-creation
   * time, not at grant time — a currently-revoked student who is later
   * re-authorized still benefits from an earlier grant). */
  async grantExtraTime(
    schoolId: string,
    actor: AuthorizedActor,
    examSessionId: string,
    studentProfileId: string,
    dto: GrantExtraTimeDto,
    auditCtx: ActorContext,
  ): Promise<void> {
    const session = await loadExamSessionOrThrow(schoolId, examSessionId);
    const decision = await this.authz.evaluate(actor, 'examAdmin.grantExtraTime', {
      schoolId,
      ownerMembershipId: session.exam.createdByMembershipId,
      examId: session.exam.id,
      ...(session.exam.departmentId !== null && { departmentId: session.exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to grant extra time for this session.',
      });
    }

    const schoolActor = requireSchoolActor(actor);
    const { count } = await withTenant(prisma, schoolId, (tx) =>
      tx.examSessionParticipant.updateMany({
        where: { schoolId, examSessionId, studentProfileId },
        data: {
          extraTimeSeconds: dto.extraTimeSeconds,
          extraTimeGrantedByMembershipId: schoolActor.membershipId,
          extraTimeGrantedAt: new Date(),
        },
      }),
    );
    if (count === 0) {
      throw new AppHttpException({
        code: 'EXAM_SESSION_PARTICIPANT_NOT_FOUND',
        message: 'This student has no participant row for this session.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'ATTEMPT_EXTRA_TIME_GRANTED',
      entityType: 'ExamSessionParticipant',
      entityId: examSessionId,
      metadata: { studentProfileId, extraTimeSeconds: dto.extraTimeSeconds },
    });
  }

  /** `POST /v1/exam-sessions/:id/participants/:studentId/larger-text` — F20
   * (DoD 3; owner decision 2026-10-03): the LARGER_TEXT accommodation of
   * 07 §9.7, staff-granted and audited exactly like extra time (same
   * permission — both are accommodations an exam administrator grants). A
   * display accommodation: read live into the attempt package, so a grant
   * during a running attempt applies on the student's next resume. */
  async grantLargerText(
    schoolId: string,
    actor: AuthorizedActor,
    examSessionId: string,
    studentProfileId: string,
    dto: GrantLargerTextDto,
    auditCtx: ActorContext,
  ): Promise<void> {
    const session = await loadExamSessionOrThrow(schoolId, examSessionId);
    const decision = await this.authz.evaluate(actor, 'examAdmin.grantExtraTime', {
      schoolId,
      ownerMembershipId: session.exam.createdByMembershipId,
      examId: session.exam.id,
      ...(session.exam.departmentId !== null && { departmentId: session.exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to grant accommodations for this session.',
      });
    }

    const schoolActor = requireSchoolActor(actor);
    const { count } = await withTenant(prisma, schoolId, (tx) =>
      tx.examSessionParticipant.updateMany({
        where: { schoolId, examSessionId, studentProfileId },
        data: {
          largerText: dto.largerText,
          largerTextGrantedByMembershipId: schoolActor.membershipId,
          largerTextGrantedAt: new Date(),
        },
      }),
    );
    if (count === 0) {
      throw new AppHttpException({
        code: 'EXAM_SESSION_PARTICIPANT_NOT_FOUND',
        message: 'This student has no participant row for this session.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'ATTEMPT_LARGER_TEXT_GRANTED',
      entityType: 'ExamSessionParticipant',
      entityId: examSessionId,
      metadata: { studentProfileId, largerText: dto.largerText },
    });
    await this.stream.publishUpdate(schoolId, session.examId);
  }

  /** `GET /v1/exams/:id/eligible-students` — the exam's full targeted-class
   * roster, each row's eligibility computed live and joined against its
   * most-recently-touched participant row (if any) across every one of the
   * exam's sessions.
   *
   * `examAdmin.viewRegisteredStudents` is graded `ASSIGNED` for TEACHER
   * (not `OWNED`, unlike every other `examAdmin.*`/`exam.*` action in this
   * module) — the `ASSIGNED` resolver denies outright when `resource` is
   * present but `classSubjectId` is missing (it only optimistically passes
   * when `resource` is undefined entirely), so this resolves the caller's
   * own assignment against ANY of the exam's targeted classes first,
   * mirroring `ExamService.resolveViewResourceContext()`'s own established
   * B11 pattern for the identical shape of problem. */
  async listEligible(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
  ): Promise<EligibleStudentsResponseDto> {
    const exam = await loadExamOrThrow(schoolId, examId);

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

    const decision = await this.authz.evaluate(actor, 'examAdmin.viewRegisteredStudents', {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      examId: exam.id,
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
      ...(classSubjectId !== undefined && { classSubjectId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: "You do not have permission to view this exam's registered students.",
      });
    }

    const classIds = exam.classes.map((c) => c.classSubject.classId);

    const students = await withTenant(prisma, schoolId, async (tx) => {
      const enrollments =
        classIds.length === 0
          ? []
          : await tx.studentEnrollment.findMany({
              where: {
                schoolId,
                academicSessionId: exam.academicSessionId,
                status: 'ACTIVE',
                classId: { in: classIds },
              },
              select: {
                studentProfile: {
                  select: {
                    id: true,
                    studentId: true,
                    membership: { select: { user: { select: PERSON_NAME_SELECT } } },
                  },
                },
              },
              distinct: ['studentProfileId'],
            });

      const sessions = await tx.examSession.findMany({
        where: { schoolId, examId },
        select: { id: true },
      });
      const sessionIds = sessions.map((s) => s.id);
      const participants =
        sessionIds.length === 0
          ? []
          : await tx.examSessionParticipant.findMany({
              where: { schoolId, examSessionId: { in: sessionIds } },
              orderBy: { authorizedAt: 'desc' },
              select: {
                studentProfileId: true,
                status: true,
                examSessionId: true,
                extraTimeSeconds: true,
                largerText: true,
              },
            });
      const latestParticipantByStudent = new Map<
        string,
        { status: string; examSessionId: string; extraTimeSeconds: number; largerText: boolean }
      >();
      for (const p of participants) {
        if (!latestParticipantByStudent.has(p.studentProfileId)) {
          latestParticipantByStudent.set(p.studentProfileId, {
            status: p.status,
            examSessionId: p.examSessionId,
            extraTimeSeconds: p.extraTimeSeconds ?? 0,
            largerText: p.largerText,
          });
        }
      }

      // The End Examination dialog lists exactly these (bug audit P2-2).
      const pendingAbsentStudents = new Set(
        (await computePendingAbsences(tx, schoolId, examId)).map((p) => p.studentProfileId),
      );

      sortByPersonName(enrollments, (e) => ({
        ...e.studentProfile.membership.user,
        identifier: e.studentProfile.studentId,
      }));
      const rows = [];
      for (const { studentProfile } of enrollments) {
        const eligibility = await evaluateExamEligibility(tx, {
          schoolId,
          exam,
          studentProfileId: studentProfile.id,
        });
        const participant = latestParticipantByStudent.get(studentProfile.id);
        rows.push({
          studentProfileId: studentProfile.id,
          studentIdNumber: studentProfile.studentId,
          studentName: formalName(studentProfile.membership.user),
          eligible: eligibility.eligible,
          failedChecks: eligibility.failedChecks,
          participantStatus:
            (participant?.status as EligibleStudentsResponseDto['students'][number]['participantStatus']) ??
            null,
          examSessionId: participant?.examSessionId ?? null,
          pendingAbsence: pendingAbsentStudents.has(studentProfile.id),
          // F20 (DoD 3): the accommodations staff grant from this roster.
          extraTimeSeconds: participant?.extraTimeSeconds ?? 0,
          largerText: participant?.largerText ?? false,
        });
      }
      return rows;
    });

    return { students };
  }
}
