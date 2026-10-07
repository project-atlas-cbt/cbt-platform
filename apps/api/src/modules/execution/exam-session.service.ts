import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AuditService } from '../operations/audit-event.service.js';
import { NotificationService } from '../notification-center/notification.service.js';
import { requireSchoolActor } from '../questions/question-scope.util.js';
import {
  EXAM_SESSION_WITH_EXAM_INCLUDE,
  loadExamSessionOrThrow,
  loadParentExamOrThrow,
  resolveMembershipDisplayNames,
  toExamSessionResponseDto,
} from './exam-control-mappers.js';
import { ExamControlStreamService } from './exam-control-stream.service.js';
import type { ExamSessionResponseDto, OpenExamSessionDto } from './dto/exam-session.dto.js';
import { ExamMediaPrecacheService } from './media-precache/exam-media-precache.service.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

/**
 * `ExamSession`'s own create/close/reopen — session-level, distinct from
 * `ExamLifecycleService`'s exam-level close/reopen. Confirmed product
 * decision (2026-09-04): multiple `ExamSession` rows may be `OPEN`
 * simultaneously for one exam (parallel labs) — nothing here serializes on
 * "one open session at a time."
 */
@Injectable()
export class ExamSessionService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly stream: ExamControlStreamService,
    private readonly precache: ExamMediaPrecacheService,
  ) {}

  /**
   * DoD items 1/2/3/4: creates the session, and — only under
   * `OPEN_TO_ELIGIBLE` — bulk-authorizes every currently eligible student
   * for the exam's targeted classes in the same transaction (ADR-0006:
   * participant rows are ALWAYS written, never skipped). The exam's own
   * `READY → OPEN` transition is claimed via a conditional `updateMany`
   * whose `count` — not a pre-transaction status snapshot — decides whether
   * `EXAM_OPENED` fires, so two sessions opened concurrently against a
   * `READY` exam can never both be credited with "opening" it (DoD's own
   * concurrency requirement): exactly one wins the transition, both
   * sessions are still created.
   */
  async open(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    dto: OpenExamSessionDto,
    auditCtx: ActorContext,
  ): Promise<ExamSessionResponseDto> {
    const exam = await loadParentExamOrThrow(schoolId, examId);
    const decision = await this.authz.evaluate(actor, 'examAdmin.controlCenter', {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      examId: exam.id,
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to open a session for this exam.',
      });
    }
    if (exam.status !== 'READY' && exam.status !== 'OPEN') {
      // A fast-fail UX guard only, using the pre-transaction read above —
      // NOT a transactional guarantee on its own. The lock-protected
      // re-check inside the transaction below is what actually prevents a
      // session being created against an exam a concurrent close()/
      // complete() has since moved past READY/OPEN.
      throw new AppHttpException({
        code: 'EXAM_NOT_OPENABLE',
        message:
          'This exam must be READY or OPEN to open a session — reopen it first if it is CLOSED.',
      });
    }

    const schoolActor = requireSchoolActor(actor);

    const openResult = await withTenant(prisma, schoolId, async (tx) => {
      // Serializes against ExamCompletionService.complete()'s own
      // identical `SELECT ... FOR UPDATE` on this same exam row
      // (ADR-0031's own reserved pattern for exactly this class of
      // cross-statement race — see the spike's own comment). Found in
      // review: without this lock and re-check, a session opened between
      // complete()'s own precondition reads and its final write could be
      // swept into COMPLETED without this session's own (possibly
      // bulk-authorized) participants ever being accounted for in the
      // absentee determination, and — independently — a session could be
      // created against an exam a concurrent close() had already moved to
      // CLOSED, since the earlier check above reads outside any lock.
      const [locked] = await tx.$queryRaw<{ status: string }[]>`
          SELECT status FROM exams WHERE id = ${examId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE
        `;
      if (!locked || (locked.status !== 'READY' && locked.status !== 'OPEN')) {
        return { blocked: true as const };
      }
      // B19 closes an academic session only when it has no active exams.
      // Recheck the parent session while the exam row is locked so an exam
      // session cannot be opened after a concurrent rollover has closed it.
      const [academicSession] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM academic_sessions
        WHERE id = ${exam.academicSessionId}::uuid AND school_id = ${schoolId}::uuid
        FOR UPDATE
      `;
      if (academicSession?.status !== 'CURRENT') {
        return { blocked: true as const, reason: 'ACADEMIC_SESSION_NOT_CURRENT' as const };
      }

      const claim = await tx.exam.updateMany({
        where: { id: examId, status: 'READY' },
        data: { status: 'OPEN' },
      });

      const session = await tx.examSession.create({
        data: {
          schoolId,
          examId,
          sessionType: dto.sessionType ?? 'STANDARD',
          openedByMembershipId: schoolActor.membershipId,
        },
      });

      let authorized: string[] = [];
      if (exam.accessMode === 'OPEN_TO_ELIGIBLE') {
        const targets = await tx.examClass.findMany({
          where: { schoolId, examId },
          select: { classSubjectId: true, classSubject: { select: { classId: true } } },
        });
        const classIds = targets.map((t) => t.classSubject.classId);
        const classSubjectIds = targets.map((t) => t.classSubjectId);

        if (classIds.length > 0) {
          const enrollments = await tx.studentEnrollment.findMany({
            where: {
              schoolId,
              academicSessionId: exam.academicSessionId,
              status: 'ACTIVE',
              classId: { in: classIds },
            },
            select: { id: true, studentProfileId: true },
          });
          const enrollmentIds = enrollments.map((e) => e.id);
          const registrations =
            enrollmentIds.length === 0
              ? []
              : await tx.studentSubjectRegistration.findMany({
                  where: {
                    schoolId,
                    studentEnrollmentId: { in: enrollmentIds },
                    classSubjectId: { in: classSubjectIds },
                    status: 'REGISTERED',
                  },
                  select: { studentEnrollmentId: true },
                });
          const registeredEnrollmentIds = new Set(registrations.map((r) => r.studentEnrollmentId));
          authorized = [
            ...new Set(
              enrollments
                .filter((e) => registeredEnrollmentIds.has(e.id))
                .map((e) => e.studentProfileId),
            ),
          ];

          if (authorized.length > 0) {
            await tx.examSessionParticipant.createMany({
              data: authorized.map((studentProfileId) => ({
                schoolId,
                examSessionId: session.id,
                studentProfileId,
                // No human authorizer — the eligibility predicate itself
                // is the authority for a bulk OPEN_TO_ELIGIBLE sweep.
              })),
              skipDuplicates: true,
            });
          }
        }
      }

      return {
        blocked: false as const,
        sessionId: session.id,
        wonExamTransition: claim.count > 0,
        authorizedProfileIds: authorized,
      };
    });

    if (openResult.blocked) {
      // Bug audit P3-8: say the real reason when the exam itself is fine.
      if ('reason' in openResult && openResult.reason === 'ACADEMIC_SESSION_NOT_CURRENT') {
        throw new AppHttpException({
          code: 'EXAM_NOT_OPENABLE',
          message:
            "This exam belongs to an academic session that isn't the current one, so it can't be opened yet.",
        });
      }
      throw new AppHttpException({
        code: 'EXAM_NOT_OPENABLE',
        message:
          'This exam must be READY or OPEN to open a session — reopen it first if it is CLOSED.',
      });
    }
    const { sessionId, wonExamTransition, authorizedProfileIds } = openResult;

    if (wonExamTransition) {
      await this.audit.record({
        schoolId,
        actorUserId: auditCtx.actorUserId,
        actorRole: auditCtx.actorRole,
        action: 'EXAM_OPENED',
        entityType: 'Exam',
        entityId: examId,
      });
    }
    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_SESSION_OPENED',
      entityType: 'ExamSession',
      entityId: sessionId,
      metadata: { examId, authorizedCount: authorizedProfileIds.length },
    });
    await this.stream.publishUpdate(schoolId, examId);
    // F20 (ADR-0021 amendment): start encrypting the paper's media the moment
    // a lab session opens, so students can pre-cache before the bell.
    // Best-effort — the manifest endpoint enqueues lazily as a backstop.
    await this.precache.requestEncryption(schoolId, examId);

    // Best-effort, outside the write transaction (NotificationService.record
    // is itself best-effort and must never fail the caller's primary
    // action) — one EXAM_OPENED notification per newly-authorized student.
    if (authorizedProfileIds.length > 0) {
      const students = await withTenant(prisma, schoolId, (tx) =>
        tx.studentProfile.findMany({
          where: { schoolId, id: { in: authorizedProfileIds } },
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
          relatedEntityId: examId,
        });
      }
    }

    const created = await withTenant(prisma, schoolId, (tx) =>
      tx.examSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: EXAM_SESSION_WITH_EXAM_INCLUDE,
      }),
    );
    const names = await resolveMembershipDisplayNames(schoolId, [
      created.openedByMembershipId,
      created.closedByMembershipId,
    ]);
    return toExamSessionResponseDto(created, names);
  }

  /** ADR-0009: the entirety of "Pause" — stops new starts, running attempts
   * (once B13 ships them) continue unaffected. `exam.closeNewAttempts` is
   * checked as representative of `exam.pause` too — see that permission
   * row's own comment. */
  async close(
    schoolId: string,
    actor: AuthorizedActor,
    examSessionId: string,
    auditCtx: ActorContext,
  ): Promise<ExamSessionResponseDto> {
    const session = await loadExamSessionOrThrow(schoolId, examSessionId);
    const decision = await this.authz.evaluate(actor, 'exam.closeNewAttempts', {
      schoolId,
      ownerMembershipId: session.exam.createdByMembershipId,
      examId: session.exam.id,
      ...(session.exam.departmentId !== null && { departmentId: session.exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to close this session.',
      });
    }

    const schoolActor = requireSchoolActor(actor);
    const { count } = await withTenant(prisma, schoolId, (tx) =>
      tx.examSession.updateMany({
        where: { id: examSessionId, status: 'OPEN' },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedByMembershipId: schoolActor.membershipId,
        },
      }),
    );
    if (count === 0) {
      throw new AppHttpException({
        code: 'EXAM_SESSION_NOT_OPEN',
        message: 'This session is not currently OPEN.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_SESSION_CLOSED',
      entityType: 'ExamSession',
      entityId: examSessionId,
    });
    await this.stream.publishUpdate(schoolId, session.examId);

    const updated = await withTenant(prisma, schoolId, (tx) =>
      tx.examSession.findUniqueOrThrow({
        where: { id: examSessionId },
        include: EXAM_SESSION_WITH_EXAM_INCLUDE,
      }),
    );
    const names = await resolveMembershipDisplayNames(schoolId, [
      updated.openedByMembershipId,
      updated.closedByMembershipId,
    ]);
    return toExamSessionResponseDto(updated, names);
  }

  /** ADR-0009: "Resume" — the only way a CLOSED session accepts new starts
   * again. Never auto-reopens the parent exam if it too is CLOSED — that's
   * `ExamLifecycleService.reopenExam()`'s own, separate action. */
  async reopen(
    schoolId: string,
    actor: AuthorizedActor,
    examSessionId: string,
    auditCtx: ActorContext,
  ): Promise<ExamSessionResponseDto> {
    const session = await loadExamSessionOrThrow(schoolId, examSessionId);
    const decision = await this.authz.evaluate(actor, 'exam.reopen', {
      schoolId,
      ownerMembershipId: session.exam.createdByMembershipId,
      examId: session.exam.id,
      ...(session.exam.departmentId !== null && { departmentId: session.exam.departmentId }),
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to reopen this session.',
      });
    }
    if (session.exam.status !== 'OPEN') {
      throw new AppHttpException({
        code: 'EXAM_NOT_OPEN',
        message:
          'The parent exam must be OPEN before a session can be reopened — reopen the exam first.',
      });
    }

    const { count } = await withTenant(prisma, schoolId, (tx) =>
      tx.examSession.updateMany({
        where: { id: examSessionId, status: 'CLOSED' },
        data: { status: 'OPEN', reopenedAt: new Date() },
      }),
    );
    if (count === 0) {
      throw new AppHttpException({
        code: 'EXAM_SESSION_NOT_CLOSED',
        message: 'This session is not currently CLOSED.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_SESSION_REOPENED',
      entityType: 'ExamSession',
      entityId: examSessionId,
    });
    await this.stream.publishUpdate(schoolId, session.examId);

    const updated = await withTenant(prisma, schoolId, (tx) =>
      tx.examSession.findUniqueOrThrow({
        where: { id: examSessionId },
        include: EXAM_SESSION_WITH_EXAM_INCLUDE,
      }),
    );
    const names = await resolveMembershipDisplayNames(schoolId, [
      updated.openedByMembershipId,
      updated.closedByMembershipId,
    ]);
    return toExamSessionResponseDto(updated, names);
  }
}
