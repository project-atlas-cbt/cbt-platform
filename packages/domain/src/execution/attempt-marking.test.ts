import { describe, expect, it } from 'vitest';
import {
  computeAttemptQuestionMarkingResults,
  type AttemptSnapshotDocumentV1,
  type AttemptAnswerForMarking,
} from './attempt-marking.js';

function document(questions: AttemptSnapshotDocumentV1['questions']): AttemptSnapshotDocumentV1 {
  return { version: 1, seed: 'seed-x', questions };
}

const CORRECT_ANSWER_QUESTION: AttemptSnapshotDocumentV1['questions'][number] = {
  examQuestionId: 'q1',
  questionRevisionId: 'rev1',
  displaySequence: 1,
  marks: 5,
  questionType: 'SINGLE_CHOICE',
  content: '2 + 2 = ?',
  explanation: null,
  options: [
    { optionId: 'a', content: '3', originalOrder: 1, displayPosition: 1, correctFlag: false },
    { optionId: 'b', content: '4', originalOrder: 2, displayPosition: 2, correctFlag: true },
  ],
  media: [],
};

describe('computeAttemptQuestionMarkingResults', () => {
  it('awards full marks for a correct selection', () => {
    const answers = new Map<string, AttemptAnswerForMarking>([['q1', { selectedOptionId: 'b' }]]);
    const results = computeAttemptQuestionMarkingResults(
      document([CORRECT_ANSWER_QUESTION]),
      answers,
    );
    expect(results).toEqual([
      { examQuestionId: 'q1', correctness: 'CORRECT', awardedMarks: 5, maximumMarks: 5 },
    ]);
  });

  it('awards zero marks for an incorrect selection', () => {
    const answers = new Map<string, AttemptAnswerForMarking>([['q1', { selectedOptionId: 'a' }]]);
    const results = computeAttemptQuestionMarkingResults(
      document([CORRECT_ANSWER_QUESTION]),
      answers,
    );
    expect(results).toEqual([
      { examQuestionId: 'q1', correctness: 'INCORRECT', awardedMarks: 0, maximumMarks: 5 },
    ]);
  });

  it('marks UNANSWERED when no answer row exists for the question', () => {
    const results = computeAttemptQuestionMarkingResults(
      document([CORRECT_ANSWER_QUESTION]),
      new Map(),
    );
    expect(results).toEqual([
      { examQuestionId: 'q1', correctness: 'UNANSWERED', awardedMarks: 0, maximumMarks: 5 },
    ]);
  });

  it('marks UNANSWERED when the stored answer has a null selection', () => {
    const answers = new Map<string, AttemptAnswerForMarking>([['q1', { selectedOptionId: null }]]);
    const results = computeAttemptQuestionMarkingResults(
      document([CORRECT_ANSWER_QUESTION]),
      answers,
    );
    expect(results[0]?.correctness).toBe('UNANSWERED');
  });

  it('treats a selected option id absent from the question (data anomaly) as incorrect, not a crash', () => {
    const answers = new Map<string, AttemptAnswerForMarking>([
      ['q1', { selectedOptionId: 'does-not-exist' }],
    ]);
    const results = computeAttemptQuestionMarkingResults(
      document([CORRECT_ANSWER_QUESTION]),
      answers,
    );
    expect(results).toEqual([
      { examQuestionId: 'q1', correctness: 'INCORRECT', awardedMarks: 0, maximumMarks: 5 },
    ]);
  });

  it('computes independent per-question results across mixed per-question marks', () => {
    const secondQuestion: AttemptSnapshotDocumentV1['questions'][number] = {
      ...CORRECT_ANSWER_QUESTION,
      examQuestionId: 'q2',
      marks: 10,
      options: [
        { optionId: 'x', content: 'X', originalOrder: 1, displayPosition: 1, correctFlag: true },
        { optionId: 'y', content: 'Y', originalOrder: 2, displayPosition: 2, correctFlag: false },
      ],
    };
    const thirdQuestion: AttemptSnapshotDocumentV1['questions'][number] = {
      ...CORRECT_ANSWER_QUESTION,
      examQuestionId: 'q3',
      marks: 2,
    };
    const answers = new Map<string, AttemptAnswerForMarking>([
      ['q1', { selectedOptionId: 'b' }], // correct, 5
      ['q2', { selectedOptionId: 'y' }], // incorrect, 0 of 10
      // q3 unanswered, 0 of 2
    ]);

    const results = computeAttemptQuestionMarkingResults(
      document([CORRECT_ANSWER_QUESTION, secondQuestion, thirdQuestion]),
      answers,
    );

    expect(results).toEqual([
      { examQuestionId: 'q1', correctness: 'CORRECT', awardedMarks: 5, maximumMarks: 5 },
      { examQuestionId: 'q2', correctness: 'INCORRECT', awardedMarks: 0, maximumMarks: 10 },
      { examQuestionId: 'q3', correctness: 'UNANSWERED', awardedMarks: 0, maximumMarks: 2 },
    ]);

    // Derived totals/percentage/counts — the same aggregation GET /status
    // performs over AttemptQuestionResult rows, proven here at the level of
    // the pure function's own output shape.
    const totalAwarded = results.reduce((sum, r) => sum + r.awardedMarks, 0);
    const totalMax = results.reduce((sum, r) => sum + r.maximumMarks, 0);
    const correctCount = results.filter((r) => r.correctness === 'CORRECT').length;
    const incorrectCount = results.filter((r) => r.correctness === 'INCORRECT').length;
    const unansweredCount = results.filter((r) => r.correctness === 'UNANSWERED').length;

    expect(totalAwarded).toBe(5);
    expect(totalMax).toBe(17);
    expect(correctCount).toBe(1);
    expect(incorrectCount).toBe(1);
    expect(unansweredCount).toBe(1);
    expect(Math.round((totalAwarded / totalMax) * 10000) / 100).toBeCloseTo(29.41, 2);
  });

  it('returns an empty array for an attempt with no questions (structurally unreachable, but must not crash)', () => {
    expect(computeAttemptQuestionMarkingResults(document([]), new Map())).toEqual([]);
  });
});
