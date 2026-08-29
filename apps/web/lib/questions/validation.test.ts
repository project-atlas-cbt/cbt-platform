import { describe, expect, it } from 'vitest';
import { checkSubmitValidation, computeCreateGate, type QuestionFormValues } from './validation';

const VALID: QuestionFormValues = {
  subjectId: 'sub1',
  level: 'SS2',
  questionType: 'SINGLE_CHOICE',
  content: '<p>2 + 2 = ?</p>',
  difficulty: 'EASY',
  marks: 2,
  explanation: '',
  options: [
    { content: '3', correctFlag: false },
    { content: '4', correctFlag: true },
  ],
};

describe('checkSubmitValidation', () => {
  it('passes a fully valid question', () => {
    expect(checkSubmitValidation(VALID).valid).toBe(true);
  });

  it('flags empty question text (HTML-stripped)', () => {
    const result = checkSubmitValidation({ ...VALID, content: '<p></p>' });
    expect(result.valid).toBe(false);
    expect(result.errors.content).toMatch(/question text is required/i);
  });

  it('flags fewer than two options', () => {
    const result = checkSubmitValidation({ ...VALID, options: [VALID.options[0]!] });
    expect(result.errors.options).toMatch(/at least two options/i);
  });

  it('flags an option with empty text', () => {
    const result = checkSubmitValidation({
      ...VALID,
      options: [{ content: '', correctFlag: true }, VALID.options[1]!],
    });
    expect(result.errors.options).toMatch(/every option must have text/i);
  });

  it('flags zero correct answers', () => {
    const result = checkSubmitValidation({
      ...VALID,
      options: VALID.options.map((o) => ({ ...o, correctFlag: false })),
    });
    expect(result.errors.options).toMatch(/exactly one option must be marked correct/i);
  });

  it('flags two correct answers', () => {
    const result = checkSubmitValidation({
      ...VALID,
      options: VALID.options.map((o) => ({ ...o, correctFlag: true })),
    });
    expect(result.errors.options).toMatch(/exactly one option must be marked correct/i);
  });

  it('flags a missing subject/level', () => {
    const result = checkSubmitValidation({ ...VALID, subjectId: '', level: '' });
    expect(result.errors.subjectId).toBeDefined();
    expect(result.errors.level).toBeDefined();
  });

  it('flags marks outside 1-100 or non-integer', () => {
    expect(checkSubmitValidation({ ...VALID, marks: 0 }).errors.marks).toBeDefined();
    expect(checkSubmitValidation({ ...VALID, marks: 101 }).errors.marks).toBeDefined();
    expect(checkSubmitValidation({ ...VALID, marks: 1.5 }).errors.marks).toBeDefined();
    expect(checkSubmitValidation({ ...VALID, marks: '' }).errors.marks).toBeDefined();
  });
});

describe('computeCreateGate', () => {
  it('returns a ready CreateQuestionDto body once every required field is present', () => {
    const body = computeCreateGate(VALID);
    expect(body).toEqual({
      subjectId: 'sub1',
      level: 'SS2',
      questionType: 'SINGLE_CHOICE',
      content: '<p>2 + 2 = ?</p>',
      difficulty: 'EASY',
      marks: 2,
      options: [
        { content: '3', correctFlag: false },
        { content: '4', correctFlag: true },
      ],
    });
  });

  it('returns null while any required field is missing (kept buffering locally)', () => {
    expect(computeCreateGate({ ...VALID, content: '<p></p>' })).toBeNull();
    expect(computeCreateGate({ ...VALID, subjectId: '' })).toBeNull();
    expect(computeCreateGate({ ...VALID, options: [VALID.options[0]!] })).toBeNull();
  });

  it('includes optional topic/subtopic/explanation only when present', () => {
    const body = computeCreateGate({
      ...VALID,
      topicId: 'topic1',
      subtopicId: 'sub-topic1',
      explanation: 'Because 2+2=4.',
    });
    expect(body).toMatchObject({
      topicId: 'topic1',
      subtopicId: 'sub-topic1',
      explanation: 'Because 2+2=4.',
    });
  });
});
