import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { AuditService } from '../operations/audit-event.service.js';
import { requireSchoolActor } from '../questions/question-scope.util.js';
import type { ExamResponseDto } from '../exams/dto/exam.dto.js';
import { toExamResponseDtoFresh } from '../exams/exam.util.js';
import { loadParentExamOrThrow } from './exam-control-mappers.js';
import { ExamControlStreamService } from './exam-control-stream.service.js';
import type { CompleteExamDto } from './dto/exam-control-center.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

type CompleteOutcome =
  | { kind: 'SESSIONS_STILL_OPEN' }
  | { kind: 'ATTEMPTS_STILL_IN_PROGRESS' }
  | { kind: 'STALE_ABSENTEE_LIST' }
  | { kind: 'NOT_COMPLETABLE' }
  | { kind: 'OK'; absentCount: number };

/** B13 supersedes the B12-era stub (which always returned 0, no
 * `ExamAttempt` existing yet) with the real check — A-14's "zero
 * IN_PROGRESS attempts" precondition for End Examination. */
async function countInProgressAttempts(schoolId: string, examId: string): Promise<number> {
  return withTenant(prisma, schoolId, (tx) =>
    tx.examAttempt.count({ where: { schoolId, examId, state: 'IN_PROGRESS' } }),
  );
}

/** `POST /v1/exams/:id/complete` — End Examination (A-14): an explicit,
 * audited, never-automatic operator action. Every check and write below
 * runs inside one transaction so the "no session left OPEN" / "absentee
 * list matches the server's own current pending set" preconditions can
 * never be raced by a session opening or a participant being authorized
 * between the check and the write. */
@Injectable()
export class ExamCompletionService {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly stream: ExamControlStreamService,
  ) {}

  async complete(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
    dto: CompleteExamDto,
    auditCtx: ActorContext,
  ): Promise<ExamResponseDto> {
    const exam = await loadParentExamOrThrow(schoolId, examId);
    const resource = {
      schoolId,
      ownerMembershipId: exam.createdByMembershipId,
      examId: exam.id,
      ...(exam.departmentId !== null && { departmentId: exam.departmentId }),
    };
    const controlDecision = await this.authz.evaluate(actor, 'examAdmin.controlCenter', resource);
    if (!controlDecision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to end this examination.',
      });
    }
    const absenceDecision = await this.authz.evaluate(actor, 'examAdmin.markAbsence', resource);
    if (!absenceDecision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to confirm absences for this exam.',
      });
    }

    if ((await countInProgressAttempts(schoolId, examId)) > 0) {
      // Fast-fail only — deliberately NOT the real guarantee. See the
      // re-check inside the transaction below for why this alone isn't
      // sufficient.
      throw new AppHttpException({
        code: 'EXAM_HAS_IN_PROGRESS_ATTEMPTS',
        message: 'This exam still has attempts in progress.',
      });
    }

    const schoolActor = requireSchoolActor(actor);
    const submittedIds = new Set(dto.confirmedAbsentStudentProfileIds);

    const outcome = await withTenant(prisma, schoolId, async (tx): Promise<CompleteOutcome> => {
      // Serializes against ExamSessionService.open()'s own identical
      // `SELECT ... FOR UPDATE` on this same exam row — see that method's
      // own comment for the full race this closes in both directions.
      // Found in review: without this lock, a session opened by a
      // concurrent request after the reads below (but while this exam is
      // still OPEN, which open() only requires) could be swept into
      // COMPLETED by the final writes further down without its own
      // participants ever being accounted for here.
      await tx.$queryRaw`
        SELECT id FROM exams WHERE id = ${examId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE
      `;

      // Found in review (B13 gap closure): the pre-transaction check above
      // is a fast-fail only, not the real guarantee — AttemptLifecycleService
      // .start() does not participate in this same exam-row lock (it takes
      // its own advisory lock scoped to (school, exam, student) instead),
      // so a fresh attempt can be created in the window between that
      // pre-check and this lock's acquisition. Re-verified here, under the
      // lock, exactly like openSessionCount immediately below — this is
      // what makes the real guarantee hold regardless of that gap.
      const inProgressAttemptCount = await tx.examAttempt.count({
        where: { schoolId, examId, state: 'IN_PROGRESS' },
      });
      if (inProgressAttemptCount > 0) return { kind: 'ATTEMPTS_STILL_IN_PROGRESS' };

      const openSessionCount = await tx.examSession.count({
        where: { schoolId, examId, status: 'OPEN' },
      });
      if (openSessionCount > 0) return { kind: 'SESSIONS_STILL_OPEN' };

      const sessions = await tx.examSession.findMany({
        where: { schoolId, examId },
        select: { id: true },
      });
      const sessionIds = sessions.map((s) => s.id);
      const authorizedParticipants =
        sessionIds.length === 0
          ? []
          : await tx.examSessionParticipant.findMany({
              where: { schoolId, examSessionId: { in: sessionIds }, status: 'AUTHORIZED' },
              orderBy: { authorizedAt: 'desc' },
              select: { studentProfileId: true, examSessionId: true },
              distinct: ['studentProfileId'],
            });
      const existingParticipation = await tx.examParticipation.findMany({
        where: { schoolId, examId },
        select: { studentProfileId: true },
      });
      const alreadyMarked = new Set(existingParticipation.map((p) => p.studentProfileId));
      const pending = authorizedParticipants.filter((p) => !alreadyMarked.has(p.studentProfileId));
      const pendingIds = new Set(pending.map((p) => p.studentProfileId));

      const matches =
        pendingIds.size === submittedIds.size &&
        [...pendingIds].every((id) => submittedIds.has(id));
      if (!matches) return { kind: 'STALE_ABSENTEE_LIST' };

      const claim = await tx.exam.updateMany({
        where: { id: examId, status: { in: ['OPEN', 'CLOSED'] } },
        data: { status: 'COMPLETED' },
      });
      if (claim.count === 0) return { kind: 'NOT_COMPLETABLE' };

      await tx.examSession.updateMany({
        where: { schoolId, examId, status: { in: ['OPEN', 'CLOSED'] } },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      if (pending.length > 0) {
        await tx.examParticipation.createMany({
          data: pending.map((p) => ({
            schoolId,
            examId,
            examSessionId: p.examSessionId,
            studentProfileId: p.studentProfileId,
            status: 'ABSENT',
            markedByMembershipId: schoolActor.membershipId,
          })),
        });
      }

      return { kind: 'OK', absentCount: pending.length };
    });

    if (outcome.kind === 'SESSIONS_STILL_OPEN') {
      throw new AppHttpException({
        code: 'EXAM_SESSIONS_STILL_OPEN',
        message: 'Close every open session before ending the examination.',
      });
    }
    if (outcome.kind === 'ATTEMPTS_STILL_IN_PROGRESS') {
      throw new AppHttpException({
        code: 'EXAM_HAS_IN_PROGRESS_ATTEMPTS',
        message: 'This exam still has attempts in progress.',
      });
    }
    if (outcome.kind === 'STALE_ABSENTEE_LIST') {
      throw new AppHttpException({
        code: 'STALE_ABSENTEE_LIST',
        message:
          'The confirmed absentee list does not match the current pending set — refresh and retry.',
      });
    }
    if (outcome.kind === 'NOT_COMPLETABLE') {
      throw new AppHttpException({
        code: 'EXAM_NOT_COMPLETABLE',
        message: 'This exam is no longer in a state that permits completion.',
      });
    }

    await this.audit.record({
      schoolId,
      actorUserId: auditCtx.actorUserId,
      actorRole: auditCtx.actorRole,
      action: 'EXAM_COMPLETED',
      entityType: 'Exam',
      entityId: examId,
    });
    if (outcome.absentCount > 0) {
      await this.audit.record({
        schoolId,
        actorUserId: auditCtx.actorUserId,
        actorRole: auditCtx.actorRole,
        action: 'EXAM_PARTICIPATION_MARKED_ABSENT',
        entityType: 'Exam',
        entityId: examId,
        metadata: { absentCount: outcome.absentCount },
      });
    }
    await this.stream.publishUpdate(schoolId, examId);

    return toExamResponseDtoFresh(schoolId, examId);
  }
}
