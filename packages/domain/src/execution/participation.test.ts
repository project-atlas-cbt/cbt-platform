import { describe, expect, it } from 'vitest';
import { rollUpExamParticipation, rollUpParticipation } from './participation.js';

describe('rollUpParticipation', () => {
  it('prefers an attended makeup over an earlier absence', () => {
    expect(
      rollUpParticipation([
        { status: 'ABSENT', hasNonInvalidatedAttempt: false },
        { status: 'ATTENDED', hasNonInvalidatedAttempt: true },
      ]),
    ).toBe('ATTENDED');
  });

  it('does not treat an invalidated attempt as attendance', () => {
    expect(
      rollUpParticipation([
        { status: 'ABSENT', hasNonInvalidatedAttempt: false },
        { status: 'ATTENDED', hasNonInvalidatedAttempt: false },
      ]),
    ).toBe('ABSENT');
  });

  it('keeps unrecorded participation pending', () => {
    expect(rollUpParticipation([{ status: null, hasNonInvalidatedAttempt: false }])).toBe(
      'PENDING',
    );
  });
});

describe('rollUpExamParticipation (B21 linear-time roll-up)', () => {
  const naive = (input: Parameters<typeof rollUpExamParticipation>[0]) =>
    [...new Set(input.participants.map((p) => p.studentProfileId))].map((studentProfileId) =>
      rollUpParticipation(
        input.participants
          .filter((p) => p.studentProfileId === studentProfileId)
          .map((p) => ({
            status:
              input.participations.find(
                (e) =>
                  e.studentProfileId === studentProfileId && e.examSessionId === p.examSessionId,
              )?.status ?? null,
            hasNonInvalidatedAttempt: input.attempts.some(
              (a) =>
                a.studentProfileId === studentProfileId &&
                a.examSessionId === p.examSessionId &&
                a.state !== 'INVALIDATED' &&
                a.state !== 'CANCELLED',
            ),
          })),
      ),
    );

  it('matches the per-student reference implementation on a mixed exam', () => {
    const students = Array.from({ length: 60 }, (_, i) => `s${i}`);
    const sessions = ['main', 'makeup'];
    const participants = students.flatMap((s, i) =>
      i % 3 === 0
        ? sessions.map((examSessionId) => ({ studentProfileId: s, examSessionId }))
        : [{ studentProfileId: s, examSessionId: 'main' }],
    );
    const statuses = ['ATTENDED', 'ABSENT'] as const;
    const participations = students
      .filter((_, i) => i % 2 === 0)
      .map((s, i) => ({ studentProfileId: s, examSessionId: 'main', status: statuses[i % 2]! }));
    const states = ['IN_PROGRESS', 'SUBMITTED', 'INVALIDATED', 'CANCELLED', 'AUTO_SUBMITTED'];
    const attempts = students
      .filter((_, i) => i % 4 !== 1)
      .map((s, i) => ({
        studentProfileId: s,
        examSessionId: i % 5 === 0 ? 'makeup' : 'main',
        state: states[i % states.length]!,
      }));
    const input = { participants, participations, attempts };
    expect(rollUpExamParticipation(input)).toEqual(naive(input));
  });

  it('is linear: 5,000 students roll up quickly', () => {
    const participants = Array.from({ length: 5_000 }, (_, i) => ({
      studentProfileId: `s${i}`,
      examSessionId: 'main',
    }));
    const attempts = participants.map((p) => ({ ...p, state: 'IN_PROGRESS' }));
    const started = performance.now();
    const out = rollUpExamParticipation({ participants, participations: [], attempts });
    expect(out).toHaveLength(5_000);
    expect(out.every((s) => s === 'ATTENDED')).toBe(true);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
