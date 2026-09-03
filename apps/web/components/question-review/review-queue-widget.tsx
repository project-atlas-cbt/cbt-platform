'use client';

import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useReviewQueue } from '@/lib/question-review/queries';

/**
 * F10 — the HOD dashboard's pending-review widget (`04 §29`): total pending
 * plus a per-subject breakdown, with "Review Questions" as, per the spec's
 * own words, "the most prominent action." Real, from `GET /reviews/queue` —
 * the only part of the `04 §29` dashboard this phase builds; the rest
 * (teacher/student/class/subject counts, active/completed exams, department
 * average) needs backend that doesn't exist as a single endpoint yet
 * (department-stats aggregation, `B11`/`B15`) and stays an honest
 * "not yet available" section on the dashboard page itself.
 */
export function ReviewQueueWidget() {
  const queue = useReviewQueue();

  if (queue.isPending) return <Skeleton className="h-40 w-full" />;
  if (queue.isError) {
    return <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />;
  }

  const subjects = queue.data.subjects;
  const totalPending = subjects.reduce((sum, group) => sum + group.pendingCount, 0);

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-text-primary">
        <ClipboardCheck className="size-5" aria-hidden />
        <h2 className="text-base font-semibold">
          {totalPending} Question{totalPending === 1 ? '' : 's'} Awaiting Review
        </h2>
      </div>
      {subjects.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
          {subjects.map((group) => (
            <li key={group.subjectId}>
              {group.subjectName} — {group.pendingCount}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-muted">Nothing is waiting for your review right now.</p>
      )}
      <Button asChild>
        <Link href="/hod/question-review">Review Questions</Link>
      </Button>
    </div>
  );
}
