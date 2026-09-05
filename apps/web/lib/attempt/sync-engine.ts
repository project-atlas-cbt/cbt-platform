import { apiClient, unwrap } from '@/lib/api';
import { ApiError, NetworkError } from '@/lib/api/error';
import { getAttemptDb, type AnswerRow } from './db';
import { connectivityStore } from './connectivity-store';
import { isNotWritableError, isQuestionNotInSnapshotError } from './error-utils';

/**
 * F13 — the offline answer sync engine (ADR-0003/ADR-0007). Owns the
 * write-then-flush lifecycle for one attempt's answers.
 *
 * **Write path**: `recordAnswer` writes to Dexie synchronously (relative to
 * the UI — before any network call) with an incremented `localSequence` and
 * `syncStatus: 'pending'`. The on-screen "answered" state (read by
 * `question-navigator.tsx` via `useLiveQuery` directly against Dexie) updates
 * in the same tick this returns, satisfying DoD 6 ("answers persist locally
 * immediately"). A separate, serialized flush chain then does the network
 * work — adapting `question-editor-screen.tsx`'s (F9) `saveChainRef`
 * discipline: every `scheduleFlush()` call chains onto the same promise, so
 * at most one `POST .../answers/batch` request is ever in flight for this
 * attempt, no matter how many questions changed in between.
 *
 * **Never per-question single calls once more than one row is pending** —
 * `flush()` always uses the batch endpoint uniformly (even for exactly one
 * pending row), matching that endpoint's own "per-item, never all-or-
 * nothing" contract.
 */
export class AttemptSyncEngine {
  private flushChain: Promise<void> = Promise.resolve();

  /** Bug fix (see `recordAnswer`'s own doc comment): serializes the read-
   * modify-write itself, exactly like `flushChain` already serializes
   * network flushes — a second, independent chain, since a write must
   * never wait behind a flush (ADR-0020/DoD 6: answering is never blocked
   * by network activity) and a flush must never wait behind a write either
   * (it only ever reads whatever is *currently* `pending`). An explicit
   * `db.transaction()` around the read+write was tried first and reverted:
   * under fake-indexeddb (this codebase's IndexedDB test double), a
   * `recordAnswer` transaction genuinely deadlocked against a concurrently
   * in-flight `flush()`'s own separate implicit transactions on the same
   * table — reproduced by this file's own `sync-engine.test.ts` DoD-9 case
   * hanging indefinitely. Plain promise-chain serialization (no second
   * Dexie transaction) gives the same "no two `recordAnswer` calls for one
   * question can interleave their read and write" guarantee without ever
   * touching Dexie's own transaction scheduler for it. */
  private writeChain: Promise<void> = Promise.resolve();

  /** Called when a flush discovers the attempt itself has left
   *  `IN_PROGRESS` (submitted elsewhere, invalidated, a structural
   *  mismatch) — never thrown out of `scheduleFlush()`'s chain, since a
   *  rejected link would otherwise break every subsequent `.then()`.
   *  Mutable (not constructor-only) so `use-attempt-sync-engine.ts` can keep
   *  it current via a `useEffect` without ever reading a ref inside a
   *  `useMemo` factory (this codebase's `react-hooks/refs` lint rule flags
   *  that as a static syntactic hazard even when the actual invocation is
   *  safely deferred). */
  private onNotWritable: (() => void) | undefined;

  constructor(
    private readonly attemptId: string,
    onNotWritable?: () => void,
  ) {
    this.onNotWritable = onNotWritable;
  }

  setOnNotWritable(callback: () => void): void {
    this.onNotWritable = callback;
  }

  /** Writes the new answer to Dexie and schedules a flush. Does not await
   * the network round-trip — callers that need to know the flush finished
   * (e.g. before submitting) should call `flushNow()` directly instead.
   *
   * Bug fix: the read (`existing`) and the write (`put`) are now serialized
   * through `writeChain`. Previously they were two separate awaited
   * operations with nothing serializing them — two `recordAnswer` calls
   * for the *same question* close enough together (both `get()`s resolving
   * before either `put()`, plausible on the slow/low-end hardware this
   * product explicitly targets) could read the same `existing` row and
   * compute the *same* `localSequence` for two different selections. If the
   * first (stale) value reached the server first, the second (real, later)
   * value's flush would then be rejected as `ATTEMPT_ANSWER_SEQUENCE_STALE`
   * — a rejection `applyBatchResults` treats as "the server already has
   * this exact value" — silently and permanently losing the student's
   * actual answer with no error ever surfaced. */
  async recordAnswer(examQuestionId: string, selectedOptionId: string | null): Promise<void> {
    const db = getAttemptDb();
    const task = this.writeChain.then(async () => {
      const existing = await db.answers.get([this.attemptId, examQuestionId]);
      const localSequence = (existing?.localSequence ?? 0) + 1;
      const row: AnswerRow = {
        attemptId: this.attemptId,
        examQuestionId,
        selectedOptionId,
        localSequence,
        syncStatus: 'pending',
        lastServerSequence: existing?.lastServerSequence ?? null,
        lastSyncedAt: existing?.lastSyncedAt ?? null,
        lastAttemptedAt: null,
        rejectionCode: null,
        acknowledged: false,
        updatedAt: new Date().toISOString(),
      };
      await db.answers.put(row);
    });
    // A rejected link must never break the chain for the next write —
    // mirrors `scheduleFlush()`'s own `.catch(() => undefined)` precedent.
    this.writeChain = task.catch(() => undefined);
    await task;
    this.scheduleFlush();
  }

  /** Chains `flush()` onto the engine's single serialized queue — safe to
   * call any number of times; only one network request is ever in flight. */
  scheduleFlush(): void {
    this.flushChain = this.flushChain.then(() => this.flush()).catch(() => undefined);
  }

  /** Awaits the current flush chain to settle — used before a final submit
   * to make a best-effort attempt at getting every answer to the server
   * first (the server-side submit itself still works correctly even if some
   * answers are still `pending` locally; this is a best-effort courtesy,
   * not a correctness dependency). */
  async flushNow(): Promise<void> {
    this.scheduleFlush();
    await this.flushChain;
  }

  private async flush(): Promise<void> {
    const db = getAttemptDb();
    const pending = await db.answers
      .where('[attemptId+syncStatus]')
      .equals([this.attemptId, 'pending'])
      .toArray();
    if (pending.length === 0) return;

    const sentSequenceByQuestion = new Map<string, number>();
    for (const row of pending) sentSequenceByQuestion.set(row.examQuestionId, row.localSequence);

    await db.answers
      .where('[attemptId+syncStatus]')
      .equals([this.attemptId, 'pending'])
      .modify({ syncStatus: 'in-flight' });

    const source: 'online' | 'offline-replay' =
      connectivityStore.getSnapshot() === 'offline' ? 'offline-replay' : 'online';

    try {
      const response = await unwrap(
        apiClient.POST('/attempts/{id}/answers/batch', {
          params: { path: { id: this.attemptId } },
          body: {
            answers: pending.map((row) => ({
              examQuestionId: row.examQuestionId,
              selectedOptionId: row.selectedOptionId,
              sequenceNumber: row.localSequence,
              source,
            })),
          },
        }),
      );
      connectivityStore.reportSuccess();
      await this.applyBatchResults(response.results, sentSequenceByQuestion);
    } catch (error) {
      if (error instanceof NetworkError) {
        connectivityStore.reportFailure();
        await this.revertInFlightToPending();
        return;
      }
      if (
        error instanceof ApiError &&
        (isNotWritableError(error) || isQuestionNotInSnapshotError(error))
      ) {
        // The attempt itself changed state (submitted/invalidated/etc.) or a
        // structural mismatch occurred — neither is something this engine
        // should keep retrying against. Revert to `pending` (nothing is
        // lost) and let the resume/reconciliation flow (resume.ts) take
        // over via the caller-supplied callback.
        await this.revertInFlightToPending();
        this.onNotWritable?.();
        return;
      }
      // Any other unexpected error: treat conservatively like a network
      // failure — never drop data on an error this engine doesn't recognise.
      await this.revertInFlightToPending();
    }
  }

  private async applyBatchResults(
    results: readonly { examQuestionId: string; accepted: boolean; rejectionCode?: string }[],
    sentSequenceByQuestion: Map<string, number>,
  ): Promise<void> {
    const db = getAttemptDb();
    for (const result of results) {
      const sentSequence = sentSequenceByQuestion.get(result.examQuestionId);
      if (sentSequence === undefined) continue;
      const row = await db.answers.get([this.attemptId, result.examQuestionId]);
      if (!row) continue;

      // A newer local write superseded this one while the request was in
      // flight — it already flipped syncStatus back to 'pending' with a
      // higher localSequence. Never let this stale response touch it
      // (DoD 9: out-of-order replay must never overwrite a newer answer).
      if (row.syncStatus !== 'in-flight' || row.localSequence !== sentSequence) continue;

      if (result.accepted) {
        await db.answers.update([this.attemptId, result.examQuestionId], {
          syncStatus: 'synced',
          lastServerSequence: sentSequence,
          lastSyncedAt: new Date().toISOString(),
          lastAttemptedAt: new Date().toISOString(),
        });
        continue;
      }

      if (result.rejectionCode === 'ATTEMPT_WRITE_WINDOW_CLOSED') {
        // ADR-0003: never silently drop — permanently excluded from retry,
        // surfaced via grace-window-banner.tsx.
        await db.answers.update([this.attemptId, result.examQuestionId], {
          syncStatus: 'window-closed',
          rejectionCode: result.rejectionCode,
          acknowledged: false,
          lastAttemptedAt: new Date().toISOString(),
        });
        continue;
      }

      if (result.rejectionCode === 'ATTEMPT_ANSWER_SEQUENCE_STALE') {
        // The server already holds this exact value (or something the
        // client will reconcile on its own next resume) — a benign,
        // expected outcome of out-of-order replay, not a real error.
        await db.answers.update([this.attemptId, result.examQuestionId], {
          syncStatus: 'synced',
          lastServerSequence: sentSequence,
          lastSyncedAt: new Date().toISOString(),
          lastAttemptedAt: new Date().toISOString(),
        });
        continue;
      }

      // Any other/unknown per-item rejection: revert to pending so the next
      // flush cycle retries it, rather than losing it silently.
      await db.answers.update([this.attemptId, result.examQuestionId], {
        syncStatus: 'pending',
        lastAttemptedAt: new Date().toISOString(),
      });
    }
  }

  private async revertInFlightToPending(): Promise<void> {
    const db = getAttemptDb();
    await db.answers
      .where('[attemptId+syncStatus]')
      .equals([this.attemptId, 'in-flight'])
      .modify({ syncStatus: 'pending' });
  }
}
