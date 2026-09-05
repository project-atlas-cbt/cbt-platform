'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAttemptDb } from '@/lib/attempt/db';

/**
 * F13 — ADR-0003's explicit "never silently" requirement. An answer write
 * that arrives past the 60-second post-expiry grace window is permanently
 * excluded from retry (`sync-engine.ts`) and counts as unanswered — this
 * banner is the one place that must never be dismissed automatically. Each
 * affected question is named individually and requires its own explicit
 * acknowledgement before it stops appearing.
 */
export function GraceWindowBanner({ attemptId }: { attemptId: string }) {
  const unacknowledged = useLiveQuery(
    () =>
      getAttemptDb()
        .answers.where('[attemptId+syncStatus]')
        .equals([attemptId, 'window-closed'])
        .filter((row) => !row.acknowledged)
        .toArray(),
    [attemptId],
  );
  const questions = useLiveQuery(
    () => getAttemptDb().questions.where('attemptId').equals(attemptId).toArray(),
    [attemptId],
  );

  if (!unacknowledged || unacknowledged.length === 0) return null;

  const displaySequenceFor = (examQuestionId: string) =>
    questions?.find((q) => q.examQuestionId === examQuestionId)?.displaySequence ?? '?';

  return (
    <div role="alert" className="space-y-2 border-b border-danger/30 bg-danger-subtle px-4 py-3">
      {unacknowledged.map((row) => (
        <div key={row.examQuestionId} className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-danger-subtle-foreground">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            Question {displaySequenceFor(row.examQuestionId)} could not be saved — the answer window
            for this question closed before it reached the server. This will count as unanswered.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void getAttemptDb().answers.update([attemptId, row.examQuestionId], {
                acknowledged: true,
              })
            }
          >
            I understand
          </Button>
        </div>
      ))}
    </div>
  );
}
