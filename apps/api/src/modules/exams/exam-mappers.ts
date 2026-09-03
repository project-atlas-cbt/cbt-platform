import { prisma, withTenant, type Prisma } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import type {
  ExamClassResponseDto,
  ExamListItemResponseDto,
  ExamQuestionResponseDto,
  ExamResponseDto,
  ExamSectionResponseDto,
} from './dto/exam.dto.js';

/** The exact Prisma `include` shape every read in this module needs — kept
 * in one place, mirroring `question-mappers.ts`'s own established
 * precedent, so `exam.service.ts`/`exam-question.service.ts`/
 * `exam-configuration.service.ts`/`exam-readiness.service.ts` never drift
 * against each other on what a "full" exam looks like. */
export const EXAM_CLASS_INCLUDE = {
  classSubject: {
    include: {
      classGroupSession: { select: { id: true, name: true, level: true, arm: true, status: true } },
    },
  },
} satisfies Prisma.ExamClassInclude;

export type ExamClassWithRelations = Prisma.ExamClassGetPayload<{
  include: typeof EXAM_CLASS_INCLUDE;
}>;

export const EXAM_QUESTION_INCLUDE = {
  revision: {
    select: {
      id: true,
      content: true,
      questionType: true,
      difficulty: true,
      marks: true,
      status: true,
      topic: { select: { name: true } },
      question: { select: { id: true, subjectId: true, level: true } },
    },
  },
} satisfies Prisma.ExamQuestionInclude;

export type ExamQuestionWithRelations = Prisma.ExamQuestionGetPayload<{
  include: typeof EXAM_QUESTION_INCLUDE;
}>;

export const EXAM_SECTION_INCLUDE = {
  questions: { include: EXAM_QUESTION_INCLUDE, orderBy: { sequence: 'asc' } },
} satisfies Prisma.ExamSectionInclude;

export type ExamSectionWithRelations = Prisma.ExamSectionGetPayload<{
  include: typeof EXAM_SECTION_INCLUDE;
}>;

export const EXAM_LIST_INCLUDE = {
  subject: { select: { name: true, status: true } },
  department: { select: { name: true } },
  session: { select: { name: true, status: true } },
  term: { select: { name: true, status: true } },
  createdByMember: { include: { user: { select: { displayName: true } } } },
  classes: { include: EXAM_CLASS_INCLUDE },
} satisfies Prisma.ExamInclude;

export type ExamWithListRelations = Prisma.ExamGetPayload<{ include: typeof EXAM_LIST_INCLUDE }>;

/** `GET /v1/exams/:id` (and every mutation's own response) — the list-shaped
 * include plus sections/questions. */
export const EXAM_DETAIL_INCLUDE = {
  ...EXAM_LIST_INCLUDE,
  sections: { include: EXAM_SECTION_INCLUDE, orderBy: { sequence: 'asc' } },
} satisfies Prisma.ExamInclude;

export type ExamWithDetailRelations = Prisma.ExamGetPayload<{
  include: typeof EXAM_DETAIL_INCLUDE;
}>;

export function toExamClassResponseDto(examClass: ExamClassWithRelations): ExamClassResponseDto {
  return {
    id: examClass.id,
    classId: examClass.classSubject.classId,
    classSubjectId: examClass.classSubjectId,
    className: examClass.classSubject.classGroupSession.name,
    level: examClass.classSubject.classGroupSession.level,
    arm: examClass.classSubject.classGroupSession.arm,
  };
}

export function toExamQuestionResponseDto(
  examQuestion: ExamQuestionWithRelations,
): ExamQuestionResponseDto {
  return {
    id: examQuestion.id,
    questionId: examQuestion.revision.question.id,
    questionRevisionId: examQuestion.questionRevisionId,
    sequence: examQuestion.sequence,
    marks: examQuestion.marks,
    content: examQuestion.revision.content,
    questionType: examQuestion.revision.questionType,
    difficulty: examQuestion.revision.difficulty,
    topicName: examQuestion.revision.topic?.name ?? null,
  };
}

/** `ExamSection.marks` is deliberately not a Prisma column (ADR-0029) —
 * always the SUM of this section's own `ExamQuestion.marks`, computed here
 * on every read so it can never disagree with its own children. */
export function toExamSectionResponseDto(
  section: ExamSectionWithRelations,
): ExamSectionResponseDto {
  return {
    id: section.id,
    title: section.title,
    sequence: section.sequence,
    marks: section.questions.reduce((sum, q) => sum + q.marks, 0),
    questions: section.questions.map(toExamQuestionResponseDto),
  };
}

export function toExamListItemResponseDto(exam: ExamWithListRelations): ExamListItemResponseDto {
  return {
    id: exam.id,
    title: exam.title,
    examType: exam.examType,
    status: exam.status,
    academicSessionId: exam.academicSessionId,
    sessionName: exam.session.name,
    academicTermId: exam.academicTermId,
    termName: exam.term.name,
    subjectId: exam.subjectId,
    subjectName: exam.subject.name,
    departmentId: exam.departmentId,
    departmentName: exam.department?.name ?? null,
    createdByMembershipId: exam.createdByMembershipId,
    createdByName: exam.createdByMember.user.displayName,
    classes: exam.classes.map(toExamClassResponseDto),
    createdAt: exam.createdAt.toISOString(),
    updatedAt: exam.updatedAt.toISOString(),
  };
}

export function toExamResponseDto(exam: ExamWithDetailRelations): ExamResponseDto {
  return {
    ...toExamListItemResponseDto(exam),
    durationSeconds: exam.durationSeconds,
    attemptLimit: exam.attemptLimit,
    navigationPolicy: exam.navigationPolicy,
    randomizeQuestions: exam.randomizeQuestions,
    randomizeOptions: exam.randomizeOptions,
    resultPolicy: exam.resultPolicy,
    resultDetailVisibility: exam.resultDetailVisibility,
    accessMode: exam.accessMode,
    generalInstructions: exam.generalInstructions,
    navigationInstructions: exam.navigationInstructions,
    submissionInstructions: exam.submissionInstructions,
    accommodations: exam.accommodations,
    cancelledReason: exam.cancelledReason,
    cancelledAt: exam.cancelledAt?.toISOString() ?? null,
    archivedAt: exam.archivedAt?.toISOString() ?? null,
    sections: exam.sections.map(toExamSectionResponseDto),
  };
}

/** Shared by every service in this module (`exam.service.ts`,
 * `exam-question.service.ts`, `exam-configuration.service.ts`,
 * `exam-readiness.service.ts`) — a plain function, not a class method, so
 * it can be imported without introducing a circular DI dependency between
 * services that each need "load the full exam" as their first step. */
export async function loadExamOrThrow(
  schoolId: string,
  examId: string,
): Promise<ExamWithDetailRelations> {
  const exam = await withTenant(prisma, schoolId, (tx) =>
    tx.exam.findUnique({ where: { id: examId }, include: EXAM_DETAIL_INCLUDE }),
  );
  if (!exam || exam.schoolId !== schoolId) {
    throw new AppHttpException({ code: 'NOT_FOUND', message: 'Exam not found.' });
  }
  return exam;
}

/** The exam's single derived "level" — every targeted class's
 * `ClassGroup.level` is guaranteed identical by `assertClassAgreement`
 * (`exam-scope.util.ts`) at write time, so this simply reads the first
 * one. Returns `null` only for the structurally-impossible case of an exam
 * with no targeted classes at all (never reachable post-creation — see
 * `CreateExamDto.classIds`'s own `@ArrayMinSize(1)`). */
export function deriveExamLevel(exam: { classes: ExamClassWithRelations[] }): string | null {
  return exam.classes[0]?.classSubject.classGroupSession.level ?? null;
}
