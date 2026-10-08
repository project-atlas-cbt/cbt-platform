import { AppHttpException } from '../../common/app-http-exception.js';

/**
 * Bug audit P1-6: the server side of `SEQUENTIAL_NO_REVISIT`. The browser
 * already refuses to navigate back (`apps/web/lib/attempt/navigation-
 * policy.ts`); this is the authority behind it (AGENTS.md §5).
 *
 * The server never sees navigation, only answers, so how far a student has
 * got is the furthest question, in this attempt's own materialised order,
 * that the server holds an answer row for (cleared answers included: the
 * student reached that question). Every question before it is locked.
 *
 * Offline replays arrive in batches whose items are in no particular order,
 * so a batch is applied in question order: a legitimate offline sitting
 * (answers only ever move forward) is then accepted whole. A batch item
 * that fails for a retryable reason stops the later items, so a later
 * question can never be stored ahead of an earlier answer that will be
 * retried.
 *
 * `ANSWERED_ONLY` (the narrower alternative put to Haneef on 2026-10-08)
 * would lock only questions that already have an answer row, leaving a
 * skipped question open to a first, late answer.
 */
export type NoRevisitLockMode = 'ALL_EARLIER' | 'ANSWERED_ONLY';
export const NO_REVISIT_LOCK_MODE: NoRevisitLockMode = 'ALL_EARLIER';

export function isQuestionLocked(params: {
  rank: number;
  furthestRank: number;
  alreadyAnswered: boolean;
  mode?: NoRevisitLockMode;
}): boolean {
  const { rank, furthestRank, alreadyAnswered, mode = NO_REVISIT_LOCK_MODE } = params;
  if (rank >= furthestRank) return false;
  return mode === 'ALL_EARLIER' || alreadyAnswered;
}

/** The furthest rank among questions the server holds an answer for, or -1. */
export function furthestAnsweredRank(
  answeredQuestionIds: Iterable<string>,
  order: ReadonlyMap<string, number>,
): number {
  let furthest = -1;
  for (const id of answeredQuestionIds) {
    const rank = order.get(id);
    if (rank !== undefined && rank > furthest) furthest = rank;
  }
  return furthest;
}

export function questionLocked(): AppHttpException {
  return new AppHttpException({
    code: 'ATTEMPT_QUESTION_LOCKED',
    message: 'This exam does not allow going back, and this question has already been passed.',
  });
}
