import { describe, expect, it } from 'vitest';
import { AppHttpException } from '../../common/app-http-exception.js';
import { validateQuestionRevisionForSubmit } from './question-validation.util.js';

const validOptions = [
  { content: 'A', correctFlag: false },
  { content: 'B', correctFlag: true },
];

function codeOf(fn: () => void): string {
  try {
    fn();
    throw new Error('expected validateQuestionRevisionForSubmit to throw');
  } catch (error) {
    if (error instanceof AppHttpException) return error.code;
    throw error;
  }
}

/** DoD item 8's validation catalogue, unit-tested directly against the
 * pure function — the integration suite's own `badMarks`/`oneOption`
 * cases can't reach several of these rules via HTTP at all (DTO-level
 * `@IsInt()/@Min()/@Max()`/`@ArrayMinSize()` decorators catch the same
 * malformed input first for any *explicitly supplied* value — see
 * `question-lifecycle.integration.test.ts`'s own comment on this), so this
 * is the one place the domain function's own logic is proven directly. */
describe('validateQuestionRevisionForSubmit', () => {
  it('passes for a valid revision', () => {
    expect(() =>
      validateQuestionRevisionForSubmit({ content: 'x', options: validOptions, marks: 5 }),
    ).not.toThrow();
  });

  it('QUESTION_TEXT_EMPTY — empty or whitespace-only content', () => {
    expect(
      codeOf(() =>
        validateQuestionRevisionForSubmit({ content: '   ', options: validOptions, marks: 5 }),
      ),
    ).toBe('QUESTION_TEXT_EMPTY');
  });

  it('QUESTION_INSUFFICIENT_OPTIONS — fewer than two options', () => {
    expect(
      codeOf(() =>
        validateQuestionRevisionForSubmit({
          content: 'x',
          options: [{ content: 'A', correctFlag: true }],
          marks: 5,
        }),
      ),
    ).toBe('QUESTION_INSUFFICIENT_OPTIONS');
  });

  it('QUESTION_OPTION_TEXT_EMPTY — a blank option', () => {
    expect(
      codeOf(() =>
        validateQuestionRevisionForSubmit({
          content: 'x',
          options: [
            { content: '  ', correctFlag: true },
            { content: 'B', correctFlag: false },
          ],
          marks: 5,
        }),
      ),
    ).toBe('QUESTION_OPTION_TEXT_EMPTY');
  });

  it('QUESTION_CORRECT_ANSWER_MISSING — zero options flagged correct', () => {
    expect(
      codeOf(() =>
        validateQuestionRevisionForSubmit({
          content: 'x',
          options: [
            { content: 'A', correctFlag: false },
            { content: 'B', correctFlag: false },
          ],
          marks: 5,
        }),
      ),
    ).toBe('QUESTION_CORRECT_ANSWER_MISSING');
  });

  it('QUESTION_CORRECT_ANSWER_MISSING — more than one option flagged correct', () => {
    expect(
      codeOf(() =>
        validateQuestionRevisionForSubmit({
          content: 'x',
          options: [
            { content: 'A', correctFlag: true },
            { content: 'B', correctFlag: true },
          ],
          marks: 5,
        }),
      ),
    ).toBe('QUESTION_CORRECT_ANSWER_MISSING');
  });

  it('QUESTION_MARKS_INVALID — zero, negative, non-integer, or over 100', () => {
    for (const marks of [0, -1, 1.5, 101]) {
      expect(
        codeOf(() =>
          validateQuestionRevisionForSubmit({ content: 'x', options: validOptions, marks }),
        ),
      ).toBe('QUESTION_MARKS_INVALID');
    }
  });
});
