import { prisma, withTenant } from '@atlas/db';
import type { AttemptSnapshotDocumentV1 } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';

/**
 * B21: what an answer write needs, without re-reading the attempt's whole
 * JSONB snapshot document on every save.
 *
 * - The attempt's mutable fields (state, expiry) and its owner are read
 *   fresh on every request — admissibility and ownership are never cached
 *   (AGENTS.md §5, §6).
 * - The question → option membership index is derived from the snapshot,
 *   which is immutable once written (ADR-0008, enforced by the
 *   `attempt_question_snapshots_immutable` trigger), so a per-process cache
 *   of it can never go stale. A miss costs exactly the read it replaces.
 *
 * Measured motivation: at 100 concurrent attempts the snapshot read was
 * the second-largest statement by total time and the largest per-request
 * payload on the answer path (docs/performance/results, B21 baseline).
 */

export interface AttemptWriteContext {
  id: string;
  schoolId: string;
  state: string;
  expiresAt: Date;
  ownerUserId: string;
  /** examQuestionId → its option ids, from the immutable snapshot. */
  questions: ReadonlyMap<string, ReadonlySet<string>>;
}

const INDEX_CACHE_MAX_ENTRIES = 20_000;
const indexCache = new Map<string, ReadonlyMap<string, ReadonlySet<string>>>();

export function buildSnapshotIndex(
  document: AttemptSnapshotDocumentV1 | undefined,
): ReadonlyMap<string, ReadonlySet<string>> {
  const index = new Map<string, ReadonlySet<string>>();
  for (const question of document?.questions ?? []) {
    index.set(question.examQuestionId, new Set(question.options.map((o) => o.optionId)));
  }
  return index;
}

function remember(attemptId: string, index: ReadonlyMap<string, ReadonlySet<string>>): void {
  // Bounded by live attempts per process; when full, drop the oldest
  // (Map iterates in insertion order) — a later miss just re-reads.
  if (indexCache.size >= INDEX_CACHE_MAX_ENTRIES) {
    const oldest = indexCache.keys().next();
    if (!oldest.done) indexCache.delete(oldest.value);
  }
  indexCache.set(attemptId, index);
}

/** Test-only: forget cached indexes (each test file boots a fresh app, but shares the module). */
export function clearAttemptIndexCacheForTests(): void {
  indexCache.clear();
}

export async function loadAttemptWriteContextOrThrow(
  schoolId: string,
  attemptId: string,
): Promise<AttemptWriteContext> {
  const cached = indexCache.get(attemptId);
  const row = await withTenant(prisma, schoolId, (tx) =>
    tx.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        schoolId: true,
        state: true,
        expiresAt: true,
        studentProfile: { select: { membership: { select: { userId: true } } } },
        ...(cached === undefined && { snapshot: { select: { document: true } } }),
      },
    }),
  );
  if (!row || row.schoolId !== schoolId) {
    throw new AppHttpException({ code: 'NOT_FOUND', message: 'Attempt not found.' });
  }
  let questions = cached;
  if (questions === undefined) {
    const snapshot = (row as { snapshot?: { document: unknown } | null }).snapshot;
    questions = buildSnapshotIndex(snapshot?.document as AttemptSnapshotDocumentV1 | undefined);
    // Only cache a real snapshot: an attempt row is always created with its
    // snapshot in one transaction (B13 DoD 1), but never cache emptiness.
    if (snapshot) remember(attemptId, questions);
  }
  return {
    id: row.id,
    schoolId: row.schoolId,
    state: row.state,
    expiresAt: row.expiresAt,
    ownerUserId: row.studentProfile.membership.userId,
    questions,
  };
}

/** The attempt's question → option index alone (cached; one snapshot read
 * on a miss). `undefined` when the attempt has no snapshot. */
export async function loadSnapshotIndex(
  schoolId: string,
  attemptId: string,
): Promise<ReadonlyMap<string, ReadonlySet<string>> | undefined> {
  const cached = indexCache.get(attemptId);
  if (cached) return cached;
  const snapshot = await withTenant(prisma, schoolId, (tx) =>
    tx.attemptQuestionSnapshot.findUnique({
      where: { schoolId_attemptId: { schoolId, attemptId } },
      select: { document: true },
    }),
  );
  if (!snapshot) return undefined;
  const index = buildSnapshotIndex(snapshot.document as unknown as AttemptSnapshotDocumentV1);
  remember(attemptId, index);
  return index;
}
