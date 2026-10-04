import { describe, expect, it } from 'vitest';
import { diffAttempts, type AttemptFingerprint } from './attempts-affected.js';

const a = (id: string, over: Partial<AttemptFingerprint> = {}): AttemptFingerprint => ({
  attemptId: id,
  schoolId: 's',
  examId: 'e',
  studentProfileId: `p-${id}`,
  state: 'SUBMITTED',
  answers: 10,
  sequenceSum: 14,
  resultState: 'FINAL',
  ...over,
});

describe('B22 attempts affected by a point-in-time restore', () => {
  it('reports nothing when the restore holds everything', () => {
    expect(diffAttempts([a('1'), a('2')], [a('1'), a('2')])).toEqual([]);
  });

  it('classifies each kind of rollback', () => {
    const old = [
      a('missing'),
      a('reopened'),
      a('answers', { state: 'IN_PROGRESS', resultState: null }),
      a('unmarked'),
    ];
    const restored = [
      a('reopened', { state: 'IN_PROGRESS', resultState: null, answers: 8, sequenceSum: 9 }),
      a('answers', { state: 'IN_PROGRESS', resultState: null, answers: 10, sequenceSum: 12 }),
      a('unmarked', { resultState: 'PROCESSING' }),
    ];
    const kinds = diffAttempts(old, restored).map((x) => `${x.attemptId}:${x.kind}`);
    expect(kinds).toEqual([
      'missing:MISSING',
      'reopened:STATE_ROLLED_BACK',
      'reopened:ANSWERS_ROLLED_BACK',
      'reopened:RESULT_ROLLED_BACK',
      'answers:ANSWERS_ROLLED_BACK',
      'unmarked:RESULT_ROLLED_BACK',
    ]);
  });

  it('an attempt the restore holds but the old instance never had is not affected', () => {
    // (Only possible if the old instance is itself older — never reported.)
    expect(diffAttempts([], [a('new')])).toEqual([]);
  });
});
