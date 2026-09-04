import type { ApiComponents } from '@atlas/contracts';
import type { ExamReadinessCheckCode } from '@atlas/domain';

export type ExamWizardStep = 'details' | 'questions' | 'rules' | 'review';

type ExamSummary = ApiComponents['schemas']['ExamResponseDto'];

/**
 * Where to send a teacher who clicks into an existing DRAFT exam from the
 * list (or visits `/teacher/exams/:id` directly) — a light heuristic, not a
 * persisted "last visited step" (nothing server-side records one, and the
 * roadmap's own "progress survives navigation" requirement is already
 * satisfied structurally: the exam id lives in the URL, and each step
 * independently reloads its own slice of `useExam` on mount). A non-DRAFT
 * exam always lands on Review, where the read-only checklist and
 * Cancel/Archive actions live.
 */
export function resolveWizardEntryStep(exam: ExamSummary): ExamWizardStep {
  if (exam.status !== 'DRAFT') return 'review';
  const hasQuestions = (exam.sections[0]?.questions.length ?? 0) > 0;
  return hasQuestions ? 'questions' : 'details';
}

export function examStepPath(basePath: string, examId: string, step: ExamWizardStep): string {
  if (step === 'details') return `${basePath}/${examId}/edit`;
  return `${basePath}/${examId}/${step}`;
}

/**
 * Maps a failed readiness check to the wizard step that resolves it (DoD
 * item 7: "each failed check links directly to its resolution"). Codes with
 * no entry (`SCHOOL_ACTIVE`/`SESSION_ACTIVE`/`TERM_ACTIVE`) describe
 * platform/academic-structure state with no in-builder resolution screen —
 * `ReadinessChecklist` renders their message with no link for those,
 * deliberately, rather than a dead one.
 */
export const READINESS_CHECK_STEP: Partial<Record<ExamReadinessCheckCode, ExamWizardStep>> = {
  CLASSES_TARGETED: 'details',
  CLASSES_ACTIVE: 'details',
  DETAILS_COMPLETE: 'details',
  SUBJECT_ACTIVE: 'details',
  ELIGIBLE_STUDENTS_EXIST: 'details',
  QUESTIONS_SELECTED: 'questions',
  QUESTIONS_APPROVED: 'questions',
  QUESTIONS_IN_SCOPE: 'questions',
  MARKS_VALID: 'questions',
  DURATION_CONFIGURED: 'rules',
  INSTRUCTIONS_CONFIGURED: 'rules',
  RESULT_POLICY_CONFIGURED: 'rules',
};
