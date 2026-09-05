import { describe, expect, it } from 'vitest';
import { buildSnapshotDocument } from './attempt-snapshot-builder.js';
import type { SnapshotSourceQuestion } from './attempt-snapshot.types.js';

function question(overrides: Partial<SnapshotSourceQuestion> = {}): SnapshotSourceQuestion {
  return {
    examQuestionId: 'q1',
    questionRevisionId: 'rev1',
    sequence: 1,
    marks: 5,
    questionType: 'SINGLE_CHOICE',
    content: 'What is 2 + 2?',
    explanation: null,
    options: [
      { optionId: 'o1', content: '3', originalOrder: 1, correctFlag: false },
      { optionId: 'o2', content: '4', originalOrder: 2, correctFlag: true },
    ],
    media: [],
    ...overrides,
  };
}

const THREE_QUESTIONS: SnapshotSourceQuestion[] = [
  question({ examQuestionId: 'q1', sequence: 1 }),
  question({ examQuestionId: 'q2', sequence: 2 }),
  question({ examQuestionId: 'q3', sequence: 3 }),
];

describe('buildSnapshotDocument', () => {
  it('preserves authoring order when randomizeQuestions/randomizeOptions are both off', () => {
    const doc = buildSnapshotDocument(THREE_QUESTIONS, {
      randomizeQuestions: false,
      randomizeOptions: false,
      seed: 'seed-a',
    });
    expect(doc.questions.map((q) => q.examQuestionId)).toEqual(['q1', 'q2', 'q3']);
    expect(doc.questions.map((q) => q.displaySequence)).toEqual([1, 2, 3]);
    expect(doc.questions[0]?.options.map((o) => o.optionId)).toEqual(['o1', 'o2']);
  });

  it('is deterministic: the same seed and source always produce the same order', () => {
    const first = buildSnapshotDocument(THREE_QUESTIONS, {
      randomizeQuestions: true,
      randomizeOptions: true,
      seed: 'attempt-seed-123',
    });
    const second = buildSnapshotDocument(THREE_QUESTIONS, {
      randomizeQuestions: true,
      randomizeOptions: true,
      seed: 'attempt-seed-123',
    });
    expect(second).toEqual(first);
  });

  it('produces a different order for a different seed (proving randomization actually runs)', () => {
    // A ten-question fixture makes a same-order collision across two
    // different seeds vanishingly unlikely, keeping this a reliable,
    // non-flaky assertion rather than a probabilistic one on 3 items.
    const tenQuestions = Array.from({ length: 10 }, (_, i) =>
      question({ examQuestionId: `q${i}`, sequence: i + 1 }),
    );
    const a = buildSnapshotDocument(tenQuestions, {
      randomizeQuestions: true,
      randomizeOptions: false,
      seed: 'seed-one',
    });
    const b = buildSnapshotDocument(tenQuestions, {
      randomizeQuestions: true,
      randomizeOptions: false,
      seed: 'seed-two',
    });
    expect(a.questions.map((q) => q.examQuestionId)).not.toEqual(
      b.questions.map((q) => q.examQuestionId),
    );
  });

  it('materialises question order into displaySequence, 1-indexed and contiguous', () => {
    const doc = buildSnapshotDocument(THREE_QUESTIONS, {
      randomizeQuestions: true,
      randomizeOptions: false,
      seed: 'seed-b',
    });
    expect(doc.questions.map((q) => q.displaySequence).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('materialises option order into displayPosition independently per question', () => {
    const doc = buildSnapshotDocument(THREE_QUESTIONS, {
      randomizeQuestions: false,
      randomizeOptions: true,
      seed: 'seed-c',
    });
    for (const q of doc.questions) {
      expect(q.options.map((o) => o.displayPosition).sort((a, b) => a - b)).toEqual([1, 2]);
    }
  });

  it('stamps the current document version and the seed onto the document', () => {
    const doc = buildSnapshotDocument(THREE_QUESTIONS, {
      randomizeQuestions: false,
      randomizeOptions: false,
      seed: 'seed-d',
    });
    expect(doc.version).toBe(1);
    expect(doc.seed).toBe('seed-d');
  });

  it("carries correctFlag through into the document (server-side field — never stripped here; stripping is the projection mapper's job)", () => {
    const doc = buildSnapshotDocument(THREE_QUESTIONS, {
      randomizeQuestions: false,
      randomizeOptions: false,
      seed: 'seed-e',
    });
    const q1 = doc.questions[0];
    expect(q1?.options.find((o) => o.optionId === 'o2')?.correctFlag).toBe(true);
    expect(q1?.options.find((o) => o.optionId === 'o1')?.correctFlag).toBe(false);
  });

  it('sorts media by displayOrder and never randomizes it', () => {
    const doc = buildSnapshotDocument(
      [
        question({
          media: [
            { mediaAssetId: 'm2', displayOrder: 2, mediaType: 'QUESTION_IMAGE' },
            { mediaAssetId: 'm1', displayOrder: 1, mediaType: 'QUESTION_DIAGRAM' },
          ],
        }),
      ],
      { randomizeQuestions: true, randomizeOptions: true, seed: 'seed-f' },
    );
    expect(doc.questions[0]?.media.map((m) => m.mediaAssetId)).toEqual(['m1', 'm2']);
  });

  it('uses ExamQuestion.marks as authoritative, not any option/revision field', () => {
    const doc = buildSnapshotDocument([question({ marks: 7 })], {
      randomizeQuestions: false,
      randomizeOptions: false,
      seed: 'seed-g',
    });
    expect(doc.questions[0]?.marks).toBe(7);
  });

  it('handles an empty question list (structurally defensive — CreateExamDto.classIds requires at least one class, but a snapshot builder should not assume a non-empty exam)', () => {
    const doc = buildSnapshotDocument([], {
      randomizeQuestions: true,
      randomizeOptions: true,
      seed: 'seed-h',
    });
    expect(doc.questions).toEqual([]);
  });
});
