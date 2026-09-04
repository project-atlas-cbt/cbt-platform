'use client';

import Link from 'next/link';
import { ArrowLeft, History } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useExam } from '@/lib/exams/queries';
import { useExamControl } from '@/lib/exam-control/queries';
import { examControlPath } from '@/lib/exam-control/navigation';
import { formatDateTime } from '@/lib/format/date';
import { ExamSessionStatusBadge } from './exam-session-status-badge';

/** F12 — `/[examId]/history`. Reads the same `sessions[]` already embedded
 * in `useExamControl(examId)`'s cache — no cross-exam "list sessions"
 * endpoint exists, and none is needed: this is a fuller presentation of
 * data the Control Center screen already fetched, not a new query. */
export function SessionHistoryScreen({ basePath, examId }: { basePath: string; examId: string }) {
  const exam = useExam(examId);
  const control = useExamControl(examId);

  if (exam.isPending || control.isPending) return <Skeleton className="h-96 w-full" />;
  if (exam.isError) return <ErrorState error={exam.error} onRetry={() => void exam.refetch()} />;
  if (control.isError)
    return <ErrorState error={control.error} onRetry={() => void control.refetch()} />;

  const sessions = control.data.sessions;

  const columns: DataTableColumn<(typeof sessions)[number]>[] = [
    { id: 'type', header: 'Type', cell: (row) => row.sessionType },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => <ExamSessionStatusBadge value={row.status} />,
    },
    { id: 'opened', header: 'Opened', cell: (row) => formatDateTime(row.openedAt) },
    { id: 'openedBy', header: 'Opened by', cell: (row) => row.openedByName },
    {
      id: 'reopened',
      header: 'Reopened',
      cell: (row) => (row.reopenedAt ? formatDateTime(row.reopenedAt) : '—'),
    },
    {
      id: 'closed',
      header: 'Closed',
      cell: (row) => (row.closedAt ? formatDateTime(row.closedAt) : '—'),
    },
    { id: 'closedBy', header: 'Closed by', cell: (row) => row.closedByName ?? '—' },
    {
      id: 'completed',
      header: 'Completed',
      cell: (row) => (row.completedAt ? formatDateTime(row.completedAt) : '—'),
    },
  ];

  return (
    <div className="space-y-6">
      <Link
        href={examControlPath(basePath, examId)}
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden /> Control Center
      </Link>
      <h1 className="text-lg font-semibold text-text-primary">
        {exam.data.title} — session history
      </h1>
      <DataTable
        columns={columns}
        rows={sessions}
        getRowId={(row) => row.id}
        caption="Session history"
        emptyState={
          <EmptyState
            icon={History}
            title="No sessions yet"
            description="No session has been opened for this exam."
          />
        }
      />
    </div>
  );
}
