'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getAttemptDb } from '@/lib/attempt/db';
import { describeAttemptError } from '@/lib/attempt/error-utils';

/**
 * F13 — `04 §55`/`§58` (DoD 14): warns of unanswered questions with an
 * accurate count before a manual submit. Never shown for the proactive
 * zero-reached submit (`use-attempt-timer.ts`) or auto-submit — those are
 * never confirmable by design (DoD 15: "no confirmation prompt").
 */
export function SubmitDialog({
  attemptId,
  questionCount,
  open,
  onOpenChange,
  onConfirm,
  submitting,
  error,
}: {
  attemptId: string;
  questionCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  submitting: boolean;
  error?: unknown;
}) {
  const answeredCount = useLiveQuery(
    async () =>
      (await getAttemptDb().answers.where('attemptId').equals(attemptId).toArray()).filter(
        // Bug fix: a `'window-closed'` row has a `selectedOptionId` (the
        // student's own pick) but was never accepted by the server — it
        // will count as unanswered there (per `grace-window-banner.tsx`'s
        // own copy), so it must not count as answered here either, or this
        // "accurate unanswered count" (DoD 14) would understate it.
        (row) => row.selectedOptionId !== null && row.syncStatus !== 'window-closed',
      ).length,
    [attemptId],
    0,
  );
  const unansweredCount = Math.max(0, questionCount - (answeredCount ?? 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit your answers?</DialogTitle>
          <DialogDescription>
            {unansweredCount > 0
              ? `You have ${unansweredCount} unanswered question${unansweredCount === 1 ? '' : 's'} out of ${questionCount}. Once you submit, you won't be able to change your answers.`
              : `You've answered all ${questionCount} questions. Once you submit, you won't be able to change your answers.`}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {describeAttemptError(error)} Your answers are safely saved on this device — try
            submitting again once you&apos;re reconnected.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
            Keep answering
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={submitting}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
