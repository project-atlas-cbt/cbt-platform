import { z } from 'zod';
import type { CreateExamBody } from './mutations';

/**
 * F11 — the Details step's validation catalogue, mirroring
 * `lib/questions/validation.ts`'s two-schema shape:
 *
 * - `examDetailsFormSchema` — types only, no required-ness. The editor's
 *   `zodResolver` throughout, so react-hook-form never blocks a half-typed
 *   draft from being held in form state (autosave needs that).
 * - `checkExamDetailsValidation(values)` — the real gate, mirroring
 *   `CreateExamDto`'s exact required shape (DoD item 2).
 *
 * `academicSessionId`/`academicTermId` are populated automatically from
 * `GET /academics/context` (the caller's own currently-active session/term)
 * rather than offered as a free picker — `schoolConfig.session.view`/
 * `.term.view` are both denied to TEACHER (the same class of gap F6 already
 * found for class/subject), and the readiness checklist's own
 * `SESSION_ACTIVE`/`TERM_ACTIVE` checks require UPCOMING or CURRENT anyway,
 * so a free-form historical pick would only ever fail readiness in practice.
 * See `ExamDetailsForm`'s own doc comment for the full reasoning, including
 * the honestly-recorded limitation this implies (no UPCOMING-term exam
 * authoring in this pass).
 */

export const examDetailsFormSchema = z.object({
  academicSessionId: z.string(),
  academicTermId: z.string(),
  subjectId: z.string(),
  title: z.string(),
  examType: z.string(),
  classIds: z.array(z.string()),
});

export type ExamDetailsFormValues = z.infer<typeof examDetailsFormSchema>;

export interface ExamDetailsValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof ExamDetailsFormValues, string>>;
}

export function checkExamDetailsValidation(
  values: ExamDetailsFormValues,
): ExamDetailsValidationResult {
  const errors: ExamDetailsValidationResult['errors'] = {};

  if (!values.academicSessionId) {
    errors.academicSessionId =
      'No active academic session — set one up in Academics before building an exam.';
  }
  if (!values.academicTermId) {
    errors.academicTermId =
      'No active academic term — set one up in Academics before building an exam.';
  }
  if (!values.subjectId) {
    errors.subjectId = 'Select a subject.';
  }
  if (!values.title.trim()) {
    errors.title = 'Title is required.';
  }
  if (!values.examType.trim()) {
    errors.examType = 'Exam type is required.';
  }
  if (values.classIds.length === 0) {
    errors.classIds = 'Select at least one class.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * The autosave "minimum-viable-fields gate" — mirrors `CreateExamDto`'s
 * exact required shape, since `POST /exams` requires every field at once
 * with no partial-create path. Returns a ready-to-send body only once every
 * required field is genuinely present; `undefined` otherwise, meaning "keep
 * buffering locally."
 */
export function computeExamCreateGate(values: ExamDetailsFormValues): CreateExamBody | undefined {
  const { valid } = checkExamDetailsValidation(values);
  if (!valid) return undefined;
  return {
    academicSessionId: values.academicSessionId,
    academicTermId: values.academicTermId,
    subjectId: values.subjectId,
    title: values.title.trim(),
    examType: values.examType.trim(),
    classIds: values.classIds,
  };
}
