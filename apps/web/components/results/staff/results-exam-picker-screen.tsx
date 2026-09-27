'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { formatDate } from '@/lib/format/date';
import { useExamsPaginated } from '@/lib/exams/queries';
import { ExamStatusBadge } from '@/components/exams/exam-status-badge';

const PAGE_SIZE = 25;

interface ExamRow {
  id: string;
  title: string;
  status: string;
  subjectName: string;
  classes: { className: string }[];
  updatedAt: string;
}

/**
 * F15 — the landing screen for each staff results root.
 *
 * `results.v1` is addressed per exam (`GET /exams/:id/results`), so
 * "Results" needs a way to choose an exam first. Rather than inventing a
 * second exam-listing endpoint, this reuses `useExamsPaginated` (B11) and
 * the same scope the exam list already enforces — which means a teacher
 * sees their own exams here and a HOD sees their department's, with no
 * extra scope logic to keep in sync.
 *
 * Deliberately not filtered to a "finished" status client-side: exam status
 * and result availability are related but not identical (a CLOSED exam may
 * still be mid-marking), and hiding rows on a guess would leave staff
 * unable to reach a screen that would have loaded fine. An exam with no
 * results yet lands on its own honest empty state instead.
 */
export function ResultsExamPickerScreen({ basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const exams = useExamsPaginated({ page, pageSize: PAGE_SIZE });
  const rows: ExamRow[] = exams.data?.exams ?? [];
  const pageCount = Math.max(1, Math.ceil((exams.data?.total ?? 0) / PAGE_SIZE));

  const columns: DataTableColumn<ExamRow>[] = [
    {
      id: 'title',
      header: 'Exam',
      cell: (row) => (
        <Link
          href={`${basePath}/${row.id}`}
          className="font-medium text-text-primary hover:underline"
        >
          {row.title}
        </Link>
      ),
    },
    { id: 'subject', header: 'Subject', cell: (row) => row.subjectName },
    {
      id: 'classes',
      header: 'Classes',
      cell: (row) => row.classes.map((c) => c.className).join(', ') || '—',
    },
    { id: 'status', header: 'Status', cell: (row) => <ExamStatusBadge value={row.status} /> },
    { id: 'updated', header: 'Updated', cell: (row) => formatDate(row.updatedAt) },
    {
      id: 'view',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${basePath}/${row.id}`}>View results</Link>
        </Button>
      ),
    },
  ];

  if (exams.isError) {
    return <ErrorState error={exams.error} onRetry={() => void exams.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-text-primary">Results</h1>
      <p className="text-sm text-text-muted">Choose an exam to see its results.</p>
      <DataTable
        caption="Exams with results"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={exams.isPending}
        page={page}
        pageCount={pageCount}
        onPageChange={(next) => router.replace(next > 1 ? `${basePath}?page=${next}` : basePath)}
        emptyState={
          <EmptyState
            icon={ClipboardList}
            title="No exams yet"
            description="Results appear here once exams within your scope have been built and sat."
          />
        }
      />
    </div>
  );
}
