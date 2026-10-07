export type NavigationPolicy = 'FREE' | 'SEQUENTIAL_NO_REVISIT' | 'SEQUENTIAL_WITH_REVISIT';

/**
 * Pure jump-permission rules for `question-navigator.tsx`, keyed off the
 * exam's `navigationPolicy` (07 §8.1's single attribute, ADR-0013). No
 * server round-trip involved — the navigator is purely a client affordance;
 * the server never validates "was this jump allowed," only whether the
 * question being answered exists in the snapshot at all.
 *
 * `furthestIndex` is the highest question index the student has ever
 * visited in this attempt (0-indexed), tracked by the caller across
 * navigation and restored from `answers` on resume (any question with an
 * `answers` row, plus the current question, counts as visited).
 *
 * - `FREE`: every index is reachable.
 * - `SEQUENTIAL_NO_REVISIT`: once a question is passed, it's locked —
 *   reachable indices are `[furthestIndex, questionCount)`. Jumping ahead
 *   (skipping an unanswered question) is allowed; jumping back to an
 *   already-passed one is not.
 * - `SEQUENTIAL_WITH_REVISIT`: any already-visited question stays reachable
 *   (`[0, furthestIndex]`), plus exactly one step forward
 *   (`furthestIndex + 1`) — advancing must go through the sequence in
 *   order, but looking back is always allowed.
 */
export function isNavigationAllowed(
  policy: NavigationPolicy,
  targetIndex: number,
  furthestIndex: number,
  questionCount: number,
): boolean {
  if (targetIndex < 0 || targetIndex >= questionCount) return false;
  switch (policy) {
    case 'FREE':
      return true;
    case 'SEQUENTIAL_NO_REVISIT':
      return targetIndex >= furthestIndex;
    case 'SEQUENTIAL_WITH_REVISIT':
      return targetIndex <= furthestIndex + 1;
    default:
      return false;
  }
}

export function nextFurthestIndex(currentFurthest: number, visitedIndex: number): number {
  return Math.max(currentFurthest, visitedIndex);
}

/**
 * Audit P1-6: where a reloaded runtime resumes. The furthest question
 * reached is the larger of what this device saved and the last question
 * with an answer (the answers come back from the server on resume, so this
 * also holds on a different PC). Under `SEQUENTIAL_NO_REVISIT` everything
 * before the furthest question is locked, so the student resumes there.
 */
export function restoredPosition(params: {
  policy: NavigationPolicy;
  questionCount: number;
  savedCurrentIndex: number | undefined;
  savedFurthestIndex: number | undefined;
  answeredIndexes: readonly number[];
}): { currentIndex: number; furthestIndex: number } {
  const { policy, questionCount, savedCurrentIndex, savedFurthestIndex, answeredIndexes } = params;
  const last = Math.max(0, questionCount - 1);
  const clamp = (value: number) => Math.min(Math.max(0, value), last);
  const current = clamp(savedCurrentIndex ?? 0);
  const furthest = clamp(Math.max(savedFurthestIndex ?? 0, current, ...answeredIndexes));
  return {
    currentIndex: policy === 'SEQUENTIAL_NO_REVISIT' ? furthest : current,
    furthestIndex: furthest,
  };
}
