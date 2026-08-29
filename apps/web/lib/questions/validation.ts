import { z } from 'zod';
import { CLASS_LEVELS, QUESTION_DIFFICULTIES, QUESTION_TYPES } from '@atlas/domain';
import { stripHtmlToText } from './sanitize-html';
import type { CreateQuestionBody, QuestionOptionInput } from './mutations';

/**
 * F9 — `05 §15.4`'s validation catalogue, cross-checked against
 * `apps/api/src/modules/questions/question-validation.util.ts` (the true
 * source of truth for exact wording/edge cases). Two schemas, matching the
 * two moments validation actually matters:
 *
 * - `draftFormSchema` — types only, no required-ness. Used as the editor's
 *   `zodResolver` throughout, so react-hook-form never blocks a half-typed
 *   draft from being held in form state (autosave needs that).
 * - `submitValidation.check(values)` — the real gate, run before "Submit
 *   for review" is attempted, mirroring the server's own rules so the
 *   error the teacher sees client-side is the same one the server would
 *   give. The server re-validates regardless (this is UX, not the
 *   enforcement boundary — doctrine-wide, never trust client-only checks).
 */

export const optionFormSchema = z.object({
  id: z.string().optional(),
  content: z.string(),
  correctFlag: z.boolean(),
});

export const draftFormSchema = z.object({
  subjectId: z.string(),
  level: z.string(),
  questionType: z.enum(QUESTION_TYPES),
  content: z.string(),
  topicId: z.string().optional(),
  topicName: z.string().max(128).optional(),
  subtopicId: z.string().optional(),
  subtopicName: z.string().max(128).optional(),
  difficulty: z.string(),
  marks: z.union([z.number(), z.literal('')]),
  explanation: z.string().optional(),
  options: z.array(optionFormSchema).max(4),
});

export type QuestionFormValues = z.infer<typeof draftFormSchema>;

export interface SubmitValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof QuestionFormValues | 'options', string>>;
}

/** The strict, submit-time check — every rule from `05 §15.4` plus the
 * DTO's own structural caps (max 4 options, name lengths). */
export function checkSubmitValidation(values: QuestionFormValues): SubmitValidationResult {
  const errors: SubmitValidationResult['errors'] = {};

  if (!stripHtmlToText(values.content)) {
    errors.content = 'Question text is required.';
  }
  if (!values.subjectId) {
    errors.subjectId = 'Select a subject.';
  }
  if (!values.level) {
    errors.level = 'Select a class level.';
  }
  if (!values.difficulty) {
    errors.difficulty = 'Select a difficulty.';
  }
  if (
    values.marks === '' ||
    !Number.isInteger(values.marks) ||
    values.marks < 1 ||
    values.marks > 100
  ) {
    errors.marks = 'Marks must be a whole number between 1 and 100.';
  }

  if (values.options.length < 2) {
    errors.options = 'At least two options are required.';
  } else if (values.options.some((o) => !o.content.trim())) {
    errors.options = 'Every option must have text.';
  } else if (values.options.filter((o) => o.correctFlag).length !== 1) {
    errors.options = 'Exactly one option must be marked correct.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * The autosave "minimum-viable-fields gate" — deliberately mirrors
 * `CreateQuestionDto`'s exact required shape (not a looser approximation),
 * since `POST /questions` runs the full validation catalogue immediately
 * and has no partial-create path. Returns a ready-to-send body only once
 * every required field is genuinely present; `null` otherwise, meaning
 * "keep buffering locally."
 */
export function computeCreateGate(values: QuestionFormValues): CreateQuestionBody | null {
  const { valid } = checkSubmitValidation(values);
  if (!valid) return null;
  if (!CLASS_LEVELS.includes(values.level as (typeof CLASS_LEVELS)[number])) return null;
  if (
    !QUESTION_DIFFICULTIES.includes(values.difficulty as (typeof QUESTION_DIFFICULTIES)[number])
  ) {
    return null;
  }

  const options: QuestionOptionInput[] = values.options.map((o) => ({
    content: o.content,
    correctFlag: o.correctFlag,
  }));

  return {
    subjectId: values.subjectId,
    level: values.level as (typeof CLASS_LEVELS)[number],
    questionType: values.questionType,
    content: values.content,
    difficulty: values.difficulty as (typeof QUESTION_DIFFICULTIES)[number],
    marks: values.marks as number,
    options,
    ...(values.topicId ? { topicId: values.topicId } : {}),
    ...(values.subtopicId ? { subtopicId: values.subtopicId } : {}),
    ...(values.explanation ? { explanation: values.explanation } : {}),
  };
}
