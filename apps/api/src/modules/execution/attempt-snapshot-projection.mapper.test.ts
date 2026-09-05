import { describe, expect, it } from 'vitest';
import { toStudentAttemptQuestions } from './attempt-snapshot-projection.mapper.js';
import type { AttemptSnapshotDocumentV1 } from './attempt-snapshot.types.js';

const DOCUMENT: AttemptSnapshotDocumentV1 = {
  version: 1,
  seed: 'seed-x',
  questions: [
    {
      examQuestionId: 'eq2',
      questionRevisionId: 'rev2',
      displaySequence: 2,
      marks: 5,
      questionType: 'SINGLE_CHOICE',
      content: 'Second question',
      explanation: 'an explanation the student should never see either',
      options: [
        { optionId: 'o2b', content: 'B', originalOrder: 2, displayPosition: 2, correctFlag: false },
        { optionId: 'o2a', content: 'A', originalOrder: 1, displayPosition: 1, correctFlag: true },
      ],
      media: [{ mediaAssetId: 'm1', displayOrder: 1, mediaType: 'QUESTION_IMAGE' }],
    },
    {
      examQuestionId: 'eq1',
      questionRevisionId: 'rev1',
      displaySequence: 1,
      marks: 3,
      questionType: 'TRUE_FALSE',
      content: 'First question',
      explanation: null,
      options: [
        {
          optionId: 'o1a',
          content: 'True',
          originalOrder: 1,
          displayPosition: 1,
          correctFlag: true,
        },
        {
          optionId: 'o1b',
          content: 'False',
          originalOrder: 2,
          displayPosition: 2,
          correctFlag: false,
        },
      ],
      media: [],
    },
  ],
};

describe('toStudentAttemptQuestions (X-05)', () => {
  it('never includes correctFlag anywhere in the serialized output', () => {
    const result = toStudentAttemptQuestions(DOCUMENT, new Map(), new Map());
    expect(JSON.stringify(result)).not.toContain('correctFlag');
    expect(JSON.stringify(result)).not.toContain('correct_answer');
  });

  it('orders questions by displaySequence, not source array order', () => {
    const result = toStudentAttemptQuestions(DOCUMENT, new Map(), new Map());
    expect(result.map((q) => q.examQuestionId)).toEqual(['eq1', 'eq2']);
  });

  it('orders options by displayPosition, not source array order', () => {
    const result = toStudentAttemptQuestions(DOCUMENT, new Map(), new Map());
    const q2 = result.find((q) => q.examQuestionId === 'eq2');
    expect(q2?.options.map((o) => o.optionId)).toEqual(['o2a', 'o2b']);
  });

  it('projects only optionId/content/displayPosition per option — nothing else', () => {
    const result = toStudentAttemptQuestions(DOCUMENT, new Map(), new Map());
    const option = result[0]?.options[0];
    expect(Object.keys(option ?? {}).sort()).toEqual(['content', 'displayPosition', 'optionId']);
  });

  it('resolves the saved answer for a question when present', () => {
    const answers = new Map([['eq1', { selectedOptionId: 'o1b', sequenceNumber: 3 }]]);
    const result = toStudentAttemptQuestions(DOCUMENT, answers, new Map());
    const q1 = result.find((q) => q.examQuestionId === 'eq1');
    expect(q1?.selectedOptionId).toBe('o1b');
    expect(q1?.answerSequenceNumber).toBe(3);
  });

  it('reports null (not undefined) for an unanswered question', () => {
    const result = toStudentAttemptQuestions(DOCUMENT, new Map(), new Map());
    expect(result[0]?.selectedOptionId).toBeNull();
    expect(result[0]?.answerSequenceNumber).toBeUndefined();
  });

  it('resolves media URLs from the pre-resolved map, defaulting to empty strings when unresolved', () => {
    const mediaUrls = new Map([
      ['m1', { url: 'https://signed.example/m1', expiresAt: '2026-01-01T00:00:00.000Z' }],
    ]);
    const result = toStudentAttemptQuestions(DOCUMENT, new Map(), mediaUrls);
    const q2 = result.find((q) => q.examQuestionId === 'eq2');
    expect(q2?.media[0]?.url).toBe('https://signed.example/m1');
    expect(q2?.media[0]?.urlExpiresAt).toBe('2026-01-01T00:00:00.000Z');

    const unresolved = toStudentAttemptQuestions(DOCUMENT, new Map(), new Map());
    const q2Unresolved = unresolved.find((q) => q.examQuestionId === 'eq2');
    expect(q2Unresolved?.media[0]?.url).toBe('');
  });

  it("never includes the question's explanation field (marking-only metadata)", () => {
    const result = toStudentAttemptQuestions(DOCUMENT, new Map(), new Map());
    expect(JSON.stringify(result)).not.toContain('explanation');
  });
});
