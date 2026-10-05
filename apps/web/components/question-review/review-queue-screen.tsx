'use client';

import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useReviewQueue } from '@/lib/question-review/queries';
import { formatQueueAge } from '@/lib/question-review/queue-order';
import { stripHtmlToText } from '@/lib/questions/sanitize-html';
import { formatDate } from '@/lib/format/date';

/**
 * F10 — `ReviewQueue` (`QB-03`, `05 §16.1`, `04 §29`/`§70`). Grouped by
 * subject with counts, matching the dashboard widget's own shape — one
 * fetch (`GET /reviews/queue`), no pagination (B9's own contract: the queue
 * is department-scoped and expected to be dozens, not thousands, of items).
 * Plain `Table` primitives per subject group rather than the full
 * `DataTable`, since there's no server-side sort/pagination to wire up here.
 */
export function ReviewQueue() {
  const queue = useReviewQueue();

  if (queue.isPending) return <Skeleton className="h-96 w-full" />;
  if (queue.isError) {
    return <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />;
  }

  const subjects = queue.data.subjects;
  const totalPending = subjects.reduce((sum, group) => sum + group.pendingCount, 0);

  if (totalPending === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-text-primary">Question review</h1>
        <EmptyState
          icon={ClipboardCheck}
          title="Queue is empty"
          description="No questions are waiting for your review right now."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Question review</h1>
        <p className="text-sm text-text-secondary">
          {totalPending} question{totalPending === 1 ? '' : 's'} awaiting review
        </p>
      </div>

      {subjects.map((group) => (
        <div key={group.subjectId} className="space-y-2">
          <h2 className="text-sm font-semibold text-text-primary">
            {group.subjectName}{' '}
            <span className="font-normal text-text-muted">({group.pendingCount})</span>
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Age</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.items.map((item) => (
                <TableRow key={item.questionId}>
                  <TableCell className="max-w-sm truncate">
                    {stripHtmlToText(item.revision.content)}
                  </TableCell>
                  <TableCell>{item.authorName}</TableCell>
                  <TableCell>{item.level}</TableCell>
                  <TableCell>{formatDate(item.submittedAt)}</TableCell>
                  <TableCell>{formatQueueAge(item.submittedAt)}</TableCell>
                  <TableCell>
                    <Button asChild size="sm">
                      <Link href={`/hod/question-review/${item.questionId}`}>Open review</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
