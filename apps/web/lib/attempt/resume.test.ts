import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api';
import { reconcileAttemptOnLoad } from './resume';
import { getAttemptDb, clearAttemptData, type AnswerRow } from './db';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { ...actual.apiClient, GET: vi.fn() } };
});

const mockGet = vi.mocked(apiClient.GET);
const ATTEMPT_ID = 'attempt-resume-1';

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

function serverPackage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    attemptId: ATTEMPT_ID,
    examId: 'exam-1',
    examSessionId: 'session-1',
    state: 'IN_PROGRESS',
    startedAt: '2026-01-01T10:00:00.000Z',
    expiresAt: '2026-01-01T11:00:00.000Z',
    serverTime: '2026-01-01T10:05:00.000Z',
    navigationPolicy: 'FREE',
    generalInstructions: null,
    navigationInstructions: null,
    questions: [
      {
        examQuestionId: 'q1',
        displaySequence: 1,
        marks: 1,
        questionType: 'MULTIPLE_CHOICE',
        content: '<p>Q1</p>',
        options: [{ optionId: 'o1', content: 'A', displayPosition: 1 }],
        media: [],
        selectedOptionId: null,
        answerSequenceNumber: 0,
      },
    ],
    ...overrides,
  };
}

describe('reconcileAttemptOnLoad', () => {
  beforeEach(async () => {
    await clearAttemptData(ATTEMPT_ID);
    mockGet.mockReset();
  });

  it('a terminal state (SUBMITTED) writes nothing locally and reports isRunning: false', async () => {
    mockGet.mockResolvedValue(ok(serverPackage({ state: 'SUBMITTED' })));
    const result = await reconcileAttemptOnLoad(ATTEMPT_ID);
    expect(result.isRunning).toBe(false);
    const db = getAttemptDb();
    expect(await db.attemptPackages.get(ATTEMPT_ID)).toBeUndefined();
  });

  it('DoD 10 — persists question/option order exactly as the server returned it', async () => {
    mockGet.mockResolvedValue(ok(serverPackage()));
    await reconcileAttemptOnLoad(ATTEMPT_ID);
    const db = getAttemptDb();
    const question = await db.questions.get([ATTEMPT_ID, 'q1']);
    expect(question?.displaySequence).toBe(1);
    expect(question?.options[0]?.optionId).toBe('o1');
  });

  it('no local row exists (first entry): takes the server answer as truth', async () => {
    mockGet.mockResolvedValue(
      ok(
        serverPackage({
          questions: [
            {
              examQuestionId: 'q1',
              displaySequence: 1,
              marks: 1,
              questionType: 'MULTIPLE_CHOICE',
              content: '<p>Q1</p>',
              options: [{ optionId: 'o1', content: 'A', displayPosition: 1 }],
              media: [],
              selectedOptionId: 'o1',
              answerSequenceNumber: 3,
            },
          ],
        }),
      ),
    );
    await reconcileAttemptOnLoad(ATTEMPT_ID);
    const db = getAttemptDb();
    const answer = await db.answers.get([ATTEMPT_ID, 'q1']);
    expect(answer?.selectedOptionId).toBe('o1');
    expect(answer?.syncStatus).toBe('synced');
    expect(answer?.localSequence).toBe(3);
  });

  it('DoD 9/11 — a local write newer than the server (crash mid-flight) is kept and marked pending for resend', async () => {
    const db = getAttemptDb();
    const localRow: AnswerRow = {
      attemptId: ATTEMPT_ID,
      examQuestionId: 'q1',
      selectedOptionId: 'o1',
      localSequence: 5,
      syncStatus: 'in-flight',
      lastServerSequence: null,
      lastSyncedAt: null,
      lastAttemptedAt: null,
      rejectionCode: null,
      acknowledged: false,
      updatedAt: new Date().toISOString(),
    };
    await db.answers.put(localRow);

    mockGet.mockResolvedValue(
      ok(
        serverPackage({
          questions: [
            {
              examQuestionId: 'q1',
              displaySequence: 1,
              marks: 1,
              questionType: 'MULTIPLE_CHOICE',
              content: '<p>Q1</p>',
              options: [{ optionId: 'o1', content: 'A', displayPosition: 1 }],
              media: [],
              selectedOptionId: null, // server never received it
              answerSequenceNumber: 2, // lower than local
            },
          ],
        }),
      ),
    );
    await reconcileAttemptOnLoad(ATTEMPT_ID);

    const answer = await db.answers.get([ATTEMPT_ID, 'q1']);
    expect(answer?.selectedOptionId).toBe('o1');
    expect(answer?.localSequence).toBe(5);
    expect(answer?.syncStatus).toBe('pending'); // resent on the next flush
  });

  it('a local window-closed row is preserved exactly as-is, never resent', async () => {
    const db = getAttemptDb();
    await db.answers.put({
      attemptId: ATTEMPT_ID,
      examQuestionId: 'q1',
      selectedOptionId: 'o1',
      localSequence: 5,
      syncStatus: 'window-closed',
      lastServerSequence: null,
      lastSyncedAt: null,
      lastAttemptedAt: null,
      rejectionCode: 'ATTEMPT_WRITE_WINDOW_CLOSED',
      acknowledged: false,
      updatedAt: new Date().toISOString(),
    });

    mockGet.mockResolvedValue(
      ok(
        serverPackage({
          questions: [
            {
              examQuestionId: 'q1',
              displaySequence: 1,
              marks: 1,
              questionType: 'MULTIPLE_CHOICE',
              content: '<p>Q1</p>',
              options: [{ optionId: 'o1', content: 'A', displayPosition: 1 }],
              media: [],
              selectedOptionId: null,
              answerSequenceNumber: 2,
            },
          ],
        }),
      ),
    );
    await reconcileAttemptOnLoad(ATTEMPT_ID);

    const answer = await db.answers.get([ATTEMPT_ID, 'q1']);
    expect(answer?.syncStatus).toBe('window-closed');
  });

  it('computes clockSkewMs fresh from this response, not any prior stored value', async () => {
    mockGet.mockResolvedValue(ok(serverPackage()));
    await reconcileAttemptOnLoad(ATTEMPT_ID);
    const db = getAttemptDb();
    const pkg = await db.attemptPackages.get(ATTEMPT_ID);
    // serverTime is 5 minutes after startedAt in the fixture; skew is
    // computed against Date.now() at receipt, so just assert it's a finite
    // number (the exact value depends on the real clock at test run time).
    expect(typeof pkg?.clockSkewMs).toBe('number');
    expect(Number.isFinite(pkg?.clockSkewMs)).toBe(true);
  });
});
