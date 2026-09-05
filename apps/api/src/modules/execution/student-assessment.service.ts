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

    const participant = await withTenant(prisma, schoolId, (tx) =>
      tx.examSessionParticipant.findFirst({
        where: {
          schoolId,
          studentProfileId: studentProfile.id,
          status: 'AUTHORIZED',
          session: { schoolId, status: 'OPEN', exam: { schoolId, status: 'OPEN' } },
        },
        orderBy: { authorizedAt: 'desc' },
        select: {
          examSessionId: true,
          session: { select: { examId: true, exam: { select: { title: true } } } },
        },
      }),
    );
    if (!participant) return NO_ACTIVE_ASSESSMENT;

    return {
      examId: participant.session.examId,
      examTitle: participant.session.exam.title,
      examSessionId: participant.examSessionId,
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
    };
  }
}
