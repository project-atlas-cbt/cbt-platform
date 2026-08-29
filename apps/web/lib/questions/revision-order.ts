export interface RevisionOrderLike {
  revisionNumber: number;
}

/**
 * F9 bug-review fix — "the current revision" must always be the highest
 * `revisionNumber`, never assumed from an array's raw return order.
 * `GET /questions/:id` doesn't contractually guarantee `revisions` arrives
 * pre-sorted; `RevisionHistory` already sorted defensively before this fix,
 * while the editor and detail screen separately trusted
 * `revisions[revisions.length - 1]` directly — an inconsistency that could
 * silently load or act on the wrong revision if that assumption were ever
 * violated. Every place that needs "the current revision" or a newest-first
 * ordering now goes through this one shared pair of functions instead of
 * each repeating (and risking disagreeing on) the same assumption.
 */
export function sortRevisionsDescending<T extends RevisionOrderLike>(revisions: T[]): T[] {
  return [...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber);
}

export function pickCurrentRevision<T extends RevisionOrderLike>(revisions: T[]): T | undefined {
  return sortRevisionsDescending(revisions)[0];
}
