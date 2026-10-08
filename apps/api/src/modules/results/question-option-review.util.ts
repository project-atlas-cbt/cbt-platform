import type { AttemptSnapshotQuestionV1 } from '@atlas/domain';

export interface QuestionOptionReview {
  optionId: string;
  content: string;
  /** The option the question's answer key marks correct. */
  correct: boolean;
  /** The option this student chose. */
  selected: boolean;
}

/**
 * The options of one snapshotted question as the student saw them (their
 * own `displayPosition` order), with the answer key and the student's pick
 * resolved. Reads `correctFlag` from the frozen attempt snapshot, so editing
 * the question bank afterwards changes nothing here (ADR-0008).
 *
 * This is the ONE place the key leaves the snapshot for a read endpoint. Its
 * callers are the staff result detail and the student result detail under
 * FULL_REVIEW only — a student under a narrower policy must never reach it.
 */
export function buildQuestionOptionReview(
  question: AttemptSnapshotQuestionV1 | undefined,
  selectedOptionId: string | null,
): QuestionOptionReview[] {
  if (!question) return [];
  return [...question.options]
    .sort((a, b) => a.displayPosition - b.displayPosition)
    .map((option) => ({
      optionId: option.optionId,
      content: option.content,
      correct: option.correctFlag,
      selected: option.optionId === selectedOptionId,
    }));
}
