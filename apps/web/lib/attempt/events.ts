import { apiClient, unwrap } from '@/lib/api';
import { getAttemptDb, type OutboxRow } from './db';
import { getDeviceId } from './device-id';
import { connectivityStore } from './connectivity-store';

/**
 * F13 — the integrity-signal / heartbeat outbox (ADR-0020). Physically
 * separate from `sync-engine.ts`'s answer-flush path (see `db.ts`'s own doc
 * comment on why) so a slow/failing event send can never delay or block an
 * answer save. A dropped event after repeated failures is an accepted,
 * silent loss — these are "counts, never judgements" signals, not academic
 * records; losing one is a materially different risk than losing an answer.
 */
const MAX_EVENT_ATTEMPTS = 5;

export type AttemptEventType =
  'WINDOW_BLUR' | 'FULLSCREEN_EXIT' | 'TAB_HIDDEN' | 'RECONNECTED' | 'RESUMED';

/** Enqueues one integrity event and kicks a fire-and-forget flush — never
 * awaited by the caller, per ADR-0020's "off the critical path" rule. */
export function recordAttemptEvent(attemptId: string, eventType: AttemptEventType): void {
  const db = getAttemptDb();
  void db.eventOutbox
    .add({
      attemptId,
      kind: 'event',
      eventType,
      occurredAt: new Date().toISOString(),
      payload: null,
      syncStatus: 'pending',
      attempts: 0,
      lastAttemptedAt: null,
    })
    .then(() => flushEventOutbox(attemptId));
}

/** `POST /attempts/:id/heartbeat` — liveness + the decision-1 binding-
 * mismatch signal. Doubles as this app's connectivity probe (see
 * `connectivity-store.ts`'s own doc comment): its outcome, not
 * `navigator.onLine`, is what the connection banner actually reflects. */
export async function sendHeartbeat(attemptId: string): Promise<boolean> {
  try {
    await unwrap(
      apiClient.POST('/attempts/{id}/heartbeat', {
        params: { path: { id: attemptId } },
        headers: { 'X-Device-Id': getDeviceId() },
      }),
    );
    connectivityStore.reportSuccess();
    return true;
  } catch {
    connectivityStore.reportFailure();
    return false;
  }
}

async function sendOneEvent(attemptId: string, row: OutboxRow): Promise<boolean> {
  if (!row.eventType) return true;
  try {
    await unwrap(
      apiClient.POST('/attempts/{id}/events', {
        params: { path: { id: attemptId } },
        body: { type: row.eventType as never, occurredAt: row.occurredAt },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Best-effort flush of every pending outbox row for one attempt. Never
 * throws — a failure just leaves rows `pending` for the next call. */
export async function flushEventOutbox(attemptId: string): Promise<void> {
  const db = getAttemptDb();
  const pending = await db.eventOutbox
    .where('[attemptId+syncStatus]')
    .equals([attemptId, 'pending'])
    .toArray();

  for (const row of pending) {
    if (row.id === undefined) continue;
    const ok = await sendOneEvent(attemptId, row);
    if (ok) {
      await db.eventOutbox.update(row.id, { syncStatus: 'sent' });
    } else {
      const attempts = row.attempts + 1;
      await db.eventOutbox.update(row.id, {
        attempts,
        lastAttemptedAt: new Date().toISOString(),
        ...(attempts >= MAX_EVENT_ATTEMPTS ? { syncStatus: 'dropped' as const } : {}),
      });
    }
  }
}
