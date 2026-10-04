import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api';
import {
  AttemptSyncEngine,
  FLUSH_BACKOFF_BASE_MS,
  FLUSH_BACKOFF_MAX_MS,
  flushBackoffDelay,
} from './sync-engine';
import { getAttemptDb, clearAttemptData } from './db';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiClient: { ...actual.apiClient, POST: vi.fn() } };
});

const mockPost = vi.mocked(apiClient.POST);
const ATTEMPT_ID = 'attempt-sync-1';

function ok<T>(data: T) {
  return Promise.resolve({ data, response: new Response(null, { status: 200 }) } as never);
}

describe('AttemptSyncEngine', () => {
  beforeEach(async () => {
    await clearAttemptData(ATTEMPT_ID);
    mockPost.mockReset();
  });

  it('writes the answer to Dexie synchronously, before the network call resolves (DoD 6)', async () => {
    let resolveRequest: (() => void) | undefined;
    mockPost.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = () =>
          resolve(
            ok({ results: [{ examQuestionId: 'q1', accepted: true, gradeWindowFlag: false }] }),
          );
      }),
    );

    const engine = new AttemptSyncEngine(ATTEMPT_ID);
    await engine.recordAnswer('q1', 'o1');

    const db = getAttemptDb();
    const row = await db.answers.get([ATTEMPT_ID, 'q1']);
    expect(row?.selectedOptionId).toBe('o1');
    // Still pending — the network call hasn't resolved yet.
    expect(row?.syncStatus).toBe('pending');

    resolveRequest?.();
    // flushNow() awaits the engine's real promise chain (rather than a
    // fixed number of microtask ticks), so it correctly waits out whatever
    // Dexie/IndexedDB scheduling the underlying writes actually use.
    await engine.flushNow();
    const synced = await db.answers.get([ATTEMPT_ID, 'q1']);
    expect(synced?.syncStatus).toBe('synced');
  });

  it('uses the batch endpoint uniformly, even for a single pending answer', async () => {
    mockPost.mockResolvedValue(
      ok({ results: [{ examQuestionId: 'q1', accepted: true, gradeWindowFlag: false }] }),
    );
    const engine = new AttemptSyncEngine(ATTEMPT_ID);
    await engine.recordAnswer('q1', 'o1');
    await engine.flushNow();

    expect(mockPost).toHaveBeenCalledWith(
      '/attempts/{id}/answers/batch',
      expect.objectContaining({
        params: { path: { id: ATTEMPT_ID } },
        body: {
          answers: [expect.objectContaining({ examQuestionId: 'q1', selectedOptionId: 'o1' })],
        },
      }),
    );
  });

  it('DoD 9 — a stale-sequence rejection never overwrites a newer local answer', async () => {
    let resolveFirst: (() => void) | undefined;
    mockPost.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = () =>
            resolve(
              ok({
                results: [
                  {
                    examQuestionId: 'q1',
                    accepted: false,
                    rejectionCode: 'ATTEMPT_ANSWER_SEQUENCE_STALE',
                    gradeWindowFlag: false,
                  },
                ],
              }),
            );
        }) as never,
    );
    mockPost.mockResolvedValueOnce(
      ok({ results: [{ examQuestionId: 'q1', accepted: true, gradeWindowFlag: false }] }),
    );

    const engine = new AttemptSyncEngine(ATTEMPT_ID);
    await engine.recordAnswer('q1', 'o1'); // localSequence 1, sent
    // Student changes their mind before the first response lands.
    await engine.recordAnswer('q1', 'o2'); // localSequence 2, superseding
    resolveFirst?.(); // the stale response for sequence 1 arrives late
    await engine.flushNow();

    const db = getAttemptDb();
    const row = await db.answers.get([ATTEMPT_ID, 'q1']);
    expect(row?.selectedOptionId).toBe('o2');
    expect(row?.localSequence).toBe(2);
  });

  it('DoD 8 — a network failure loses nothing; a subsequent flush still succeeds', async () => {
    // The very first send fails outright (never reaches the server); the
    // engine's own next scheduled attempt (triggered by flushNow() below)
    // succeeds — nothing about the answer is lost across the failure.
    mockPost.mockRejectedValueOnce(new Error('network down'));
    mockPost.mockResolvedValueOnce(
      ok({ results: [{ examQuestionId: 'q1', accepted: true, gradeWindowFlag: false }] }),
    );

    const engine = new AttemptSyncEngine(ATTEMPT_ID);
    await engine.recordAnswer('q1', 'o1');
    await engine.flushNow();

    const db = getAttemptDb();
    const row = await db.answers.get([ATTEMPT_ID, 'q1']);
    expect(row?.syncStatus).toBe('synced');
    expect(row?.selectedOptionId).toBe('o1');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('ADR-0003 — a window-closed rejection is permanently excluded from retry', async () => {
    mockPost.mockResolvedValue(
      ok({
        results: [
          {
            examQuestionId: 'q1',
            accepted: false,
            rejectionCode: 'ATTEMPT_WRITE_WINDOW_CLOSED',
            gradeWindowFlag: true,
          },
        ],
      }),
    );
    const engine = new AttemptSyncEngine(ATTEMPT_ID);
    await engine.recordAnswer('q1', 'o1');
    await engine.flushNow();

    const db = getAttemptDb();
    const row = await db.answers.get([ATTEMPT_ID, 'q1']);
    expect(row?.syncStatus).toBe('window-closed');
    expect(row?.rejectionCode).toBe('ATTEMPT_WRITE_WINDOW_CLOSED');

    mockPost.mockClear();
    await engine.flushNow();
    // A window-closed row is never `pending` again, so the next flush finds
    // nothing to send.
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('bug fix — two near-simultaneous selections for the same question never share a sequence number', async () => {
    // Reproduces the pre-fix race directly: two `recordAnswer` calls whose
    // reads interleave before either write commits (plausible on the slow/
    // low-end hardware this product targets) used to compute the *same*
    // `localSequence` for two different selections, since the read and the
    // write weren't in one transaction. Firing them via `Promise.all`
    // forces the worst-case interleaving rather than relying on timing.
    const engine = new AttemptSyncEngine(ATTEMPT_ID);
    await Promise.all([engine.recordAnswer('q1', 'o1'), engine.recordAnswer('q1', 'o2')]);

    const db = getAttemptDb();
    const row = await db.answers.get([ATTEMPT_ID, 'q1']);
    // Whichever write logically "won" is fine — the guarantee this test
    // protects is that the two writes were assigned *distinct* sequence
    // numbers, never the same one (which would let a stale server response
    // for the loser be mistaken for confirmation of the winner's value).
    expect(row?.localSequence).toBe(2);
  });

  it('calls onNotWritable when the whole request fails with ATTEMPT_NOT_WRITABLE, without losing the pending answer', async () => {
    const { ApiError } = await vi.importActual<typeof import('@/lib/api/error')>('@/lib/api/error');
    mockPost.mockImplementationOnce(() => {
      throw new ApiError({
        code: 'ATTEMPT_NOT_WRITABLE',
        message: 'no',
        retryable: false,
        correlationId: 'c1',
      });
    });
    const onNotWritable = vi.fn();
    const engine = new AttemptSyncEngine(ATTEMPT_ID, onNotWritable);
    await engine.recordAnswer('q1', 'o1');
    await engine.flushNow();

    expect(onNotWritable).toHaveBeenCalledTimes(1);
    const db = getAttemptDb();
    const row = await db.answers.get([ATTEMPT_ID, 'q1']);
    expect(row?.selectedOptionId).toBe('o1');
    expect(row?.syncStatus).toBe('pending');
  });

  it('F20 — every batch request carries a timeout signal, so a hung request releases the chain', async () => {
    mockPost.mockResolvedValue(
      ok({ results: [{ examQuestionId: 'q1', accepted: true, gradeWindowFlag: false }] }),
    );
    const engine = new AttemptSyncEngine(ATTEMPT_ID);
    await engine.recordAnswer('q1', 'o1');
    await engine.flushNow();
    const init = mockPost.mock.calls[0]![1] as { signal?: AbortSignal };
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('F20 — after a failure, answer-triggered flushes back off; answers still save locally', async () => {
    mockPost.mockRejectedValueOnce(new Error('network down'));
    const engine = new AttemptSyncEngine(ATTEMPT_ID);
    await engine.recordAnswer('q1', 'o1'); // its own flush fails
    const db = getAttemptDb();
    await vi.waitFor(async () => {
      expect(mockPost).toHaveBeenCalledTimes(1);
      expect((await db.answers.get([ATTEMPT_ID, 'q1']))?.syncStatus).toBe('pending');
    });

    // Inside the backoff window: the local write happens, the network retry waits.
    await engine.recordAnswer('q2', 'o9');
    expect((await db.answers.get([ATTEMPT_ID, 'q2']))?.syncStatus).toBe('pending');
    expect(mockPost).toHaveBeenCalledTimes(1);

    // A forced flush (heartbeat tick / pre-submit) always tries.
    mockPost.mockResolvedValueOnce(
      ok({
        results: [
          { examQuestionId: 'q1', accepted: true, gradeWindowFlag: false },
          { examQuestionId: 'q2', accepted: true, gradeWindowFlag: false },
        ],
      }),
    );
    await engine.flushNow();
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect((await db.answers.get([ATTEMPT_ID, 'q2']))?.syncStatus).toBe('synced');
  });
});

describe('flushBackoffDelay', () => {
  it('grows exponentially with jitter, caps, and never undercuts Retry-After', () => {
    expect(flushBackoffDelay(1, undefined, () => 0)).toBe(FLUSH_BACKOFF_BASE_MS / 2);
    expect(flushBackoffDelay(3, undefined, () => 1)).toBe(4_000);
    expect(flushBackoffDelay(20, undefined, () => 1)).toBe(FLUSH_BACKOFF_MAX_MS);
    expect(flushBackoffDelay(1, 20_000, () => 0)).toBe(20_000);
  });
});
