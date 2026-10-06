import {
  ENCRYPTED_CACHE_NAME,
  MEDIA_CACHE_NAME,
  encryptedCacheKey,
  mediaCacheKey,
} from './cache-keys';
import Dexie, { type Table } from 'dexie';

/**
 * F13 — the offline exam engine's client-side store. One Dexie database per
 * browser origin (school subdomains are already separate origins under
 * ADR-0005, so no cross-school leakage risk exists at this layer).
 *
 * Five tables, each justified against the DoD items it serves — see
 * `docs/roadmaps/frontend-roadmap.md`'s F13 section for the full list:
 *
 * - `attemptPackages` / `questions` — the server's attempt package, stored
 *   verbatim (ADR-0008: never re-derive question/option order client-side).
 *   Split into two tables (rather than one JSON blob) so a hot read (e.g.
 *   the navigator repainting) doesn't have to deserialize every question's
 *   content on every render.
 * - `answers` — this attempt's current answer state, one row per question.
 *   Deliberately **not** a separate "pending sync queue" table: an answer is
 *   a single current value, not an append-only log (selecting option B after
 *   option A doesn't need A's write replayed). Folding queue membership into
 *   `answers.syncStatus` makes "never overwrite a newer answer with an
 *   older one" (DoD 9) enforceable by one `WHERE` clause instead of a join
 *   against a second structure that could disagree with this one about
 *   what the current answer actually is.
 * - `eventOutbox` — kept genuinely separate, because these entries are a
 *   real log (multiple heartbeats/integrity events don't supersede each
 *   other) and must never share a code path with the answer-flush hot path
 *   (ADR-0020: "never blocks answering," enforced structurally here, not by
 *   discipline elsewhere).
 * - `mediaManifest` — status only. Actual media bytes live in Cache Storage
 *   (see `media-cache.ts`), keyed by `mediaAssetId` rather than the signed
 *   URL, since the URL's signature rotates every re-fetch (ADR-0021).
 *
 * Nothing in any table has, or could have, a correct-answer field — the
 * server's student-facing payload (`StudentAttemptOptionDto`) structurally
 * has none (X-05). `db.test.ts` verifies this by inspecting real serialized
 * rows, not just trusting the type.
 */

export type AnswerSyncStatus = 'synced' | 'pending' | 'in-flight' | 'window-closed';
export type MediaCacheStatus = 'pending' | 'cached' | 'stale-needs-refetch' | 'failed';
export type OutboxKind = 'event' | 'heartbeat';
export type OutboxSyncStatus = 'pending' | 'sent' | 'dropped';

export interface AttemptPackageRow {
  attemptId: string;
  examId: string;
  examSessionId: string;
  state:
    'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'INVALIDATED' | 'CANCELLED';
  startedAt: string;
  expiresAt: string;
  navigationPolicy: 'FREE' | 'SEQUENTIAL_NO_REVISIT' | 'SEQUENTIAL_WITH_REVISIT';
  /** F20 (DoD 3): staff-granted larger-text accommodation. Optional so rows
   * written before F20 still read. Not indexed — no schema version bump. */
  largerText?: boolean;
  generalInstructions: string | null;
  navigationInstructions: string | null;
  /** Audit P1-6: the question on screen and the furthest question reached
   * (0-based), kept so a reload neither resets the student to question 1
   * nor reopens questions `SEQUENTIAL_NO_REVISIT` has locked. Optional and
   * unindexed, like `largerText` — no schema version bump. */
  currentIndex?: number;
  furthestIndex?: number;
  /** `Date.parse(serverTime) - Date.now()` at the moment this row was
   * written — the single source of truth `use-attempt-timer.ts` reads to
   * reconstruct server-relative "now" without trusting the local clock. */
  clockSkewMs: number;
  deviceId: string;
  /** Wall-clock time this row was last written by a resume/start call —
   * informational only, never used to compute remaining time. */
  lastResumedAt: string;
}

export interface QuestionOptionRow {
  optionId: string;
  content: string;
  displayPosition: number;
}

export interface QuestionMediaRow {
  mediaAssetId: string;
  displayOrder: number;
  mediaType: string;
}

export interface QuestionRow {
  attemptId: string;
  examQuestionId: string;
  displaySequence: number;
  marks: number;
  questionType: string;
  content: string;
  options: QuestionOptionRow[];
  media: QuestionMediaRow[];
}

export interface AnswerRow {
  attemptId: string;
  examQuestionId: string;
  selectedOptionId: string | null;
  /** Client-assigned, monotonic per (attempt, question) — ADR-0007. Used
   * only for replay ordering, never for admissibility. */
  localSequence: number;
  syncStatus: AnswerSyncStatus;
  lastServerSequence: number | null;
  lastSyncedAt: string | null;
  lastAttemptedAt: string | null;
  /** Set only when `syncStatus === 'window-closed'` — the server's
   * rejection code, surfaced verbatim by `grace-window-banner.tsx`. */
  rejectionCode: string | null;
  /** ADR-0003: a `'window-closed'` row must be explicitly acknowledged by
   * the student, never auto-dismissed — this flag is what
   * `grace-window-banner.tsx` reads to decide whether to keep showing it. */
  acknowledged: boolean;
  updatedAt: string;
}

export interface OutboxRow {
  id?: number;
  attemptId: string;
  kind: OutboxKind;
  eventType: string | null;
  occurredAt: string;
  payload: Record<string, unknown> | null;
  syncStatus: OutboxSyncStatus;
  attempts: number;
  lastAttemptedAt: string | null;
}

export interface MediaManifestRow {
  attemptId: string;
  mediaAssetId: string;
  examQuestionIds: string[];
  url: string;
  urlExpiresAt: string;
  mediaType: string;
  cacheStatus: MediaCacheStatus;
  cachedAt: string | null;
}

/**
 * `questions`/`answers`/`mediaManifest` use a compound primary key
 * (`[attemptId+examQuestionId]` / `[attemptId+mediaAssetId]`) — Dexie
 * derives the key automatically from those two object properties on
 * `.put()`, and a row is fetched by primary key with `.get([attemptId, id])`
 * (a plain array, not an object). Typed as `Table<T, [string, string]>`
 * rather than Dexie's `EntityTable` helper, which only models a
 * single-property primary key.
 */
class AtlasAttemptDB extends Dexie {
  attemptPackages!: Table<AttemptPackageRow, string>;
  questions!: Table<QuestionRow, [string, string]>;
  answers!: Table<AnswerRow, [string, string]>;
  eventOutbox!: Table<OutboxRow, number>;
  mediaManifest!: Table<MediaManifestRow, [string, string]>;

  constructor() {
    super('atlas-attempt-engine');
    this.version(1).stores({
      attemptPackages: 'attemptId',
      questions: '[attemptId+examQuestionId], attemptId',
      answers: '[attemptId+examQuestionId], [attemptId+syncStatus], attemptId',
      eventOutbox: '++id, [attemptId+syncStatus], attemptId',
      mediaManifest: '[attemptId+mediaAssetId], attemptId, cacheStatus',
    });
  }
}

/** Lazily constructed — Dexie opens a real IndexedDB connection at
 * construction time, which must never happen during SSR/module evaluation. */
let instance: AtlasAttemptDB | null = null;
export function getAttemptDb(): AtlasAttemptDB {
  instance ??= new AtlasAttemptDB();
  return instance;
}

/** Deletes every row for one attempt across all five tables. Called once an
 * attempt reaches a confirmed terminal state with both queues flushed —
 * bounds storage growth and narrows the window a stale local copy of
 * anything could be inspected. Not a DoD requirement; low-cost to do.
 *
 * Audit P0-2: except answers the server never acknowledged (`pending` or
 * `in-flight`). They are the only copy of what the student chose, so they
 * stay on the device as evidence rather than being silently deleted. */
export async function clearAttemptData(attemptId: string): Promise<void> {
  const db = getAttemptDb();
  // F20 (Security row: "no sensitive data in browser storage beyond the
  // sanctioned exam cache"; ADR-0021 "cleared on finalisation"): the
  // attempt's decrypted media and any leftover ciphertext go too — until
  // F20 only the Dexie rows were removed and the images stayed in Cache
  // Storage indefinitely.
  const mediaAssetIds = (await db.mediaManifest.where('attemptId').equals(attemptId).toArray()).map(
    (row) => row.mediaAssetId,
  );
  const examId = (await db.attemptPackages.get(attemptId))?.examId;
  await db.transaction(
    'rw',
    [db.attemptPackages, db.questions, db.answers, db.eventOutbox, db.mediaManifest],
    async () => {
      await db.attemptPackages.delete(attemptId);
      await db.questions.where('attemptId').equals(attemptId).delete();
      await db.answers
        .where('attemptId')
        .equals(attemptId)
        .filter((row) => row.syncStatus !== 'pending' && row.syncStatus !== 'in-flight')
        .delete();
      await db.eventOutbox.where('attemptId').equals(attemptId).delete();
      await db.mediaManifest.where('attemptId').equals(attemptId).delete();
    },
  );
  if (typeof caches !== 'undefined') {
    const plain = await caches.open(MEDIA_CACHE_NAME);
    const encrypted = await caches.open(ENCRYPTED_CACHE_NAME);
    for (const id of mediaAssetIds) {
      await plain.delete(mediaCacheKey(id));
      if (examId) await encrypted.delete(encryptedCacheKey(examId, id));
    }
  }
}
