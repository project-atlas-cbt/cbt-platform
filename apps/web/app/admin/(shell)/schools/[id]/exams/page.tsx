'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import type { ExamStatus } from '@atlas/domain';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ExamStatusBadge } from '@/components/exams/exam-status-badge';
import { ExamStatusTabs } from '@/components/exams/exam-status-tabs';
import { useSchoolExams } from '@/lib/platform/queries';
import { formatDate } from '@/lib/format/date';

const PAGE_SIZE = 25;
const EXAM_STATUS_VALUES = new Set([
  'DRAFT',
  'READY',
  'OPEN',
  'CLOSED',
  'COMPLETED',
  'ARCHIVED',
  'CANCELLED',
]);

function asExamStatus(value: string | null): ExamStatus | undefined {
  return value && EXAM_STATUS_VALUES.has(value) ? (value as ExamStatus) : undefined;
}

interface SchoolExamRow {
  id: string;
  title: string;
  examType: string;
  status: string;
  subjectName: string;
  sessionName: string;
  termName: string;
  createdByName: string;
  createdAt: string;
}

/**
 * SA-04's Exams section (`04 §8`) — a read-only directory of the school's
 * exams, from `GET /platform/schools/:id/exams` (the B3/F3 gap-closure that
 * replaced the previous "Not yet available" placeholder). A Software Admin's
 * platform session gets no write paths here: no create/edit/cancel, no
 * navigation into the school-session wizard — this is oversight data.
 * Status filter + pagination are server-side and mirrored into the URL.
 */
export default function SchoolExamsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const status = asExamStatus(searchParams.get('status'));
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  function updateFilterParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    // Changing the status filter can leave the view on a now out-of-range
    // page — always reset to page 1.
    router.replace(`/admin/schools/${id}/exams?${params.toString()}`);
  }

  const exams = useSchoolExams(id, { status: status ?? null, page });

  const rows: SchoolExamRow[] = exams.data?.exams ?? [];
  const pageCount = Math.max(1, Math.ceil((exams.data?.total ?? 0) / PAGE_SIZE));

  const columns: DataTableColumn<SchoolExamRow>[] = [
    {
      id: 'title',
      header: 'Exam',
      cell: (row) => (
        <div>
          <p className="font-medium text-text-primary">{row.title}</p>
          <p className="text-xs text-text-muted">{row.examType}</p>
        </div>
      ),
    },
    { id: 'subject', header: 'Subject', cell: (row) => row.subjectName },
    {
      id: 'sessionTerm',
      header: 'Session / Term',
      cell: (row) => `${row.sessionName} · ${row.termName}`,
    },
    { id: 'teacher', header: 'Teacher', cell: (row) => row.createdByName },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => <ExamStatusBadge value={row.status} />,
    },
    { id: 'createdAt', header: 'Created', cell: (row) => formatDate(row.createdAt) },
  ];

  return (
    <div className="space-y-4">
      <ExamStatusTabs
        active={status}
        onChange={(next) => updateFilterParams({ status: next ?? null, page: null })}
      />

      {exams.isError ? (
        <ErrorState error={exams.error} onRetry={() => void exams.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          isLoading={exams.isPending}
          page={page}
          pageCount={pageCount}
          onPageChange={(next) => updateFilterParams({ page: next > 1 ? String(next) : null })}
          caption={`${exams.data?.total ?? 0} exams at this school`}
          emptyState={
            !status ? (
              <EmptyState
                icon={ClipboardList}
                title="No exams have been built at this school yet"
                description="Exams created through Exam Builder will appear here."
              />
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="No exams match this status"
                description="Try a different exam status."
              />
            )
          }
        />
      )}
    </div>
  );
}
