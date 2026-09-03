import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { ExamReadinessCheckCode } from '@atlas/domain';
import { deriveExamLevel, loadExamOrThrow, type ExamWithDetailRelations } from './exam-mappers.js';
import type { ExamReadinessCheckItemDto, ExamReadinessResponseDto } from './dto/exam.dto.js';

/**
 * `GET /v1/exams/:id/readiness` — the itemised checklist (05 §23/§72,
 * 07 §20), never a single boolean. One function, called by both the `GET`
 * route directly and `ExamService.ready()`'s own pre-transition re-check —
 * so the two can never disagree on what "ready" means.
 *
 * Several checks are marked "defensive" below: structurally unreachable
 * given this migration's own database triggers and `NOT NULL` columns, but
 * kept anyway for 05 §23/§72's own literal spec fidelity, mirroring
 * `QuestionRevisionStatus.ARCHIVED`'s "kept even though never written"
 * precedent. A defensive check failing would indicate a real bug elsewhere,
 * not a normal user-facing outcome.
 */
@Injectable()
export class ExamReadinessService {
  async evaluate(schoolId: string, examId: string): Promise<ExamReadinessResponseDto> {
    const exam = await loadExamOrThrow(schoolId, examId);

    const school = await withTenant(prisma, schoolId, (tx) =>
      tx.school.findUnique({ where: { id: schoolId }, select: { status: true } }),
    );

    const classSubjectIds = exam.classes.map((c) => c.classSubjectId);
    const eligibleStudentCount =
      classSubjectIds.length === 0
        ? 0
        : await withTenant(prisma, schoolId, (tx) =>
            tx.studentSubjectRegistration.count({
              where: {
                schoolId,
                classSubjectId: { in: classSubjectIds },
                status: 'REGISTERED',
                enrollment: { status: 'ACTIVE' },
              },
            }),
          );

    const checks = this.buildChecks(exam, school?.status ?? null, eligibleStudentCount);
    return { examId, ready: checks.every((c) => c.passed), checks };
  }

  private buildChecks(
    exam: ExamWithDetailRelations,
    schoolStatus: string | null,
    eligibleStudentCount: number,
  ): ExamReadinessCheckItemDto[] {
    const level = deriveExamLevel(exam);
    const allQuestions = exam.sections.flatMap((s) => s.questions);
    const inactiveClasses = exam.classes.filter(
      (c) => c.classSubject.classGroupSession.status !== 'ACTIVE',
    );
    const unapprovedQuestions = allQuestions.filter((q) => q.revision.status !== 'APPROVED');
    const outOfScopeQuestions = allQuestions.filter(
      (q) =>
        q.revision.question.subjectId !== exam.subjectId || q.revision.question.level !== level,
    );
    const invalidMarksQuestions = allQuestions.filter((q) => q.marks <= 0);

    return [
      this.item(
        'SCHOOL_ACTIVE',
        'School active',
        schoolStatus === 'ACTIVE',
        schoolStatus === 'ACTIVE'
          ? 'The school is active.'
          : `The school is not active (${schoolStatus}).`,
      ),
      this.item(
        'SESSION_ACTIVE',
        'Session active',
        exam.session.status === 'UPCOMING' || exam.session.status === 'CURRENT',
        exam.session.status === 'UPCOMING' || exam.session.status === 'CURRENT'
          ? 'The academic session is active.'
          : `The academic session is not active (${exam.session.status}).`,
      ),
      this.item(
        'TERM_ACTIVE',
        'Term active',
        exam.term.status === 'UPCOMING' || exam.term.status === 'CURRENT',
        exam.term.status === 'UPCOMING' || exam.term.status === 'CURRENT'
          ? 'The term is active.'
          : `The term is not active (${exam.term.status}).`,
      ),
      this.item(
        'CLASSES_TARGETED',
        'Class(es) selected',
        exam.classes.length > 0,
        exam.classes.length > 0
          ? `${exam.classes.length} class(es) targeted.`
          : 'No classes are targeted.',
      ),
      this.item(
        'CLASSES_ACTIVE',
        'Class(es) active',
        exam.classes.length > 0 && inactiveClasses.length === 0,
        inactiveClasses.length === 0
          ? 'All targeted classes are active.'
          : `${inactiveClasses.length} targeted class(es) are not active.`,
      ),
      this.item(
        'SUBJECT_ACTIVE',
        'Subject active',
        exam.subject.status === 'ACTIVE',
        exam.subject.status === 'ACTIVE'
          ? 'The subject is active.'
          : `The subject is not active (${exam.subject.status}).`,
      ),
      this.item(
        'QUESTIONS_SELECTED',
        'Questions selected',
        allQuestions.length > 0,
        allQuestions.length > 0
          ? `${allQuestions.length} question(s) selected.`
          : 'No questions have been selected.',
      ),
      this.item(
        'QUESTIONS_APPROVED',
        'All questions approved',
        unapprovedQuestions.length === 0,
        unapprovedQuestions.length === 0
          ? 'Every selected question is approved.'
          : `${unapprovedQuestions.length} question(s) are awaiting approval.`,
      ),
      this.item(
        'QUESTIONS_IN_SCOPE',
        'Questions match exam scope',
        outOfScopeQuestions.length === 0,
        outOfScopeQuestions.length === 0
          ? 'Every selected question matches this exam’s subject and level.'
          : `${outOfScopeQuestions.length} question(s) do not match this exam's subject/level.`,
      ),
      this.item(
        'MARKS_VALID',
        'Marks valid',
        allQuestions.length > 0 && invalidMarksQuestions.length === 0,
        invalidMarksQuestions.length === 0
          ? 'Every question has a valid mark allocation.'
          : `${invalidMarksQuestions.length} question(s) have an invalid mark allocation.`,
      ),
      this.item(
        'DURATION_CONFIGURED',
        'Duration configured',
        exam.durationSeconds > 0,
        exam.durationSeconds > 0
          ? `Duration set to ${exam.durationSeconds} seconds.`
          : 'Duration has not been configured.',
      ),
      this.item(
        'INSTRUCTIONS_CONFIGURED',
        'Instructions configured',
        Boolean(exam.generalInstructions && exam.generalInstructions.trim().length > 0),
        exam.generalInstructions && exam.generalInstructions.trim().length > 0
          ? 'General instructions are configured.'
          : 'General instructions have not been configured.',
      ),
      this.item(
        'ELIGIBLE_STUDENTS_EXIST',
        'Eligible students found',
        eligibleStudentCount > 0,
        eligibleStudentCount > 0
          ? `${eligibleStudentCount} eligible student(s) found.`
          : 'The targeted class(es) have no eligible students.',
      ),
      this.item(
        'RESULT_POLICY_CONFIGURED',
        'Result policy configured',
        Boolean(exam.resultPolicy),
        exam.resultPolicy ? 'A result policy is configured.' : 'No result policy is configured.',
      ),
      this.item(
        'DETAILS_COMPLETE',
        'Exam details complete',
        exam.title.trim().length > 0 && exam.examType.trim().length > 0,
        exam.title.trim().length > 0 && exam.examType.trim().length > 0
          ? 'Exam details are complete.'
          : 'Exam details are incomplete.',
      ),
    ];
  }

  private item(
    code: ExamReadinessCheckCode,
    label: string,
    passed: boolean,
    message: string,
  ): ExamReadinessCheckItemDto {
    return { code, label, passed, message };
  }
}
