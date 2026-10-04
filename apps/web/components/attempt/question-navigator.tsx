'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getAttemptDb } from '@/lib/attempt/db';
import { isNavigationAllowed, type NavigationPolicy } from '@/lib/attempt/navigation-policy';
import { cn } from '@/lib/utils';

/**
 * F13 — `04 §55`'s question navigator (DoD 5): exactly three visual states
 * — unanswered, answered, current — and policy-gated jumps. "Answered"
 * reflects the *local* Dexie state (`answers` table, read reactively via
 * `useLiveQuery`), not server-confirmed sync — DoD 6's "persist locally
 * immediately" means the navigator must not wait for a round trip to show a
 * question as answered.
 */
export function QuestionNavigator({
  attemptId,
  questionIds,
  currentIndex,
  furthestIndex,
  navigationPolicy,
  onNavigate,
}: {
  attemptId: string;
  questionIds: string[];
  currentIndex: number;
  furthestIndex: number;
  navigationPolicy: NavigationPolicy;
  onNavigate: (index: number) => void;
}) {
  const answers = useLiveQuery(
    () => getAttemptDb().answers.where('attemptId').equals(attemptId).toArray(),
    [attemptId],
  );
  // Bug fix: a `'window-closed'` row was rejected by the server (ADR-0003)
  // and will count as unanswered there — showing it "answered" (green) here
  // would contradict `grace-window-banner.tsx`'s own warning and understate
  // the true unanswered count the submit dialog reports.
  const answeredIds = new Set(
    (answers ?? [])
      .filter((row) => row.selectedOptionId !== null && row.syncStatus !== 'window-closed')
      .map((row) => row.examQuestionId),
  );

  return (
    <nav aria-label="Question navigator" className="grid grid-cols-5 gap-2">
      {questionIds.map((id, index) => {
        const isCurrent = index === currentIndex;
        const isAnswered = answeredIds.has(id);
        const allowed = isNavigationAllowed(
          navigationPolicy,
          index,
          furthestIndex,
          questionIds.length,
        );
        return (
          <button
            key={id}
            type="button"
            disabled={!allowed}
            aria-current={isCurrent ? 'true' : undefined}
            aria-label={`Question ${index + 1}${isAnswered ? ', answered' : ', unanswered'}${isCurrent ? ', current' : ''}`}
            onClick={() => onNavigate(index)}
            className={cn(
              // F20: 44 px targets (WCAG 2.5.5) — mouse precision on old lab hardware.
              'flex size-11 items-center justify-center rounded-md border text-sm font-medium tabular-nums transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-40',
              isCurrent
                ? 'border-brand-primary bg-brand-primary text-brand-primary-foreground'
                : isAnswered
                  ? 'border-success/40 bg-success-subtle text-success-subtle-foreground'
                  : 'border-border bg-surface text-text-secondary hover:bg-surface-muted',
            )}
          >
            {index + 1}
          </button>
        );
      })}
    </nav>
  );
}
