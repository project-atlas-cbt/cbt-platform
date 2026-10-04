/**
 * B22 decision 2c: the server's database is restored to a point in time T
 * (PITR) while a student's exam page stays open. Answers the server
 * acknowledged after T are gone from the server, but the client holds them
 * as `synced`. When the client reconnects — no reload — it must find out
 * and send them again. (A reload is covered by `reconcileAttemptOnLoad`.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api';
import { ApiError } from '@/lib/api/error';
import { AttemptSyncEngine } from './sync-engine';
import { getAttemptDb, clearAttemptData } from './db';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { ...actual.apiClient, POST: vi.fn(), GET: vi.fn() } };
});

const mockPost = vi.mocked(apiClient.POST);
const mockGet = vi.mocked(apiClient.GET);
const ATTEMPT_ID = 'attempt-rollback-1';

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

function question(id: string, selectedOptionId: string | null, answerSequenceNumber: number) {
  return {
    examQuestionId: id,
    displaySequence: Number(id.slice(1)),
    marks: 1,
    questionType: 'MULTIPLE_CHOICE',
    content: `<p>${id}</p>`,
    options: [
      { optionId: 'a', content: 'A', displayPosition: 1 },
      { optionId: 'b', content: 'B', displayPosition: 2 },
    ],
    media: [],
    selectedOptionId,
    answerSequenceNumber,
  };
}

function serverPackage(questions: ReturnType<typeof question>[], state = 'IN_PROGRESS') {
  return {
    attemptId: ATTEMPT_ID,
    examId: 'exam-1',
    examSessionId: 'session-1',
    state,
    startedAt: '2026-01-01T10:00:00.000Z',
    expiresAt: '2099-01-01T11:00:00.000Z',
    serverTime: new Date().toISOString(),
    navigationPolicy: 'FREE',
    largerText: false,
    generalInstructions: null,
    navigationInstructions: null,
    mediaKey: null,
    questions,
  };
}

/** The server accepts every answer in each batch. */
function acceptAll() {
  mockPost.mockImplementation(((
    _path: string,
    init: { body: { answers: { examQuestionId: string }[] } },
  ) =>
    ok({
      results: init.body.answers.map((a) => ({
        examQuestionId: a.examQuestionId,
        accepted: true,
        gradeWindowFlag: false,
      })),
    })) as never);
}

function sentQuestionIds(): string[] {
  return (mockPost.mock.calls as unknown as [string, unknown][]).flatMap(([, init]) =>
    (init as { body: { answers: { examQuestionId: string }[] } }).body.answers.map(
      (a) => a.examQuestionId,
    ),
  );
}

const engines: AttemptSyncEngine[] = [];

describe('AttemptSyncEngine — answers rolled back by a database restore (B22 2c)', () => {
  beforeEach(async () => {
    await clearAttemptData(ATTEMPT_ID);
    mockPost.mockReset();
    mockGet.mockReset();
  });
  afterEach(() => {
    for (const engine of engines.splice(0)) engine.dispose();
  });

  it('resends answers acknowledged after the restore point when the page reconnects, without a reload', async () => {
    acceptAll();
    const engine = new AttemptSyncEngine(ATTEMPT_ID);
    engines.push(engine);

    // Before T: q1 answered and acknowledged.
    await engine.recordAnswer('q1', 'a');
    await engine.flushNow();
    // After T: q2 answered, q1 changed — both acknowledged.
    await engine.recordAnswer('q2', 'b');
    await engine.recordAnswer('q1', 'b');
    await engine.flushNow();
    const db = getAttemptDb();
    expect((await db.answers.get([ATTEMPT_ID, 'q1']))?.syncStatus).toBe('synced');
    expect((await db.answers.get([ATTEMPT_ID, 'q2']))?.syncStatus).toBe('synced');

    // The database is restored to T: the server holds q1 = 'a' (sequence
    // 1) and no answer for q2. The page stays open; it loses the server,
    // then reconnects.
    mockPost.mockClear();
    mockGet.mockImplementation(() =>
      ok(serverPackage([question('q1', 'a', 1), question('q2', null, 0)])),
    );
    engine.onReconnect();
    await engine.flushNow();

    // Both answers lost by the restore are sent again, at their own
    // (higher) sequence numbers; the server accepts them.
    expect(sentQuestionIds().sort()).toEqual(['q1', 'q2']);
    const resent = (mockPost.mock.calls as unknown as [string, unknown][]).flatMap(
      ([, init]) =>
        (
          init as {
            body: {
              answers: {
                examQuestionId: string;
                selectedOptionId: string;
                sequenceNumber: number;
              }[];
            };
          }
        ).body.answers,
    );
    expect(resent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ examQuestionId: 'q1', selectedOptionId: 'b', sequenceNumber: 2 }),
        expect.objectContaining({ examQuestionId: 'q2', selectedOptionId: 'b', sequenceNumber: 1 }),
      ]),
    );
    expect((await db.answers.get([ATTEMPT_ID, 'q1']))?.syncStatus).toBe('synced');
    expect((await db.answers.get([ATTEMPT_ID, 'q2']))?.syncStatus).toBe('synced');
  });

  it('resends nothing when the server still holds every answer', async () => {
    acceptAll();
    const engine = new AttemptSyncEngine(ATTEMPT_ID);
    engines.push(engine);
    await engine.recordAnswer('q1', 'a');
    await engine.flushNow();

    mockPost.mockClear();
    mockGet.mockImplementation(() => ok(serverPackage([question('q1', 'a', 1)])));
    engine.onReconnect();
    await engine.flushNow();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('an attempt the server no longer has is reported, and its answers stay on the device', async () => {
    acceptAll();
    const onMissing = vi.fn();
    const engine = new AttemptSyncEngine(ATTEMPT_ID);
    engine.setOnAttemptMissing(onMissing);
    engines.push(engine);
    await engine.recordAnswer('q1', 'a');
    await engine.flushNow();

    // Restored to before the attempt was started.
    mockGet.mockImplementation(() => {
      throw new ApiError({
        code: 'NOT_FOUND',
        message: 'Attempt not found.',
        retryable: false,
        correlationId: 'c1',
        httpStatus: 404,
      });
    });
    engine.onReconnect();
    await engine.flushNow();

    expect(onMissing).toHaveBeenCalledTimes(1);
    const row = await getAttemptDb().answers.get([ATTEMPT_ID, 'q1']);
    expect(row?.selectedOptionId).toBe('a');
  });

  it('a submitted attempt is handed to the not-writable path', async () => {
    acceptAll();
    const onNotWritable = vi.fn();
    const engine = new AttemptSyncEngine(ATTEMPT_ID, onNotWritable);
    engines.push(engine);
    mockGet.mockImplementation(() => ok(serverPackage([], 'SUBMITTED')));
    engine.onReconnect();
    await engine.flushNow();
    expect(onNotWritable).toHaveBeenCalledTimes(1);
  });

  it('W3: items the server could not save (its database failed mid-request) are retried by themselves', async () => {
    mockPost
      .mockImplementationOnce(() =>
        ok({
          results: [
            {
              examQuestionId: 'q1',
              accepted: false,
              rejectionCode: 'INTERNAL',
              gradeWindowFlag: false,
            },
          ],
        }),
      )
      .mockImplementation(() =>
        ok({ results: [{ examQuestionId: 'q1', accepted: true, gradeWindowFlag: false }] }),
      );
    const engine = new AttemptSyncEngine(ATTEMPT_ID);
    engines.push(engine);
    await engine.recordAnswer('q1', 'a');
    await vi.waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    // No new answer and no heartbeat: the backoff retry alone (0.5–1 s)
    // sends it again.
    await vi.waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2), { timeout: 3_000 });
    await vi.waitFor(async () =>
      expect((await getAttemptDb().answers.get([ATTEMPT_ID, 'q1']))?.syncStatus).toBe('synced'),
    );
  });
});
