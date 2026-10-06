import { AppHttpException } from '../../common/app-http-exception.js';

export interface QuestionValidationOption {
  content: string;
  correctFlag: boolean;
}

/**
 * DoD item 8's validation catalogue, run at question creation (matching DoD
 * item 1's own "creates a complete, valid MCQ" example) and again at submit
 * (DoD item 4's "cannot submit if" gate, 05 §15.4) — deliberately never run
 * on a plain `PATCH`, which may legitimately leave a draft transiently
 * incomplete mid-edit (DoD item 3: "freely editable").
 *
 * "Correct answer references a non-existent option" (the DoD's literal
 * wording) has no direct equivalent here: 07 §7.3/06 §27 store `correctFlag`
 * per-option, not a separate correct-answer-id field, so there is no
 * pointer that could reference something missing. The closest faithful
 * check — a body-supplied option `id` that doesn't belong to the revision
 * being edited — is a service-layer concern (it needs the revision's real
 * option ids to compare against), not this pure content validator; see
 * `question-revision.service.ts`'s own option-merge logic for where that's
 * enforced (`QUESTION_OPTION_NOT_FOUND`).
 */
export function validateQuestionRevisionForSubmit(input: {
  content: string;
  questionType?: 'SINGLE_CHOICE' | 'TRUE_FALSE';
  options: QuestionValidationOption[];
  marks: number;
}): void {
  if (!input.content.trim()) {
    throw new AppHttpException({
      code: 'QUESTION_TEXT_EMPTY',
      message: 'Question text is required.',
    });
  }
  if (input.options.length < 2) {
    throw new AppHttpException({
      code: 'QUESTION_INSUFFICIENT_OPTIONS',
      message: 'At least two options are required.',
    });
  }
  if (input.questionType === 'TRUE_FALSE' && input.options.length !== 2) {
    throw new AppHttpException({
      code: 'QUESTION_TRUE_FALSE_OPTIONS',
      message: 'A True/False question has exactly two options.',
    });
  }
  for (const option of input.options) {
    if (!option.content.trim()) {
      throw new AppHttpException({
        code: 'QUESTION_OPTION_TEXT_EMPTY',
        message: 'Every option must have text.',
      });
    }
  }
  const correctCount = input.options.filter((option) => option.correctFlag).length;
  if (correctCount !== 1) {
    throw new AppHttpException({
      code: 'QUESTION_CORRECT_ANSWER_MISSING',
      message: 'Exactly one option must be marked correct.',
    });
  }
  if (!Number.isInteger(input.marks) || input.marks < 1 || input.marks > 100) {
    throw new AppHttpException({
      code: 'QUESTION_MARKS_INVALID',
      message: 'Marks must be a whole number between 1 and 100.',
    });
  }
}
