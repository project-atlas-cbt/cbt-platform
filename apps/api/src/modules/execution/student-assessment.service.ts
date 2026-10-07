import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import type { AuthorizedActor } from '../authorization/authorization.types.js';
import { requireSchoolActor } from '../questions/question-scope.util.js';
import { loadExamOrThrow } from '../exams/exam-mappers.js';
import type { ActiveAssessmentResponseDto, AttemptPreviewResponseDto } from './dto/attempt.dto.js';

const NO_ACTIVE_ASSESSMENT: ActiveAssessmentResponseDto = {
  examId: null,
  examTitle: null,
  examSessionId: null,
  attemptId: null,
  state: null,
};

/** `GET /v1/student/assessment` and its `/preview` — the two read-only
 * routes that precede `POST /v1/exams/:id/attempts`. Neither is the
 * authority for eligibility (`start()`'s own re-validated-under-lock
 * predicate is) — these are display concerns only, matching `07 §31.1`'s
 * "student sees preview, clicks Start" flow. */
@Injectable()
export class StudentAssessmentService {
  constructor(private readonly authz: AuthorizationService) {}

  async getActiveAssessment(
    schoolId: string,
    actor: AuthorizedActor,
  ): Promise<ActiveAssessmentResponseDto> {
    const decision = await this.authz.evaluate(actor, 'studentCbt.viewActiveAssessment', {
      schoolId,
      ownerUserId: actor.userId,
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to view the active assessment.',
      });
    }

    const schoolActor = requireSchoolActor(actor);
    const studentProfile = await withTenant(prisma, schoolId, (tx) =>
      tx.studentProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId: schoolActor.membershipId } },
        select: { id: true },
      }),
    );
    if (!studentProfile) return NO_ACTIVE_ASSESSMENT;

    // An already-IN_PROGRESS attempt IS the active assessment — the
    // client should resume it, never attempt a fresh start.
    const inProgress = await withTenant(prisma, schoolId, (tx) =>
      tx.examAttempt.findFirst({
        where: { schoolId, studentProfileId: studentProfile.id, state: 'IN_PROGRESS' },
        select: {
          id: true,
          examId: true,
          examSessionId: true,
          exam: { select: { title: true } },
        },
      }),
    );
    if (inProgress) {
      return {
        examId: inProgress.examId,
        examTitle: inProgress.exam.title,
        examSessionId: inProgress.examSessionId,
        attemptId: inProgress.id,
        state: 'IN_PROGRESS',
      };
    }

    // Bug fix (audit P1-1, P2-1): offer the newest exam this student can
    // actually start, judged by the same clauses `start()` uses — an OPEN
    // exam with attempt-limit headroom, or a live MAKEUP/RETRY authorization
    // for one of the student's open sessions (which also admits a COMPLETED
    // exam). Before, only OPEN exams were offered, so a makeup student saw
    // nothing, and an exam the student had already submitted kept showing
    // as available, hiding any other open exam behind it.
    const now = new Date();
    const candidate = await withTenant(prisma, schoolId, async (tx) => {
      const participants = await tx.examSessionParticipant.findMany({
        where: {
          schoolId,
          studentProfileId: studentProfile.id,
          status: 'AUTHORIZED',
          session: {
            schoolId,
            status: 'OPEN',
            exam: { schoolId, status: { in: ['OPEN', 'COMPLETED'] } },
          },
        },
        orderBy: { authorizedAt: 'desc' },
        select: {
          examSessionId: true,
          session: {
            select: {
              examId: true,
              exam: { select: { title: true, status: true, attemptLimit: true } },
            },
          },
        },
      });
      if (participants.length === 0) return null;

      const examIds = [...new Set(participants.map((p) => p.session.examId))];
      const completed = await tx.examAttempt.groupBy({
        by: ['examId'],
        where: {
          schoolId,
          studentProfileId: studentProfile.id,
          examId: { in: examIds },
          state: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
        },
        _count: { _all: true },
      });
      const authorizations = await tx.attemptAuthorization.findMany({
        where: {
          schoolId,
          studentProfileId: studentProfile.id,
          examId: { in: examIds },
          status: 'AUTHORIZED',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { examId: true, examSessionId: true },
      });
      const completedByExam = new Map(completed.map((row) => [row.examId, row._count._all]));
      const openSessionIds = new Set(participants.map((p) => p.examSessionId));
      const authorizedExams = new Set(
        authorizations
          .filter((auth) => openSessionIds.has(auth.examSessionId))
          .map((auth) => auth.examId),
      );

      return (
        participants.find((p) => {
          const { examId, exam } = p.session;
          if (authorizedExams.has(examId)) return true;
          return exam.status === 'OPEN' && (completedByExam.get(examId) ?? 0) < exam.attemptLimit;
        }) ?? null
      );
    });
    if (!candidate) return NO_ACTIVE_ASSESSMENT;

    return {
      examId: candidate.session.examId,
      examTitle: candidate.session.exam.title,
      examSessionId: candidate.examSessionId,
      attemptId: null,
      state: 'NOT_STARTED',
    };
  }

  async getPreview(
    schoolId: string,
    actor: AuthorizedActor,
    examId: string,
  ): Promise<AttemptPreviewResponseDto> {
    const exam = await loadExamOrThrow(schoolId, examId);
    const decision = await this.authz.evaluate(actor, 'studentCbt.viewActiveAssessment', {
      schoolId,
      ownerUserId: actor.userId,
      examId,
    });
    if (!decision.allowed) {
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to preview this exam.',
      });
    }

    // F20 (DoD 3): the caller's own accommodations for this exam, from the
    // participant row that would admit them (the same predicate as
    // getActiveAssessment) — 0/false for anyone without one.
    const schoolActor = requireSchoolActor(actor);
    const participant = await withTenant(prisma, schoolId, (tx) =>
      tx.examSessionParticipant.findFirst({
        where: {
          schoolId,
          status: 'AUTHORIZED',
          studentProfile: { schoolId, membershipId: schoolActor.membershipId },
          session: { schoolId, status: 'OPEN', examId },
        },
        orderBy: { authorizedAt: 'desc' },
        select: { extraTimeSeconds: true, largerText: true },
      }),
    );

    const questionCount = exam.sections.reduce((sum, s) => sum + s.questions.length, 0);
    const totalMarks = exam.sections.reduce(
      (sum, s) => sum + s.questions.reduce((qSum, q) => qSum + q.marks, 0),
      0,
    );

    return {
      examId: exam.id,
      title: exam.title,
      examType: exam.examType,
      durationSeconds: exam.durationSeconds,
      attemptLimit: exam.attemptLimit,
      navigationPolicy: exam.navigationPolicy,
      generalInstructions: exam.generalInstructions,
      navigationInstructions: exam.navigationInstructions,
      submissionInstructions: exam.submissionInstructions,
      accommodations: exam.accommodations,
      questionCount,
      totalMarks,
      extraTimeSeconds: participant?.extraTimeSeconds ?? 0,
      largerText: participant?.largerText ?? false,
    };
  }
}
