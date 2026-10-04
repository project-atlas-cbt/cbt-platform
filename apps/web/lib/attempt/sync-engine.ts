import { apiClient, unwrap } from '@/lib/api';
import { ApiError, NetworkError } from '@/lib/api/error';
import type { ApiComponents } from '@atlas/contracts';
import { getAttemptDb, type AnswerRow } from './db';
import { getDeviceId } from './device-id';
import { connectivityStore } from './connectivity-store';
import {
  isAttemptMissingError,
  isNotWritableError,
  isQuestionNotInSnapshotError,
} from './error-utils';

/**
 * F20 (DoD 8 — high latency and packet loss). A batch request that hangs on
 * a lossy link would otherwise hold the single-flight chain until the
 * browser gives up (minutes); abort it so the rows return to `pending` and
 * the next trigger retries. Generous against B21's measured budget (answer
 * save p99 ≤ 750 ms) and a 300 ms-RTT congested lab link.
 */
export const FLUSH_TIMEOUT_MS = 15_000;

type AttemptPackage = ApiComponents['schemas']['AttemptPackageResponseDto'];

/** `AbortSignal.timeout` where available (every declared-matrix browser);
 * a manual controller otherwise — a missing API must never break syncing. */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * After consecutive failed flushes, answer-triggered flushes wait out a
 * jittered exponential backoff (honouring a `Retry-After`, if the server sent
 * one). Answers are still written locally at once — only the network retry
 * is spaced. The heartbeat tick and a pre-submit `flushNow()` are `force`d
 * and always try.
 */
export const FLUSH_BACKOFF_BASE_MS = 1_000;
export const FLUSH_BACKOFF_MAX_MS = 30_000;

export function flushBackoffDelay(
  consecutiveFailures: number,
  retryAfterMs: number | undefined,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(
    FLUSH_BACKOFF_MAX_MS,
    FLUSH_BACKOFF_BASE_MS * 2 ** Math.max(0, consecutiveFailures - 1),
  );
  const jitter = random();
  const backoff = Math.round(ceiling / 2 + (ceiling / 2) * jitter);
  // Retry-After is a floor, jittered upward (as lib/api/retry.ts does): a
  // lab refused together must not come back together.
  const floor = retryAfterMs === undefined ? 0 : Math.round(retryAfterMs * (1 + 0.3 * jitter));
  return Math.max(backoff, floor);
}

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

  /** F20: backoff state — see `flushBackoffDelay`. */
  private consecutiveFailures = 0;
  private nextFlushAt = 0;
  /** End of the server's last `Retry-After`, which even `force`d flushes
   * (heartbeat, reconnect) wait out — only `flushNow()` does not. */
  private retryAfterUntil = 0;
  private deferredFlush: ReturnType<typeof setTimeout> | null = null;
  /** B22: retry of a reconnect check that could not reach the server. */
  private reconcileRetry: ReturnType<typeof setTimeout> | null = null;
  private reconcileFailures = 0;
  /** B22: the server no longer has this attempt (see `onReconnect`). */
  private onAttemptMissing: (() => void) | undefined;

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

  setOnAttemptMissing(callback: () => void): void {
    this.onAttemptMissing = callback;
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
  scheduleFlush(options: { force?: boolean; ignoreRetryAfter?: boolean } = {}): void {
    // `force` skips the client's own backoff (a heartbeat or reconnect is
    // a fresh reason to try), never the server's Retry-After (F20 e2e
    // finding: a heartbeat retried 0.9 s into a 3 s Retry-After).
    const wait = options.ignoreRetryAfter
      ? 0
      : (options.force ? this.retryAfterUntil : this.nextFlushAt) - Date.now();
    if (wait > 0) {
      // Inside a backoff window: coalesce into one flush when it ends.
      this.deferredFlush ??= setTimeout(() => {
        this.deferredFlush = null;
        this.scheduleFlush({ force: true });
      }, wait);
      return;
    }
    this.flushChain = this.flushChain.then(() => this.flush(options)).catch(() => undefined);
  }

  private recordFlushSuccess(): void {
    this.consecutiveFailures = 0;
    this.nextFlushAt = 0;
    this.retryAfterUntil = 0;
  }

  private recordFlushFailure(retryAfterMs?: number): void {
    this.consecutiveFailures += 1;
    this.nextFlushAt = Date.now() + flushBackoffDelay(this.consecutiveFailures, retryAfterMs);
    this.retryAfterUntil = retryAfterMs === undefined ? 0 : this.nextFlushAt;
    // Retry by itself when the window ends (F20 e2e finding): otherwise the
    // student's last answers waited for the next heartbeat, up to ~30 s,
    // after a refusal. A no-op if nothing is pending by then.
    this.scheduleFlush();
  }

  /**
   * B22 (decision 2c): connectivity came back after an outage. Before
   * flushing, compare the server's answers with this device's: if the
   * server's database was restored to an earlier point while the page was
   * open, answers it acknowledged after that point are gone from the server
   * but marked `synced` here, and a plain flush (pending rows only) would
   * never send them again. A reload already handles this
   * (`reconcileAttemptOnLoad`); this is the same rule without the reload.
   * Runs on the flush chain, so no flush is in flight meanwhile.
   */
  onReconnect(): void {
    if (this.reconcileRetry) clearTimeout(this.reconcileRetry);
    this.reconcileRetry = null;
    this.flushChain = this.flushChain.then(() => this.reconcileWithServer()).catch(() => undefined);
    this.scheduleFlush({ force: true });
  }

  private async reconcileWithServer(): Promise<void> {
    let pkg: AttemptPackage;
    try {
      pkg = await unwrap(
        apiClient.GET('/attempts/{id}', {
          params: { path: { id: this.attemptId } },
          headers: { 'X-Device-Id': getDeviceId() },
          signal: timeoutSignal(FLUSH_TIMEOUT_MS),
        }),
      );
    } catch (error) {
      if (isAttemptMissingError(error)) {
        this.onAttemptMissing?.();
        return;
      }
      if (isNotWritableError(error)) {
        this.onNotWritable?.();
        return;
      }
      // The server is still unreachable or refusing: try again after a
      // backoff — the rollback check must not be skipped just because the
      // first try after reconnecting failed.
      this.reconcileFailures += 1;
      this.reconcileRetry = setTimeout(
        () => this.onReconnect(),
        flushBackoffDelay(
          this.reconcileFailures,
          error instanceof ApiError ? error.retryAfterMs : undefined,
        ),
      );
      return;
    }
    this.reconcileFailures = 0;
    if (pkg.state !== 'IN_PROGRESS') {
      this.onNotWritable?.();
      return;
    }
    const db = getAttemptDb();
    for (const question of pkg.questions) {
      const row = await db.answers.get([this.attemptId, question.examQuestionId]);
      if (row?.syncStatus !== 'synced') continue;
      if (row.localSequence <= (question.answerSequenceNumber ?? 0)) continue;
      // The server has an older answer (or none) than one it once
      // acknowledged: send it again. A partial update — a newer local write
      // that lands meanwhile is already `pending` and is left intact.
      await db.answers.update([this.attemptId, question.examQuestionId], {
        syncStatus: 'pending',
      });
    }
  }

  /** Stops the backoff retry timer (the runtime unmounted). */
  dispose(): void {
    if (this.deferredFlush) clearTimeout(this.deferredFlush);
    this.deferredFlush = null;
    if (this.reconcileRetry) clearTimeout(this.reconcileRetry);
    this.reconcileRetry = null;
  }

  /** Awaits the current flush chain to settle — used before a final submit
   * to make a best-effort attempt at getting every answer to the server
   * first (the server-side submit itself still works correctly even if some
   * answers are still `pending` locally; this is a best-effort courtesy,
   * not a correctness dependency). */
  async flushNow(): Promise<void> {
    // The student pressed Submit: one request now, whatever the backoff.
    this.scheduleFlush({ force: true, ignoreRetryAfter: true });
    await this.flushChain;
  }

  private async flush(
    options: { force?: boolean; ignoreRetryAfter?: boolean } = {},
  ): Promise<void> {
    // Re-check the backoff when the flush actually runs, not only when it was
    // queued: a flush queued behind one still in flight would otherwise go
    // out the moment that one failed, ignoring the Retry-After its refusal
    // just set (F20 e2e finding: a second save 70 ms after a 503).
    if (!options.ignoreRetryAfter) {
      const until = options.force ? this.retryAfterUntil : this.nextFlushAt;
      if (until > Date.now()) {
        this.scheduleFlush(options);
        return;
      }
    }
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
          signal: timeoutSignal(FLUSH_TIMEOUT_MS),
        }),
      );
      connectivityStore.reportSuccess();
      this.recordFlushSuccess();
      const retryable = await this.applyBatchResults(response.results, sentSequenceByQuestion);
      // B22: items the server could not save (`INTERNAL` — its database
      // failed mid-request) are pending again; retry them after a backoff
      // rather than leaving them until the next heartbeat.
      if (retryable > 0) this.recordFlushFailure();
    } catch (error) {
      if (error instanceof NetworkError) {
        // Includes the FLUSH_TIMEOUT_MS abort — `unwrap` maps any thrown
        // fetch failure to NetworkError.
        connectivityStore.reportFailure();
        this.recordFlushFailure();
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
      if (isAttemptMissingError(error)) {
        // B22: kept `pending` on this device — the only copy left.
        await this.revertInFlightToPending();
        this.onAttemptMissing?.();
        return;
      }
      // Any other unexpected error: treat conservatively like a network
      // failure — never drop data on an error this engine doesn't recognise.
      this.recordFlushFailure(error instanceof ApiError ? error.retryAfterMs : undefined);
      await this.revertInFlightToPending();
    }
  }

  private async applyBatchResults(
    results: readonly { examQuestionId: string; accepted: boolean; rejectionCode?: string }[],
    sentSequenceByQuestion: Map<string, number>,
  ): Promise<number> {
    const db = getAttemptDb();
    let retryable = 0;
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
      retryable += 1;
    }
    return retryable;
  }

  private async revertInFlightToPending(): Promise<void> {
    const db = getAttemptDb();
    await db.answers
      .where('[attemptId+syncStatus]')
      .equals([this.attemptId, 'in-flight'])
      .modify({ syncStatus: 'pending' });
  }
}
