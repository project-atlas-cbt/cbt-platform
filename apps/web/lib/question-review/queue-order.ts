export interface ReviewQueueItemLike {
  questionId: string;
  submittedAt: string;
}

export interface ReviewQueueSubjectGroupLike {
  items: ReviewQueueItemLike[];
}

export interface ReviewQueueLike {
  subjects: ReviewQueueSubjectGroupLike[];
}

/**
 * F10 — the "Approve → Reject → Comment → Next" flow (`04 §70`) needs one
 * agreed processing order shared by the queue list, the workspace's
 * Previous/Next navigation, and its prefetch — computed once here rather
 * than redecided in three places. Subject order as the server returns it,
 * then oldest-submitted-first within each subject (true queue age, matching
 * `04 §29`'s "process the longest-waiting first" framing) — B9's own
 * deferred-item note confirms no server-side queue-age field exists, so this
 * is exactly what age computation and ordering both rest on.
 */
export function flattenQueueOrder(queue: ReviewQueueLike | undefined): string[] {
  if (!queue) return [];
  const order: { questionId: string; submittedAt: string }[] = [];
  for (const group of queue.subjects) {
    const bySubmission = [...group.items].sort(
      (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
    );
    order.push(...bySubmission);
  }
  return order.map((item) => item.questionId);
}

export interface AdjacentQuestionIds {
  previous: string | undefined;
  next: string | undefined;
}

/** `undefined` on either side means "no such neighbour" — including when
 * `currentId` isn't in `order` at all (e.g. a direct deep link opened before
 * the queue itself has ever been fetched in this session). */
export function getAdjacentQuestionIds(order: string[], currentId: string): AdjacentQuestionIds {
  const index = order.indexOf(currentId);
  if (index === -1) return { previous: undefined, next: undefined };
  return {
    previous: index > 0 ? order[index - 1] : undefined,
    next: index < order.length - 1 ? order[index + 1] : undefined,
  };
}

/** Pure client-side "how long has this been waiting" — no server field for
 * this exists (B9's own recorded deferral). A short, stable label rather
 * than a live-ticking one; the queue/workspace screens don't need
 * second-level precision. */
export function formatQueueAge(submittedAt: string, now: Date = new Date()): string {
  const submitted = new Date(submittedAt).getTime();
  const diffMs = Math.max(0, now.getTime() - submitted);
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 60) return diffMinutes <= 1 ? 'Just now' : `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

export type ReviewFallbackReason = 'NO_DEPARTMENT' | 'NO_HOD' | 'AUTHOR_IS_ONLY_HOD';

/** ADR-0038: why the School Admin is reviewing a question no HOD can. */
export const FALLBACK_REASON_TEXT: Record<ReviewFallbackReason, string> = {
  NO_DEPARTMENT: 'Its subject has no department, so no HOD covers it.',
  NO_HOD: 'Its department has no HOD.',
  AUTHOR_IS_ONLY_HOD: "The department's only HOD wrote it, and nobody reviews their own question.",
};

/** ADR-0038: the School Admin's queue holds only the questions no HOD can
 * review. Subjects left with none are dropped and counts recomputed. */
export function fallbackOnlyQueue<
  Item extends ReviewQueueItemLike & { fallbackReason: ReviewFallbackReason | null },
  Group extends { items: Item[]; pendingCount: number },
>(queue: { subjects: Group[] } | undefined): { subjects: Group[] } | undefined {
  if (!queue) return queue;
  return {
    subjects: queue.subjects
      .map((group) => {
        const items = group.items.filter((item) => item.fallbackReason !== null);
        return { ...group, items, pendingCount: items.length };
      })
      .filter((group) => group.items.length > 0),
  };
}
